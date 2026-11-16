-- NEXA — Migración 0011: Préstamos con días fijos del mes + cambio de fecha de pago
--
-- ADITIVA. Lo único que toca de lo existente (aprobado explícitamente):
--   * ALTER TABLE loans ADD COLUMN schedule_type / payment_days, con default
--     y check. Los préstamos existentes quedan como 'interval' con
--     payment_days NULL, es decir, exactamente como funcionan hoy. En
--     PostgreSQL 11+ agregar una columna con default constante no reescribe
--     la tabla.
-- No modifica create_loan_with_installments, register_payment, vistas,
-- políticas RLS ni privilegios de tablas existentes. No hace DELETE ni
-- TRUNCATE de nada.
--
-- Objetos nuevos:
--   1) loans.schedule_type, loans.payment_days (+ check loans_payment_days_check)
--   2) Helpers internos: fixed_day_after, loan_add_period, payment_days_error
--   3) RPC create_loan_with_schedule: envuelve (llama) a la RPC original dentro
--      de la misma transacción y luego guarda el tipo de calendario.
--   4) RPC reschedule_loan_installments: cambia SOLO las fechas de las cuotas
--      pendientes sin abono. Nunca toca montos.
--
-- La matemática de fechas vive en lib/finance/fixed-days.ts y
-- lib/finance/reschedule.ts. Aquí se REVALIDA lo que manda la app (no se
-- confía en el cliente), con la misma regla que lib/finance.
--
-- Reversa: 0011_down.sql

-- =========================================================================
-- 1) Columnas nuevas en loans
-- =========================================================================
alter table public.loans
  add column schedule_type text not null default 'interval',
  add column payment_days smallint[];

-- Reglas (idénticas a validatePaymentDays en lib/finance/fixed-days.ts):
--  - 'interval'   -> payment_days NULL
--  - 'fixed_days' -> 1 o 2 días, entre 1 y 31, ordenados ascendente (sin repetir),
--                    y si son 2, no pueden ser ambos >= 28.
alter table public.loans
  add constraint loans_schedule_type_check
    check (schedule_type in ('interval', 'fixed_days')),
  add constraint loans_payment_days_check check (
    (schedule_type = 'interval' and payment_days is null)
    or (
      schedule_type = 'fixed_days'
      and payment_days is not null
      and array_ndims(payment_days) = 1
      and array_lower(payment_days, 1) = 1
      and cardinality(payment_days) between 1 and 2
      and array_position(payment_days, null) is null
      and 1 <= all (payment_days)
      and 31 >= all (payment_days)
      and (
        cardinality(payment_days) = 1
        or (payment_days[1] < payment_days[2] and payment_days[1] < 28)
      )
    )
  );

comment on column public.loans.schedule_type is
  'Tipo de calendario: interval (cada período según frequency, comportamiento original) o fixed_days (días fijos del mes)';
comment on column public.loans.payment_days is
  'Días fijos del mes (1 o 2, ordenados) cuando schedule_type = fixed_days; NULL en interval';

-- =========================================================================
-- 2) Helpers (internos; solo se usan desde las RPC de abajo)
-- =========================================================================

-- Mensaje de error si los días no son válidos, o NULL si lo son.
create or replace function public.payment_days_error(p_days smallint[])
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_days is null or cardinality(p_days) = 0 then
    return 'Elige al menos un día de pago';
  end if;
  if array_ndims(p_days) <> 1 or array_position(p_days, null) is not null then
    return 'Días de pago inválidos';
  end if;
  if cardinality(p_days) > 2 then
    return 'Elige como máximo 2 días de pago';
  end if;
  if not (1 <= all (p_days) and 31 >= all (p_days)) then
    return 'Los días de pago deben estar entre 1 y 31';
  end if;
  if cardinality(p_days) = 2 and p_days[array_lower(p_days, 1)] = p_days[array_upper(p_days, 1)] then
    return 'Los días de pago no se pueden repetir';
  end if;
  if cardinality(p_days) = 2 and 28 <= all (p_days) then
    return 'No se pueden elegir dos días de 28 en adelante (por ejemplo 29 y 30, o 30 y 31)';
  end if;
  return null;
end;
$$;

-- Siguiente día fijo ESTRICTAMENTE posterior a p_after. Si el mes no tiene
-- ese día, cae el último día del mes. Igual a nextFixedDay() en lib/finance.
create or replace function public.fixed_day_after(p_after date, p_days smallint[])
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_month_start date;
  v_last_day integer;
  v_candidate date;
  v_best date;
  v_day smallint;
  v_offset integer;
