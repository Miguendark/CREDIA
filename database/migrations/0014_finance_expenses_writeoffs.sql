-- NEXA — Migración 0014: Finanzas (fase 2) — gastos e incobrables
--
-- ADITIVA. Crea dos tablas nuevas, sus funciones de escritura y lectura, y
-- reemplaza dos funciones de lectura de la 0013 (finance_loans y
-- finance_projection) para que Finanzas saque de la cartera los préstamos
-- marcados incobrables. No modifica tablas, vistas ni funciones existentes
-- fuera de las de Finanzas; no toca loans, payments, capital_transactions,
-- register_payment ni el Dashboard. No borra datos.
--
-- 1) expenses: gastos de operación. No mueven Capital: Finanzas muestra
--    "Caja después de gastos" = caja − gastos. Admin y supervisor
--    registran; solo admin anula (con motivo). No se borran.
-- 2) loan_writeoffs: clasificación de un préstamo como pérdida.
--      incobrable → el cliente no va a pagar: es pérdida en la fecha en que se marca.
--      error      → préstamo creado por error (solo cancelados): no es pérdida.
--    Préstamo activo: solo "incobrable"; sigue "activo" (Dashboard, Capital y
--    Cobros lo siguen viendo); solo Finanzas lo trata como pérdida.
--    Solo admin; motivo obligatorio. Se anula (desclasifica), no se borra.
--    Guarda el capital y el interés pendientes en el momento de clasificar.
-- 3) Lectura para Finanzas: finance_expenses, finance_expenses_total,
--    finance_writeoffs; finance_loans y finance_projection actualizadas.
--
-- Reversa: 0014_down.sql (restaura las funciones de la 0013 y elimina lo nuevo).

begin;

-- =========================================================================
-- 1) Gastos
-- =========================================================================
create type public.expense_category as enum (
  'gasolina_transporte',
  'telefono_internet',
  'papeleria_impresion',
  'sueldos',
  'comisiones',
  'alquiler',
  'otros'
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default public.today_rd(),
  category public.expense_category not null,
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.users (id),
  void_reason text,
  constraint expenses_void_consistent check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and void_reason is not null and btrim(void_reason) <> '')
  )
);

comment on table public.expenses is 'Gastos de operación (Finanzas). No mueven Capital. No se borran: se anulan con motivo (solo admin).';

create index expenses_date_idx on public.expenses (expense_date) where voided_at is null;

-- =========================================================================
-- 2) Clasificación de préstamos (incobrable / error)
-- =========================================================================
create type public.writeoff_kind as enum ('incobrable', 'error');

create table public.loan_writeoffs (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete restrict,
  kind public.writeoff_kind not null,
  writeoff_date date not null,
  reason text not null check (btrim(reason) <> ''),
  capital_lost numeric(14, 2) not null check (capital_lost >= 0),
  interest_lost numeric(14, 2) not null check (interest_lost >= 0),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.users (id),
  void_reason text,
  constraint loan_writeoffs_void_consistent check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and void_reason is not null and btrim(void_reason) <> '')
  )
);

comment on table public.loan_writeoffs is 'Préstamos clasificados como incobrable (pérdida) o error (no es pérdida). No modifica el préstamo. Se anula, no se borra.';
comment on column public.loan_writeoffs.capital_lost is 'Capital pendiente al clasificar (capital − capital cobrado). Para kind = error no es pérdida.';

-- Una sola clasificación vigente por préstamo.
create unique index loan_writeoffs_one_active_idx on public.loan_writeoffs (loan_id) where voided_at is null;

-- =========================================================================
-- RLS: solo admin y supervisor leen. Nadie escribe directo: solo las
-- funciones de abajo (security definer, verifican el rol).
-- =========================================================================
alter table public.expenses enable row level security;
alter table public.loan_writeoffs enable row level security;

create policy expenses_select_admin_supervisor on public.expenses
  for select using (public.current_user_role() in ('admin', 'supervisor'));
create policy loan_writeoffs_select_admin_supervisor on public.loan_writeoffs
  for select using (public.current_user_role() in ('admin', 'supervisor'));

