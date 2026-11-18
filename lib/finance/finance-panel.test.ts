import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { daysInclusive, formatMonthLabel, formatRange, monthsInDays, periodFromParams, resolvePeriod } from "./periods"
import {
  agingBucketFor,
  agingSummary,
  changeTone,
  collectionEfficiency,
  compare,
  frequencyBreakdown,
  lateClients,
  monthlyReturn,
  projectionSeries,
  shareOf,
  sumFlows,
  sumPosition,
  type CancelledLoanRow,
  type FlowRow,
  type OverdueLoan,
  type PositionRow,
} from "./indicators"
import {
  EXPENSE_CATEGORY_LABELS,
  expenseSummary,
  lossSummary,
  netProfit,
  writeoffLossBetween,
  type ExpenseRow,
  type WriteoffRow,
} from "./losses"
import type { ExpenseCategory, LoanStatus } from "@/types/database.types"

const pick = (p: ReturnType<typeof resolvePeriod>) => [p.from, p.to, p.prevFrom, p.prevTo]

describe("periodos", () => {
  test("este mes: del 1 a hoy vs. los mismos días del mes anterior", () => {
    assert.deepEqual(pick(resolvePeriod("mes", "2026-11-17")), ["2026-11-01", "2026-11-17", "2026-10-01", "2026-10-17"])
  })
  test("este mes el 31: el mes anterior corto se recorta a su último día", () => {
    assert.deepEqual(pick(resolvePeriod("mes", "2026-03-31")), ["2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28"])
    assert.deepEqual(pick(resolvePeriod("mes", "2028-03-31")), ["2028-03-01", "2028-03-31", "2028-02-01", "2028-02-29"])
  })
  test("este mes en enero compara con diciembre del año anterior", () => {
    assert.deepEqual(pick(resolvePeriod("mes", "2027-01-10")), ["2027-01-01", "2027-01-10", "2026-12-01", "2026-12-10"])
  })
  test("mes anterior completo vs. el previo", () => {
    assert.deepEqual(pick(resolvePeriod("mes_anterior", "2026-11-17")), [
      "2026-10-01",
      "2026-10-31",
      "2026-09-01",
      "2026-09-30",
    ])
    assert.deepEqual(pick(resolvePeriod("mes_anterior", "2026-01-05")), [
      "2025-12-01",
      "2025-12-31",
      "2025-11-01",
      "2025-11-30",
    ])
    assert.deepEqual(pick(resolvePeriod("mes_anterior", "2028-03-15")), [
      "2028-02-01",
      "2028-02-29",
      "2028-01-01",
      "2028-01-31",
    ])
  })
  test("trimestre hasta hoy vs. el mismo tramo del anterior", () => {
    // Q4: 1 oct – 17 nov (48 días) vs. 1 jul – 17 ago (48 días)
    const q = resolvePeriod("trimestre", "2026-11-17")
    assert.deepEqual(pick(q), ["2026-10-01", "2026-11-17", "2026-07-01", "2026-08-17"])
    assert.equal(daysInclusive(q.prevFrom, q.prevTo), q.days)
    // Q1 vs. Q4 del año anterior
    assert.deepEqual(pick(resolvePeriod("trimestre", "2027-02-10")), [
      "2027-01-01",
      "2027-02-10",
      "2026-10-01",
      "2026-11-10",
    ])
  })
  test("trimestre: el anterior nunca pasa de su último día", () => {
    // Q3 (92 días) al 30 sep: el Q2 tiene 91 días → se recorta al 30 jun
    assert.deepEqual(pick(resolvePeriod("trimestre", "2026-09-30")), [
      "2026-07-01",
      "2026-09-30",
      "2026-04-01",
      "2026-06-30",
    ])
  })
  test("año hasta hoy vs. el mismo tramo del año anterior (29 feb → 28 feb)", () => {
    assert.deepEqual(pick(resolvePeriod("anio", "2026-11-17")), [
      "2026-01-01",
      "2026-11-17",
      "2025-01-01",
      "2025-11-17",
    ])
    assert.deepEqual(pick(resolvePeriod("anio", "2028-02-29")), [
      "2028-01-01",
      "2028-02-29",
      "2027-01-01",
      "2027-02-28",
    ])
  })
  test("rango: el anterior es de igual duración, justo antes", () => {
    const p = resolvePeriod("rango", "2026-11-17", {
      from: "2026-10-10",
      to: "2026-10-19",
    })
    assert.deepEqual(pick(p), ["2026-10-10", "2026-10-19", "2026-09-30", "2026-10-09"])
    assert.equal(p.days, 10)
    assert.equal(daysInclusive(p.prevFrom, p.prevTo), 10)
  })
  test("rango inválido vuelve a este mes", () => {
    for (const custom of [
      { from: "2026-10-19", to: "2026-10-10" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "x", to: "2026-03-01" },
      {},
      { from: "2020-01-01", to: "2026-01-01" },
    ]) {
      assert.equal(resolvePeriod("rango", "2026-11-17", custom).key, "mes")
    }
  })
  test("parámetros de la URL", () => {
    assert.equal(periodFromParams({}, "2026-11-17").key, "mes")
    assert.equal(periodFromParams({ periodo: "nada" }, "2026-11-17").key, "mes")
    assert.equal(periodFromParams({ periodo: "anio" }, "2026-11-17").from, "2026-01-01")
    assert.equal(
      periodFromParams({ periodo: "rango", desde: "2026-05-01", hasta: "2026-05-31" }, "2026-11-17").days,
      31
    )
  })
  test("días y meses", () => {
    assert.equal(daysInclusive("2026-11-01", "2026-11-17"), 17)
    assert.equal(daysInclusive("2028-02-01", "2028-02-29"), 29)
    assert.equal(daysInclusive("2026-12-31", "2027-01-01"), 2)
    assert.ok(Math.abs(monthsInDays(365.25) - 12) < 1e-9)
  })
  test("etiquetas", () => {
    assert.equal(formatRange("2026-11-01", "2026-11-17"), "1–17 nov 2026")
    assert.equal(formatRange("2026-10-01", "2026-11-17"), "1 oct – 17 nov 2026")
    assert.equal(formatRange("2025-12-01", "2026-01-05"), "1 dic 2025 – 5 ene 2026")
    assert.equal(formatRange("2026-11-17", "2026-11-17"), "17 nov 2026")
    assert.equal(formatMonthLabel("2026-09-01"), "sep 26")
  })
})

