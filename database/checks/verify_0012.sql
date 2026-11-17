-- NEXA — Verificación (SOLO LECTURA) después de aplicar 0012.
-- Un único SELECT. Todas las filas con "ok" deben ser true; null = informativo.

with
checks(orden, comprobacion, valor, esperado, ok) as (
  select 1, 'today_rd() existe y es STABLE',
    (select count(*)::text || ' / volatilidad=' || coalesce(max(provolatile::text), '-') from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'today_rd'),
    '1 / volatilidad=s',
    (select count(*) = 1 and bool_and(provolatile = 's') from pg_proc where pronamespace = 'public'::regnamespace and proname = 'today_rd')
  union all
  select 2, 'today_rd() = fecha en RD',
    public.today_rd()::text || ' (UTC: ' || (now() at time zone 'UTC')::date::text || ')',
    (now() at time zone 'America/Santo_Domingo')::date::text,
    public.today_rd() = (now() at time zone 'America/Santo_Domingo')::date
  union all
  select 3, 'Frontera: 18/11 00:30 UTC (20:30 RD del 17)',
    ((timestamptz '2026-11-18 00:30:00+00') at time zone 'America/Santo_Domingo')::date::text, '2026-11-17',
    ((timestamptz '2026-11-18 00:30:00+00') at time zone 'America/Santo_Domingo')::date = date '2026-11-17'
  union all
  select 4, 'Permisos today_rd: authenticated sí, anon no',
    'authenticated=' || has_function_privilege('authenticated', 'public.today_rd()', 'execute')::text
      || ', anon=' || has_function_privilege('anon', 'public.today_rd()', 'execute')::text,
    'authenticated=true, anon=false',
    has_function_privilege('authenticated', 'public.today_rd()', 'execute')
      and not has_function_privilege('anon', 'public.today_rd()', 'execute')
  union all
  select 5, 'Defaults de fecha usan today_rd()',
    (select string_agg(table_name || '.' || column_name || '=' || coalesce(column_default, 'null'), '; ' order by table_name)
       from information_schema.columns where table_schema = 'public'
       and ((table_name = 'payments' and column_name = 'payment_date') or (table_name = 'capital_transactions' and column_name = 'transaction_date'))),
    'today_rd() en ambos',
    (select count(*) from information_schema.columns where table_schema = 'public'
       and ((table_name = 'payments' and column_name = 'payment_date') or (table_name = 'capital_transactions' and column_name = 'transaction_date'))
       and column_default = 'today_rd()') = 2
  union all
  select 6, 'dashboard_metrics usa today_rd() y sigue con security_invoker',
    'today_rd=' || (pg_get_viewdef('public.dashboard_metrics'::regclass) like '%today_rd()%')::text
      || '; current_date=' || (pg_get_viewdef('public.dashboard_metrics'::regclass) ilike '%current_date%')::text
      || '; opciones=' || coalesce((select array_to_string(reloptions, ',') from pg_class where oid = 'public.dashboard_metrics'::regclass), '-'),
    'today_rd=true; current_date=false; opciones=security_invoker=true',
    pg_get_viewdef('public.dashboard_metrics'::regclass) like '%today_rd()%'
      and pg_get_viewdef('public.dashboard_metrics'::regclass) not ilike '%current_date%'
      and (select reloptions from pg_class where oid = 'public.dashboard_metrics'::regclass) @> array['security_invoker=true']
  union all
  select 7, 'dashboard_metrics: vencidos = recálculo con today_rd()',
    (select overdue_loans_count::text from public.dashboard_metrics) || ' = '
      || (select count(*)::text from public.loans where status = 'activo' and next_payment_date < public.today_rd()),
    'iguales',
    (select overdue_loans_count from public.dashboard_metrics)
      = (select count(*) from public.loans where status = 'activo' and next_payment_date < public.today_rd())
  union all
  select 8, 'Permisos dashboard_metrics: authenticated puede leer',
    has_table_privilege('authenticated', 'public.dashboard_metrics', 'select')::text, 'true',
    has_table_privilege('authenticated', 'public.dashboard_metrics', 'select')
  union all
  select 9, 'register_capital_movement: today_rd() y sigue exigiendo admin/supervisor',
    (select 'versiones=' || count(*)::text || '; today_rd=' || bool_and(prosrc like '%today_rd()%')::text
       || '; current_date=' || bool_and(prosrc ilike '%current_date%')::text
       || '; rol=' || bool_and(prosrc like '%current_user_role() not in (''admin'', ''supervisor'')%')::text
       || '; definer=' || bool_and(prosecdef)::text
       from pg_proc where pronamespace = 'public'::regnamespace and proname = 'register_capital_movement'),
    'versiones=1; today_rd=true; current_date=false; rol=true; definer=true',
    (select count(*) = 1 and bool_and(prosrc like '%today_rd()%') and not bool_or(prosrc ilike '%current_date%')
       and bool_and(prosrc like '%current_user_role() not in (''admin'', ''supervisor'')%') and bool_and(prosecdef)
       from pg_proc where pronamespace = 'public'::regnamespace and proname = 'register_capital_movement')
  union all
  select 10, 'register_capital_movement: permisos sin cambios (authenticated sí)',
    has_function_privilege('authenticated', 'public.register_capital_movement(public.capital_transaction_type, numeric, text, date)', 'execute')::text,
    'true',
    has_function_privilege('authenticated', 'public.register_capital_movement(public.capital_transaction_type, numeric, text, date)', 'execute')
  union all
  select 11, '0011 sigue aplicada',
    (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'loans'
       and column_name in ('schedule_type', 'payment_days', 'payment_weekday')), '3',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'loans'
       and column_name in ('schedule_type', 'payment_days', 'payment_weekday')) = 3

  union all select 40, 'Filas: loans', (select count(*)::text from public.loans), '(comparar con antes)', null
  union all select 41, 'Filas: payments', (select count(*)::text from public.payments), '(comparar con antes)', null
  union all select 42, 'Filas: capital_transactions', (select count(*)::text from public.capital_transactions), '(comparar con antes)', null
  union all select 43, 'Filas: audit_logs', (select count(*)::text from public.audit_logs), '(comparar con antes)', null
)
select orden, comprobacion, valor, esperado, ok from checks order by orden;
