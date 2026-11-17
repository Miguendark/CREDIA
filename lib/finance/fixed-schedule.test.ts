import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  buildFixedSchedule,
  fixedScheduleAllowed,
  formatLoanSchedule,
  nextScheduledDate,
  nextWeekday,
  validateFixedSchedule,
} from "./fixed-days"
import { buildLoanReschedulePlan } from "./reschedule"
import { calculateLoan } from "./loan-calculator"
import { addDaysIso, isoWeekday, todayRD } from "../utils/date"

describe("validateFixedSchedule: el día fijo debe coincidir con la frecuencia", () => {
  test("mensual = 1 día del mes", () => {
    assert.equal(validateFixedSchedule("monthly", [5], null), null)
    assert.equal(validateFixedSchedule("monthly", [31], null), null)
    assert.match(validateFixedSchedule("monthly", [5, 20], null)!, /mensual se elige 1 día/)
    assert.match(validateFixedSchedule("monthly", [], null)!, /mensual se elige 1 día/)
    assert.ok(validateFixedSchedule("monthly", [32], null))
    assert.ok(validateFixedSchedule("monthly", [0], null))
    assert.match(validateFixedSchedule("monthly", [5], 1)!, /solo aplica a la frecuencia semanal/)
  })
  test("quincenal = 2 días del mes", () => {
    assert.equal(validateFixedSchedule("biweekly", [5, 20], null), null)
    assert.equal(validateFixedSchedule("biweekly", [20, 5], null), null)
    assert.equal(validateFixedSchedule("biweekly", [15, 30], null), null)
    assert.match(validateFixedSchedule("biweekly", [5], null)!, /quincenal se eligen 2 días/)
    assert.match(validateFixedSchedule("biweekly", [5, 5], null)!, /no se pueden repetir/)
    assert.match(validateFixedSchedule("biweekly", [29, 30], null)!, /dos días de 28 en adelante/)
    assert.match(validateFixedSchedule("biweekly", [28, 31], null)!, /dos días de 28 en adelante/)
    assert.ok(validateFixedSchedule("biweekly", [5, 20], 3))
  })
  test("semanal = 1 día de la semana (1 = lunes … 7 = domingo)", () => {
    for (let d = 1; d <= 7; d++) assert.equal(validateFixedSchedule("weekly", [], d), null)
    assert.match(validateFixedSchedule("weekly", [], null)!, /día de la semana/)
    assert.ok(validateFixedSchedule("weekly", [], 0))
    assert.ok(validateFixedSchedule("weekly", [], 8))
    assert.ok(validateFixedSchedule("weekly", [], 1.5))
    assert.match(validateFixedSchedule("weekly", [5], null)!, /no días del mes/)
  })
  test("diaria no permite día fijo", () => {
    assert.equal(fixedScheduleAllowed("daily"), false)
    assert.match(validateFixedSchedule("daily", [], null)!, /diaria no permite día fijo/)
    assert.match(validateFixedSchedule("daily", [5], null)!, /diaria no permite día fijo/)
    assert.equal(fixedScheduleAllowed("weekly"), true)
  })
})

describe("día de la semana", () => {
  test("isoWeekday", () => {
    assert.equal(isoWeekday("2026-11-16"), 1) // lunes
    assert.equal(isoWeekday("2026-11-17"), 2) // martes
    assert.equal(isoWeekday("2026-11-22"), 7) // domingo
    assert.equal(isoWeekday("1970-01-01"), 4) // jueves
    assert.equal(isoWeekday("2028-02-29"), 2) // martes (bisiesto)
    assert.equal(isoWeekday("2000-01-01"), 6) // sábado
  })
  test("siguiente día de la semana, estrictamente posterior", () => {
    // martes 17/11/2026
    assert.equal(nextWeekday("2026-11-17", 5), "2026-11-20") // viernes
    assert.equal(nextWeekday("2026-11-17", 2), "2026-11-24") // mismo día -> la próxima semana
    assert.equal(nextWeekday("2026-11-17", 1), "2026-11-23") // lunes
    assert.equal(nextWeekday("2026-12-28", 5), "2027-01-01") // cruza el año
    assert.equal(nextWeekday("2028-02-27", 2), "2028-02-29") // bisiesto
  })
  test("calendario semanal: cada cuota cae ese día, 7 días después", () => {
    const dates = buildFixedSchedule("2026-11-17", { days: [], weekday: 6 }, 6)
    assert.deepEqual(dates, ["2026-11-21", "2026-11-28", "2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"])
    for (const d of dates) assert.equal(isoWeekday(d), 6)
  })
  test("no mezcla días del mes y día de la semana", () => {
    assert.throws(() => nextScheduledDate("2026-11-17", { days: [5], weekday: 1 }))
    assert.throws(() => nextScheduledDate("2026-11-17", { days: [], weekday: 9 }))
  })
})