describe("comparación con el período anterior", () => {
  test("variación porcentual", () => {
    const c = compare(1200, 1000)
    assert.equal(c.direction, "up")
    assert.ok(Math.abs(c.pct! - 20) < 1e-9)
    assert.equal(compare(800, 1000).pct, -20)
    assert.equal(compare(1000, 1000).direction, "flat")
  })
  test("anterior en 0: sin porcentaje", () => {
    assert.deepEqual(compare(500, 0), {
      current: 500,
      previous: 0,
      pct: null,
      direction: "up",
      isNew: true,
    })
    assert.equal(compare(0, 0).isNew, false)
    assert.equal(compare(0, 0).direction, "flat")
  })
  test("anterior negativo (caja en rojo): el % se mide sobre su valor absoluto", () => {
    assert.equal(compare(-500, -1000).pct, 50)
    assert.equal(compare(-500, -1000).direction, "up")
  })
  test("color según lo que significa subir", () => {
    assert.equal(changeTone(compare(2, 1), "higher_is_better"), "good")
    assert.equal(changeTone(compare(2, 1), "higher_is_worse"), "bad")
    assert.equal(changeTone(compare(1, 2), "higher_is_worse"), "good")
    assert.equal(changeTone(compare(1, 1), "higher_is_better"), "neutral")
    assert.equal(changeTone(compare(2, 1), "neutral"), "neutral")
  })
})

