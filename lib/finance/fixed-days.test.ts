import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  buildFixedDaySchedule,
  daysInMonth,
  formatPaymentDays,
  isLeapYear,
  nextFixedDay,
  validatePaymentDays,
} from "./fixed-days"

describe("daysInMonth / isLeapYear", () => {
  test("bisiestos", () => {
    assert.equal(isLeapYear(2024), true)
    assert.equal(isLeapYear(2026), false)
    assert.equal(isLeapYear(2028), true)
    assert.equal(isLeapYear(1900), false)
    assert.equal(isLeapYear(2000), true)
  })
  test("días por mes", () => {
    assert.equal(daysInMonth(2026, 2), 28)
    assert.equal(daysInMonth(2028, 2), 29)
    assert.equal(daysInMonth(2026, 4), 30)
    assert.equal(daysInMonth(2026, 12), 31)
  })
})

describe("validatePaymentDays", () => {
  test("válidos", () => {
    assert.equal(validatePaymentDays([5]), null)
    assert.equal(validatePaymentDays([5, 20]), null)
    assert.equal(validatePaymentDays([1, 31]), null)
  })
  test("fuera de rango", () => {
    assert.ok(validatePaymentDays([0]))
    assert.ok(validatePaymentDays([32]))
    assert.ok(validatePaymentDays([-1]))
    assert.ok(validatePaymentDays([5.5]))
  })
  test("repetidos, vacíos o demasiados", () => {
    assert.ok(validatePaymentDays([5, 5]))
    assert.ok(validatePaymentDays([]))
    assert.ok(validatePaymentDays([1, 15, 28]))
  })
  test("dos días ambos de 28 en adelante: rechazado con mensaje claro", () => {
    for (const days of [[28, 29], [29, 30], [30, 31], [28, 31], [31, 29]]) {
      const error = validatePaymentDays(days)
      assert.ok(error, `${days} debería rechazarse`)
      assert.match(error!, /dos días de 28 en adelante/)
    }
  })
  test("combinaciones cercanas a fin de mes que sí son válidas", () => {
    for (const days of [[27, 28], [15, 30], [1, 31], [27, 31], [28], [29], [30], [31]]) {
      assert.equal(validatePaymentDays(days), null, `${days} debería ser válido`)
    }
  })
  test("nextFixedDay rechaza días inválidos", () => {
    assert.throws(() => nextFixedDay("2026-01-10", [0]))
    assert.throws(() => nextFixedDay("2026-01-10", [10, 10]))
  })
  test("rechaza fechas inválidas", () => {
    assert.throws(() => nextFixedDay("2026-02-30", [5]))
    assert.throws(() => nextFixedDay("10/01/2026", [5]))
  })
})

