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