begin
  for v_offset in 0..1 loop
    v_month_start := (date_trunc('month', p_after) + make_interval(months => v_offset))::date;
    v_last_day := extract(day from (v_month_start + interval '1 month' - interval '1 day'))::integer;
    foreach v_day in array p_days loop
      v_candidate := v_month_start + (least(v_day, v_last_day) - 1);
      if v_candidate > p_after and (v_best is null or v_candidate < v_best) then
        v_best := v_candidate;
      end if;
    end loop;
    if v_best is not null then
      return v_best;
    end if;
  end loop;
  return v_best;
end;
$$;

-- Suma n períodos según la frecuencia. Igual a addPeriod() en
-- lib/finance/frequency.ts (mensual ajusta a fin de mes como date-fns).
create or replace function public.loan_add_period(p_date date, p_frequency public.loan_frequency, p_periods integer)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_frequency
    when 'daily' then p_date + p_periods
    when 'weekly' then p_date + p_periods * 7
    when 'biweekly' then p_date + p_periods * 14
    when 'monthly' then (p_date + make_interval(months => p_periods))::date
  end;
$$;

-- =========================================================================
-- 3) create_loan_with_schedule
-- Mismos parámetros que create_loan_with_installments + calendario.
-- Llama a la RPC original (sin modificarla) y, en la MISMA transacción,
-- guarda schedule_type/payment_days. Si algo falla, se revierte todo,
-- incluido el préstamo.
-- =========================================================================
create or replace function public.create_loan_with_schedule(
  p_client_id uuid,
  p_principal_amount numeric,
  p_interest_rate numeric,
  p_interest_type public.loan_interest_type,
  p_number_of_installments integer,
  p_installment_amount numeric,
  p_total_interest numeric,
  p_total_amount numeric,
  p_frequency public.loan_frequency,
  p_start_date date,
  p_first_payment_date date,
  p_notes text,
  p_installments jsonb,
  p_schedule_type text,
  p_payment_days smallint[]
)
returns public.loans
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_loan public.loans;
  v_days smallint[];
  v_error text;
  v_expected date;
  v_inst record;
begin
  if p_schedule_type is null or p_schedule_type not in ('interval', 'fixed_days') then
    raise exception 'Tipo de calendario inválido';
  end if;

  if p_schedule_type = 'fixed_days' then
    v_error := public.payment_days_error(p_payment_days);
    if v_error is not null then
      raise exception '%', v_error;
    end if;
    select array_agg(d order by d) into v_days from unnest(p_payment_days) as d;

    if p_first_payment_date <> public.fixed_day_after(p_start_date, v_days) then
      raise exception 'La primera cuota debe ser el siguiente día fijo después de la fecha del préstamo (%)',
        public.fixed_day_after(p_start_date, v_days);
    end if;
  elsif p_payment_days is not null then
    raise exception 'Los días fijos solo aplican al calendario de días fijos';
  end if;

  v_loan := public.create_loan_with_installments(
    p_client_id, p_principal_amount, p_interest_rate, p_interest_type,
    p_number_of_installments, p_installment_amount, p_total_interest, p_total_amount,
    p_frequency, p_start_date, p_first_payment_date, p_notes, p_installments
  );

  if p_schedule_type = 'fixed_days' then
    -- Revalidar TODAS las fechas contra el calendario (no confiar en el cliente).
    v_expected := p_first_payment_date;
    for v_inst in
      select installment_number, due_date from public.installments
      where loan_id = v_loan.id order by installment_number
    loop
      if v_inst.due_date <> v_expected then
        raise exception 'La cuota % debería vencer el %, no el %', v_inst.installment_number, v_expected, v_inst.due_date;
      end if;
      v_expected := public.fixed_day_after(v_expected, v_days);
    end loop;

    update public.loans
      set schedule_type = 'fixed_days', payment_days = v_days
      where id = v_loan.id
      returning * into v_loan;
  end if;

  return v_loan;
end;
$$;

