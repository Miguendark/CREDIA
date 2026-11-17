import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { applyReschedule, planReschedule, type RescheduleInstallment } from "./reschedule"
import type { InstallmentStatus } from "@/types/database.types"

interface FullInstallment extends RescheduleInstallment {
  loan_id: string
  principal_amount: number
  interest_amount: number
  total_amount: number
  remaining_amount: number
  paid_at: string | null
}

function inst(n: number, due: string, status: InstallmentStatus, amountPaid = 0): FullInstallment {
  return {
    id: `i${n}`,
    loan_id: "L1",
    installment_number: n,
    due_date: due,
    status,
    amount_paid: amountPaid,
    principal_amount: 1428.57,
    interest_amount: 285.71,
    total_amount: 1714.28,
    remaining_amount: round(1714.28 - amountPaid),
    paid_at: status === "pagada" ? "2026-01-15T10:00:00Z" : null,
  }
}
const round = (n: number) => Math.round(n * 100) / 100

// 1 pagada, 2 parcial, 3-6 pendientes (la 3 ya vencida)
const LOAN = [
  inst(1, "2026-01-15", "pagada", 1714.28),
  inst(2, "2026-02-15", "parcial", 500),
  inst(3, "2026-03-15", "vencida"),
  inst(4, "2026-04-15", "pendiente"),
  inst(5, "2026-05-15", "pendiente"),
  inst(6, "2026-06-15", "pendiente"),
]

describe("planReschedule", () => {
  test("días fijos: solo mueve pendientes/vencidas sin abono", () => {
    const plan = planReschedule(LOAN, { type: "fixed_days", days: [5, 20], afterDate: "2026-03-10" })
    assert.deepEqual(
      plan.changes.map((c) => [c.installmentNumber, c.oldDate, c.newDate]),
      [
        [3, "2026-03-15", "2026-03-20"],
        [4, "2026-04-15", "2026-04-05"],
        [5, "2026-05-15", "2026-04-20"],
        [6, "2026-06-15", "2026-05-05"],
      ]
    )
    // La cuota 2 (parcial) sigue abierta y es la más antigua.
    assert.equal(plan.nextPaymentDate, "2026-02-15")
  })

  test("nueva fecha de inicio con frecuencia", () => {
    const plan = planReschedule(LOAN, { type: "interval", frequency: "monthly", firstDate: "2026-03-30" })
    assert.deepEqual(
      plan.changes.map((c) => c.newDate),
      ["2026-03-30", "2026-04-30", "2026-05-30", "2026-06-30"]
    )
  })

  test("préstamo sin pagos: nextPaymentDate es la primera fecha nueva", () => {
    const fresh = [inst(1, "2026-01-15", "pendiente"), inst(2, "2026-02-15", "pendiente")]
    const plan = planReschedule(fresh, { type: "fixed_days", days: [31], afterDate: "2026-01-20" })
    assert.deepEqual(
      plan.changes.map((c) => c.newDate),
      ["2026-01-31", "2026-02-28"]
    )
    assert.equal(plan.nextPaymentDate, "2026-01-31")
  })

  test("una pendiente con abono (amount_paid > 0) no se mueve", () => {
    const loan = [inst(1, "2026-01-15", "pendiente", 10), inst(2, "2026-02-15", "pendiente")]
    const plan = planReschedule(loan, { type: "fixed_days", days: [20], afterDate: "2026-01-16" })
    assert.deepEqual(
      plan.changes.map((c) => c.installmentNumber),
      [2]
    )
  })

  test("rechaza primera fecha anterior o igual a la última cuota bloqueada", () => {
    assert.throws(
      () => planReschedule(LOAN, { type: "interval", frequency: "monthly", firstDate: "2026-02-15" }),
      /posterior a 2026-02-15/
    )
    assert.throws(() => planReschedule(LOAN, { type: "fixed_days", days: [5], afterDate: "2026-01-01" }))
  })

  test("rechaza si no hay cuotas pendientes", () => {
    const paid = [inst(1, "2026-01-15", "pagada", 1714.28)]
    assert.throws(() => planReschedule(paid, { type: "fixed_days", days: [5], afterDate: "2026-02-01" }), /no tiene cuotas/)
  })

  test("rechaza pendientes anteriores a una pagada (estado inconsistente)", () => {
    const weird = [inst(1, "2026-01-15", "pendiente"), inst(2, "2026-02-15", "pagada", 1714.28)]
    assert.throws(() => planReschedule(weird, { type: "fixed_days", days: [5], afterDate: "2026-03-01" }))
  })

  test("rechaza días inválidos", () => {
    assert.throws(() => planReschedule(LOAN, { type: "fixed_days", days: [5, 5], afterDate: "2026-03-10" }))
    assert.throws(() => planReschedule(LOAN, { type: "fixed_days", days: [32], afterDate: "2026-03-10" }))
  })
})

describe("cambiar fechas: solo cambian las fechas, nunca los montos", () => {
  const modes = [
    { type: "fixed_days" as const, days: [5, 20], afterDate: "2026-03-10" },
    { type: "fixed_days" as const, days: [31], afterDate: "2026-02-20" },
    { type: "interval" as const, frequency: "biweekly" as const, firstDate: "2026-04-01" },
  ]

  for (const mode of modes) {
    test(JSON.stringify(mode), () => {
      const plan = planReschedule(LOAN, mode)
      const after = applyReschedule(LOAN, plan)
      const sum = (list: FullInstallment[], key: keyof FullInstallment) =>
        round(list.reduce((s, i) => s + Number(i[key]), 0))

      assert.equal(after.length, LOAN.length)
      for (let k = 0; k < LOAN.length; k++) {
        const { due_date: beforeDate, ...beforeRest } = LOAN[k]
        const { due_date: afterDate, ...afterRest } = after[k]
        // Todo menos due_date es idéntico (montos, estado, abonos, número).
        assert.deepEqual(afterRest, beforeRest)
        // Las cuotas pagadas o con abono conservan también su fecha.
        if (LOAN[k].amount_paid > 0) assert.equal(afterDate, beforeDate)
      }
      for (const key of ["principal_amount", "interest_amount", "total_amount", "amount_paid", "remaining_amount"] as const) {
        assert.equal(sum(after, key), sum(LOAN, key), key)
      }
      // El original no fue mutado.
      assert.equal(LOAN[2].due_date, "2026-03-15")
    })
  }
})
