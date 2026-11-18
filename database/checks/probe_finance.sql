-- NEXA — Revisión de datos para Finanzas (SOLO LECTURA). Un único SELECT.
-- Pegar completo en el SQL Editor y ejecutar. No modifica nada.
--   ok = true  → cuadra
--   ok = false → no cuadra (revisar antes de confiar en ese indicador)
--   ok = null  → informativo
-- Filas 100+: un renglón por préstamo cancelado.

with
hoy as (select (now() at time zone 'America/Santo_Domingo')::date as d),
p as (select loan_id, sum(principal_applied) pa, sum(interest_applied) ia, sum(amount) a, count(*) n from public.payments group by loan_id),
i as (select loan_id, sum(principal_amount) ip, sum(interest_amount) ii, sum(amount_paid) ap from public.installments group by loan_id),
x as (
  select l.id, l.status,
    l.principal_amount - coalesce(p.pa, 0) - l.outstanding_principal as dif_cap,
    l.total_interest - coalesce(p.ia, 0) - l.outstanding_interest as dif_int,
    l.total_paid - coalesce(p.a, 0) as dif_pagado,
    i.ip - l.principal_amount as dif_cuotas_cap,
    i.ii - l.total_interest as dif_cuotas_int,
    i.ap - coalesce(p.a, 0) as dif_abonado
  from public.loans l left join p on p.loan_id = l.id left join i on i.loan_id = l.id
),
cuota_int as (
  select i.id, i.interest_amount - coalesce(sum(pm.interest_applied), 0) as d
  from public.installments i left join public.payments pm on pm.installment_id = i.id
  where i.status = 'pagada'
  group by i.id, i.interest_amount
),
cancelados as (
  select l.loan_number, l.principal_amount, l.outstanding_principal, l.outstanding_interest, l.start_date,
    coalesce(p.n, 0) as pagos, coalesce(p.a, 0) as cobrado,
    (select min((a.created_at at time zone 'America/Santo_Domingo')::date) from public.audit_logs a
      where a.entity = 'loans' and a.entity_id = l.id and a.action = 'cancelar_prestamo') as fecha_auditoria,
    (l.updated_at at time zone 'America/Santo_Domingo')::date as fecha_actualizado,
    exists (select 1 from public.capital_transactions t where t.type = 'prestamo' and t.reference_id = l.id) as desembolso_en_caja,
    l.notes
  from public.loans l left join p on p.loan_id = l.id
  where l.status = 'cancelado'
),
checks(orden, comprobacion, valor, esperado, ok) as (
  select 1, 'Hoy (hora RD)', (select d::text from hoy), '(informativo)', null::boolean
  union all select 2, 'Préstamos por estado',
    (select string_agg(status::text || '=' || n, ', ' order by status) from (select status, count(*) n from public.loans group by 1) s), '(informativo)', null
  union all select 3, 'Préstamos por tipo de interés',
    (select string_agg(interest_type::text || '=' || n, ', ') from (select interest_type, count(*) n from public.loans group by 1) s), '(informativo)', null

  -- Cuadres que usa Finanzas
  union all select 10, 'Capital: principal − Σ capital pagado = saldo (préstamos que NO cuadran / máx. dif.)',
    count(*) filter (where abs(dif_cap) > 0.009)::text || ' / ' || coalesce(max(abs(dif_cap)), 0)::text, '0 / 0.00',
    count(*) filter (where abs(dif_cap) > 0.009) = 0 from x
  union all select 11, 'Interés: total − Σ interés pagado = saldo (NO cuadran / máx. dif.)',
    count(*) filter (where abs(dif_int) > 0.009)::text || ' / ' || coalesce(max(abs(dif_int)), 0)::text, '0 / 0.00',
    count(*) filter (where abs(dif_int) > 0.009) = 0 from x
  union all select 12, 'total_paid = Σ pagos (NO cuadran)', count(*) filter (where abs(dif_pagado) > 0.009)::text, '0',
    count(*) filter (where abs(dif_pagado) > 0.009) = 0 from x
  union all select 13, 'Σ capital de cuotas = capital del préstamo (NO cuadran / máx.)',
    count(*) filter (where abs(dif_cuotas_cap) > 0.009)::text || ' / ' || coalesce(max(abs(dif_cuotas_cap)), 0)::text, '0 / 0.00',
    count(*) filter (where abs(dif_cuotas_cap) > 0.009) = 0 from x
  union all select 14, 'Σ interés de cuotas = interés del préstamo (NO cuadran / máx.)',
    count(*) filter (where abs(dif_cuotas_int) > 0.009)::text || ' / ' || coalesce(max(abs(dif_cuotas_int)), 0)::text, '0 / 0.00',
    count(*) filter (where abs(dif_cuotas_int) > 0.009) = 0 from x
  union all select 15, 'Σ abonado en cuotas = Σ pagos (NO cuadran)', count(*) filter (where abs(dif_abonado) > 0.009)::text, '0',
    count(*) filter (where abs(dif_abonado) > 0.009) = 0 from x
  union all select 16, 'Cuotas pagadas: interés cobrado = interés de la cuota (NO cuadran de total / máx. dif.)',
    (select count(*) filter (where abs(d) > 0.009)::text || ' de ' || count(*)::text || ' / ' || coalesce(max(abs(d)), 0)::text from cuota_int),
    '0 de N / 0.00', (select count(*) filter (where abs(d) > 0.009) = 0 from cuota_int)
  union all select 17, 'Σ movimientos "pago" de capital = Σ pagos',
    (select coalesce(sum(amount), 0)::text from public.capital_transactions where type = 'pago') || ' vs ' || (select coalesce(sum(amount), 0)::text from public.payments),
    'iguales', (select coalesce(sum(amount), 0) from public.capital_transactions where type = 'pago') = (select coalesce(sum(amount), 0) from public.payments)
  union all select 18, 'Σ movimientos "prestamo" = Σ capital de préstamos',
    (select coalesce(sum(amount), 0)::text from public.capital_transactions where type = 'prestamo') || ' vs ' || (select coalesce(sum(principal_amount), 0)::text from public.loans),
    'iguales', (select coalesce(sum(amount), 0) from public.capital_transactions where type = 'prestamo') = (select coalesce(sum(principal_amount), 0) from public.loans)
  union all select 19, 'Capital en la calle (préstamos activos) = dashboard',
    (select coalesce(sum(outstanding_principal), 0)::text from public.loans where status = 'activo') || ' vs ' || (select lent_capital::text from public.dashboard_metrics),
    'iguales', (select coalesce(sum(outstanding_principal), 0) from public.loans where status = 'activo') = (select lent_capital from public.dashboard_metrics)
  -- Tolerancia de 1 centavo (la misma de las cuotas): un saldo de RD$0.01 o menos cuenta como cero.
  union all select 20, 'Préstamos "pagado" con saldo, o "activo" sin saldo (saldo ≤ RD$0.01 cuenta como cero)',
    (select count(*)::text from public.loans where (status = 'pagado' and outstanding_principal + outstanding_interest > 0.01)
       or (status = 'activo' and outstanding_principal + outstanding_interest <= 0.01)), '0',
    (select count(*) from public.loans where (status = 'pagado' and outstanding_principal + outstanding_interest > 0.01)
       or (status = 'activo' and outstanding_principal + outstanding_interest <= 0.01)) = 0
  union all select 21, 'Préstamos "pagado" con 1 centavo de saldo (se cuentan como cero)',
    coalesce((select string_agg(loan_number || ' (' || (outstanding_principal + outstanding_interest) || ')', ', ' order by loan_number)
       from public.loans where status = 'pagado' and outstanding_principal + outstanding_interest > 0.005
         and outstanding_principal + outstanding_interest <= 0.01), 'ninguno'), '(informativo)', null

  -- Fechas en el futuro (afectan la comparación por fechas)
  union all select 30, 'Préstamos con fecha de inicio futura (cantidad / capital)',
    (select count(*)::text || ' / ' || coalesce(sum(principal_amount), 0)::text from public.loans, hoy where start_date > hoy.d), '0 / 0', null
  union all select 31, 'Pagos con fecha futura (cantidad / monto)',
    (select count(*)::text || ' / ' || coalesce(sum(amount), 0)::text from public.payments, hoy where payment_date > hoy.d), '0 / 0', null
  union all select 32, 'Movimientos de capital con fecha futura (cantidad / neto)',
    (select count(*)::text || ' / ' || coalesce(sum(case when type in ('aporte','pago','ajuste') then amount else -amount end), 0)::text
       from public.capital_transactions, hoy where transaction_date > hoy.d), '0 / 0', null
  union all select 33, 'Pagos registrados SIN usuario (created_by vacío)',
    (select count(*)::text from public.payments where created_by is null), '(informativo: salen como "Sin usuario")', null

  -- Cancelados: resumen
  union all select 40, 'Cancelados: cantidad', (select count(*)::text from cancelados), '(informativo)', null
  union all select 41, 'Cancelados: capital prestado (salió de caja)', (select coalesce(sum(principal_amount), 0)::text from cancelados), '(informativo)', null
  union all select 42, 'Cancelados: saldo de capital que quedó registrado', (select coalesce(sum(outstanding_principal), 0)::text from cancelados), '(informativo)', null
  union all select 43, 'Cancelados: con pagos (cantidad / Σ cobrado)',
    (select count(*) filter (where pagos > 0)::text || ' / ' || coalesce(sum(cobrado), 0)::text from cancelados), '(informativo)', null
  union all select 44, 'Cancelados: sin fecha en auditoría (se usaría la fecha de última actualización)',
    (select count(*) filter (where fecha_auditoria is null)::text from cancelados), '0', (select count(*) filter (where fecha_auditoria is null) = 0 from cancelados)

  -- Cancelados: detalle (uno por renglón)
  union all
  select (100 + row_number() over (order by start_date, loan_number))::int,
    'Cancelado ' || loan_number,
    'capital ' || principal_amount || ' · saldo capital ' || outstanding_principal || ' · pagos ' || pagos || ' (' || cobrado || ')'
      || ' · inicio ' || start_date || ' · cancelado ' || coalesce(fecha_auditoria::text, fecha_actualizado::text || ' (sin auditoría)')
      || ' · desembolso en caja: ' || case when desembolso_en_caja then 'sí' else 'no' end
      || ' · nota: ' || coalesce(left(notes, 60), '-'),
    '(informativo)', null
  from cancelados
)
select orden, comprobacion, valor, esperado, ok from checks order by orden;
