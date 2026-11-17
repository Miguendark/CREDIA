-- NEXA — Migración 0012: "hoy" en hora de República Dominicana
--
-- La sesión de la base de datos corre en UTC. `current_date` en UTC adelanta
-- el día desde las 8:00 p. m. hora de RD (UTC-4, sin horario de verano):
-- un préstamo que vence hoy aparecería como vencido a esa hora, y un pago o
-- movimiento de capital sin fecha quedaría registrado con la fecha de mañana.
--
-- Cambia SOLO cómo se calcula "hoy". No cambia datos, montos, columnas,
-- políticas RLS ni privilegios de tablas.
--
--   1) Función public.today_rd(): fecha actual en America/Santo_Domingo.
--   2) Defaults: payments.payment_date y capital_transactions.transaction_date
--      (solo afecta filas NUEVAS sin fecha explícita; las existentes no cambian).
--   3) Vista dashboard_metrics: "vencidos" compara con today_rd().
--      Misma definición que 0007, mismas columnas, security_invoker = true.
--   4) register_capital_movement: fecha por defecto today_rd().
--      Mismo cuerpo que 0009 salvo esa línea.
--
-- La migración 0011 ya usa la hora de RD en sus propias funciones.
-- Reversa: 0012_down.sql
-- NO se aplica en producción sin respaldo previo y aprobación explícita.

begin;

-- =========================================================================
-- 1) today_rd()
-- =========================================================================
create or replace function public.today_rd()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Santo_Domingo')::date;
$$;

comment on function public.today_rd() is
  'Fecha de hoy en República Dominicana (America/Santo_Domingo). Usar en vez de current_date (la sesión corre en UTC).';

revoke execute on function public.today_rd() from public, anon;
grant execute on function public.today_rd() to authenticated, service_role;

-- =========================================================================
-- 2) Defaults de fecha
-- =========================================================================
alter table public.payments alter column payment_date set default public.today_rd();
alter table public.capital_transactions alter column transaction_date set default public.today_rd();

-- =========================================================================
-- 3) dashboard_metrics (definición de 0007; solo cambia current_date)
-- =========================================================================
create or replace view public.dashboard_metrics
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
    where status = 'activo' and next_payment_date < public.today_rd()
  ), 0) as overdue_loans_count;

-- =========================================================================
-- 4) register_capital_movement (cuerpo de 0009; solo cambia current_date)
-- =========================================================================
create or replace function public.register_capital_movement(
  p_type public.capital_transaction_type,
  p_amount numeric,
  p_description text,
  p_transaction_date date
)
returns public.capital_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement public.capital_transactions;
begin
  if public.current_user_role() not in ('admin', 'supervisor') then
    raise exception 'No tienes permiso para registrar movimientos de capital';
  end if;

  if p_type not in ('aporte', 'retiro', 'ajuste') then
    raise exception 'Este movimiento debe registrarse automáticamente por el sistema (tipo %)', p_type;
  end if;
  if p_amount <= 0 then
    raise exception 'El monto del movimiento debe ser mayor a cero';
  end if;

  insert into public.capital_transactions (type, amount, description, transaction_date, created_by)
  values (p_type, p_amount, p_description, coalesce(p_transaction_date, public.today_rd()), auth.uid())
  returning * into v_movement;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'movimiento_capital', 'capital_transactions', v_movement.id, p_type || ' de RD$' || p_amount);

  return v_movement;
end;
$$;

commit;