-- =========================================================================
-- 4) reschedule_loan_installments
-- p_new_dates: jsonb array de { "installment_id": uuid, "due_date": "YYYY-MM-DD" }
--   precalculado por lib/finance/reschedule.ts y revalidado aquí bajo lock.
-- p_schedule_type / p_payment_days: calendario resultante del préstamo.
--   - 'fixed_days': las fechas deben seguir exactamente esos días fijos.
--   - 'interval'  : las fechas deben seguir loans.frequency desde la primera.
-- Solo admin/supervisor. Motivo obligatorio (mínimo 10 caracteres, igual
-- que anular recibo). Una sola transacción; orden de locks igual que
-- register_payment (primero loans, luego installments) para evitar
-- interbloqueos.
-- =========================================================================
create or replace function public.reschedule_loan_installments(
  p_loan_id uuid,
  p_schedule_type text,
  p_payment_days smallint[],
  p_new_dates jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
  v_loan public.loans;
  v_days smallint[];
  v_error text;
  v_reason text;
  v_movable_count integer;
  v_input_count integer;
  v_input_ids uuid[];
  v_input_dates date[];
  v_first_movable integer;
  v_last_locked_number integer;
  v_last_locked_date date;
  v_prev date;
  v_first date;
  v_idx integer := 0;
  v_row record;
  v_changes jsonb := '[]'::jsonb;
  v_detail jsonb;
  v_next_payment date;
  v_sum_before numeric;
  v_sum_after numeric;
begin
  -- Rol
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'supervisor') then
    raise exception 'Solo un admin o supervisor puede cambiar la fecha de pago';
  end if;

  -- Motivo
  v_reason := btrim(coalesce(p_reason, ''));
  if length(v_reason) < 10 then
    raise exception 'El motivo del cambio debe tener al menos 10 caracteres';
  end if;

  -- Calendario
  if p_schedule_type is null or p_schedule_type not in ('interval', 'fixed_days') then
    raise exception 'Tipo de calendario inválido';
  end if;
  if p_schedule_type = 'fixed_days' then
    v_error := public.payment_days_error(p_payment_days);
    if v_error is not null then
      raise exception '%', v_error;
    end if;
    select array_agg(d order by d) into v_days from unnest(p_payment_days) as d;
  elsif p_payment_days is not null then
    raise exception 'Los días fijos solo aplican al calendario de días fijos';
  end if;

  if p_new_dates is null or jsonb_typeof(p_new_dates) <> 'array' then
    raise exception 'Fechas nuevas inválidas';
  end if;

  -- Lock del préstamo
  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'El préstamo no existe';
  end if;
  if v_loan.status <> 'activo' then
    raise exception 'Solo se puede cambiar la fecha de un préstamo activo';
  end if;

  -- Lock de TODAS las cuotas del préstamo
  perform 1 from public.installments where loan_id = p_loan_id order by installment_number for update;

  select coalesce(sum(principal_amount + interest_amount + total_amount + amount_paid + remaining_amount), 0)
    into v_sum_before from public.installments where loan_id = p_loan_id;

  -- Cuotas movibles: pendiente/vencida sin ningún abono
  select count(*), min(installment_number) into v_movable_count, v_first_movable
    from public.installments
    where loan_id = p_loan_id and status in ('pendiente', 'vencida') and amount_paid = 0;
  if v_movable_count = 0 then
    raise exception 'El préstamo no tiene cuotas pendientes para reprogramar';
  end if;

  select max(installment_number), max(due_date) into v_last_locked_number, v_last_locked_date
    from public.installments
    where loan_id = p_loan_id and not (status in ('pendiente', 'vencida') and amount_paid = 0);
  if v_last_locked_number is not null and v_first_movable < v_last_locked_number then
    raise exception 'Hay cuotas pendientes anteriores a cuotas ya pagadas; no se puede reprogramar automáticamente';
  end if;

  -- El input debe cubrir EXACTAMENTE las cuotas movibles, sin repetir
  -- Solo se acepta AAAA-MM-DD: Postgres interpretaría "10/12/2026" como
  -- 12 de octubre (DateStyle MDY), lo cual sería un error silencioso.
  if exists (
    select 1 from jsonb_array_elements(p_new_dates) as item
    where jsonb_typeof(item) <> 'object'
       or coalesce(item ->> 'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'Fechas nuevas inválidas: deben tener formato AAAA-MM-DD';
  end if;

  begin
    select array_agg(r.installment_id order by r.installment_id), array_agg(r.due_date::date order by r.installment_id)
      into v_input_ids, v_input_dates
      from jsonb_to_recordset(p_new_dates) as r(installment_id uuid, due_date text);
  exception
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception 'Fechas nuevas inválidas';
  end;

  v_input_count := coalesce(cardinality(v_input_ids), 0);
  if v_input_count = 0
     or array_position(v_input_ids, null) is not null
     or array_position(v_input_dates, null) is not null then
    raise exception 'Fechas nuevas inválidas';
  end if;
  if (select count(distinct x) from unnest(v_input_ids) as x) <> v_input_count then
    raise exception 'Hay cuotas repetidas en las fechas nuevas';
  end if;
  if v_input_count <> v_movable_count or exists (
    select 1 from unnest(v_input_ids) as x(id)
    where not exists (
      select 1 from public.installments i
      where i.id = x.id and i.loan_id = p_loan_id
        and i.status in ('pendiente', 'vencida') and i.amount_paid = 0
    )
  ) then
    raise exception 'Las fechas nuevas deben incluir exactamente las cuotas pendientes sin abono del préstamo';
  end if;

  -- Validar fechas en orden de número de cuota
  for v_row in
    select i.id, i.installment_number, i.due_date as old_date, r.new_date
    from public.installments i
    join unnest(v_input_ids, v_input_dates) as r(installment_id, new_date) on r.installment_id = i.id
    where i.loan_id = p_loan_id
    order by i.installment_number
  loop
    if v_idx = 0 then
      v_first := v_row.new_date;
      if v_last_locked_date is not null and v_row.new_date <= v_last_locked_date then
        raise exception 'La nueva primera fecha debe ser posterior a % (última cuota pagada o con abono)', v_last_locked_date;
      end if;
      if p_schedule_type = 'fixed_days'
         and v_row.new_date <> public.fixed_day_after(v_row.new_date - 1, v_days) then
        raise exception 'La fecha % no corresponde a los días fijos elegidos', v_row.new_date;
      end if;
    else
      if p_schedule_type = 'fixed_days' then
        if v_row.new_date <> public.fixed_day_after(v_prev, v_days) then
          raise exception 'La cuota % debería vencer el %', v_row.installment_number, public.fixed_day_after(v_prev, v_days);
        end if;
      else
        if v_row.new_date <> public.loan_add_period(v_first, v_loan.frequency, v_idx) then
          raise exception 'La cuota % debería vencer el %', v_row.installment_number,
            public.loan_add_period(v_first, v_loan.frequency, v_idx);
        end if;
      end if;
    end if;

    v_changes := v_changes || jsonb_build_object(
      'cuota', v_row.installment_number,
      'antes', v_row.old_date,
      'despues', v_row.new_date
    );
    v_prev := v_row.new_date;
    v_idx := v_idx + 1;
  end loop;

  -- Aplicar: SOLO due_date (y vencida -> pendiente si la nueva fecha no está vencida)
  update public.installments i set
    due_date = r.new_date,
    status = case
      when i.status = 'vencida' and r.new_date >= current_date then 'pendiente'::public.installment_status
      else i.status
    end
  from unnest(v_input_ids, v_input_dates) as r(installment_id, new_date)
  where i.id = r.installment_id and i.loan_id = p_loan_id;

  -- Defensa extra: los montos no pueden haber cambiado.
  select coalesce(sum(principal_amount + interest_amount + total_amount + amount_paid + remaining_amount), 0)
    into v_sum_after from public.installments where loan_id = p_loan_id;
  if v_sum_after <> v_sum_before then
    raise exception 'Error interno: los montos de las cuotas cambiaron; se revierte el cambio';
  end if;

  select min(due_date) into v_next_payment
    from public.installments
    where loan_id = p_loan_id and status in ('pendiente', 'parcial', 'vencida');

  v_detail := jsonb_build_object(
    'motivo', v_reason,
    'calendario_antes', jsonb_build_object('tipo', v_loan.schedule_type, 'dias', to_jsonb(v_loan.payment_days),
                                           'frecuencia', v_loan.frequency),
    'calendario_despues', jsonb_build_object('tipo', p_schedule_type, 'dias', to_jsonb(v_days),
                                             'frecuencia', v_loan.frequency),
    'proximo_pago_antes', v_loan.next_payment_date,
    'proximo_pago_despues', v_next_payment,
    'cuotas', v_changes
  );

  update public.loans set
    schedule_type = p_schedule_type,
    payment_days = v_days,
    next_payment_date = v_next_payment
  where id = p_loan_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'cambiar_fecha_pago', 'loans', p_loan_id,
    'Cambio de fecha de pago préstamo ' || v_loan.loan_number || '. Motivo: ' || v_reason
    || ' | Detalle: ' || v_detail::text);

  return v_detail;
end;
$$;

-- =========================================================================
-- Permisos: igual que 0006/0010. La verificación de rol fina vive DENTRO
-- de cada RPC. Los helpers no se exponen (se usan desde funciones
-- SECURITY DEFINER, que corren como su dueño).
-- =========================================================================
revoke execute on function public.payment_days_error(smallint[]) from public, anon, authenticated;
revoke execute on function public.fixed_day_after(date, smallint[]) from public, anon, authenticated;
revoke execute on function public.loan_add_period(date, public.loan_frequency, integer) from public, anon, authenticated;

revoke execute on function public.create_loan_with_schedule(
  uuid, numeric, numeric, public.loan_interest_type, integer, numeric, numeric, numeric,
  public.loan_frequency, date, date, text, jsonb, text, smallint[]
) from public, anon;
revoke execute on function public.reschedule_loan_installments(uuid, text, smallint[], jsonb, text) from public, anon;

grant execute on function public.create_loan_with_schedule(
  uuid, numeric, numeric, public.loan_interest_type, integer, numeric, numeric, numeric,
  public.loan_frequency, date, date, text, jsonb, text, smallint[]
) to authenticated;
grant execute on function public.reschedule_loan_installments(uuid, text, smallint[], jsonb, text) to authenticated;
