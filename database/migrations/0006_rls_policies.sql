-- NEXA — Migración 0006: Row Level Security
--
-- Modelo de autorización de dos capas:
--  1) RLS (políticas abajo) controla qué filas puede leer/escribir cada usuario.
--  2) GRANT/REVOKE de privilegios de tabla obliga a que las operaciones
--     financieras multi-tabla (crear préstamo, registrar pago, mover capital)
--     pasen SIEMPRE por las funciones RPC de la migración 0005, que corren
--     como SECURITY DEFINER. Un INSERT directo a "payments" desde el cliente,
--     por ejemplo, queda bloqueado aunque la política RLS lo permitiera,
--     porque el rol "authenticated" no tiene el privilegio INSERT en esa tabla.

alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.loans enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.capital_transactions enable row level security;
alter table public.audit_logs enable row level security;

-- Privilegios base explícitos: no depender de los privilegios por defecto
-- que Supabase concede al crear una tabla desde su SQL Editor. Si una tabla
-- se recrea (drop/create) fuera de ese flujo, o el proyecto se levanta en
-- otro entorno, estos GRANT garantizan que "authenticated" tenga la base
-- necesaria para los verbos que las políticas de abajo autorizan (las
-- políticas deciden QUÉ filas; estos GRANT deciden si el verbo aplica en
-- absoluto). GRANT es idempotente. Los REVOKE puntuales más abajo siguen
-- siendo los que fuerzan el paso por las funciones RPC de la migración 0005.
grant select, insert, update on public.users to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, update on public.loans to authenticated;
grant select on public.installments to authenticated;
grant select on public.payments to authenticated;
grant select on public.capital_transactions to authenticated;
grant select, insert on public.audit_logs to authenticated;

-- =========================================================================
-- users
-- =========================================================================
create policy users_select_staff on public.users
  for select using (auth.uid() is not null);

create policy users_update_self_or_admin on public.users
  for update using (auth.uid() = id or public.current_user_role() = 'admin')
  with check (auth.uid() = id or public.current_user_role() = 'admin');

create policy users_insert_admin on public.users
  for insert with check (public.current_user_role() = 'admin');

-- =========================================================================
-- clients — todo el staff autenticado gestiona clientes
-- =========================================================================
create policy clients_select_staff on public.clients
  for select using (auth.uid() is not null);

create policy clients_insert_staff on public.clients
  for insert with check (auth.uid() is not null);

create policy clients_update_staff on public.clients
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

-- =========================================================================
-- loans — lectura abierta al staff; creación solo vía RPC (revoke abajo);
-- edición directa (cancelar, notas) limitada a admin/supervisor.
-- =========================================================================
create policy loans_select_staff on public.loans
  for select using (auth.uid() is not null);

create policy loans_update_admin_supervisor on public.loans
  for update using (public.current_user_role() in ('admin', 'supervisor'))
  with check (public.current_user_role() in ('admin', 'supervisor'));

revoke insert on public.loans from authenticated, anon;

-- =========================================================================
-- installments — lectura abierta; toda escritura vía RPC
-- =========================================================================
create policy installments_select_staff on public.installments
  for select using (auth.uid() is not null);

revoke insert, update on public.installments from authenticated, anon;

-- =========================================================================
-- payments — lectura abierta; toda escritura vía RPC register_payment
-- =========================================================================
create policy payments_select_staff on public.payments
  for select using (auth.uid() is not null);

revoke insert, update, delete on public.payments from authenticated, anon;

-- =========================================================================
-- capital_transactions — lectura abierta; toda escritura vía RPC
-- =========================================================================
create policy capital_transactions_select_staff on public.capital_transactions
  for select using (auth.uid() is not null);

revoke insert, update, delete on public.capital_transactions from authenticated, anon;

-- =========================================================================
-- audit_logs — cualquier staff autenticado puede escribir su propia entrada
-- (clients, users, configuración); las operaciones financieras además
-- insertan aquí desde las funciones RPC de la migración 0005.
-- Solo admin/supervisor pueden LEER la bitácora completa.
-- =========================================================================
create policy audit_logs_select_admin_supervisor on public.audit_logs
  for select using (public.current_user_role() in ('admin', 'supervisor'));

create policy audit_logs_insert_staff on public.audit_logs
  for insert with check (auth.uid() is not null and user_id = auth.uid());

revoke update, delete on public.audit_logs from authenticated, anon;

-- =========================================================================
-- Funciones RPC: solo el staff autenticado puede ejecutarlas
-- =========================================================================
revoke execute on function public.create_loan_with_installments from public, anon;
revoke execute on function public.register_payment from public, anon;
revoke execute on function public.register_capital_movement from public, anon;

grant execute on function public.create_loan_with_installments to authenticated;
grant execute on function public.register_payment to authenticated;
grant execute on function public.register_capital_movement to authenticated;