describe("mensual con día 31 (último día del mes si no existe)", () => {
  test("2027 (febrero de 28)", () => {
    assert.deepEqual(buildFixedSchedule("2027-01-01", { days: [31], weekday: null }, 4), [
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ])
  })
  test("2028 bisiesto (febrero de 29)", () => {
    assert.deepEqual(buildFixedSchedule("2028-01-01", { days: [31], weekday: null }, 4), [
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
      "2028-04-30",
    ])
  })
})

describe("calculadora con día fijo semanal: solo cambian las fechas", () => {
  test("mismos montos que Automático", () => {
    const base = {
      principal: 10000,
      interestRate: 20,
      interestType: "fixed_capital" as const,
      numberOfInstallments: 5,
      frequency: "weekly" as const,
    }
    const auto = calculateLoan({ ...base, firstPaymentDate: "2026-11-24" })
    const first = nextScheduledDate("2026-11-17", { days: [], weekday: 5 })
    const fixed = calculateLoan({ ...base, firstPaymentDate: first, schedule: { type: "fixed_days", days: [], weekday: 5 } })
    assert.equal(fixed.totalAmount, auto.totalAmount)
    assert.deepEqual(
      fixed.installments.map((i) => i.totalAmount),
      auto.installments.map((i) => i.totalAmount)
    )
    assert.deepEqual(
      fixed.installments.map((i) => i.dueDate),
      ["2026-11-20", "2026-11-27", "2026-12-04", "2026-12-11", "2026-12-18"]
    )
  })
})

describe("cambiar fecha: el día fijo se valida contra la frecuencia del préstamo", () => {
  const installments = [1, 2, 3].map((n) => ({
    id: `i${n}`,
    installment_number: n,
    due_date: `2026-12-0${n}`,
    status: "pendiente" as const,
    amount_paid: 0,
  }))
  test("semanal con día de semana", () => {
    const plan = buildLoanReschedulePlan("weekly", installments, {
      schedule_type: "fixed_days",
      payment_days: [],
      payment_weekday: 1,
      start_from: "2026-11-17",
    })
    assert.deepEqual(plan.changes.map((c) => c.newDate), ["2026-11-23", "2026-11-30", "2026-12-07"])
  })
  test("mensual con 2 días: rechazado", () => {
    assert.throws(
      () =>
        buildLoanReschedulePlan("monthly", installments, {
          schedule_type: "fixed_days",
          payment_days: [5, 20],
          payment_weekday: null,
          start_from: "2026-11-17",
        }),
      /mensual se elige 1 día/
    )
  })
  test("diario: rechazado", () => {
    assert.throws(
      () =>
        buildLoanReschedulePlan("daily", installments, {
          schedule_type: "fixed_days",
          payment_days: [5],
          payment_weekday: null,
          start_from: "2026-11-17",
        }),
      /diaria no permite/
    )
  })
})

describe("hoy en hora de República Dominicana (UTC-4)", () => {
  test("8 p. m. en RD ya es el día siguiente en UTC, pero en RD sigue siendo hoy", () => {
    // 17/11/2026 19:59 RD = 23:59 UTC; 20:00 RD = 18/11 00:00 UTC
    assert.equal(todayRD(new Date("2026-11-17T23:59:00Z")), "2026-11-17")
    assert.equal(todayRD(new Date("2026-11-18T00:00:00Z")), "2026-11-17")
    assert.equal(todayRD(new Date("2026-11-18T03:59:59Z")), "2026-11-17")
    assert.equal(todayRD(new Date("2026-11-18T04:00:00Z")), "2026-11-18")
  })
  test("fin de año", () => {
    assert.equal(todayRD(new Date("2027-01-01T02:00:00Z")), "2026-12-31")
  })
  test("addDaysIso", () => {
    assert.equal(addDaysIso("2026-11-17", 7), "2026-11-24")
    assert.equal(addDaysIso("2026-12-28", 7), "2027-01-04")
    assert.equal(addDaysIso("2028-02-28", 1), "2028-02-29")
    assert.equal(addDaysIso("2027-02-28", 1), "2027-03-01")
    assert.equal(addDaysIso("2026-03-01", -1), "2026-02-28")
  })
})

test("formatLoanSchedule", () => {
  const base = { payment_days: null, payment_weekday: null }
  assert.equal(formatLoanSchedule({ ...base, frequency: "monthly", schedule_type: "interval" }), "Mensual")
  assert.equal(
    formatLoanSchedule({ frequency: "monthly", schedule_type: "fixed_days", payment_days: [5], payment_weekday: null }),
    "Mensual · día 5 de cada mes"
  )
  assert.equal(
    formatLoanSchedule({ frequency: "biweekly", schedule_type: "fixed_days", payment_days: [5, 20], payment_weekday: null }),
    "Quincenal · días 5 y 20 de cada mes"
  )
  assert.equal(
    formatLoanSchedule({ frequency: "weekly", schedule_type: "fixed_days", payment_days: null, payment_weekday: 1 }),
    "Semanal · cada lunes"
  )
})
