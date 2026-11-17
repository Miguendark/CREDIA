/**
 * Calendario de "días fijos del mes" (por ejemplo el 5 y el 20, o solo el 5).
 *
 * Toda la aritmética es sobre (año, mes, día) enteros: no se usa `Date`, así
 * que no hay sorpresas de zona horaria ni de horario de verano.
 *
 * Reglas de negocio:
 *  - Se eligen 1 o 2 días, entre 1 y 31, sin repetir.
 *  - Si el mes no tiene ese día (p. ej. 30 o 31 en febrero), la cuota cae el
 *    último día de ese mes.
 *  - La siguiente cuota es SIEMPRE estrictamente posterior a la fecha de
 *    referencia: un préstamo creado justo un día fijo paga en el próximo.
 *  - Con dos días, no pueden ser ambos >= 28 (p. ej. 29 y 30, 30 y 31): en
 *    meses cortos caerían el mismo día. La misma regla está en el check de
 *    la tabla loans (migración 0011) y en la validación del servidor.
 */

import type { LoanFrequency } from "@/types/database.types"
import { addDaysIso, isoWeekday } from "../utils/date"
import { FREQUENCY_LABELS } from "./frequency"

export type ScheduleType = "interval" | "fixed_days"

export const MAX_PAYMENT_DAYS = 2

/** Con dos días de pago, no pueden ser ambos >= este valor. */
export const LATE_DAY_THRESHOLD = 28

interface YMD {
  year: number
  month: number // 1-12
  day: number
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseIso(iso: string): YMD {
  const match = ISO_DATE.exec(iso)
  if (!match) throw new Error(`Fecha inválida: ${iso}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Fecha inválida: ${iso}`)
  }
  return { year, month, day }
}

function toIso({ year, month, day }: YMD): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** Devuelve un mensaje de error si los días no son válidos, o null si lo son. */
export function validatePaymentDays(days: readonly number[]): string | null {
  if (days.length === 0) return "Elige al menos un día de pago"
  if (days.length > MAX_PAYMENT_DAYS) return `Elige como máximo ${MAX_PAYMENT_DAYS} días de pago`
  for (const day of days) {
    if (!Number.isInteger(day) || day < 1 || day > 31) return "Los días de pago deben estar entre 1 y 31"
  }
  if (new Set(days).size !== days.length) return "Los días de pago no se pueden repetir"
  if (days.length === 2 && days.every((day) => day >= LATE_DAY_THRESHOLD)) {
    return `No se pueden elegir dos días de ${LATE_DAY_THRESHOLD} en adelante (por ejemplo 29 y 30, o 30 y 31): en meses cortos caerían el mismo día. Usa un solo día o separa las fechas (por ejemplo 15 y 30).`
  }
  return null
}

/** Ordena los días de menor a mayor (forma canónica para guardar en BD). */
export function normalizePaymentDays(days: readonly number[]): number[] {
  return [...days].sort((a, b) => a - b)
}

function assertValidDays(days: readonly number[]) {
  const error = validatePaymentDays(days)
  if (error) throw new Error(error)
}

/** Siguiente día fijo ESTRICTAMENTE posterior a `afterIso`. */
export function nextFixedDay(afterIso: string, days: readonly number[]): string {
  assertValidDays(days)
  const from = parseIso(afterIso)
  const sorted = normalizePaymentDays(days)

  // Mes actual: el primer día fijo (ajustado a fin de mes) posterior a la fecha.
  const currentMonthDays = daysInMonth(from.year, from.month)
  for (const day of sorted) {
    const effective = Math.min(day, currentMonthDays)
    if (effective > from.day) return toIso({ year: from.year, month: from.month, day: effective })
  }

  // Si no queda ninguno este mes, el primero del mes siguiente.
  const nextYear = from.month === 12 ? from.year + 1 : from.year
  const nextMonth = from.month === 12 ? 1 : from.month + 1
  const effective = Math.min(sorted[0], daysInMonth(nextYear, nextMonth))
  return toIso({ year: nextYear, month: nextMonth, day: effective })
}

/**
 * Genera `count` fechas de cuota con días fijos, todas posteriores a
 * `afterIso` (normalmente la fecha del préstamo).
 */
export function buildFixedDaySchedule(afterIso: string, days: readonly number[], count: number): string[] {
  if (!Number.isInteger(count) || count <= 0) throw new Error("El número de cuotas debe ser mayor a cero")
  const dates: string[] = []
  let cursor = afterIso
  for (let i = 0; i < count; i++) {
    cursor = nextFixedDay(cursor, days)
    dates.push(cursor)
  }
  return dates
}

/** Etiqueta legible: "Día 5" o "Días 5 y 20". */
export function formatPaymentDays(days: readonly number[]): string {
  const sorted = normalizePaymentDays(days)
  return sorted.length === 1 ? `Día ${sorted[0]}` : `Días ${sorted.join(" y ")}`
}

// ===========================================================================
// "Día fijo" según la frecuencia (elegida por el usuario, nunca deducida)
//   - Mensual:   1 día del mes (payment_days = [d])
//   - Quincenal: 2 días del mes (payment_days = [a, b], a < b, no ambos >= 28)
//   - Semanal:   1 día de la semana (payment_weekday 1 = lunes … 7 = domingo)
//   - Diaria:    no admite día fijo (solo Automático)
// Mismas reglas en el servidor (Zod) y en la BD (check loans_schedule_check
// y fixed_schedule_error, migración 0011).
// ===========================================================================

