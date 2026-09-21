-- NEXA — Migración 0010: Comprobante de pago (receipts)
--
-- 100% ADITIVA. No hace ALTER, DROP ni UPDATE sobre ninguna tabla, función,
-- vista o política existente. No modifica create_loan_with_installments,
-- register_payment ni register_capital_movement (migración 0005). Solo LEE
-- de clients/loans/installments/payments/users — nunca escribe en ellas.
--
-- Contexto de diseño (acordado antes de escribir este archivo):
--
-- 1) Un solo "pago" del cobrador puede generar VARIAS filas en `payments`
--    cuando el monto cae en cascada sobre 2+ cuotas (ver register_payment,
--    migración 0005). Por eso un recibo no ancla a una sola fila de forma
--    ingenua: `payment_id` es la fila de la cuota de MENOR número del
--    grupo, y `covered_payment_ids` guarda el id de TODAS las filas de pago
--    cubiertas (incluida el ancla). La reimpresión debe poder encontrar el
--    recibo a partir de cualquiera de esos ids, por eso existe el índice
--    GIN sobre `covered_payment_ids`.
-- 2) create_receipt revalida quién puede generar el recibo DENTRO de la
--    función (no confía en el frontend): admin/supervisor pueden generar el
--    recibo de cualquier pago; un cobrador solo puede generar el recibo de
--    pagos donde payments.created_by sea él mismo.
-- 3) void_receipt anula (nunca borra ni edita) un recibo: solo admin/
--    supervisor, con motivo obligatorio de al menos 10 caracteres. Anular
--    un recibo NO anula el pago ni revierte ningún saldo — es un dato
--    aparte, de exhibición.
-- 4) Los montos y datos mostrados en el recibo (cliente, préstamo, cuotas
--    cubiertas, saldo pendiente, próxima cuota, cobrador, etiqueta de
--    cuotas) se recalculan DENTRO de create_receipt leyendo el estado real
--    en base de datos, nunca se confía en lo que mande el navegador —
--    mismo criterio que register_payment usa para los montos de pago.
-- 5) El saldo pendiente del recibo solo es válido si este es el pago más
--    reciente del préstamo al momento de generarlo: si ya existe un pago
--    posterior, create_receipt rechaza la generación (ver más abajo).
-- 6) `payment_id` es único solo entre recibos VIGENTES (índice único
--    parcial `where status = 'activo'`): anular un recibo libera su ancla
--    para poder emitir uno nuevo que la cubra.

-- =========================================================================
-- Secuencia para el número consecutivo del recibo (REC-000001, REC-000002...)
-- =========================================================================
create sequence public.receipt_number_seq start 1;