describe("fórmulas", () => {
  test("rentabilidad mensual", () => {
    // 10,000 cobrados sobre 200,000 promedio en un mes exacto = 5 %
    assert.ok(Math.abs(monthlyReturn(10_000, 200_000, 365.25 / 12)! - 5) < 1e-9)
    // el mismo interés en 3 meses = 1.67 % mensual
    assert.ok(Math.abs(monthlyReturn(10_000, 200_000, 3 * (365.25 / 12))! - 5 / 3) < 1e-9)
    assert.equal(monthlyReturn(500, 0, 30), null)
    assert.equal(monthlyReturn(500, 1000, 0), null)
  })
  test("ejemplo del cuadre: febrero 2020 (29 días)", () => {
    // 500 de interés sobre un promedio de (10,000×29 − 2,500×20)/29
    const average = (10_000 * 29 - 2_500 * 20) / 29
    const r = monthlyReturn(500, average, 29)!
    assert.ok(Math.abs(r - (500 / average / (29 / (365.25 / 12))) * 100) < 1e-9)
  })
  test("eficiencia de cobro", () => {
    assert.ok(Math.abs(collectionEfficiency(9_600, 3_700)! - 38.541666) < 1e-4)
    assert.equal(collectionEfficiency(0, 0), null)
    assert.equal(collectionEfficiency(1000, 1000), 100)
  })
  test("participación", () => {
    assert.equal(shareOf(25, 100), 25)
    assert.equal(shareOf(5, 0), null)
  })
  test("totales por frecuencia", () => {
    const position: PositionRow[] = [
      {
        frequency: "weekly",
        active_loans: 2,
        capital_outstanding: 1000.1,
        interest_outstanding: 100,
      },
      {
        frequency: "monthly",
        active_loans: 1,
        capital_outstanding: 2000.2,
        interest_outstanding: 50.5,
      },
    ]
    assert.deepEqual(sumPosition(position), {
      activeLoans: 3,
      capitalOutstanding: 3000.3,
      interestOutstanding: 150.5,
    })
    const flows: FlowRow[] = [
      {
        frequency: "weekly",
        interest_collected: 200,
        principal_collected: 800,
        operations: 2,
        disbursed: 0,
        new_loans: 0,
        paid_loans: 1,
        avg_capital: 900,
      },
      {
        frequency: "monthly",
        interest_collected: 50.25,
        principal_collected: 0.1,
        operations: 1,
        disbursed: 5000,
        new_loans: 1,
        paid_loans: 0,
        avg_capital: 1500,
      },
    ]
    const t = sumFlows(flows)
    assert.equal(t.interestCollected, 250.25)
    assert.equal(t.totalCollected, 1050.35)
    assert.equal(t.averageCapital, 2400)
    assert.equal(t.newLoans + t.paidLoans + t.operations, 5)
  })
})

describe("cartera en riesgo", () => {
  const loan = (days: number, capital: number, overdue: number, client = "c1"): OverdueLoan => ({
    loan_id: `l${days}${client}`,
    loan_number: "PR",
    client_id: client,
    client_name: client.toUpperCase(),
    frequency: "weekly",
    days_late: days,
    capital_at_risk: capital,
    overdue_amount: overdue,
    overdue_installments: 1,
  })
  test("límites de cada grupo", () => {
    assert.equal(agingBucketFor(0), null)
    assert.equal(agingBucketFor(1), "1-7")
    assert.equal(agingBucketFor(7), "1-7")
    assert.equal(agingBucketFor(8), "8-30")
    assert.equal(agingBucketFor(30), "8-30")
    assert.equal(agingBucketFor(31), "31+")
    assert.equal(agingBucketFor(900), "31+")
  })
  test("montos y % sobre el capital en la calle", () => {
    const s = agingSummary(
      [loan(3, 1000, 200), loan(10, 2000, 500), loan(40, 3000, 900), loan(7, 500, 100, "c2")],
      20_000,
      10
    )
    assert.deepEqual(
      s.buckets.map((b) => [b.key, b.loans, b.capitalAtRisk, b.overdueAmount, b.pct]),
      [
        ["1-7", 2, 1500, 300, 7.5],
        ["8-30", 1, 2000, 500, 10],
        ["31+", 1, 3000, 900, 15],
      ]
    )
    assert.equal(s.capitalAtRisk, 6500)
    assert.equal(s.pct, 32.5)
    // grupos + al día = capital en la calle
    assert.equal(s.capitalAtRisk + s.currentCapital, 20_000)
    // préstamos al día = en la calle − con atraso
    assert.equal(s.currentLoans, 6)
    assert.equal(s.loans + s.currentLoans, 10)
  })
  test("sin cartera: % vacío", () => {
    const s = agingSummary([], 0, 0)
    assert.equal(s.pct, null)
    assert.equal(s.currentLoans, 0)
  })
  test("clientes con más atraso: días, luego monto", () => {
    const list = lateClients(
      [loan(10, 100, 50, "a"), loan(40, 100, 10, "b"), loan(10, 100, 90, "c"), loan(2, 100, 5, "a")],
      10
    )
    assert.deepEqual(
      list.map((c) => [c.clientId, c.maxDaysLate, c.loans, c.overdueAmount]),
      [
        ["b", 40, 1, 10],
        ["c", 10, 1, 90],
        ["a", 10, 2, 55],
      ]
    )
    assert.equal(lateClients([loan(1, 1, 1, "a"), loan(2, 1, 1, "b")], 1).length, 1)
    // cada cliente trae sus préstamos atrasados, el más atrasado primero (para "Marcar incobrable")
    const a = list.find((c) => c.clientId === "a")!
    assert.deepEqual(
      a.lateLoans.map((l) => [l.loanId, l.daysLate]),
      [
        ["l10a", 10],
        ["l2a", 2],
      ]
    )
  })
})

