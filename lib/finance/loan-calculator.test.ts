import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { calculateLoan, type LoanCalculatorInput } from "./loan-calculator"
import { nextFixedDay } from "./fixed-days"

const BASES: LoanCalculatorInput[] = [
  {
    principal: 10000,
    interestRate: 20,
    interestType: "fixed_capital",
    numberOfInstallments: 7,
    frequency: "monthly",
    firstPaymentDate: "2026-02-15",
  },
  {
    principal: 25000,
    interestRate: 5,
    interestType: "declining_balance",
    numberOfInstallments: 11,
    frequency: "biweekly",
    firstPaymentDate: "2026-01-31",
  },
  {
    principal: 3333.33,
    interestRate: 0,
    interestType: "declining_balance",
    numberOfInstallments: 3,
    frequency: "weekly",
    firstPaymentDate: "2026-03-01",
  },
]

const withoutDates = (r: ReturnType<typeof calculateLoan>) => ({
  ...r,
  installments: r.installments.map((i) => ({
    installmentNumber: i.installmentNumber,
    principalAmount: i.principalAmount,
    interestAmount: i.interestAmount,
    totalAmount: i.totalAmount,
  })),
})

describe("regresión: calendario por frecuencia sin cambios", () => {
  test("fechas mensuales iguales a las de antes (date-fns addMonths)", () => {
    const r = calculateLoan(BASES[0])
    assert.deepEqual(
      r.installments.map((i) => i.dueDate),
      ["2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15", "2026-07-15", "2026-08-15"]
    )
  })
  test("quincenal sigue siendo cada 14 días", () => {
    const r = calculateLoan(BASES[1])
    assert.equal(r.installments[0].dueDate, "2026-01-31")
    assert.equal(r.installments[1].dueDate, "2026-02-14")
    assert.equal(r.installments[2].dueDate, "2026-02-28")
  })
  test("montos de fixed_capital conocidos", () => {
    const r = calculateLoan(BASES[0])
    assert.equal(r.totalInterest, 2000)
    assert.equal(r.totalAmount, 12000)
    assert.equal(r.installments[0].principalAmount, 1428.57)
    assert.equal(r.installments[0].interestAmount, 285.71)
    assert.equal(r.installments[6].principalAmount, 1428.58)
    assert.equal(r.installments[6].interestAmount, 285.74)
  })
})

describe("días fijos: solo cambian las fechas, nunca los montos", () => {
  for (const base of BASES) {
    for (const days of [[5], [5, 20], [15, 31], [30]]) {
      test(`${base.interestType} ${base.principal} días ${days.join("/")}`, () => {
        const interval = calculateLoan(base)
        const fixedFirst = nextFixedDay("2026-01-10", days)
        const fixed = calculateLoan({ ...base, firstPaymentDate: fixedFirst, schedule: { type: "fixed_days", days } })

        // Total, capital, interés, monto de cuota y cada cuota: idénticos.
        assert.deepEqual(withoutDates(fixed), withoutDates(interval))
        assert.equal(fixed.installments.length, base.numberOfInstallments)

        // Las fechas sí son las del calendario de días fijos.
        assert.equal(fixed.installments[0].dueDate, fixedFirst)
        for (const inst of fixed.installments) {
          const day = Number(inst.dueDate.slice(8))
          const ok = days.includes(day) || day >= 28 // ajuste a fin de mes
          assert.ok(ok, `fecha ${inst.dueDate} no corresponde a días ${days}`)
        }
      })
    }
  }

  test("ejemplo concreto: préstamo del 10/01/2026, días 5 y 20, 4 cuotas", () => {
    const r = calculateLoan({
      ...BASES[0],
      numberOfInstallments: 4,
      firstPaymentDate: nextFixedDay("2026-01-10", [5, 20]),
      schedule: { type: "fixed_days", days: [5, 20] },
    })
    assert.deepEqual(
      r.installments.map((i) => i.dueDate),
      ["2026-01-20", "2026-02-05", "2026-02-20", "2026-03-05"]
    )
  })
})
