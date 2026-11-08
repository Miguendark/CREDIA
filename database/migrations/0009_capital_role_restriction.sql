-- NEXA — Migración 0009: Restringir Capital a admin/supervisor
--
-- El rol "cobrador" está documentado (Configuración > Seguridad) como
-- limitado a clientes, préstamos, pagos y cobros — sin acceso a Capital.
-- Hasta esta migración esa restricción solo existía en el frontend
-- (ocultar el link de menú); a nivel de base de datos cualquier staff
-- autenticado podía leer y mover capital vía register_capital_movement.
-- Esta migración cierra ese hueco en las dos capas: RLS (lectura) y la
-- función RPC (escritura).

drop policy if exists capital_transactions_select_staff on public.capital_transactions;

create policy capital_transactions_select_admin_supervisor on public.capital_transactions
  for select using (public.current_user_role() in ('admin', 'supervisor'));

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