-- =========================================================================
-- Tabla receipts
-- =========================================================================
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,

  -- Ancla: la fila de `payments` de la cuota de menor número del grupo cubierto.
  -- Único solo entre recibos con status = 'activo' (ver índice más abajo).
  payment_id uuid not null references public.payments (id) on delete restrict,

  -- Todas las filas de `payments` cubiertas por este recibo (incluye el ancla).
  -- Permite encontrar el recibo a partir de cualquier pago del grupo, no solo del ancla.
  covered_payment_ids uuid[] not null,
  constraint receipts_covered_payment_ids_not_empty check (array_length(covered_payment_ids, 1) > 0),

  loan_id uuid not null references public.loans (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,

  -- Copia fija ("snapshot") de lo que se muestra en el recibo, tomada al
  -- generarlo. No se actualiza si el cliente/préstamo cambian después.
  client_name text not null,
  client_code text not null,
  loan_number text not null,
  amount_paid numeric(14, 2) not null check (amount_paid > 0),
  installments_covered jsonb not null,
  installments_label text not null check (btrim(installments_label) <> ''),
  total_installments integer not null check (total_installments > 0),
  -- Cuotas del préstamo completamente pagadas después de este pago (barra de progreso).
  installments_paid_count integer not null check (installments_paid_count >= 0),
  outstanding_balance numeric(14, 2) not null check (outstanding_balance >= 0),
  next_payment_date date,
  collector_id uuid references public.users (id),
  collector_name text not null,
  payment_date date not null,

  -- Anulación (nunca UPDATE de los datos financieros de arriba, ni DELETE).
  status text not null default 'activo' check (status in ('activo', 'anulado')),
  void_reason text,
  voided_by uuid references public.users (id),
  voided_at timestamptz,

  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

comment on table public.receipts is 'Comprobantes de pago (snapshot inmutable, generado después de register_payment). No se edita ni se borra: se anula.';
comment on column public.receipts.payment_id is 'Fila ancla en payments: la de menor installment_number del grupo cubierto por este recibo.';
comment on column public.receipts.covered_payment_ids is 'Todas las filas de payments cubiertas (incluye el ancla). Usar para buscar el recibo desde cualquier pago del grupo.';

-- Único por payment_id solo entre recibos vigentes: al anular un recibo,
-- su ancla queda libre para que se pueda generar uno nuevo.
create unique index receipts_payment_id_active_idx on public.receipts (payment_id) where status = 'activo';

create index receipts_covered_payment_ids_idx on public.receipts using gin (covered_payment_ids);
create index receipts_loan_id_idx on public.receipts (loan_id);
create index receipts_client_id_idx on public.receipts (client_id);
create index receipts_created_by_idx on public.receipts (created_by);
create index receipts_collector_id_idx on public.receipts (collector_id);
create index receipts_status_idx on public.receipts (status);

-- =========================================================================
-- RLS: admin/supervisor ven todos los recibos; cobrador ve los que cobró
-- (collector_id) o los que él mismo generó (created_by) — pueden diferir si
-- un admin regenera/reimprime el recibo de un pago cobrado por otra persona.
-- =========================================================================
alter table public.receipts enable row level security;

create policy receipts_select_admin_supervisor on public.receipts
  for select using (public.current_user_role() in ('admin', 'supervisor'));

create policy receipts_select_own_cobrador on public.receipts
  for select using (
    public.current_user_role() = 'cobrador'
    and (collector_id = auth.uid() or created_by = auth.uid())
  );

-- Privilegios base explícitos: toda escritura pasa por las funciones RPC de
-- abajo, nunca por INSERT/UPDATE/DELETE directo ni por acceso directo a la
-- secuencia (que solo se usa dentro de create_receipt, SECURITY DEFINER).
revoke all on public.receipts from anon, authenticated;
grant select on public.receipts to authenticated;

revoke all on public.receipt_number_seq from anon, authenticated;

-- =========================================================================
-- create_receipt — genera el recibo DESPUÉS de que register_payment ya
-- confirmó el pago. Si esta función falla, el pago queda intacto: se puede
-- reintentar la generación del recibo sin volver a cobrar nada.
--
-- p_payment_ids: todas las filas de `payments` que produjo UNA sola llamada
-- a register_payment (una si el pago cayó en una sola cuota, varias si
-- cayó en cascada sobre más de una).
-- =========================================================================
create or replace function public.create_receipt(
  p_payment_ids uuid[]
)
returns public.receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
  v_payment_ids uuid[];
  v_found_count integer;
  v_loan_count integer;
  v_client_count integer;
  v_date_count integer;
  v_loan_id uuid;
  v_client_id uuid;
  v_payment_date date;
  v_group_created_at timestamptz;
  v_later_payment_count integer;
  v_owned_by_others integer;
  v_overlap_count integer;
  v_anchor_payment_id uuid;
  v_collector_id uuid;
  v_collector_name text;
  v_loan public.loans;
  v_client public.clients;
  v_total_amount numeric(14, 2);
  v_installments_covered jsonb;
  v_numbers integer[];
  v_all_paid boolean;
  v_count integer;
  v_is_range boolean;
  v_installments_label text;
  v_installments_paid_count integer;
  v_receipt_number text;
  v_receipt public.receipts;
begin
  if p_payment_ids is null or array_length(p_payment_ids, 1) is null then
    raise exception 'Debes indicar al menos un pago para generar el recibo';
  end if;

  v_role := public.current_user_role();
  if v_role is null then
    raise exception 'No tienes permiso para generar recibos';
  end if;

  -- Ids sin duplicados, para que las validaciones de conteo de abajo sean exactas.
  select array_agg(distinct x) into v_payment_ids from unnest(p_payment_ids) as x;

  -- Todos los ids deben existir y pertenecer a un único préstamo/cliente/fecha
  -- (defensa contra mezclar pagos de eventos distintos en un mismo recibo).
  -- min()/max() no existen para uuid: loan_id/client_id/payment_date se leen
  -- aparte, una vez confirmado que hay exactamente un valor distinto de cada uno.
  select count(*), count(distinct loan_id), count(distinct client_id), count(distinct payment_date),
         max(created_at)
    into v_found_count, v_loan_count, v_client_count, v_date_count, v_group_created_at
    from public.payments
    where id = any (v_payment_ids);

  if v_found_count <> array_length(v_payment_ids, 1) then
    raise exception 'Alguno de los pagos indicados no existe';
  end if;
  if v_loan_count <> 1 or v_client_count <> 1 or v_date_count <> 1 then
    raise exception 'Los pagos indicados no corresponden a un mismo evento de pago';
  end if;

  select loan_id, client_id, payment_date
    into v_loan_id, v_client_id, v_payment_date
    from public.payments
    where id = v_payment_ids[1];

  -- Bloquea la fila del préstamo (compartido) mientras dura la generación
  -- del recibo, para leer un outstanding_principal/outstanding_interest
  -- consistente con el resto de las validaciones de esta transacción.
  select * into v_loan from public.loans where id = v_loan_id for share;

  -- Cobrador: solo puede generar recibos de pagos que él mismo registró.
  if v_role = 'cobrador' then
    select count(*) into v_owned_by_others
      from public.payments
      where id = any (v_payment_ids) and created_by is distinct from auth.uid();
    if v_owned_by_others > 0 then
      raise exception 'Solo puedes generar recibos de pagos que tú registraste';
    end if;
  end if;

  -- El snapshot de saldo pendiente solo es válido si este es el pago más
  -- reciente del préstamo: si ya hay uno posterior, el saldo actual del
  -- préstamo ya no corresponde al momento de este pago.
  select count(*) into v_later_payment_count
    from public.payments
    where loan_id = v_loan_id and created_at > v_group_created_at;
  if v_later_payment_count > 0 then
    raise exception 'No se puede generar el recibo: ya se registró un pago posterior en este préstamo, el saldo pendiente ya no corresponde al momento de este pago';
  end if;

  -- Evita recibos duplicados o parcialmente solapados con uno ya vigente
  -- (un recibo anulado no bloquea generar uno nuevo).
  select count(*) into v_overlap_count
    from public.receipts
    where status = 'activo' and covered_payment_ids && v_payment_ids;
  if v_overlap_count > 0 then
    raise exception 'Ya existe un recibo vigente que cubre alguno de estos pagos';
  end if;

  -- Ancla = la fila de la cuota de menor número dentro del grupo.
  select p.id, p.created_by
    into v_anchor_payment_id, v_collector_id
    from public.payments p
    join public.installments i on i.id = p.installment_id
    where p.id = any (v_payment_ids)
    order by i.installment_number asc
    limit 1;

  select
      coalesce(jsonb_agg(jsonb_build_object(
        'installment_number', i.installment_number,
        'amount', p.amount,
        'status', i.status
      ) order by i.installment_number asc), '[]'::jsonb),
      coalesce(sum(p.amount), 0),
      array_agg(distinct i.installment_number order by i.installment_number),
      bool_and(i.status = 'pagada')
    into v_installments_covered, v_total_amount, v_numbers, v_all_paid
    from public.payments p
    join public.installments i on i.id = p.installment_id
    where p.id = any (v_payment_ids);

  select * into v_client from public.clients where id = v_client_id;
  select name into v_collector_name from public.users where id = v_collector_id;

  -- Cuántas cuotas del préstamo quedan completamente pagadas después de este
  -- pago (para la barra de progreso del comprobante).
  select count(*) into v_installments_paid_count
    from public.installments
    where loan_id = v_loan_id and status = 'pagada';

  -- Etiqueta legible de cuotas cubiertas: "Cuota 4 de 12" (una cuota),
  -- "Cuotas 4 y 5 de 12" (dos), "Cuotas 4 a 6 de 12" (tres o más
  -- consecutivas); si alguna quedó incompleta (abono parcial), se antepone
  -- "Abono a ".
  v_count := array_length(v_numbers, 1);

  if v_count = 1 then
    v_installments_label := 'Cuota ' || v_numbers[1] || ' de ' || v_loan.number_of_installments;
  else
    v_is_range := (v_numbers[v_count] - v_numbers[1] + 1) = v_count;
    if v_is_range and v_count > 2 then
      v_installments_label :=
        'Cuotas ' || v_numbers[1] || ' a ' || v_numbers[v_count] || ' de ' || v_loan.number_of_installments;
    else
      v_installments_label :=
        'Cuotas ' || array_to_string(v_numbers[1 : v_count - 1], ', ') || ' y ' || v_numbers[v_count]
        || ' de ' || v_loan.number_of_installments;
    end if;
  end if;

  if not v_all_paid then
    v_installments_label :=
      'Abono a ' || lower(left(v_installments_label, 1)) || substring(v_installments_label from 2);
  end if;

  v_receipt_number := 'REC-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');

  insert into public.receipts (
    receipt_number, payment_id, covered_payment_ids, loan_id, client_id,
    client_name, client_code, loan_number, amount_paid, installments_covered,
    installments_label, total_installments, installments_paid_count,
    outstanding_balance, next_payment_date,
    collector_id, collector_name, payment_date, created_by
  ) values (
    v_receipt_number, v_anchor_payment_id, v_payment_ids, v_loan_id, v_client_id,
    v_client.full_name, v_client.client_code, v_loan.loan_number, v_total_amount, v_installments_covered,
    v_installments_label, v_loan.number_of_installments, v_installments_paid_count,
    v_loan.outstanding_principal + v_loan.outstanding_interest, v_loan.next_payment_date,
    v_collector_id, coalesce(v_collector_name, 'Desconocido'), v_payment_date, auth.uid()
  )
  returning * into v_receipt;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'crear_recibo', 'receipts', v_receipt.id,
    'Recibo ' || v_receipt_number || ' generado por RD$' || v_total_amount);

  return v_receipt;
