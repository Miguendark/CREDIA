-- NEXA — Revisión previa (SOLO LECTURA) antes de aplicar 0011 y 0012.
-- No modifica nada: es un único SELECT. Pegar completo en el SQL Editor y
-- ejecutar. Devuelve una fila por comprobación con la columna "ok":
--   true  = como se espera
--   false = NO aplicar migraciones; revisar primero
--   null  = dato informativo

with
fn as (
  select p.proname, p.prosrc, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
checks(orden, comprobacion, valor, esperado, ok) as (
  -- ---------- Base: migraciones anteriores aplicadas ----------
  select 1, 'Postgres versión', current_setting('server_version'), '>= 15', current_setting('server_version_num')::int >= 150000
  union all
  select 2, 'Zona horaria de la sesión', current_setting('TimeZone'), '(informativo)', null
  union all
  select 3, '0009: política capital_transactions_select_admin_supervisor',
    (select count(*)::text from pg_policies where schemaname = 'public' and policyname = 'capital_transactions_select_admin_supervisor'),
    '1', (select count(*) from pg_policies where schemaname = 'public' and policyname = 'capital_transactions_select_admin_supervisor') = 1
  union all
  select 4, '0009: política vieja capital_transactions_select_staff eliminada',
    (select count(*)::text from pg_policies where schemaname = 'public' and policyname = 'capital_transactions_select_staff'),
    '0', (select count(*) from pg_policies where schemaname = 'public' and policyname = 'capital_transactions_select_staff') = 0
  union all
  select 5, '0009: register_capital_movement exige admin/supervisor',
    (select case when count(*) = 0 then 'no existe' else bool_or(prosrc like '%current_user_role() not in (''admin'', ''supervisor'')%')::text end
       from fn where proname = 'register_capital_movement'),
    'true', (select bool_or(prosrc like '%current_user_role() not in (''admin'', ''supervisor'')%') from fn where proname = 'register_capital_movement')
  union all
  select 6, 'register_capital_movement: 1 sola versión, SECURITY DEFINER, usa current_date',
    (select count(*)::text || ' versión(es); definer=' || coalesce(bool_and(prosecdef)::text, '-') || '; current_date=' || coalesce(bool_and(prosrc like '%current_date%')::text, '-')
       from fn where proname = 'register_capital_movement'),
    '1 versión(es); definer=true; current_date=true',
    (select count(*) = 1 and bool_and(prosecdef) and bool_and(prosrc like '%current_date%') from fn where proname = 'register_capital_movement')
  union all
  select 7, '0010: tabla receipts',
    coalesce(to_regclass('public.receipts')::text, 'no existe'), 'public.receipts', to_regclass('public.receipts') is not null
  union all
  select 8, '0010: funciones create_receipt y void_receipt',
    (select count(distinct proname)::text from fn where proname in ('create_receipt', 'void_receipt')),
    '2', (select count(distinct proname) from fn where proname in ('create_receipt', 'void_receipt')) = 2
  union all
  select 9, 'create_loan_with_installments (la llama 0011): firma original',
    (select string_agg(args, ' || ') from fn where proname = 'create_loan_with_installments'),
    '1 versión con 13 parámetros',
    (select count(*) = 1 and bool_and(args like 'p_client_id uuid, p_principal_amount numeric, p_interest_rate numeric, p_interest_type loan_interest_type, p_number_of_installments integer, p_installment_amount numeric, p_total_interest numeric, p_total_amount numeric, p_frequency loan_frequency, p_start_date date, p_first_payment_date date, p_notes text, p_installments jsonb')
       from fn where proname = 'create_loan_with_installments')
  union all
  select 10, 'current_user_role() existe (la usa 0011)',
    (select count(*)::text from fn where proname = 'current_user_role'), '1',
    (select count(*) from fn where proname = 'current_user_role') = 1
  union all
  select 11, 'Enum loan_frequency',
    (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'loan_frequency'),
    'daily,weekly,biweekly,monthly',
    (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'loan_frequency') = 'daily,weekly,biweekly,monthly'
  union all
  select 12, 'Enum installment_status incluye vencida',
    (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'installment_status'),
    'contiene pendiente,parcial,pagada,vencida',
    (select array_agg(e.enumlabel::text) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'installment_status')
      @> array['pendiente', 'parcial', 'pagada', 'vencida']

  -- ---------- 0011 y 0012 todavía NO aplicadas ----------
  union all
  select 20, '0011 no aplicada: columnas nuevas en loans',
    (select coalesce(string_agg(column_name, ','), 'ninguna') from information_schema.columns
       where table_schema = 'public' and table_name = 'loans' and column_name in ('schedule_type', 'payment_days', 'payment_weekday')),
    'ninguna',
    (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'loans' and column_name in ('schedule_type', 'payment_days', 'payment_weekday')) = 0
  union all
  select 21, '0011 no aplicada: funciones nuevas',
    (select coalesce(string_agg(distinct proname, ','), 'ninguna') from fn where proname in
       ('create_loan_with_schedule', 'reschedule_loan_installments', 'fixed_day_after', 'fixed_schedule_error',
        'fixed_schedule_next', 'loan_add_period', 'payment_days_error')),
    'ninguna',
    (select count(*) from fn where proname in
       ('create_loan_with_schedule', 'reschedule_loan_installments', 'fixed_day_after', 'fixed_schedule_error',
        'fixed_schedule_next', 'loan_add_period', 'payment_days_error')) = 0
  union all
  select 22, '0011 no aplicada: constraints con esos nombres',
    (select coalesce(string_agg(conname, ','), 'ninguna') from pg_constraint
       where conname in ('loans_schedule_check', 'loans_schedule_type_check', 'loans_payment_days_check')),
    'ninguna',
    (select count(*) from pg_constraint where conname in ('loans_schedule_check', 'loans_schedule_type_check', 'loans_payment_days_check')) = 0
  union all
  select 23, '0012 no aplicada: today_rd()',
    (select count(*)::text from fn where proname = 'today_rd'), '0',
    (select count(*) from fn where proname = 'today_rd') = 0
  union all
  select 24, '0012 no aplicada: dashboard_metrics (0007) usa current_date y security_invoker',
    'current_date=' || (pg_get_viewdef('public.dashboard_metrics'::regclass) ilike '%current_date%')::text
      || '; opciones=' || coalesce((select array_to_string(reloptions, ',') from pg_class where oid = 'public.dashboard_metrics'::regclass), '-'),
    'current_date=true; opciones=security_invoker=true',
    pg_get_viewdef('public.dashboard_metrics'::regclass) ilike '%current_date%'
      and (select reloptions from pg_class where oid = 'public.dashboard_metrics'::regclass) @> array['security_invoker=true']
  union all
  select 25, '0012 no aplicada: defaults de fecha',
    (select string_agg(table_name || '.' || column_name || '=' || coalesce(column_default, 'null'), '; ' order by table_name)
       from information_schema.columns where table_schema = 'public'
       and ((table_name = 'payments' and column_name = 'payment_date') or (table_name = 'capital_transactions' and column_name = 'transaction_date'))),
    'CURRENT_DATE en ambos',
    (select count(*) from information_schema.columns where table_schema = 'public'
       and ((table_name = 'payments' and column_name = 'payment_date') or (table_name = 'capital_transactions' and column_name = 'transaction_date'))
       and column_default ilike 'current_date') = 2

  -- ---------- Datos (informativo, para comparar después) ----------
  union all select 40, 'Filas: clients', (select count(*)::text from public.clients), '(informativo)', null
  union all select 41, 'Filas: loans', (select count(*)::text from public.loans), '(informativo)', null
  union all select 42, 'Filas: loans por frecuencia',
    (select coalesce(string_agg(frequency::text || '=' || n, ', ' order by frequency), '-') from (select frequency, count(*) n from public.loans group by frequency) x),
    '(informativo)', null
  union all select 43, 'Filas: installments', (select count(*)::text from public.installments), '(informativo)', null
  union all select 44, 'Filas: payments', (select count(*)::text from public.payments), '(informativo)', null
  union all select 45, 'Filas: receipts',
    case when to_regclass('public.receipts') is null then 'no existe'
         else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.receipts', false, true, '')))[1]::text end,
    '(informativo)', null
  union all select 46, 'Filas: capital_transactions', (select count(*)::text from public.capital_transactions), '(informativo)', null
  union all select 47, 'Filas: audit_logs', (select count(*)::text from public.audit_logs), '(informativo)', null
  union all select 48, 'Filas: users (staff)', (select count(*)::text from public.users), '(informativo)', null
  union all select 49, 'Tamaño de la base', pg_size_pretty(pg_database_size(current_database())), '(informativo)', null
)
select orden, comprobacion, valor, esperado, ok
from checks
order by orden;
