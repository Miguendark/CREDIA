/**
 * Períodos del panel de Finanzas y su período de comparación.
 *
 * Todas las fechas son AAAA-MM-DD en hora de República Dominicana; "hoy"
 * lo pasa quien llama (todayRD()). La aritmética es con enteros/UTC, sin
 * depender de la zona horaria del servidor.
 *
 *  - mes:          del día 1 a hoy        vs. los mismos días del mes anterior
 *  - mes_anterior: mes completo           vs. el mes previo
 *  - trimestre:    trimestre hasta hoy    vs. el mismo tramo del trimestre anterior
 *  - anio:         1 de enero a hoy       vs. el mismo tramo del año anterior
 *  - rango:        fechas elegidas        vs. el rango de igual duración justo antes
 */
import { daysInMonth } from "./fixed-days"
import { addDaysIso } from "../utils/date"

export type PeriodKey = "mes" | "mes_anterior" | "trimestre" | "anio" | "rango"

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "mes", label: "Este mes" },
  { key: "mes_anterior", label: "Mes anterior" },
  { key: "trimestre", label: "Este trimestre" },
  { key: "anio", label: "Este año" },
  { key: "rango", label: "Rango personalizado" },
]

/** Duración máxima de un rango personalizado (3 años). */
export const MAX_RANGE_DAYS = 1096

/** Días promedio de un mes (365.25 / 12), para llevar tasas a "por mes". */
export const AVERAGE_MONTH_DAYS = 365.25 / 12

export interface Period {
  key: PeriodKey
  from: string
  to: string
  prevFrom: string
  prevTo: string
  /** Días del período, contando ambos extremos. */
  days: number
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

function parse(iso: string): { y: number; m: number; d: number } {
  const match = ISO.exec(iso)
  if (!match) throw new Error(`Fecha inválida: ${iso}`)
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`Fecha inválida: ${iso}`)
  return { y, m, d }
}

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    parse(value)
    return true
  } catch {
    return false
  }
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** Suma meses a (año, mes), devolviendo el año y mes resultantes. */
function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + delta
  return { y: Math.floor(index / 12), m: (index % 12) + 1 }
}

/** Días entre dos fechas, contando ambos extremos (from ≤ to). */
export function daysInclusive(from: string, to: string): number {
  const a = parse(from)
  const b = parse(to)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000) + 1
}

/** Meses (fraccionarios) que dura un período de `days` días. */
export function monthsInDays(days: number): number {
  return days / AVERAGE_MONTH_DAYS
}

function build(key: PeriodKey, from: string, to: string, prevFrom: string, prevTo: string): Period {
  return { key, from, to, prevFrom, prevTo, days: daysInclusive(from, to) }
}

/**
 * Calcula el período y su comparación. Un rango personalizado inválido
 * (fechas mal escritas, desde > hasta o más de 3 años) vuelve a "Este mes".
 */
export function resolvePeriod(key: PeriodKey, today: string, custom?: { from?: string; to?: string }): Period {
  const t = parse(today)

  switch (key) {
    case "mes_anterior": {
      const p = shiftMonth(t.y, t.m, -1)
      const pp = shiftMonth(t.y, t.m, -2)
      return build(key, iso(p.y, p.m, 1), iso(p.y, p.m, daysInMonth(p.y, p.m)), iso(pp.y, pp.m, 1), iso(pp.y, pp.m, daysInMonth(pp.y, pp.m)))
    }
    case "trimestre": {
      const qStartMonth = Math.floor((t.m - 1) / 3) * 3 + 1
      const from = iso(t.y, qStartMonth, 1)
      const elapsed = daysInclusive(from, today) - 1
      const pq = shiftMonth(t.y, qStartMonth, -3)
      const prevFrom = iso(pq.y, pq.m, 1)
      const prevQuarterEnd = addDaysIso(from, -1)
      const candidate = addDaysIso(prevFrom, elapsed)
      return build(key, from, today, prevFrom, candidate < prevQuarterEnd ? candidate : prevQuarterEnd)
    }
    case "anio": {
      const py = t.y - 1
      return build(key, iso(t.y, 1, 1), today, iso(py, 1, 1), iso(py, t.m, Math.min(t.d, daysInMonth(py, t.m))))
    }
    case "rango": {
      const from = custom?.from
      const to = custom?.to
      if (isValidIsoDate(from) && isValidIsoDate(to) && from <= to && daysInclusive(from, to) <= MAX_RANGE_DAYS) {
        const n = daysInclusive(from, to)
        return build(key, from, to, addDaysIso(from, -n), addDaysIso(from, -1))
      }
      return resolvePeriod("mes", today)
    }
    case "mes":
    default: {
      const p = shiftMonth(t.y, t.m, -1)
      return build("mes", iso(t.y, t.m, 1), today, iso(p.y, p.m, 1), iso(p.y, p.m, Math.min(t.d, daysInMonth(p.y, p.m))))
    }
  }
}

/** Lee el período desde los parámetros de la URL (?periodo=&desde=&hasta=). */
export function periodFromParams(
  params: { periodo?: string; desde?: string; hasta?: string },
  today: string
): Period {
  const key = PERIOD_OPTIONS.some((o) => o.key === params.periodo) ? (params.periodo as PeriodKey) : "mes"
  return resolvePeriod(key, today, { from: params.desde, to: params.hasta })
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** "5 nov 2026" */
export function formatShortDate(value: string): string {
  const { y, m, d } = parse(value)
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** "1–17 nov 2026", "1 oct – 17 nov 2026" o "1 dic 2025 – 5 ene 2026". */
export function formatRange(from: string, to: string): string {
  const a = parse(from)
  const b = parse(to)
  if (a.y === b.y && a.m === b.m) return a.d === b.d ? formatShortDate(from) : `${a.d}–${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`
  if (a.y === b.y) return `${a.d} ${MONTHS_SHORT[a.m - 1]} – ${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`
  return `${formatShortDate(from)} – ${formatShortDate(to)}`
}

/** "nov 26" para ejes de gráficos mensuales (recibe el primer día del mes). */
export function formatMonthLabel(monthStart: string): string {
  const { y, m } = parse(monthStart.slice(0, 10))
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`
}