/** Día fijo de un préstamo: días del mes (mensual/quincenal) o día de la semana (semanal). */
export interface FixedSchedule {
  days: number[]
  weekday: number | null
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
}

/** Cantidad de días del mes que exige cada frecuencia con "Día fijo". */
export const FIXED_DAYS_BY_FREQUENCY = { monthly: 1, biweekly: 2 } as const

/** Etiqueta del campo "Día fijo" según la frecuencia. */
export const FIXED_DAY_LABELS: Record<LoanFrequency, string> = {
  daily: "Día fijo",
  weekly: "Día de la semana",
  biweekly: "Días del mes (2)",
  monthly: "Día del mes",
}

/** Ayuda bajo el campo "Día fijo" según la frecuencia. */
export const FIXED_DAY_HINTS: Record<LoanFrequency, string> = {
  daily: "La frecuencia diaria no permite día fijo.",
  weekly: "Cada cuota cae ese día de la semana.",
  biweekly:
    "Dos días del mes, por ejemplo 5 y 20. No pueden ser los dos del 28 en adelante. Si el mes no tiene ese día, la cuota cae el último día del mes.",
  monthly: "Del 1 al 31. Si el mes no tiene ese día, la cuota cae el último día del mes.",
}

export function fixedScheduleAllowed(frequency: LoanFrequency): boolean {
  return frequency !== "daily"
}

/** Mensaje de error si el día fijo no coincide con la frecuencia, o null si es válido. */
export function validateFixedSchedule(
  frequency: LoanFrequency,
  days: readonly number[],
  weekday: number | null | undefined
): string | null {
  switch (frequency) {
    case "daily":
      return "La frecuencia diaria no permite día fijo; usa Automático"
    case "weekly":
      if (days.length > 0) return "Con frecuencia semanal se elige un día de la semana, no días del mes"
      if (weekday == null) return "Elige el día de la semana"
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return "Día de la semana inválido"
      return null
    case "monthly":
    case "biweekly": {
      if (weekday != null) return "El día de la semana solo aplica a la frecuencia semanal"
      const required = FIXED_DAYS_BY_FREQUENCY[frequency]
      if (days.length !== required) {
        return frequency === "monthly"
          ? "Con frecuencia mensual se elige 1 día del mes"
          : "Con frecuencia quincenal se eligen 2 días del mes (por ejemplo 5 y 20)"
      }
      return validatePaymentDays(days)
    }
  }
}

function assertValidSchedule(schedule: FixedSchedule) {
  if (schedule.weekday != null) {
    if (!Number.isInteger(schedule.weekday) || schedule.weekday < 1 || schedule.weekday > 7) {
      throw new Error("Día de la semana inválido")
    }
    if (schedule.days.length > 0) throw new Error("Día fijo inválido: días del mes y día de la semana a la vez")
  } else {
    assertValidDays(schedule.days)
  }
}

/** Siguiente fecha con ese día de la semana, ESTRICTAMENTE posterior a `afterIso`. */
export function nextWeekday(afterIso: string, weekday: number): string {
  parseIso(afterIso)
  const delta = ((weekday - isoWeekday(afterIso) + 6) % 7) + 1
  return addDaysIso(afterIso, delta)
}

/** Siguiente fecha del día fijo (del mes o de la semana), estrictamente posterior a `afterIso`. */
export function nextScheduledDate(afterIso: string, schedule: FixedSchedule): string {
  assertValidSchedule(schedule)
  return schedule.weekday != null ? nextWeekday(afterIso, schedule.weekday) : nextFixedDay(afterIso, schedule.days)
}

/** `count` fechas de cuota con día fijo, todas posteriores a `afterIso`. */
export function buildFixedSchedule(afterIso: string, schedule: FixedSchedule, count: number): string[] {
  if (!Number.isInteger(count) || count <= 0) throw new Error("El número de cuotas debe ser mayor a cero")
  const dates: string[] = []
  let cursor = afterIso
  for (let i = 0; i < count; i++) {
    cursor = nextScheduledDate(cursor, schedule)
    dates.push(cursor)
  }
  return dates
}

/** "Día 5 de cada mes", "Días 5 y 20 de cada mes" o "Cada lunes". */
export function formatFixedSchedule(schedule: { days: readonly number[] | null; weekday: number | null }): string {
  if (schedule.weekday != null) return `Cada ${(WEEKDAY_LABELS[schedule.weekday] ?? "").toLowerCase()}`
  return `${formatPaymentDays(schedule.days ?? [])} de cada mes`
}

/** Etiqueta del calendario de un préstamo: "Mensual" o "Quincenal · días 5 y 20 de cada mes". */
export function formatLoanSchedule(loan: {
  frequency: LoanFrequency
  schedule_type: ScheduleType
  payment_days: readonly number[] | null
  payment_weekday: number | null
}): string {
  const base = FREQUENCY_LABELS[loan.frequency]
  if (loan.schedule_type !== "fixed_days") return base
  const detail = formatFixedSchedule({ days: loan.payment_days, weekday: loan.payment_weekday })
  return `${base} · ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`
}
