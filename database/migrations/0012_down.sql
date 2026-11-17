-- NEXA — Reversa de la migración 0012 ("hoy" en hora de RD)
--
-- Deja todo como en 0007/0009: current_date (UTC) en la vista, los defaults
-- y register_capital_movement, y elimina today_rd(). No toca datos.
-- No ejecutar contra producción sin respaldo previo y aprobación explícita.

begin;

alter table public.payments alter column payment_date set default current_date;
alter table public.capital_transactions alter column transaction_date set default current_date;

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
    where status = 'activo' and next_payment_date < current_date
  ), 0) as overdue_loans_count;

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
  values (p_type, p_amount, p_description, coalesce(p_transaction_date, current_date), auth.uid())
  returning * into v_movement;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'movimiento_capital', 'capital_transactions', v_movement.id, p_type || ' de RD$' || p_amount);

  return v_movement;
end;
$$;

drop function if exists public.today_rd();

commit;