describe("nextFixedDay", () => {
  test("quincenal 5 y 20: siguiente día fijo", () => {
    assert.equal(nextFixedDay("2026-03-01", [5, 20]), "2026-03-05")
    assert.equal(nextFixedDay("2026-03-10", [5, 20]), "2026-03-20")
    assert.equal(nextFixedDay("2026-03-25", [5, 20]), "2026-04-05")
  })
  test("el orden en que se eligen los días no importa", () => {
    assert.equal(nextFixedDay("2026-03-10", [20, 5]), "2026-03-20")
  })
  test("préstamo creado justo en un día fijo paga en el siguiente", () => {
    assert.equal(nextFixedDay("2026-03-05", [5, 20]), "2026-03-20")
    assert.equal(nextFixedDay("2026-03-20", [5, 20]), "2026-04-05")
    assert.equal(nextFixedDay("2026-03-05", [5]), "2026-04-05")
  })
  test("mensual día 5", () => {
    assert.equal(nextFixedDay("2026-01-04", [5]), "2026-01-05")
    assert.equal(nextFixedDay("2026-01-06", [5]), "2026-02-05")
  })
  test("cambio de año", () => {
    assert.equal(nextFixedDay("2026-12-25", [5, 20]), "2027-01-05")
    assert.equal(nextFixedDay("2026-12-31", [31]), "2027-01-31")
  })
  test("febrero normal: 29, 30 y 31 caen el 28", () => {
    assert.equal(nextFixedDay("2026-02-10", [29]), "2026-02-28")
    assert.equal(nextFixedDay("2026-02-10", [30]), "2026-02-28")
    assert.equal(nextFixedDay("2026-01-31", [31]), "2026-02-28")
  })
  test("febrero bisiesto: 29 existe, 30 y 31 caen el 29", () => {
    assert.equal(nextFixedDay("2028-02-10", [29]), "2028-02-29")
    assert.equal(nextFixedDay("2028-02-10", [30]), "2028-02-29")
    assert.equal(nextFixedDay("2028-01-31", [31]), "2028-02-29")
  })
  test("préstamo creado el último día de febrero con día fijo 30", () => {
    // El 28 de febrero de 2026 ES el día 30 ajustado: paga el siguiente.
    assert.equal(nextFixedDay("2026-02-28", [30]), "2026-03-30")
    assert.equal(nextFixedDay("2028-02-29", [30]), "2028-03-30")
    // En bisiesto, el 28 no es el día ajustado (lo es el 29).
    assert.equal(nextFixedDay("2028-02-28", [30]), "2028-02-29")
  })
  test("meses de 30 días: el 31 cae el 30", () => {
    assert.equal(nextFixedDay("2026-04-10", [31]), "2026-04-30")
    assert.equal(nextFixedDay("2026-03-31", [31]), "2026-04-30")
    assert.equal(nextFixedDay("2026-04-30", [31]), "2026-05-31")
    assert.equal(nextFixedDay("2026-04-20", [15, 31]), "2026-04-30")
  })
})

describe("buildFixedDaySchedule", () => {
  test("quincenal 5 y 20, 6 cuotas", () => {
    assert.deepEqual(buildFixedDaySchedule("2026-03-10", [5, 20], 6), [
      "2026-03-20",
      "2026-04-05",
      "2026-04-20",
      "2026-05-05",
      "2026-05-20",
      "2026-06-05",
    ])
  })
  test("mensual día 31 a lo largo del año (2026, no bisiesto)", () => {
    assert.deepEqual(buildFixedDaySchedule("2026-01-15", [31], 6), [
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ])
  })
  test("mensual día 30 cruzando febrero bisiesto", () => {
    assert.deepEqual(buildFixedDaySchedule("2028-01-15", [30], 3), ["2028-01-30", "2028-02-29", "2028-03-30"])
  })
  test("15 y 30 cruzando febrero normal", () => {
    assert.deepEqual(buildFixedDaySchedule("2026-01-20", [15, 30], 5), [
      "2026-01-30",
      "2026-02-15",
      "2026-02-28",
      "2026-03-15",
      "2026-03-30",
    ])
  })
  test("30 y 31 se rechaza al generar el calendario", () => {
    assert.throws(() => buildFixedDaySchedule("2026-01-01", [30, 31], 6), /dos días de 28 en adelante/)
  })
  test("27 y 28: válido y nunca dos cuotas el mismo día (febrero incluido)", () => {
    const dates = buildFixedDaySchedule("2026-01-01", [27, 28], 6)
    assert.deepEqual(dates, ["2026-01-27", "2026-01-28", "2026-02-27", "2026-02-28", "2026-03-27", "2026-03-28"])
    assert.equal(new Set(dates).size, dates.length)
  })
  test("fechas siempre estrictamente crecientes (2 años, varios días)", () => {
    for (const days of [[1], [5, 20], [15, 31], [29], [31], [1, 31], [27, 31]]) {
      const dates = buildFixedDaySchedule("2027-12-31", days, 48)
      for (let i = 1; i < dates.length; i++) assert.ok(dates[i] > dates[i - 1], `${days}: ${dates[i - 1]} -> ${dates[i]}`)
    }
  })
  test("cuotas inválidas", () => {
    assert.throws(() => buildFixedDaySchedule("2026-01-01", [5], 0))
  })
})

test("formatPaymentDays", () => {
  assert.equal(formatPaymentDays([5]), "Día 5")
  assert.equal(formatPaymentDays([20, 5]), "Días 5 y 20")
})
