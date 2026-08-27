-- NEXA — Migración 0007: Vistas de agregación
-- security_invoker = true: las vistas respetan el RLS del usuario que consulta,
-- no el del dueño de la vista. Requiere Postgres 15+ (Supabase lo soporta).

-- =========================================================================
-- client_summary — usada por el listado de clientes (sección 11)
-- =========================================================================
create view public.client_summary
with (security_invoker = true) as
select
  c.*,
  count(l.id) filter (where l.status = 'activo') as active_loans_count,
  coalesce(sum(l.outstanding_principal + l.outstanding_interest) filter (where l.status = 'activo'), 0) as outstanding_balance,
  min(l.next_payment_date) filter (where l.status = 'activo') as next_payment_date
from public.clients c
left join public.loans l on l.client_id = c.id
group by c.id;

revoke all on public.client_summary from anon;
grant select on public.client_summary to authenticated;

-- =========================================================================
-- dashboard_metrics — una sola fila con los indicadores del Dashboard.
--
-- Definiciones (documentadas aquí porque son decisiones de negocio, no
-- fórmulas arbitrarias — ver sección 42):
--  - available_capital: aportes + pagos recibidos + ajustes (siempre suman)
--    menos retiros y capital desembolsado en préstamos. Un 'ajuste' se
--    trata como corrección al alza; para corregir a la baja usar 'retiro'.
--  - lent_capital: principal aún pendiente de cobro en préstamos activos.
--  - total_received: suma histórica de payments.amount (todo lo cobrado).
--  - total_interest_generated: interés efectivamente COBRADO (payments.
--    interest_applied), no el interés total pactado en los préstamos.
--  - overdue: status = 'activo' y next_payment_date ya pasó (no se
--    almacena un estado "vencido" separado, ver migración 0001).
-- =========================================================================
create view public.dashboard_metrics
with (security_invoker = true) as
select
  coalesce((
    select sum(case
      when type in ('aporte', 'pago', 'ajuste') then amount
      when type in ('retiro', 'prestamo') then -amount
      else 0
    end)
    from public.capital_transactions
  ), 0) as available_capital,
  coalesce((select sum(outstanding_principal) from public.loans where status = 'activo'), 0) as lent_capital,
  coalesce((select sum(amount) from public.payments), 0) as total_received,
  coalesce((select sum(interest_applied) from public.payments), 0) as total_interest_generated,
  coalesce((select count(*) from public.loans where status = 'activo'), 0) as active_loans_count,
  coalesce((select count(*) from public.clients where status = 'activo'), 0) as active_clients_count,
  coalesce((select count(*) from public.installments where status in ('pendiente', 'parcial')), 0) as pending_installments_count,
  coalesce((
    select count(*) from public.loans
    where status = 'activo' and next_payment_date < current_date
  ), 0) as overdue_loans_count;

revoke all on public.dashboard_metrics from anon;
grant select on public.dashboard_metrics to authenticated;