end;
$$;

-- =========================================================================
-- void_receipt — anula un recibo (nunca lo edita ni lo borra). Solo
-- admin/supervisor. No toca payments/loans/installments: anular un recibo
-- NO anula el pago ni revierte ningún saldo, es un dato aparte de exhibición.
-- =========================================================================
create or replace function public.void_receipt(
  p_receipt_id uuid,
  p_reason text
)
returns public.receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
  v_receipt public.receipts;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'supervisor') then
    raise exception 'Solo un admin o supervisor puede anular un recibo';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'El motivo de anulación debe tener al menos 10 caracteres';
  end if;

  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'El recibo no existe';
  end if;
  if v_receipt.status = 'anulado' then
    raise exception 'Este recibo ya está anulado';
  end if;

  update public.receipts set
    status = 'anulado',
    void_reason = btrim(p_reason),
    voided_by = auth.uid(),
    voided_at = now()
    where id = p_receipt_id
    returning * into v_receipt;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'anular_recibo', 'receipts', v_receipt.id,
    'Recibo ' || v_receipt.receipt_number || ' anulado: ' || v_receipt.void_reason);

  return v_receipt;
end;
$$;

-- =========================================================================
-- Funciones RPC: solo el staff autenticado puede ejecutarlas (mismo patrón
-- que 0006). La verificación de rol fina (quién puede generar/anular qué)
-- vive DENTRO de cada función, no aquí.
-- =========================================================================
revoke execute on function public.create_receipt(uuid[]) from public, anon;
revoke execute on function public.void_receipt(uuid, text) from public, anon;

grant execute on function public.create_receipt(uuid[]) to authenticated;
grant execute on function public.void_receipt(uuid, text) to authenticated;
