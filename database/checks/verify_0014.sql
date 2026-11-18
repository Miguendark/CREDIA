-- NEXA — Verificación (SOLO LECTURA) después de aplicar 0014 (Finanzas: gastos e incobrables).
-- Un único SELECT. Todas las filas con "ok" deben ser true; null = informativo.
-- Correr justo después de aplicar 0014 (las tablas nuevas todavía vacías).
--
-- Para llamar a las funciones de lectura este SELECT actúa como el primer
-- usuario admin SOLO durante esta consulta. No escribe nada (no llama a
-- register_expense, void_expense, classify_loan ni void_writeoff).

with
w(name, sig, definer) as (
  values
    ('register_expense', 'public.register_expense(public.expense_category, numeric, text, date)', true),
    ('void_expense', 'public.void_expense(uuid, text)', true),
    ('classify_loan', 'public.classify_loan(uuid, public.writeoff_kind, text, date)', true),
    ('void_writeoff', 'public.void_writeoff(uuid, text)', true),
    ('finance_expenses', 'public.finance_expenses(date, date)', false),
    ('finance_expenses_total', 'public.finance_expenses_total(date)', false),
    ('finance_writeoffs', 'public.finance_writeoffs()', false)
),
s as materialized (
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where role = 'admin' order by created_at limit 1), 'role', 'authenticated')::text,
    true) as claims
),
v as (
  select
    (select coalesce(sum(capital_outstanding), 0) from public.finance_position('infinity') where s.claims is not null) as cap,
    (select coalesce(sum(active_loans), 0) from public.finance_position('infinity') where s.claims is not null) as n,
    (select public.finance_expenses_total('infinity') where s.claims is not null) as expenses_total,
    (select count(*) from public.finance_writeoffs() where s.claims is not null) as writeoffs_n,
    (select count(*) from public.finance_expenses('2000-01-01', '2100-01-01') where s.claims is not null) as expenses_n,
    (select count(*) from public.finance_projection((now() at time zone 'America/Santo_Domingo')::date, 4) where s.claims is not null) as projection_rows
  from s
),
checks(orden, comprobacion, valor, esperado, ok) as (
  select 1, 'Tablas expenses y loan_writeoffs creadas',
    coalesce(to_regclass('public.expenses')::text, '-') || ' / ' || coalesce(to_regclass('public.loan_writeoffs')::text, '-'),
    'ambas', to_regclass('public.expenses') is not null and to_regclass('public.loan_writeoffs') is not null
  union all select 2, 'Tablas nuevas vacías (recién aplicada)',
    (select count(*) from public.expenses)::text || ' / ' || (select count(*) from public.loan_writeoffs)::text, '0 / 0',
    (select count(*) from public.expenses) = 0 and (select count(*) from public.loan_writeoffs) = 0
  union all select 3, 'RLS activado en ambas',
    (select string_agg(relname || '=' || relrowsecurity, ', ') from pg_class where oid in ('public.expenses'::regclass, 'public.loan_writeoffs'::regclass)),
    'ambas true', (select bool_and(relrowsecurity) from pg_class where oid in ('public.expenses'::regclass, 'public.loan_writeoffs'::regclass))
  union all select 4, 'Políticas de lectura (admin/supervisor)',
    (select string_agg(policyname, ', ') from pg_policies where schemaname = 'public' and tablename in ('expenses', 'loan_writeoffs')),
    '2 políticas select',
    (select count(*) = 2 and bool_and(cmd = 'SELECT') from pg_policies where schemaname = 'public' and tablename in ('expenses', 'loan_writeoffs'))
  union all select 5, 'Nadie escribe directo: anon/authenticated sin insert/update/delete',
    (select count(*)::text from (values ('anon'), ('authenticated')) r(role), (values ('public.expenses'), ('public.loan_writeoffs')) t(tbl),
       (values ('insert'), ('update'), ('delete')) p(priv) where has_table_privilege(r.role, t.tbl, p.priv)),
    '0 permisos',
    (select count(*) = 0 from (values ('anon'), ('authenticated')) r(role), (values ('public.expenses'), ('public.loan_writeoffs')) t(tbl),
       (values ('insert'), ('update'), ('delete')) p(priv) where has_table_privilege(r.role, t.tbl, p.priv))
  union all select 6, 'Lectura: authenticated sí, anon no',
    'authenticated=' || (has_table_privilege('authenticated', 'public.expenses', 'select') and has_table_privilege('authenticated', 'public.loan_writeoffs', 'select'))::text
      || ', anon=' || (has_table_privilege('anon', 'public.expenses', 'select') or has_table_privilege('anon', 'public.loan_writeoffs', 'select'))::text,
    'authenticated=true, anon=false',
    has_table_privilege('authenticated', 'public.expenses', 'select') and has_table_privilege('authenticated', 'public.loan_writeoffs', 'select')
      and not has_table_privilege('anon', 'public.expenses', 'select') and not has_table_privilege('anon', 'public.loan_writeoffs', 'select')
  union all select 7, 'Una sola clasificación vigente por préstamo (índice único)',
    coalesce(to_regclass('public.loan_writeoffs_one_active_idx')::text, '-'), 'existe', to_regclass('public.loan_writeoffs_one_active_idx') is not null

  union all select 10, 'Funciones de 0014 creadas',
    (select count(*)::text from w where to_regprocedure(w.sig) is not null) || ' de 7', '7 de 7',
    (select count(*) = 7 from w where to_regprocedure(w.sig) is not null)
  union all select 11, 'Escritura (4) security definer con search_path fijo; lectura (3) invoker',
    (select count(*)::text from w join pg_proc p on p.oid = to_regprocedure(w.sig)
       where p.prosecdef = w.definer and (not w.definer or exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))) || ' de 7',
    '7 de 7',
    (select count(*) = 7 from w join pg_proc p on p.oid = to_regprocedure(w.sig)
       where p.prosecdef = w.definer and (not w.definer or exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')))
  union all select 12, 'Permisos: anon NO ejecuta ninguna; authenticated sí',
    'anon=' || (select count(*) from w where has_function_privilege('anon', w.sig, 'execute'))
      || ', authenticated=' || (select count(*) from w where has_function_privilege('authenticated', w.sig, 'execute')),
    'anon=0, authenticated=7',
    (select count(*) = 0 from w where has_function_privilege('anon', w.sig, 'execute'))
      and (select count(*) = 7 from w where has_function_privilege('authenticated', w.sig, 'execute'))
  union all select 13, 'finance_loans y finance_projection ya consideran incobrables',
    'finance_loans=' || (position('loan_writeoffs' in pg_get_functiondef('public.finance_loans()'::regprocedure)) > 0)::text
      || ', finance_projection=' || (position('loan_writeoffs' in pg_get_functiondef('public.finance_projection(date, integer)'::regprocedure)) > 0)::text,
    'ambas true',
    position('loan_writeoffs' in pg_get_functiondef('public.finance_loans()'::regprocedure)) > 0
      and position('loan_writeoffs' in pg_get_functiondef('public.finance_projection(date, integer)'::regprocedure)) > 0

  -- Sin gastos ni clasificaciones, las cifras de 0013 no cambian
  union all select 20, 'Capital en la calle sigue = Dashboard',
    (select v.cap from v)::text || ' vs ' || (select lent_capital from public.dashboard_metrics)::text, 'iguales (±0.01)',
    (select abs(v.cap - (select lent_capital from public.dashboard_metrics)) <= 0.011 from v)
  union all select 21, 'Préstamos activos siguen = Dashboard',
    (select v.n from v)::text || ' vs ' || (select active_loans_count from public.dashboard_metrics)::text, 'iguales',
    (select v.n = (select active_loans_count from public.dashboard_metrics) from v)
  union all select 22, 'Lecturas nuevas responden: gastos / total / clasificaciones',
    (select v.expenses_n || ' / ' || v.expenses_total || ' / ' || v.writeoffs_n from v), '0 / 0 / 0',
    (select v.expenses_n = 0 and v.expenses_total = 0 and v.writeoffs_n = 0 from v)
  union all select 23, 'Proyección responde (filas)', (select v.projection_rows from v)::text, '(informativo)', null

  -- Nada cambió en los datos (comparar con el preflight)
  union all select 40, 'Conteo: préstamos por estado',
    (select string_agg(status::text || '=' || n, ', ' order by status) from (select status, count(*) n from public.loans group by 1) x), '= preflight', null
  union all select 43, 'Conteo: pagos / Σ monto', (select count(*) || ' / ' || coalesce(sum(amount), 0) from public.payments), '= preflight', null
  union all select 45, 'Conteo: movimientos de capital / caja',
    (select count(*) || ' / ' || (select available_capital from public.dashboard_metrics) from public.capital_transactions), '= preflight', null
)
select orden, comprobacion, valor, esperado, ok from checks order by orden;