describe("proyección", () => {
  test("semanas desde hoy, con las vacías en 0 y lo atrasado aparte", () => {
    const s = projectionSeries(
      [
        { bucket: 0, installments: 2, capital: 1000, interest: 200 },
        { bucket: 1, installments: 1, capital: 500.5, interest: 99.5 },
        { bucket: 3, installments: 1, capital: 100, interest: 10 },
      ],
      "2026-11-17",
      4
    )
    assert.equal(s.overdue.total, 1200)
    assert.deepEqual(
      s.weeks.map((w) => [w.label, w.total]),
      [
        ["Semana 1", 600],
        ["Semana 2", 0],
        ["Semana 3", 110],
        ["Semana 4", 0],
      ]
    )
    assert.equal(s.weeks[0].range, "17 nov 2026 – 23 nov 2026")
    assert.equal(s.weeks[3].range, "8 dic 2026 – 14 dic 2026")
  })
})

describe("por frecuencia", () => {
  test("participación y rentabilidad de cada frecuencia", () => {
    const position: PositionRow[] = [
      {
        frequency: "weekly",
        active_loans: 2,
        capital_outstanding: 30_000,
        interest_outstanding: 0,
      },
      {
        frequency: "monthly",
        active_loans: 1,
        capital_outstanding: 10_000,
        interest_outstanding: 0,
      },
    ]
    const flows: FlowRow[] = [
      {
        frequency: "weekly",
        interest_collected: 1_500,
        principal_collected: 0,
        operations: 0,
        disbursed: 0,
        new_loans: 0,
        paid_loans: 0,
        avg_capital: 30_000,
      },
      {
        frequency: "daily",
        interest_collected: 0,
        principal_collected: 0,
        operations: 0,
        disbursed: 0,
        new_loans: 0,
        paid_loans: 0,
        avg_capital: 0,
      },
    ]
    const rows = frequencyBreakdown(position, flows, 365.25 / 12)
    assert.deepEqual(
      rows.map((r) => r.frequency),
      ["weekly", "monthly"]
    )
    assert.equal(rows[0].share, 75)
    assert.ok(Math.abs(rows[0].monthlyReturn! - 5) < 1e-9)
    assert.equal(rows[1].monthlyReturn, null)
  })
})