revoke all on public.expenses from anon, authenticated;
revoke all on public.loan_writeoffs from anon, authenticated;
grant select on public.expenses to authenticated;
grant select on public.loan_writeoffs to authenticated;

-- =========================================================================
-- register_expense — admin o supervisor
-- =========================================================================
create or replace function public.register_expense(
  p_category public.expense_category,
  p_amount numeric,
  p_description text,
  p_expense_date date
)
returns public.expenses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expense public.expenses;
  v_date date := coalesce(p_expense_date, public.today_rd());
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'supervisor') then
    raise exception 'Solo un admin o supervisor puede registrar gastos';
  end if;
  if p_category is null then
    raise exception 'La categoría es obligatoria';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del gasto debe ser mayor a cero';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'El monto no puede tener más de 2 decimales';
  end if;
  if v_date > public.today_rd() then
    raise exception 'La fecha del gasto no puede ser futura';
  end if;
  if p_category = 'otros' and v_description is null then
    raise exception 'Describe el gasto cuando la categoría es "Otros"';
  end if;
  if v_description is not null and length(v_description) > 255 then
    raise exception 'La descripción no puede pasar de 255 caracteres';
  end if;

  insert into public.expenses (expense_date, category, amount, description, created_by)
  values (v_date, p_category, p_amount, v_description, auth.uid())
  returning * into v_expense;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'registrar_gasto', 'expenses', v_expense.id,
    'Gasto ' || p_category || ' de RD$' || p_amount || ' del ' || v_date);

  return v_expense;
end;
$$;

-- =========================================================================
-- void_expense — solo admin, motivo obligatorio
-- =========================================================================
create or replace function public.void_expense(p_expense_id uuid, p_reason text)
returns public.expenses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expense public.expenses;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'Solo un admin puede anular gastos';
  end if;
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Escribe el motivo de la anulación';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'El gasto no existe';
  end if;
  if v_expense.voided_at is not null then
    raise exception 'Este gasto ya está anulado';
  end if;

  update public.expenses
    set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
    where id = p_expense_id
    returning * into v_expense;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'anular_gasto', 'expenses', p_expense_id,
    'Gasto de RD$' || v_expense.amount || ' anulado: ' || v_reason);

  return v_expense;
end;
$$;

-- =========================================================================
-- classify_loan — solo admin, motivo obligatorio. No modifica el préstamo.
--   cancelado → incobrable o error
--   activo    → solo incobrable (sigue activo fuera de Finanzas)
--   pagado    → no se clasifica
-- =========================================================================
create or replace function public.classify_loan(
  p_loan_id uuid,
  p_kind public.writeoff_kind,
  p_reason text,
  p_writeoff_date date
)
returns public.loan_writeoffs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_loan public.loans;
  v_writeoff public.loan_writeoffs;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_date date := coalesce(p_writeoff_date, public.today_rd());
  v_principal_paid numeric;
  v_interest_paid numeric;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'Solo un admin puede clasificar préstamos como incobrables';
  end if;
  if p_kind is null then
    raise exception 'Indica si es incobrable o un error';
  end if;
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Escribe el motivo';
  end if;
  if length(v_reason) > 255 then
    raise exception 'El motivo no puede pasar de 255 caracteres';
  end if;

  -- Mismo orden de bloqueo que register_payment (primero el préstamo).
  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'El préstamo no existe';
  end if;
  if v_loan.status = 'pagado' then
    raise exception 'El préstamo % ya está pagado; no se puede clasificar', v_loan.loan_number;
  end if;
  if v_loan.status = 'activo' and p_kind <> 'incobrable' then
    raise exception 'Un préstamo activo solo se puede marcar como incobrable';
  end if;
  if v_loan.status not in ('activo', 'cancelado') then
    raise exception 'El préstamo % no se puede clasificar (estado: %)', v_loan.loan_number, v_loan.status;
  end if;
  if exists (select 1 from public.loan_writeoffs w where w.loan_id = p_loan_id and w.voided_at is null) then
    raise exception 'El préstamo % ya está clasificado', v_loan.loan_number;
  end if;
  if v_date > public.today_rd() then
    raise exception 'La fecha no puede ser futura';
  end if;
  if v_date < v_loan.start_date then
    raise exception 'La fecha no puede ser anterior al inicio del préstamo (%)', v_loan.start_date;
  end if;

  select coalesce(sum(principal_applied), 0), coalesce(sum(interest_applied), 0)
    into v_principal_paid, v_interest_paid
    from public.payments where loan_id = p_loan_id;

  insert into public.loan_writeoffs (loan_id, kind, writeoff_date, reason, capital_lost, interest_lost, created_by)
  values (
    p_loan_id, p_kind, v_date, v_reason,
    greatest(v_loan.principal_amount - v_principal_paid, 0),
    greatest(v_loan.total_interest - v_interest_paid, 0),
    auth.uid()
  )
  returning * into v_writeoff;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'clasificar_prestamo', 'loans', p_loan_id,
    'Préstamo ' || v_loan.loan_number || ' clasificado como ' || p_kind || ' (' || v_date || '): ' || v_reason);

  return v_writeoff;
