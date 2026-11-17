-- NEXA — Verificación (SOLO LECTURA) después de aplicar 0011.
-- Un único SELECT. Todas las filas con "ok" deben ser true; null = informativo.

with
fn as (
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p where p.pronamespace = 'public'::regnamespace
),
checks(orden, comprobacion, valor, esperado, ok) as (
  select 1, 'Columnas nuevas en loans',
    (select string_agg(column_name || ':' || udt_name || coalesce('=' || column_default, ''), ', ' order by column_name)
       from information_schema.columns where table_schema = 'public' and table_name = 'loans'
       and column_name in ('schedule_type', 'payment_days', 'payment_weekday')),
    'payment_days:_int2, payment_weekday:int2, schedule_type:text=''interval''::text',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'loans'
       and column_name in ('schedule_type', 'payment_days', 'payment_weekday')) = 3
  union all
  select 2, 'Constraints loans_schedule_type_check y loans_schedule_check',
    (select string_agg(conname, ', ' order by conname) from pg_constraint
       where conrelid = 'public.loans'::regclass and conname in ('loans_schedule_check', 'loans_schedule_type_check')),
    'loans_schedule_check, loans_schedule_type_check',
    (select count(*) from pg_constraint
       where conrelid = 'public.loans'::regclass and conname in ('loans_schedule_check', 'loans_schedule_type_check') and convalidated) = 2
  union all
  select 3, 'Préstamos existentes: todos Automático (interval) sin día fijo',
    (select count(*)::text || ' de ' || (select count(*) from public.loans)::text from public.loans
       where schedule_type = 'interval' and payment_days is null and payment_weekday is null),
    'todos', (select count(*) from public.loans where not (schedule_type = 'interval' and payment_days is null and payment_weekday is null)) = 0
  union all
  select 4, 'Funciones nuevas',
    (select string_agg(proname || '(' || args || ')', ' | ' order by proname) from fn
       where proname in ('create_loan_with_schedule', 'reschedule_loan_installments', 'fixed_day_after',
                         'fixed_schedule_error', 'fixed_schedule_next', 'loan_add_period')),
    '6 funciones',
    (select count(*) from fn where proname in ('create_loan_with_schedule', 'reschedule_loan_installments', 'fixed_day_after',
                                               'fixed_schedule_error', 'fixed_schedule_next', 'loan_add_period')) = 6
  union all
  select 5, 'create_loan_with_schedule: 16 parámetros (con p_payment_weekday)',
    (select args from fn where proname = 'create_loan_with_schedule'), '... p_payment_days smallint[], p_payment_weekday smallint',
    (select count(*) = 1 and bool_and(args like '%p_schedule_type text, p_payment_days smallint[], p_payment_weekday smallint')
       from fn where proname = 'create_loan_with_schedule')
  union all
  select 6, 'reschedule_loan_installments: firma',
    (select args from fn where proname = 'reschedule_loan_installments'),
    'p_loan_id uuid, p_schedule_type text, p_payment_days smallint[], p_payment_weekday smallint, p_new_dates jsonb, p_reason text',
    (select count(*) = 1 and bool_and(args = 'p_loan_id uuid, p_schedule_type text, p_payment_days smallint[], p_payment_weekday smallint, p_new_dates jsonb, p_reason text')
       from fn where proname = 'reschedule_loan_installments')
  union all
  select 7, 'Permisos: authenticated SÍ ejecuta las 2 RPC',
    (select string_agg(proname || '=' || has_function_privilege('authenticated', oid, 'execute')::text, ', ' order by proname)
       from fn where proname in ('create_loan_with_schedule', 'reschedule_loan_installments')),
    'ambas true',
    (select bool_and(has_function_privilege('authenticated', oid, 'execute')) from fn
       where proname in ('create_loan_with_schedule', 'reschedule_loan_installments'))
  union all
  select 8, 'Permisos: anon NO ejecuta las 2 RPC',
    (select string_agg(proname || '=' || has_function_privilege('anon', oid, 'execute')::text, ', ' order by proname)
       from fn where proname in ('create_loan_with_schedule', 'reschedule_loan_installments')),
    'ambas false',
    not (select bool_or(has_function_privilege('anon', oid, 'execute')) from fn
       where proname in ('create_loan_with_schedule', 'reschedule_loan_installments'))
  union all
  select 9, 'Permisos: helpers internos NO expuestos (anon/authenticated)',
    (select string_agg(proname || '=' || (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))::text, ', ' order by proname)
       from fn where proname in ('fixed_day_after', 'fixed_schedule_error', 'fixed_schedule_next', 'loan_add_period')),
    'todas false',
    not (select bool_or(has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))
       from fn where proname in ('fixed_day_after', 'fixed_schedule_error', 'fixed_schedule_next', 'loan_add_period'))
  union all
  select 10, 'Regla: mensual día 31 en febrero → último día',
    public.fixed_schedule_next('2027-02-01', '{31}', null)::text, '2027-02-28',
    public.fixed_schedule_next('2027-02-01', '{31}', null) = date '2027-02-28'
  union all
  select 11, 'Regla: semanal lunes después del martes 17/11/2026',
    public.fixed_schedule_next('2026-11-17', null, 1::smallint)::text, '2026-11-23',
    public.fixed_schedule_next('2026-11-17', null, 1::smallint) = date '2026-11-23'
  union all
  select 12, 'Regla: quincenal con 1 día se rechaza',
    coalesce(public.fixed_schedule_error('biweekly', '{5}', null), 'sin error'), 'mensaje de error',
    public.fixed_schedule_error('biweekly', '{5}', null) is not null
  union all
  select 13, 'Regla: diaria con día fijo se rechaza',
    coalesce(public.fixed_schedule_error('daily', '{5}', null), 'sin error'), 'mensaje de error',
    public.fixed_schedule_error('daily', '{5}', null) is not null
  union all
  select 14, 'RPC original create_loan_with_installments intacta',
    (select count(*)::text from fn where proname = 'create_loan_with_installments'), '1',
    (select count(*) from fn where proname = 'create_loan_with_installments') = 1

  union all select 40, 'Filas: clients', (select count(*)::text from public.clients), '(comparar con antes)', null
  union all select 41, 'Filas: loans', (select count(*)::text from public.loans), '(comparar con antes)', null
  union all select 42, 'Filas: loans por frecuencia',
    (select string_agg(frequency::text || '=' || n, ', ' order by frequency) from (select frequency, count(*) n from public.loans group by frequency) x),
    '(comparar con antes)', null
  union all select 43, 'Filas: installments', (select count(*)::text from public.installments), '(comparar con antes)', null
  union all select 44, 'Filas: payments', (select count(*)::text from public.payments), '(comparar con antes)', null
  union all select 45, 'Filas: receipts', (select count(*)::text from public.receipts), '(comparar con antes)', null
  union all select 46, 'Filas: capital_transactions', (select count(*)::text from public.capital_transactions), '(comparar con antes)', null
  union all select 47, 'Filas: audit_logs', (select count(*)::text from public.audit_logs), '(comparar con antes)', null
  union all select 48, 'Filas: users (staff)', (select count(*)::text from public.users), '(comparar con antes)', null
)
select orden, comprobacion, valor, esperado, ok from checks order by orden;
