-- NEXA — Verificación (SOLO LECTURA) después de aplicar 0013 (Finanzas, funciones de lectura).
-- Un único SELECT. Todas las filas con "ok" deben ser true; null = informativo.
--
-- Para llamar a las funciones (exigen admin/supervisor) este SELECT actúa como
-- el primer usuario admin SOLO durante esta consulta (set_config local a la
-- transacción). No escribe nada.

with
fn(name, sig) as (
  values
    ('finance_require_role', 'public.finance_require_role()'),
    ('finance_loans', 'public.finance_loans()'),
    ('finance_position', 'public.finance_position(date)'),
    ('finance_cash', 'public.finance_cash(date)'),
    ('finance_flows', 'public.finance_flows(date, date)'),
    ('finance_collection_efficiency', 'public.finance_collection_efficiency(date, date)'),
    ('finance_monthly', 'public.finance_monthly(date, integer)'),
    ('finance_projection', 'public.finance_projection(date, integer)'),
    ('finance_overdue_loans', 'public.finance_overdue_loans(date)'),
    ('finance_by_user', 'public.finance_by_user(date, date)'),
    ('finance_top_clients', 'public.finance_top_clients(date, date, integer)'),
    ('finance_cancelled_loans', 'public.finance_cancelled_loans()')
),
s as materialized (
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where role = 'admin' order by created_at limit 1), 'role', 'authenticated')::text,
    true) as claims
),
hoy as (select (now() at time zone 'America/Santo_Domingo')::date as d),
-- Todas las llamadas dependen de s (se ejecutan después de fijar el usuario).
v as (
  select
    (select coalesce(sum(capital_outstanding), 0) from public.finance_position('infinity') where s.claims is not null) as cap,
    (select coalesce(sum(interest_outstanding), 0) from public.finance_position('infinity') where s.claims is not null) as intr,
    (select coalesce(sum(active_loans), 0) from public.finance_position('infinity') where s.claims is not null) as n,
    (select public.finance_cash('infinity') where s.claims is not null) as cash,
    (select coalesce(sum(interest_collected), 0) from public.finance_flows('2000-01-01', (select d from hoy) + 3650) where s.claims is not null) as interest_all,
    (select coalesce(sum(principal_collected), 0) from public.finance_flows('2000-01-01', (select d from hoy) + 3650) where s.claims is not null) as principal_all,
    (select count(*) from public.finance_cancelled_loans() where s.claims is not null) as cancelled_n,
    (select coalesce(sum(capital_lost), 0) from public.finance_cancelled_loans() where s.claims is not null) as cancelled_lost,
    (select count(*) from public.finance_overdue_loans((select d from hoy)) where s.claims is not null) as overdue_n,
    (select coalesce(min(overdue_amount), 1) from public.finance_overdue_loans((select d from hoy)) where s.claims is not null) as overdue_min,
    (select count(*) from public.finance_loans() where s.claims is not null) as loans_n
  from s
),
-- Cálculos independientes (sin las funciones)
ind as (
  select
    (select coalesce(sum(outstanding_principal), 0) from public.loans
      where status = 'activo' and outstanding_principal + outstanding_interest > 0.01) as cap,
    (select coalesce(sum(outstanding_interest), 0) from public.loans
      where status = 'activo' and outstanding_principal + outstanding_interest > 0.01) as intr,
    (select count(*) from public.loans where status = 'activo' and outstanding_principal + outstanding_interest > 0.01) as n,
    (select coalesce(sum(interest_applied), 0) from public.payments) as interest_all,
    (select coalesce(sum(principal_applied), 0) from public.payments) as principal_all,
    (select count(*) from public.loans where status = 'cancelado') as cancelled_n,
    (select coalesce(sum(greatest(l.principal_amount - coalesce((select sum(p.principal_applied) from public.payments p where p.loan_id = l.id), 0), 0)), 0)
       from public.loans l where l.status = 'cancelado') as cancelled_lost
),
checks(orden, comprobacion, valor, esperado, ok) as (
  select 1, 'Funciones de 0013 creadas',
    (select count(*)::text from fn where to_regprocedure(fn.sig) is not null) || ' de ' || (select count(*) from fn),
    '12 de 12', (select count(*) = 12 from fn where to_regprocedure(fn.sig) is not null)
  union all select 2, 'Ninguna es security definer (respetan RLS de quien llama)',
    (select count(*)::text from pg_proc p join fn on fn.name = p.proname where p.pronamespace = 'public'::regnamespace and p.prosecdef),
    '0', (select count(*) = 0 from pg_proc p join fn on fn.name = p.proname where p.pronamespace = 'public'::regnamespace and p.prosecdef)
  union all select 3, 'Permisos: anon NO ejecuta ninguna',
    (select count(*)::text from fn where has_function_privilege('anon', fn.sig, 'execute')), '0',
    (select count(*) = 0 from fn where has_function_privilege('anon', fn.sig, 'execute'))
  union all select 4, 'Permisos: authenticated ejecuta todas',
    (select count(*)::text from fn where has_function_privilege('authenticated', fn.sig, 'execute')), '12',
    (select count(*) = 12 from fn where has_function_privilege('authenticated', fn.sig, 'execute'))
  union all select 5, 'Usuario usado para las llamadas (admin)',
    (select coalesce(u.name, '-') || ' · rol ' || u.role from public.users u where u.id = (select id from public.users where role = 'admin' order by created_at limit 1)),
    '(informativo)', null

  -- Cifras: funciones vs. cálculo independiente y Dashboard
  union all select 10, 'Capital en la calle = Σ saldo de activos (saldo > RD$0.01) = Dashboard',
    (select v.cap from v)::text || ' vs ' || (select ind.cap from ind)::text || ' vs Dashboard ' || (select lent_capital from public.dashboard_metrics)::text,
    'iguales (±0.01 por préstamo de 1 centavo)',
    (select abs(v.cap - ind.cap) < 0.005 from v, ind) and (select abs(v.cap - (select lent_capital from public.dashboard_metrics)) <= 0.011 from v)
  union all select 11, 'Ganancia por cobrar = Σ interés pendiente de activos',
    (select v.intr from v)::text || ' vs ' || (select ind.intr from ind)::text, 'iguales', (select abs(v.intr - ind.intr) < 0.005 from v, ind)
  union all select 12, 'Préstamos activos = Dashboard',
    (select v.n from v)::text || ' vs ' || (select ind.n from ind)::text || ' vs Dashboard ' || (select active_loans_count from public.dashboard_metrics)::text,
    'iguales', (select v.n = ind.n from v, ind)
  union all select 13, 'Caja = Dashboard (Capital)',
    (select v.cash from v)::text || ' vs ' || (select available_capital from public.dashboard_metrics)::text, 'iguales',
    (select abs(v.cash - (select available_capital from public.dashboard_metrics)) < 0.005 from v)
  union all select 14, 'Ganancia cobrada de toda la historia = Σ interés de los pagos',
    (select v.interest_all from v)::text || ' vs ' || (select ind.interest_all from ind)::text, 'iguales',
    (select abs(v.interest_all - ind.interest_all) < 0.005 from v, ind)
  union all select 15, 'Capital recuperado de toda la historia = Σ capital de los pagos',
    (select v.principal_all from v)::text || ' vs ' || (select ind.principal_all from ind)::text, 'iguales',
    (select abs(v.principal_all - ind.principal_all) < 0.005 from v, ind)
  union all select 16, 'Cancelados: cantidad y capital no recuperado',
    (select v.cancelled_n || ' / ' || v.cancelled_lost from v) || ' vs ' || (select ind.cancelled_n || ' / ' || ind.cancelled_lost from ind),
    'iguales', (select v.cancelled_n = ind.cancelled_n and abs(v.cancelled_lost - ind.cancelled_lost) < 0.005 from v, ind)
  union all select 17, 'Atraso: ningún préstamo atrasado por 1 centavo (PR-00017 no aparece)',
    (select v.overdue_n || ' atrasados · menor monto vencido ' || v.overdue_min from v), 'menor monto > 0.01',
    (select v.overdue_n = 0 or v.overdue_min > 0.01 from v)
  union all select 18, 'finance_loans lista todos los préstamos',
    (select v.loans_n from v)::text || ' vs ' || (select count(*) from public.loans)::text, 'iguales',
    (select v.loans_n = (select count(*) from public.loans) from v)

  -- Nada cambió en los datos (comparar con el preflight)
  union all select 40, 'Conteo: préstamos por estado',
    (select string_agg(status::text || '=' || n, ', ' order by status) from (select status, count(*) n from public.loans group by 1) x), '= preflight', null
  union all select 43, 'Conteo: pagos / Σ monto', (select count(*) || ' / ' || coalesce(sum(amount), 0) from public.payments), '= preflight', null
  union all select 45, 'Conteo: movimientos de capital / caja',
    (select count(*) || ' / ' || (select available_capital from public.dashboard_metrics) from public.capital_transactions), '= preflight', null
)
select orden, comprobacion, valor, esperado, ok from checks order by orden;
