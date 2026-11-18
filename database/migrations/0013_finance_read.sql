-- NEXA — Migración 0013: Finanzas (fase 1) — funciones de SOLO LECTURA
--
-- ADITIVA. Solo crea funciones nuevas que leen datos existentes. No crea ni
-- modifica tablas, vistas, políticas RLS, funciones existentes ni datos.
--
-- Seguridad:
--   * Todas corren con los permisos de QUIEN LLAMA (security invoker): respetan RLS.
--   * Todas exigen rol admin o supervisor (finance_require_role); un cobrador
--     recibe error. anon no puede ejecutarlas.
--
-- Qué calculan (la presentación, porcentajes y comparaciones viven en
-- lib/finance/indicators.ts y lib/finance/periods.ts):
--   finance_position(fecha)        cartera a una fecha: capital en la calle e interés por cobrar
--   finance_cash(fecha)            disponible en caja a una fecha (misma fórmula que dashboard_metrics)
--   finance_flows(desde, hasta)    cobrado (capital/interés), desembolsado, nuevos, pagados, capital promedio
--   finance_collection_efficiency  cuánto tocaba cobrar vs. cuánto se cobró
--   finance_monthly(hasta, meses)  serie mensual
--   finance_projection(fecha, n)   cuotas pendientes de las próximas n semanas (capital e interés exactos)
--   finance_overdue_loans(fecha)   préstamos con atraso a una fecha
--   finance_by_user(desde, hasta)  cobrado por usuario que registró el pago
--   finance_top_clients            clientes por interés cobrado
--   finance_cancelled_loans()      préstamos cancelados y su capital no recuperado
--
-- Reglas comunes:
--   * Ganancia cobrada = Σ payments.interest_applied (por payment_date).
--   * Un préstamo cuenta en cartera desde start_date. Si está cancelado,
--     deja de contar desde su fecha de cancelación (audit_logs
--     'cancelar_prestamo'; si no existe, loans.updated_at). Su capital no
--     recuperado se informa aparte (finance_cancelled_loans), sin restarlo
--     de la ganancia.
--   * Las fechas de auditoría se convierten a fecha de República Dominicana.
--   * Tolerancia de 1 centavo (la misma de register_payment con las cuotas):
--     un saldo de RD$0.01 o menos cuenta como cero. Un préstamo así no suma
--     a la cartera ni cuenta como activo, y una cuota así no está atrasada
--     y cuenta como pagada completa.
--
-- Reversa: 0013_down.sql

begin;

-- =========================================================================
-- Helpers
-- =========================================================================
create or replace function public.finance_require_role()
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
begin
  if v_role is null or v_role not in ('admin', 'supervisor') then
    raise exception 'Solo un admin o supervisor puede ver Finanzas';
  end if;
end;
$$;

-- Préstamos con su fecha de cancelación (NULL si no está cancelado).
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
    case when l.status = 'cancelado' then
      coalesce(
        (select min((a.created_at at time zone 'America/Santo_Domingo')::date)
           from public.audit_logs a
          where a.entity = 'loans' and a.entity_id = l.id and a.action = 'cancelar_prestamo'),
        (l.updated_at at time zone 'America/Santo_Domingo')::date
      )
    end
  from public.loans l;
end;
$$;

