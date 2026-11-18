-- NEXA — Revisión previa (SOLO LECTURA) antes de aplicar 0013 y 0014 en producción.
-- Un único SELECT. No modifica nada.
--   ok = true  → listo para aplicar
--   ok = false → NO aplicar; revisar primero
--   ok = null  → informativo (guardar estos conteos para comparar después)

with
fn(name) as (
  values ('finance_require_role'), ('finance_loans'), ('finance_position'), ('finance_cash'), ('finance_flows'),
         ('finance_collection_efficiency'), ('finance_monthly'), ('finance_projection'), ('finance_overdue_loans'),
         ('finance_by_user'), ('finance_top_clients'), ('finance_cancelled_loans'), ('finance_expenses'),
         ('finance_expenses_total'), ('finance_writeoffs'), ('register_expense'), ('void_expense'), ('classify_loan'),
         ('void_writeoff')
),
checks(orden, comprobacion, valor, esperado, ok) as (
  select 1, 'Base de datos', current_database() || ' · ' || split_part(version(), ',', 1), '(informativo)', null::boolean
  union all select 2, 'Hoy (hora RD)', (now() at time zone 'America/Santo_Domingo')::date::text, '(informativo)', null

  -- Requisitos (migraciones anteriores)
  union all select 10, 'today_rd() existe (0012 aplicada)',
    (to_regprocedure('public.today_rd()') is not null)::text, 'true', to_regprocedure('public.today_rd()') is not null
  union all select 11, 'current_user_role() existe',
    (to_regprocedure('public.current_user_role()') is not null)::text, 'true', to_regprocedure('public.current_user_role()') is not null
  union all select 12, 'loans.payment_weekday existe (0011 aplicada)',
    (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'loans' and column_name = 'payment_weekday'),
    '1', (select count(*) = 1 from information_schema.columns where table_schema = 'public' and table_name = 'loans' and column_name = 'payment_weekday')
  union all select 13, 'Columnas que usan las funciones (users.name, clients.full_name, payments.principal_applied/interest_applied/created_by)',
    (select count(*)::text from information_schema.columns where table_schema = 'public' and (
       (table_name = 'users' and column_name = 'name') or (table_name = 'clients' and column_name = 'full_name')
       or (table_name = 'payments' and column_name in ('principal_applied', 'interest_applied', 'created_by')))),
    '5', (select count(*) = 5 from information_schema.columns where table_schema = 'public' and (
       (table_name = 'users' and column_name = 'name') or (table_name = 'clients' and column_name = 'full_name')
       or (table_name = 'payments' and column_name in ('principal_applied', 'interest_applied', 'created_by'))))
  union all select 14, 'Estados de préstamo esperados (activo, pagado, cancelado)',
    (select string_agg(enumlabel, ', ' order by enumsortorder) from pg_enum where enumtypid = 'public.loan_status'::regtype),
    'incluye activo, pagado, cancelado',
    (select count(*) = 3 from pg_enum where enumtypid = 'public.loan_status'::regtype and enumlabel in ('activo', 'pagado', 'cancelado'))

  -- Nada de 0013/0014 existe todavía (no hay choque de nombres)
  union all select 20, 'Funciones de 0013/0014 que YA existen',
    coalesce((select string_agg(p.proname, ', ') from pg_proc p join fn on fn.name = p.proname where p.pronamespace = 'public'::regnamespace), 'ninguna'),
    'ninguna', not exists (select 1 from pg_proc p join fn on fn.name = p.proname where p.pronamespace = 'public'::regnamespace)
  union all select 21, 'Tablas expenses / loan_writeoffs ya existen',
    coalesce(to_regclass('public.expenses')::text, '-') || ' / ' || coalesce(to_regclass('public.loan_writeoffs')::text, '-'),
    '- / -', to_regclass('public.expenses') is null and to_regclass('public.loan_writeoffs') is null
  union all select 22, 'Tipos expense_category / writeoff_kind ya existen',
    coalesce(to_regtype('public.expense_category')::text, '-') || ' / ' || coalesce(to_regtype('public.writeoff_kind')::text, '-'),
    '- / -', to_regtype('public.expense_category') is null and to_regtype('public.writeoff_kind') is null

  -- Hay al menos un admin (para Finanzas y para las verificaciones)
  union all select 30, 'Usuarios admin / supervisor / cobrador',
    (select count(*) filter (where role = 'admin') || ' / ' || count(*) filter (where role = 'supervisor') || ' / ' || count(*) filter (where role = 'cobrador') from public.users),
    'al menos 1 admin', (select count(*) filter (where role = 'admin') >= 1 from public.users)

  -- Conteos para comparar después de aplicar (0013 y 0014 no deben cambiarlos)
  union all select 40, 'Conteo: clientes', (select count(*)::text from public.clients), '(guardar)', null
  union all select 41, 'Conteo: préstamos por estado',
    (select string_agg(status::text || '=' || n, ', ' order by status) from (select status, count(*) n from public.loans group by 1) s), '(guardar)', null
  union all select 42, 'Conteo: cuotas', (select count(*)::text from public.installments), '(guardar)', null
  union all select 43, 'Conteo: pagos / Σ monto', (select count(*) || ' / ' || coalesce(sum(amount), 0) from public.payments), '(guardar)', null
  union all select 44, 'Conteo: recibos', (select count(*)::text from public.receipts), '(guardar)', null
  union all select 45, 'Conteo: movimientos de capital / caja',
    (select count(*) || ' / ' || (select available_capital from public.dashboard_metrics) from public.capital_transactions), '(guardar)', null
  union all select 46, 'Conteo: auditoría', (select count(*)::text from public.audit_logs), '(guardar)', null
  union all select 47, 'Dashboard: capital en la calle / préstamos activos',
    (select lent_capital || ' / ' || active_loans_count from public.dashboard_metrics), '(guardar)', null
)
select orden, comprobacion, valor, esperado, ok from checks order by orden;
