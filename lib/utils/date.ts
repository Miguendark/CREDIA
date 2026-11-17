/**
 * Fechas de calendario (AAAA-MM-DD) para NEXA.
 *
 * El negocio opera en República Dominicana: "hoy" es la fecha en
 * America/Santo_Domingo (UTC-4, sin horario de verano), NO la fecha UTC.
 * Con UTC, de 8:00 p. m. a medianoche en RD "hoy" ya sería mañana.
 *
 * La aritmética de días es con enteros (sin `Date`), así que no depende de
 * la zona horaria del servidor ni del navegador.
 */

export const BUSINESS_TIME_ZONE = "America/Santo_Domingo"

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const rdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Fecha de hoy en República Dominicana, como AAAA-MM-DD. */
export function todayRD(now: Date = new Date()): string {
  const parts = rdFormatter.formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function parse(iso: string): [number, number, number] {
  const m = ISO_DATE.exec(iso)
  if (!m) throw new Error(`Fecha inválida: ${iso}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

// Días desde 1970-01-01 (algoritmo "days from civil" de H. Hinnant).
function toDayNumber(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function fromDayNumber(z: number): string {
  const zz = z + 719468
  const era = Math.floor(zz / 146097)
  const doe = zz - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = parse(iso)
  return fromDayNumber(toDayNumber(y, m, d) + days)
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(iso: string): number {
  const [y, m, d] = parse(iso)
  // 1970-01-01 fue jueves (4).
  return ((((toDayNumber(y, m, d) + 3) % 7) + 7) % 7) + 1
}