-- =========================================================================
-- finance_position: cartera al cierre de p_date, por frecuencia.
--   capital_outstanding  = Σ principal_amount − Σ principal_applied (pagos ≤ fecha)
--   interest_outstanding = Σ total_interest  − Σ interest_applied  (pagos ≤ fecha)
-- de los préstamos con start_date ≤ fecha y no cancelados a esa fecha.
-- Para hoy coincide con Σ outstanding_principal / outstanding_interest de
-- los préstamos activos.
-- =========================================================================
create or replace function public.finance_position(p_date date)
returns table (
  frequency public.loan_frequency,
  active_loans integer,
  capital_outstanding numeric,
  interest_outstanding numeric
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  if p_date is null then
    raise exception 'Fecha requerida';
  end if;
  return query
  with fl as (
    select * from public.finance_loans() f
    where f.start_date <= p_date and (f.cancelled_on is null or f.cancelled_on > p_date)
  ),
  p as (
    select pm.loan_id, sum(pm.principal_applied) as pa, sum(pm.interest_applied) as ia
    from public.payments pm
    where pm.payment_date <= p_date
    group by pm.loan_id
  ),
  raw as (
    select fl.frequency,
      fl.principal_amount - coalesce(p.pa, 0) as cap,
      fl.total_interest - coalesce(p.ia, 0) as intr
    from fl left join p on p.loan_id = fl.id
  ),
  -- Saldo de 1 centavo o menos = cero (tolerancia de las cuotas).
  x as (
    select raw.frequency,
      case when raw.cap + raw.intr <= 0.01 then 0 else raw.cap end as cap,
      case when raw.cap + raw.intr <= 0.01 then 0 else raw.intr end as intr
    from raw
  )
  select x.frequency,
    (count(*) filter (where x.cap + x.intr > 0))::integer,
    coalesce(sum(x.cap), 0)::numeric,
    coalesce(sum(x.intr), 0)::numeric
  from x
  group by x.frequency
  order by x.frequency;
end;
$$;

-- =========================================================================
-- finance_cash: disponible en caja al cierre de p_date.
-- aporte + pago + ajuste − retiro − prestamo (igual que dashboard_metrics).
-- =========================================================================
create or replace function public.finance_cash(p_date date)
returns numeric
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  perform public.finance_require_role();
  return coalesce((
    select sum(case
      when t.type in ('aporte', 'pago', 'ajuste') then t.amount
      when t.type in ('retiro', 'prestamo') then -t.amount
      else 0
    end)
    from public.capital_transactions t
    where t.transaction_date <= p_date
  ), 0);
end;
$$;

-- =========================================================================
-- finance_flows: movimientos del período [p_from, p_to], por frecuencia.
--   interest_collected / principal_collected: Σ de pagos con payment_date en el período
--   operations: pagos registrados (un pago que cubre varias cuotas cuenta 1)
--   disbursed / new_loans: préstamos con start_date en el período
--   paid_loans: préstamos 'pagado' cuyo último pago cae en el período
--   avg_capital: promedio diario del capital en la calle en el período
-- =========================================================================
create or replace function public.finance_flows(p_from date, p_to date)
returns table (
  frequency public.loan_frequency,
  interest_collected numeric,
  principal_collected numeric,
  operations integer,
  disbursed numeric,
  new_loans integer,
  paid_loans integer,
  avg_capital numeric
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
  with fl as (select * from public.finance_loans()),
  pay as (
    select pm.loan_id, pm.amount, pm.principal_applied, pm.interest_applied, pm.payment_date, pm.created_at,
      fl.frequency, fl.start_date, fl.cancelled_on
    from public.payments pm join fl on fl.id = pm.loan_id
  ),
  period_pay as (
    select pay.frequency,
      sum(pay.interest_applied) as i,
      sum(pay.principal_applied) as c,
      count(distinct (pay.loan_id, pay.created_at)) as ops
    from pay
    where pay.payment_date between p_from and p_to
    group by pay.frequency
  ),
  new_l as (
    select fl.frequency, sum(fl.principal_amount) as d, count(*) as n
    from fl where fl.start_date between p_from and p_to
    group by fl.frequency
  ),
  paid_l as (
    select fl.frequency, count(*) as n
    from fl
    join (select pm.loan_id, max(pm.payment_date) as last_payment from public.payments pm group by pm.loan_id) lp
      on lp.loan_id = fl.id
    where fl.status = 'pagado' and lp.last_payment between p_from and p_to
    group by fl.frequency
  ),
  -- Promedio diario sin recorrer día por día: cada préstamo aporta su capital
  -- por los días del período en que estaba vigente, y cada pago de capital
  -- lo descuenta desde su fecha.
  cap_days as (
    select fl.frequency,
      sum(fl.principal_amount * greatest(0,
        least(p_to, coalesce(fl.cancelled_on - 1, p_to)) - greatest(p_from, fl.start_date) + 1)) as v
    from fl group by fl.frequency
  ),
  paid_days as (
    select pay.frequency,
      sum(pay.principal_applied * greatest(0,
        least(p_to, coalesce(pay.cancelled_on - 1, p_to)) - greatest(p_from, pay.payment_date, pay.start_date) + 1)) as v
    from pay group by pay.frequency
  ),
  freqs as (select unnest(enum_range(null::public.loan_frequency)) as frequency)
  select f.frequency,
    coalesce(pp.i, 0)::numeric,
    coalesce(pp.c, 0)::numeric,
    coalesce(pp.ops, 0)::integer,
    coalesce(nl.d, 0)::numeric,
    coalesce(nl.n, 0)::integer,
    coalesce(pl.n, 0)::integer,
    round((coalesce(cd.v, 0) - coalesce(pd.v, 0)) / (p_to - p_from + 1), 2)::numeric
  from freqs f
  left join period_pay pp on pp.frequency = f.frequency
  left join new_l nl on nl.frequency = f.frequency
  left join paid_l pl on pl.frequency = f.frequency
  left join cap_days cd on cd.frequency = f.frequency
  left join paid_days pd on pd.frequency = f.frequency
  order by f.frequency;
end;
$$;

-- =========================================================================
-- finance_collection_efficiency: cuotas que vencían en [p_from, p_to]
-- (de préstamos vigentes al cierre). due_amount = Σ total_amount;
-- collected_amount = Σ de lo pagado sobre ESAS cuotas hasta p_to.
-- =========================================================================
create or replace function public.finance_collection_efficiency(p_from date, p_to date)
returns table (
  due_amount numeric,
  collected_amount numeric,
  installments_due integer,
  installments_paid integer
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
  with fl as (
    select * from public.finance_loans() f
    where f.start_date <= p_to and (f.cancelled_on is null or f.cancelled_on > p_to)
  ),
  i as (
    select ins.id, ins.total_amount
    from public.installments ins join fl on fl.id = ins.loan_id
    where ins.due_date between p_from and p_to
  ),
  pp as (
    select pm.installment_id, sum(pm.amount) as a
    from public.payments pm join i on i.id = pm.installment_id
    where pm.payment_date <= p_to
    group by pm.installment_id
  )
  select
    coalesce(sum(i.total_amount), 0)::numeric,
    coalesce(sum(least(coalesce(pp.a, 0), i.total_amount)), 0)::numeric,
    count(i.id)::integer,
    (count(i.id) filter (where coalesce(pp.a, 0) >= i.total_amount - 0.01))::integer
  from i left join pp on pp.installment_id = i.id;
end;
$$;

-- =========================================================================
-- finance_monthly: últimos p_months meses hasta el mes de p_to (incluido).
-- Pagos por payment_date; desembolsos por start_date. Nada posterior a p_to.
-- =========================================================================
create or replace function public.finance_monthly(p_to date, p_months integer)
returns table (
  month_start date,
  interest_collected numeric,
  principal_collected numeric,
  disbursed numeric
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  if p_to is null or p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'Parámetros inválidos';
  end if;
  return query
  with months as (
    select (date_trunc('month', p_to) - make_interval(months => g))::date as m
    from generate_series(0, p_months - 1) as g
  ),
  fl as (select * from public.finance_loans()),
  pay as (
    select date_trunc('month', pm.payment_date)::date as m,
      sum(pm.interest_applied) as i, sum(pm.principal_applied) as c
    from public.payments pm
    where pm.payment_date <= p_to
    group by 1
  ),
  dis as (
    select date_trunc('month', fl.start_date)::date as m, sum(fl.principal_amount) as d
    from fl where fl.start_date <= p_to
    group by 1
  )
  select months.m,
    coalesce(pay.i, 0)::numeric,
    coalesce(pay.c, 0)::numeric,
    coalesce(dis.d, 0)::numeric
  from months
  left join pay on pay.m = months.m
  left join dis on dis.m = months.m
  order by months.m;
end;
$$;

-- =========================================================================
-- finance_projection: lo que falta cobrar de las cuotas abiertas de
-- préstamos activos. bucket 0 = ya atrasado (vence antes de p_date);
-- bucket k = semana k (k = 1: p_date … p_date+6).
-- capital = capital de la cuota − capital ya cobrado; interés igual (exacto).
-- =========================================================================
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

-- =========================================================================
-- finance_overdue_loans: préstamos con atraso al cierre de p_date.
--   days_late       = p_date − vencimiento de la cuota impaga más vieja
--   capital_at_risk = saldo de capital del préstamo a esa fecha (estándar PAR)
--   overdue_amount  = lo vencido sin pagar a esa fecha
-- Una cuota está atrasada si vence ANTES de p_date y no está pagada.
-- =========================================================================
create or replace function public.finance_overdue_loans(p_date date)
returns table (
  loan_id uuid,
  loan_number text,
  client_id uuid,
  client_name text,
  frequency public.loan_frequency,
  days_late integer,
  capital_at_risk numeric,
  overdue_amount numeric,
  overdue_installments integer
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  if p_date is null then
    raise exception 'Fecha requerida';
  end if;
  return query
  with fl as (
    select * from public.finance_loans() f
    where f.start_date <= p_date and (f.cancelled_on is null or f.cancelled_on > p_date)
  ),
  paid_inst as (
    select pm.installment_id, sum(pm.amount) as a
    from public.payments pm where pm.payment_date <= p_date
    group by pm.installment_id
  ),
  late as (
    select ins.loan_id, ins.due_date, ins.total_amount - coalesce(pi.a, 0) as rem
    from public.installments ins
    join fl on fl.id = ins.loan_id
    left join paid_inst pi on pi.installment_id = ins.id
    where ins.due_date < p_date and ins.total_amount - coalesce(pi.a, 0) > 0.01
  ),
  agg as (
    select late.loan_id, min(late.due_date) as oldest, sum(late.rem) as rem, count(*) as n
    from late group by late.loan_id
  ),
  cap as (
    select pm.loan_id, sum(pm.principal_applied) as pa
    from public.payments pm where pm.payment_date <= p_date
    group by pm.loan_id
  )
  select fl.id, fl.loan_number, fl.client_id, c.full_name::text, fl.frequency,
    (p_date - agg.oldest)::integer,
    (fl.principal_amount - coalesce(cap.pa, 0))::numeric,
    agg.rem::numeric,
    agg.n::integer
  from agg
  join fl on fl.id = agg.loan_id
  join public.clients c on c.id = fl.client_id
  left join cap on cap.loan_id = fl.id
  order by 6 desc, 8 desc;
end;
$$;

-- =========================================================================
-- finance_by_user: cobrado por el usuario que registró el pago.
-- =========================================================================
create or replace function public.finance_by_user(p_from date, p_to date)
returns table (
  user_id uuid,
  user_name text,
  operations integer,
  collected numeric,
  principal numeric,
  interest numeric
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
  select pm.created_by,
    coalesce(u.name, 'Sin usuario')::text,
    count(distinct (pm.loan_id, pm.created_at))::integer,
    sum(pm.amount)::numeric,
    sum(pm.principal_applied)::numeric,
    sum(pm.interest_applied)::numeric
  from public.payments pm
  left join public.users u on u.id = pm.created_by
  where pm.payment_date between p_from and p_to
  group by pm.created_by, u.name
  order by 4 desc;
end;
$$;

-- =========================================================================
-- finance_top_clients: clientes por interés cobrado en el período.
-- =========================================================================
create or replace function public.finance_top_clients(p_from date, p_to date, p_limit integer)
returns table (
  client_id uuid,
  client_name text,
  interest numeric,
  principal numeric,
  loans integer
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  if p_from is null or p_to is null or p_from > p_to or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Parámetros inválidos';
  end if;
  return query
  select c.id, c.full_name::text,
    sum(pm.interest_applied)::numeric,
    sum(pm.principal_applied)::numeric,
    count(distinct pm.loan_id)::integer
  from public.payments pm
  join public.clients c on c.id = pm.client_id
  where pm.payment_date between p_from and p_to
  group by c.id, c.full_name
  having sum(pm.interest_applied) > 0
  order by 3 desc, 2
  limit p_limit;
end;
$$;

-- =========================================================================
-- finance_cancelled_loans: préstamos cancelados, con lo cobrado antes de
-- cancelar y el capital que no se recuperó (capital − capital cobrado).
-- Se calcula desde los pagos, no desde outstanding_principal.
-- =========================================================================
create or replace function public.finance_cancelled_loans()
returns table (
  loan_id uuid,
  loan_number text,
  client_id uuid,
  client_name text,
  frequency public.loan_frequency,
  start_date date,
  cancelled_on date,
  principal_amount numeric,
  principal_collected numeric,
  interest_collected numeric,
  payments integer,
  capital_lost numeric,
  notes text
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
    fl.id,
    fl.loan_number,
    fl.client_id,
    c.full_name::text,
    fl.frequency,
    fl.start_date,
    fl.cancelled_on,
    fl.principal_amount,
    coalesce(p.principal, 0)::numeric,
    coalesce(p.interest, 0)::numeric,
    coalesce(p.n, 0)::integer,
    greatest(fl.principal_amount - coalesce(p.principal, 0), 0)::numeric,
    l.notes::text
  from public.finance_loans() fl
  join public.loans l on l.id = fl.id
  join public.clients c on c.id = fl.client_id
  left join (
    select pm.loan_id, sum(pm.principal_applied) as principal, sum(pm.interest_applied) as interest,
      count(distinct (pm.loan_id, pm.created_at)) as n
    from public.payments pm
    group by pm.loan_id
  ) p on p.loan_id = fl.id
  where fl.status = 'cancelado'
  order by fl.cancelled_on desc, fl.loan_number;
end;
$$;

-- =========================================================================
-- Permisos: nadie anónimo; el rol se verifica dentro de cada función.
-- (finance_require_role y finance_loans deben poder ejecutarse por
-- authenticated porque las demás corren con los permisos de quien llama.)
-- =========================================================================
revoke execute on function public.finance_require_role() from public, anon;
revoke execute on function public.finance_loans() from public, anon;
revoke execute on function public.finance_position(date) from public, anon;
revoke execute on function public.finance_cash(date) from public, anon;
revoke execute on function public.finance_flows(date, date) from public, anon;
revoke execute on function public.finance_collection_efficiency(date, date) from public, anon;
revoke execute on function public.finance_monthly(date, integer) from public, anon;
revoke execute on function public.finance_projection(date, integer) from public, anon;
revoke execute on function public.finance_overdue_loans(date) from public, anon;
revoke execute on function public.finance_by_user(date, date) from public, anon;
revoke execute on function public.finance_top_clients(date, date, integer) from public, anon;
revoke execute on function public.finance_cancelled_loans() from public, anon;

grant execute on function public.finance_require_role() to authenticated;
grant execute on function public.finance_loans() to authenticated;
grant execute on function public.finance_position(date) to authenticated;
grant execute on function public.finance_cash(date) to authenticated;
grant execute on function public.finance_flows(date, date) to authenticated;
grant execute on function public.finance_collection_efficiency(date, date) to authenticated;
grant execute on function public.finance_monthly(date, integer) to authenticated;
grant execute on function public.finance_projection(date, integer) to authenticated;
grant execute on function public.finance_overdue_loans(date) to authenticated;
grant execute on function public.finance_by_user(date, date) to authenticated;
grant execute on function public.finance_top_clients(date, date, integer) to authenticated;
grant execute on function public.finance_cancelled_loans() to authenticated;

commit;