describe("gastos, pérdidas y ganancia neta", () => {
  const cancelled = (n: string, on: string, principal: number, collected: number): CancelledLoanRow => ({
    loan_id: n,
    loan_number: n,
    client_id: "c",
    client_name: "Cliente",
    cancelled_on: on,
    principal_amount: principal,
    principal_collected: collected,
    interest_collected: 100,
    payments: collected > 0 ? 1 : 0,
    capital_lost: principal - collected,
    notes: "no paga",
  })
  const writeoff = (
    loan: string,
    kind: "incobrable" | "error",
    date: string,
    lost: number,
    status: LoanStatus = "cancelado"
  ): WriteoffRow => ({
    id: `w-${loan}`,
    loan_id: loan,
    loan_number: loan,
    client_id: "c",
    client_name: "Cliente",
    loan_status: status,
    kind,
    writeoff_date: date,
    reason: "motivo",
    capital_lost: lost,
    interest_lost: 0,
    created_by_name: "Admin",
  })

  test("cancelados: por clasificar, incobrable y error; activo incobrable aparte", () => {
    const s = lossSummary(
      [
        cancelled("PR-09", "2026-09-10", 5000, 0), // incobrable marcado en noviembre
        cancelled("PR-11", "2026-11-03T04:00:00.000Z", 10000, 2500), // por clasificar
        cancelled("PR-18", "2026-11-05", 3000, 0), // error: no es pérdida
        cancelled("PR-30", "2026-12-01", 8000, 0), // después del cierre: no aparece
      ],
      [
        writeoff("PR-09", "incobrable", "2026-11-10", 5000),
        writeoff("PR-18", "error", "2026-11-06", 3000),
        writeoff("PR-20", "incobrable", "2026-10-15", 4000, "activo"), // activo, marcado antes del período
        writeoff("PR-21", "incobrable", "2026-12-02", 999, "activo"), // marcado después del cierre: no cuenta
      ],
      "2026-11-01",
      "2026-11-30"
    )
    assert.equal(s.loss, 9000) // PR-09 + PR-20
    assert.equal(s.lossLoans, 2)
    assert.equal(s.periodLoss, 5000) // solo PR-09 se marcó en el período
    assert.equal(s.periodLossLoans, 1)
    assert.equal(s.pending, 7500) // PR-11
    assert.equal(s.pendingLoans, 1)
    assert.equal(s.errors, 3000)
    assert.equal(s.errorLoans, 1)
    // orden: por clasificar, incobrables (recientes primero), errores
    assert.deepEqual(
      s.rows.map((r) => [r.loanNumber, r.status, r.inPeriod]),
      [
        ["PR-11", "por_clasificar", true],
        ["PR-09", "incobrable", true],
        ["PR-20", "incobrable", false],
        ["PR-18", "error", true],
      ]
    )
    const pr09 = s.rows.find((r) => r.loanNumber === "PR-09")!
    assert.equal(pr09.cancelledOn, "2026-09-10")
    assert.equal(pr09.writeoff?.date, "2026-11-10")
    assert.equal(s.rows.find((r) => r.loanNumber === "PR-11")!.collectedBefore, 2600)
  })

  test("una clasificación posterior al cierre se ve por clasificar", () => {
    const s = lossSummary(
      [cancelled("PR-09", "2026-09-10", 5000, 0)],
      [writeoff("PR-09", "incobrable", "2026-12-01", 5000)],
      "2026-11-01",
      "2026-11-30"
    )
    assert.equal(s.loss, 0)
    assert.equal(s.pending, 5000)
  })

  test("pérdida entre fechas: solo incobrables, por fecha de clasificación", () => {
    const w = [
      writeoff("A", "incobrable", "2026-10-05", 1000),
      writeoff("B", "error", "2026-10-06", 2000),
      writeoff("C", "incobrable", "2026-11-01", 500),
    ]
    assert.equal(writeoffLossBetween(w, "2026-10-01", "2026-10-31"), 1000)
    assert.equal(writeoffLossBetween(w, "2026-10-01", "2026-11-01"), 1500)
  })

  test("gastos: sin anulados, por categoría de mayor a menor", () => {
    const e = (id: string, category: ExpenseCategory, amount: number, date: string, voided = false): ExpenseRow => ({
      id,
      expense_date: date,
      category,
      amount,
      description: null,
      created_by_name: "Admin",
      voided_at: voided ? "2026-11-10T12:00:00Z" : null,
      voided_by_name: voided ? "Admin" : null,
      void_reason: voided ? "duplicado" : null,
    })
    const s = expenseSummary([
      e("1", "gasolina_transporte", 500, "2026-11-02"),
      e("2", "sueldos", 3000, "2026-11-05"),
      e("3", "gasolina_transporte", 250.5, "2026-11-09"),
      e("4", "sueldos", 9999, "2026-11-09", true), // anulado
    ])
    assert.equal(s.total, 3750.5)
    assert.equal(s.count, 3)
    assert.deepEqual(
      s.byCategory.map((c) => [c.category, c.amount, c.count]),
      [
        ["sueldos", 3000, 1],
        ["gasolina_transporte", 750.5, 2],
      ]
    )
    assert.equal(s.rows.length, 4) // los anulados se listan (tachados)
    assert.equal(s.rows[0].expense_date, "2026-11-09")
    assert.equal(EXPENSE_CATEGORY_LABELS.telefono_internet, "Teléfono e internet")
  })

  test("ganancia neta = ganancia cobrada − gastos − pérdida", () => {
    assert.equal(netProfit(10_000, 3_750.5, 5_000), 1_249.5)
    assert.equal(netProfit(1_000, 2_000, 0), -1_000)
  })
})