end;
$$;

-- =========================================================================
-- void_writeoff — solo admin, motivo obligatorio (quita la clasificación)
-- =========================================================================
create or replace function public.void_writeoff(p_writeoff_id uuid, p_reason text)
returns public.loan_writeoffs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_writeoff public.loan_writeoffs;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_number text;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'Solo un admin puede quitar una clasificación';
  end if;
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Escribe el motivo';
  end if;

  select * into v_writeoff from public.loan_writeoffs where id = p_writeoff_id for update;
  if not found then
    raise exception 'La clasificación no existe';
  end if;
  if v_writeoff.voided_at is not null then
    raise exception 'Esta clasificación ya fue quitada';
  end if;

  update public.loan_writeoffs
    set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
    where id = p_writeoff_id
    returning * into v_writeoff;

  select loan_number into v_number from public.loans where id = v_writeoff.loan_id;
  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'desclasificar_prestamo', 'loans', v_writeoff.loan_id,
    'Préstamo ' || v_number || ': se quitó la clasificación ' || v_writeoff.kind || ': ' || v_reason);

  return v_writeoff;
end;
$$;

-- =========================================================================
-- 3) Lectura para Finanzas
-- =========================================================================

-- finance_loans (reemplaza la de 0013, misma firma). cancelled_on pasa a
-- ser "la fecha en que el préstamo sale de la cartera":
--   cancelado              → fecha de cancelación (igual que 0013)
--   activo + incobrable    → fecha en que se marcó incobrable
create or replace function public.finance_loans()
returns table (
  id uuid,
  loan_number text,
  client_id uuid,
  frequency public.loan_frequency,
  status public.loan_status,
  start_date date,
  principal_amount numeric,
  total_interest numeric,
  cancelled_on date
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  return query
  select
    l.id,
    l.loan_number::text,
    l.client_id,
    l.frequency,
    l.status,
    l.start_date,
    l.principal_amount::numeric,
    l.total_interest::numeric,
    case
      when l.status = 'cancelado' then
        coalesce(
          (select min((a.created_at at time zone 'America/Santo_Domingo')::date)
             from public.audit_logs a
            where a.entity = 'loans' and a.entity_id = l.id and a.action = 'cancelar_prestamo'),
          (l.updated_at at time zone 'America/Santo_Domingo')::date
        )
      else
        (select w.writeoff_date from public.loan_writeoffs w
          where w.loan_id = l.id and w.voided_at is null and w.kind = 'incobrable')
    end
  from public.loans l;
end;
$$;

-- finance_projection (reemplaza la de 0013): igual, pero sin los préstamos
-- marcados incobrables (no se espera cobrarles).
create or replace function public.finance_projection(p_date date, p_weeks integer)
returns table (
  bucket integer,
  installments integer,
  capital numeric,
  interest numeric
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  if p_date is null or p_weeks is null or p_weeks < 1 or p_weeks > 26 then
    raise exception 'Parámetros inválidos';
  end if;
  return query
  with open_i as (
    select ins.id, ins.due_date,
      ins.principal_amount - coalesce(sum(pm.principal_applied), 0) as cap,
      ins.interest_amount - coalesce(sum(pm.interest_applied), 0) as intr
    from public.installments ins
    join public.loans l on l.id = ins.loan_id
    left join public.payments pm on pm.installment_id = ins.id
    where l.status = 'activo' and ins.status in ('pendiente', 'parcial', 'vencida')
      and not exists (
        select 1 from public.loan_writeoffs w
        where w.loan_id = l.id and w.voided_at is null and w.kind = 'incobrable'
      )
    group by ins.id, ins.due_date, ins.principal_amount, ins.interest_amount
    having ins.principal_amount + ins.interest_amount
      - coalesce(sum(pm.principal_applied), 0) - coalesce(sum(pm.interest_applied), 0) > 0.01
  ),
  b as (
    select case when o.due_date < p_date then 0 else ((o.due_date - p_date) / 7) + 1 end as bk, o.cap, o.intr
    from open_i o
  )
  select b.bk::integer, count(*)::integer, sum(b.cap)::numeric, sum(b.intr)::numeric
  from b
  where b.bk <= p_weeks
  group by b.bk
  order by b.bk;
end;
$$;

-- Gastos del período (incluye anulados, marcados, para mostrarlos tachados).
create or replace function public.finance_expenses(p_from date, p_to date)
returns table (
  id uuid,
  expense_date date,
  category public.expense_category,
  amount numeric,
  description text,
  created_by_name text,
  created_at timestamptz,
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Período inválido';
  end if;
  return query
  select e.id, e.expense_date, e.category, e.amount::numeric, e.description,
    coalesce(uc.name, 'Sin usuario')::text, e.created_at, e.voided_at, uv.name::text, e.void_reason
  from public.expenses e
  left join public.users uc on uc.id = e.created_by
  left join public.users uv on uv.id = e.voided_by
  where e.expense_date between p_from and p_to
  order by e.expense_date desc, e.created_at desc;
end;
$$;

-- Total de gastos vigentes hasta p_date (para "Caja después de gastos").
create or replace function public.finance_expenses_total(p_date date)
returns numeric
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  perform public.finance_require_role();
  return coalesce((
    select sum(e.amount) from public.expenses e
    where e.voided_at is null and e.expense_date <= p_date
  ), 0);
end;
$$;

-- Clasificaciones vigentes, con su préstamo.
create or replace function public.finance_writeoffs()
returns table (
  id uuid,
  loan_id uuid,
  loan_number text,
  client_id uuid,
  client_name text,
  loan_status public.loan_status,
  kind public.writeoff_kind,
  writeoff_date date,
  reason text,
  capital_lost numeric,
  interest_lost numeric,
  created_by_name text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  return query
  select w.id, w.loan_id, l.loan_number::text, l.client_id, c.full_name::text, l.status, w.kind,
    w.writeoff_date, w.reason, w.capital_lost::numeric, w.interest_lost::numeric,
    coalesce(u.name, 'Sin usuario')::text
  from public.loan_writeoffs w
  join public.loans l on l.id = w.loan_id
  join public.clients c on c.id = l.client_id
  left join public.users u on u.id = w.created_by
  where w.voided_at is null
  order by w.writeoff_date desc, l.loan_number;
end;
$$;

-- =========================================================================
-- Permisos
-- =========================================================================
revoke execute on function public.register_expense(public.expense_category, numeric, text, date) from public, anon;
revoke execute on function public.void_expense(uuid, text) from public, anon;
revoke execute on function public.classify_loan(uuid, public.writeoff_kind, text, date) from public, anon;
revoke execute on function public.void_writeoff(uuid, text) from public, anon;
revoke execute on function public.finance_expenses(date, date) from public, anon;
revoke execute on function public.finance_expenses_total(date) from public, anon;
revoke execute on function public.finance_writeoffs() from public, anon;

grant execute on function public.register_expense(public.expense_category, numeric, text, date) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.classify_loan(uuid, public.writeoff_kind, text, date) to authenticated;
grant execute on function public.void_writeoff(uuid, text) to authenticated;
grant execute on function public.finance_expenses(date, date) to authenticated;
grant execute on function public.finance_expenses_total(date) to authenticated;
grant execute on function public.finance_writeoffs() to authenticated;

commit;
