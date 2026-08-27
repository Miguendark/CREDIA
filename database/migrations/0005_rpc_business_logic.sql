-- NEXA — Migración 0005: Funciones RPC de negocio
--
-- Estas funciones son el ÚNICO camino soportado para escribir operaciones
-- financieras multi-tabla (crear préstamo, registrar pago, mover capital).
-- Corren con SECURITY INVOKER (por defecto): se ejecutan con los permisos
-- del usuario autenticado que llama, así que las políticas RLS (migración 0006)
-- siguen aplicando. Cada función es una sola transacción: si algo falla,
-- Postgres revierte todos los cambios (ver sección 34 del documento de producto).
--
-- La MATEMÁTICA financiera (cuánto interés, cómo se reparte un pago) vive en
-- lib/finance/*.ts, no aquí. Estas funciones solo persisten de forma atómica
-- lo que la capa de aplicación ya calculó, y re-validan los montos contra el
-- estado real en base de datos antes de aplicarlos (no confían en el cliente).

-- =========================================================================
-- create_loan_with_installments
-- =========================================================================
create or replace function public.create_loan_with_installments(
  p_client_id uuid,
  p_principal_amount numeric,
  p_interest_rate numeric,
  p_interest_type public.loan_interest_type,
  p_number_of_installments integer,
  p_installment_amount numeric,
  p_total_interest numeric,
  p_total_amount numeric,
  p_frequency public.loan_frequency,
  p_start_date date,
  p_first_payment_date date,
  p_notes text,
  p_installments jsonb
)
returns public.loans
language plpgsql
as $$
declare
  v_client public.clients;
  v_loan public.loans;
begin
  if p_principal_amount <= 0 then
    raise exception 'El capital del préstamo debe ser mayor a cero';
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'El cliente no existe';
  end if;
  if v_client.status <> 'activo' then
    raise exception 'No se puede crear un préstamo para un cliente inactivo';
  end if;

  insert into public.loans (
    client_id, principal_amount, interest_rate, interest_type,
    total_interest, total_amount, number_of_installments, installment_amount,
    frequency, start_date, first_payment_date, next_payment_date,
    outstanding_principal, outstanding_interest, total_paid, status, notes, created_by
  ) values (
    p_client_id, p_principal_amount, p_interest_rate, p_interest_type,
    p_total_interest, p_total_amount, p_number_of_installments, p_installment_amount,
    p_frequency, p_start_date, p_first_payment_date, p_first_payment_date,
    p_principal_amount, p_total_interest, 0, 'activo', p_notes, auth.uid()
  )
  returning * into v_loan;

  insert into public.installments (
    loan_id, installment_number, due_date, principal_amount, interest_amount, total_amount, remaining_amount
  )
  select
    v_loan.id,
    (item ->> 'installment_number')::integer,
    (item ->> 'due_date')::date,
    (item ->> 'principal_amount')::numeric,
    (item ->> 'interest_amount')::numeric,
    (item ->> 'total_amount')::numeric,
    (item ->> 'total_amount')::numeric
  from jsonb_array_elements(p_installments) as item;

  insert into public.capital_transactions (type, amount, description, reference_id, transaction_date, created_by)
  values ('prestamo', p_principal_amount, 'Desembolso préstamo ' || v_loan.loan_number, v_loan.id, p_start_date, auth.uid());

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'crear_prestamo', 'loans', v_loan.id, 'Préstamo ' || v_loan.loan_number || ' creado por RD$' || p_principal_amount);

  return v_loan;
end;
$$;

-- =========================================================================
-- register_payment
-- p_allocations: jsonb array de
--   { "installment_id": uuid, "amount": numeric, "principal_applied": numeric, "interest_applied": numeric }
-- Precalculado por lib/finance/payment-allocator.ts, pero revalidado aquí
-- fila por fila contra el remaining_amount real de cada cuota bajo lock.
-- =========================================================================
create or replace function public.register_payment(
  p_loan_id uuid,
  p_client_id uuid,
  p_allocations jsonb,
  p_payment_method public.payment_method_type,
  p_payment_date date,
  p_receipt_number text,
  p_notes text
)
returns setof public.payments
language plpgsql
as $$
declare
  v_loan public.loans;
  v_installment public.installments;
  v_alloc record;
  v_payment public.payments;
  v_payment_ids uuid[] := '{}';
  v_total_amount numeric := 0;
  v_total_principal numeric := 0;
  v_total_interest numeric := 0;
begin
  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'El préstamo no existe';
  end if;
  if v_loan.client_id <> p_client_id then
    raise exception 'El préstamo no corresponde al cliente indicado';
  end if;
  if v_loan.status in ('cancelado', 'pagado') then
    raise exception 'El préstamo % no admite nuevos pagos (estado: %)', v_loan.loan_number, v_loan.status;
  end if;
  if jsonb_array_length(p_allocations) = 0 then
    raise exception 'No se indicó ninguna cuota a pagar';
  end if;

  for v_alloc in select * from jsonb_to_recordset(p_allocations) as x(
    installment_id uuid, amount numeric, principal_applied numeric, interest_applied numeric
  )
  loop
    if v_alloc.amount <= 0 then
      raise exception 'El monto aplicado a una cuota debe ser mayor a cero';
    end if;
    if abs(v_alloc.amount - (v_alloc.principal_applied + v_alloc.interest_applied)) > 0.01 then
      raise exception 'La distribución capital/interés no coincide con el monto del pago';
    end if;

    select * into v_installment from public.installments
      where id = v_alloc.installment_id and loan_id = p_loan_id
      for update;
    if not found then
      raise exception 'La cuota indicada no pertenece a este préstamo';
    end if;
    if v_alloc.amount > v_installment.remaining_amount + 0.01 then
      raise exception 'El monto (RD$%) excede el saldo pendiente de la cuota #% (RD$%)',
        v_alloc.amount, v_installment.installment_number, v_installment.remaining_amount;
    end if;

    update public.installments set
      amount_paid = amount_paid + v_alloc.amount,
      remaining_amount = greatest(remaining_amount - v_alloc.amount, 0),
      status = case when remaining_amount - v_alloc.amount <= 0.01 then 'pagada' else 'parcial' end,
      paid_at = case when remaining_amount - v_alloc.amount <= 0.01 then now() else paid_at end
      where id = v_installment.id;

    insert into public.payments (
      client_id, loan_id, installment_id, amount, principal_applied, interest_applied,
      payment_method, payment_date, receipt_number, notes, created_by
    ) values (
      p_client_id, p_loan_id, v_installment.id, v_alloc.amount, v_alloc.principal_applied, v_alloc.interest_applied,
      p_payment_method, p_payment_date, p_receipt_number, p_notes, auth.uid()
    )
    returning * into v_payment;

    v_payment_ids := array_append(v_payment_ids, v_payment.id);
    v_total_amount := v_total_amount + v_alloc.amount;
    v_total_principal := v_total_principal + v_alloc.principal_applied;
    v_total_interest := v_total_interest + v_alloc.interest_applied;
  end loop;

  update public.loans set
    outstanding_principal = greatest(outstanding_principal - v_total_principal, 0),
    outstanding_interest = greatest(outstanding_interest - v_total_interest, 0),
    total_paid = total_paid + v_total_amount,
    next_payment_date = (
      select min(due_date) from public.installments
      where loan_id = p_loan_id and status in ('pendiente', 'parcial')
    ),
    status = case
      when not exists (
        select 1 from public.installments
        where loan_id = p_loan_id and status in ('pendiente', 'parcial')
      ) then 'pagado'::public.loan_status
      else status
    end
    where id = p_loan_id;

  insert into public.capital_transactions (type, amount, description, reference_id, transaction_date, created_by)
  values ('pago', v_total_amount, 'Pago recibido préstamo ' || v_loan.loan_number, p_loan_id, p_payment_date, auth.uid());

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'registrar_pago', 'payments', p_loan_id, 'Pago de RD$' || v_total_amount || ' aplicado al préstamo ' || v_loan.loan_number);

  return query select * from public.payments where id = any(v_payment_ids);
end;
$$;

-- =========================================================================
-- register_capital_movement — aportes / retiros / ajustes manuales
-- =========================================================================
create or replace function public.register_capital_movement(
  p_type public.capital_transaction_type,
  p_amount numeric,
  p_description text,
  p_transaction_date date
)
returns public.capital_transactions
language plpgsql
as $$
declare
  v_movement public.capital_transactions;
begin
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
