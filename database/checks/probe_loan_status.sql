-- NEXA — Fila 20 de probe_finance.sql: préstamos "pagado" con saldo o "activo" sin saldo.
-- SOLO LECTURA. Un único SELECT. Pegar completo en el SQL Editor y ejecutar.
--
-- Filas por préstamo encontrado (ordenadas):
--   0     resumen y diagnóstico automático
--   1xx   cada cuota (lo pactado, lo abonado y lo que aplicaron los pagos)
--   2xx   cada pago
--   3xx   movimientos de Capital del préstamo
--   4xx   auditoría del préstamo
-- Si no sale ninguna fila: el problema ya no existe.

with
sospechosos as (
  select l.*
  from public.loans l
  where (l.status = 'pagado' and l.outstanding_principal + l.outstanding_interest > 0.01)
     or (l.status = 'activo' and l.outstanding_principal + l.outstanding_interest <= 0.01)
),
cuotas as (
  select i.*,
    coalesce((select sum(pm.principal_applied) from public.payments pm where pm.installment_id = i.id), 0) as cap_aplicado,
    coalesce((select sum(pm.interest_applied) from public.payments pm where pm.installment_id = i.id), 0) as int_aplicado,
    (select count(*) from public.payments pm where pm.installment_id = i.id) as n_pagos
  from public.installments i
  where i.loan_id in (select id from sospechosos)
),
resumen as (
  select s.id,
    count(c.*) as cuotas,
    count(c.*) filter (where c.status = 'pagada') as pagadas,
    count(c.*) filter (where c.status in ('pendiente', 'parcial', 'vencida')) as abiertas,
    coalesce(sum(c.remaining_amount), 0) as resta_en_cuotas,
    coalesce(sum(c.remaining_amount) filter (where c.status = 'pagada'), 0) as resta_en_pagadas,
    coalesce(sum(c.principal_amount - c.cap_aplicado), 0) as cap_sin_aplicar,
    coalesce(sum(c.interest_amount - c.int_aplicado), 0) as int_sin_aplicar,
    coalesce(sum(c.cap_aplicado), 0) as cap_aplicado,
    coalesce(sum(c.int_aplicado), 0) as int_aplicado
  from sospechosos s left join cuotas c on c.loan_id = s.id
  group by s.id
),
filas(prestamo, orden, seccion, detalle) as (
  -- 0: resumen + diagnóstico
  select s.loan_number, 0, 'RESUMEN',
    'cliente ' || cl.full_name
    || ' · estado ' || s.status
    || ' · ' || s.frequency || ' · ' || s.interest_type
    || ' · capital ' || s.principal_amount || ' · interés ' || s.total_interest
    || ' · saldo capital ' || s.outstanding_principal || ' · saldo interés ' || s.outstanding_interest
    || ' · total pagado ' || s.total_paid
    || ' · inicio ' || s.start_date || ' · próximo pago ' || coalesce(s.next_payment_date::text, '-')
    || ' · cuotas ' || r.cuotas || ' (pagadas ' || r.pagadas || ', abiertas ' || r.abiertas || ')'
    || ' · resta en cuotas ' || r.resta_en_cuotas
    || ' · capital aplicado ' || r.cap_aplicado || ' · interés aplicado ' || r.int_aplicado
    || ' || DIAGNÓSTICO: ' ||
    case
      when s.status = 'pagado' and r.abiertas = 0 and r.resta_en_cuotas <= 0.05 then
        'Todas las cuotas quedaron "pagada" (la base marca pagada una cuota si falta RD$0.01 o menos), pero el préstamo guardó '
        || (s.outstanding_principal + s.outstanding_interest) || ' de saldo. Es redondeo: los pagos repartieron capital/interés '
        || 'con centavos distintos a los de las cuotas (capital sin aplicar ' || r.cap_sin_aplicar || ', interés sin aplicar ' || r.int_sin_aplicar || ').'
      when s.status = 'pagado' then
        'Está "pagado" pero tiene cuotas abiertas o saldo real: revisar las cuotas (filas 1xx).'
      when s.status = 'activo' and r.abiertas > 0 and r.resta_en_cuotas > 0.009 then
        'Está "activo" con saldo 0 en el préstamo, pero sus cuotas todavía deben ' || r.resta_en_cuotas
        || '. Los pagos aplicaron más capital/interés del que tenían esas cuotas (capital sin aplicar ' || r.cap_sin_aplicar
        || ', interés sin aplicar ' || r.int_sin_aplicar || '): el saldo del préstamo llegó a 0 antes que las cuotas.'
      when s.status = 'activo' and r.abiertas > 0 then
        'Está "activo" porque queda alguna cuota abierta con centavos (resta ' || r.resta_en_cuotas || '); el saldo del préstamo ya es 0. Es redondeo.'
      when s.status = 'activo' and r.cuotas = 0 then
        'Está "activo" sin cuotas.'
      else
        'Está "activo" sin saldo y sin cuotas abiertas: nunca pasó a "pagado".'
    end
  from sospechosos s
  join resumen r on r.id = s.id
  left join public.clients cl on cl.id = s.client_id

  -- 1xx: cuotas
  union all
  select s.loan_number, 100 + c.installment_number, 'CUOTA #' || c.installment_number,
    'vence ' || c.due_date || ' · estado ' || c.status
    || ' · capital ' || c.principal_amount || ' · interés ' || c.interest_amount || ' · total ' || c.total_amount
    || ' · abonado ' || c.amount_paid || ' · resta ' || c.remaining_amount
    || ' · pagos ' || c.n_pagos || ' (capital ' || c.cap_aplicado || ', interés ' || c.int_aplicado || ')'
    || case when abs(c.principal_amount - c.cap_aplicado) > 0.009 or abs(c.interest_amount - c.int_aplicado) > 0.009
         then ' · DIFERENCIA capital ' || (c.principal_amount - c.cap_aplicado) || ' / interés ' || (c.interest_amount - c.int_aplicado)
         else '' end
    || case when c.principal_amount + c.interest_amount <> c.total_amount then ' · OJO: capital + interés ≠ total' else '' end
  from sospechosos s join cuotas c on c.loan_id = s.id

  -- 2xx: pagos
  union all
  select s.loan_number,
    (200 + row_number() over (partition by s.id order by pm.payment_date, pm.created_at))::int, 'PAGO',
    pm.payment_date || ' · monto ' || pm.amount || ' · capital ' || pm.principal_applied || ' · interés ' || pm.interest_applied
    || ' · cuota #' || coalesce(ci.installment_number::text, '-') || ' · ' || pm.payment_method
    || ' · registrado ' || to_char(pm.created_at at time zone 'America/Santo_Domingo', 'YYYY-MM-DD HH24:MI')
    || ' por ' || coalesce(u.name, 'sin usuario')
  from sospechosos s
  join public.payments pm on pm.loan_id = s.id
  left join public.installments ci on ci.id = pm.installment_id
  left join public.users u on u.id = pm.created_by

  -- 3xx: movimientos de Capital
  union all
  select s.loan_number,
    (300 + row_number() over (partition by s.id order by t.transaction_date, t.created_at))::int, 'CAPITAL',
    t.transaction_date || ' · ' || t.type || ' · ' || t.amount || ' · ' || coalesce(t.description, '')
  from sospechosos s join public.capital_transactions t on t.reference_id = s.id

  -- 4xx: auditoría
  union all
  select s.loan_number,
    (400 + row_number() over (partition by s.id order by a.created_at))::int, 'AUDITORÍA',
    to_char(a.created_at at time zone 'America/Santo_Domingo', 'YYYY-MM-DD HH24:MI') || ' · ' || a.action
    || ' · ' || coalesce(left(a.description, 120), '')
  from sospechosos s
  join public.audit_logs a on a.entity_id = s.id
)
select prestamo, orden, seccion, detalle from filas order by prestamo, orden;
