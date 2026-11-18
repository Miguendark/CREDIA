/**
 * Indicadores del panel de Finanzas (cálculo puro, sin BD).
 *
 * Las sumas pesadas vienen de las funciones finance_* (migración 0013); aquí
 * se combinan, se comparan con el período anterior y se clasifican. Ningún
 * componente visual calcula: solo muestra lo que devuelve este módulo.
 */
import type { LoanFrequency } from "@/types/database.types"
import { addDaysIso } from "../utils/date"
import { formatShortDate, monthsInDays } from "./periods"
import { round2 } from "./round"

// ---------------------------------------------------------------------------
// Comparación con el período anterior
// ---------------------------------------------------------------------------

export type Direction = "up" | "down" | "flat"
/** Si subir es bueno (ganancia) o malo (riesgo, atraso). */
export type Polarity = "higher_is_better" | "higher_is_worse" | "neutral"
export type Tone = "good" | "bad" | "neutral"

export interface Change {
  current: number
  previous: number
  /** Variación porcentual; null si el anterior es 0 (no hay base para comparar). */
  pct: number | null
  direction: Direction
  /** El anterior era 0 y el actual no. */
  isNew: boolean
}

const EPSILON = 0.005

export function compare(current: number, previous: number): Change {
  const diff = current - previous
  const direction: Direction = Math.abs(diff) < EPSILON ? "flat" : diff > 0 ? "up" : "down"
  if (Math.abs(previous) < EPSILON) {
    return {
      current,
      previous,
      pct: null,
      direction,
      isNew: Math.abs(current) >= EPSILON,
    }
  }
  return {
    current,
    previous,
    pct: (diff / Math.abs(previous)) * 100,
    direction,
    isNew: false,
  }
}

export function changeTone(change: Change, polarity: Polarity): Tone {
  if (polarity === "neutral" || change.direction === "flat") return "neutral"
  const up = change.direction === "up"
  return (polarity === "higher_is_better") === up ? "good" : "bad"
}

// ---------------------------------------------------------------------------
// Fórmulas
// ---------------------------------------------------------------------------

/**
 * Rentabilidad mensual (%) = interés cobrado ÷ capital en la calle promedio ÷
 * meses del período × 100. null si no hubo capital en la calle.
 */
export function monthlyReturn(interestCollected: number, averageCapital: number, days: number): number | null {
  if (averageCapital <= 0 || days <= 0) return null
  return (interestCollected / averageCapital / monthsInDays(days)) * 100
}

/** Eficiencia de cobro (%) = cobrado sobre lo que vencía ÷ lo que vencía × 100. null si no vencía nada. */
export function collectionEfficiency(due: number, collected: number): number | null {
  if (due <= 0) return null
  return (collected / due) * 100
}

/** Porcentaje de una parte sobre el total; null si el total es 0. */
export function shareOf(part: number, total: number): number | null {
  if (total <= 0) return null
  return (part / total) * 100
}

// ---------------------------------------------------------------------------
// Totales a partir de las filas por frecuencia
// ---------------------------------------------------------------------------

export interface PositionRow {
  frequency: LoanFrequency
  active_loans: number
  capital_outstanding: number
  interest_outstanding: number
}

export interface FlowRow {
  frequency: LoanFrequency
  interest_collected: number
  principal_collected: number
  operations: number
  disbursed: number
  new_loans: number
  paid_loans: number
  avg_capital: number
}

export interface PositionTotals {
  activeLoans: number
  capitalOutstanding: number
  interestOutstanding: number
}

export interface FlowTotals {
  interestCollected: number
  principalCollected: number
  totalCollected: number
  operations: number
  disbursed: number
  newLoans: number
  paidLoans: number
  averageCapital: number
}

export function sumPosition(rows: readonly PositionRow[]): PositionTotals {
  return {
    activeLoans: rows.reduce((s, r) => s + r.active_loans, 0),
    capitalOutstanding: round2(rows.reduce((s, r) => s + r.capital_outstanding, 0)),
    interestOutstanding: round2(rows.reduce((s, r) => s + r.interest_outstanding, 0)),
  }
}

export function sumFlows(rows: readonly FlowRow[]): FlowTotals {
  const interest = round2(rows.reduce((s, r) => s + r.interest_collected, 0))
  const principal = round2(rows.reduce((s, r) => s + r.principal_collected, 0))
  return {
    interestCollected: interest,
    principalCollected: principal,
    totalCollected: round2(interest + principal),
    operations: rows.reduce((s, r) => s + r.operations, 0),
    disbursed: round2(rows.reduce((s, r) => s + r.disbursed, 0)),
    newLoans: rows.reduce((s, r) => s + r.new_loans, 0),
    paidLoans: rows.reduce((s, r) => s + r.paid_loans, 0),
    averageCapital: round2(rows.reduce((s, r) => s + r.avg_capital, 0)),
  }
}

// ---------------------------------------------------------------------------
// Cartera en riesgo
// ---------------------------------------------------------------------------

export interface OverdueLoan {
  loan_id: string
  loan_number: string
  client_id: string
  client_name: string
  frequency: LoanFrequency
  days_late: number
  capital_at_risk: number
  overdue_amount: number
  overdue_installments: number
}

export const AGING_BUCKETS = [
  { key: "1-7", label: "1 a 7 días", min: 1, max: 7 },
  { key: "8-30", label: "8 a 30 días", min: 8, max: 30 },
  {
    key: "31+",
    label: "Más de 30 días",
    min: 31,
    max: Number.POSITIVE_INFINITY,
  },
] as const

export type AgingKey = (typeof AGING_BUCKETS)[number]["key"]

export function agingBucketFor(daysLate: number): AgingKey | null {
  const bucket = AGING_BUCKETS.find((b) => daysLate >= b.min && daysLate <= b.max)
  return bucket ? bucket.key : null
}

export interface AgingBucket {
  key: AgingKey
  label: string
  loans: number
  /** Saldo de capital de esos préstamos. */
  capitalAtRisk: number
  /** Lo vencido sin pagar. */
  overdueAmount: number
  /** capitalAtRisk ÷ capital en la calle × 100. */
  pct: number | null
}

export interface AgingSummary {
  buckets: AgingBucket[]
  loans: number
  capitalAtRisk: number
  overdueAmount: number
  pct: number | null
  /** Capital de préstamos sin atraso. */
  currentCapital: number
  /** Cantidad de préstamos sin atraso (préstamos en la calle − préstamos con atraso). */
  currentLoans: number
}

export function agingSummary(
  overdue: readonly OverdueLoan[],
  portfolioCapital: number,
  portfolioLoans: number
): AgingSummary {
  const buckets: AgingBucket[] = AGING_BUCKETS.map((b) => {
    const rows = overdue.filter((o) => agingBucketFor(o.days_late) === b.key)
    const capitalAtRisk = round2(rows.reduce((s, r) => s + r.capital_at_risk, 0))
    return {
      key: b.key,
      label: b.label,
      loans: rows.length,
      capitalAtRisk,
      overdueAmount: round2(rows.reduce((s, r) => s + r.overdue_amount, 0)),
      pct: shareOf(capitalAtRisk, portfolioCapital),
    }
  })
  const capitalAtRisk = round2(buckets.reduce((s, b) => s + b.capitalAtRisk, 0))
  const loans = buckets.reduce((s, b) => s + b.loans, 0)
  return {
    buckets,
    loans,
    capitalAtRisk,
    overdueAmount: round2(buckets.reduce((s, b) => s + b.overdueAmount, 0)),
    pct: shareOf(capitalAtRisk, portfolioCapital),
    currentCapital: round2(portfolioCapital - capitalAtRisk),
    currentLoans: Math.max(portfolioLoans - loans, 0),
  }
}

// ---------------------------------------------------------------------------
// Préstamos cancelados (capital no recuperado)
// ---------------------------------------------------------------------------

export interface CancelledLoanRow {
  loan_id: string
  loan_number: string
  client_id: string
  client_name: string
  cancelled_on: string
  principal_amount: number
  principal_collected: number
  interest_collected: number
  payments: number
  capital_lost: number
  notes: string | null
}

// ---------------------------------------------------------------------------
// Atraso por cliente
// ---------------------------------------------------------------------------

export interface LateLoan {
  loanId: string
  loanNumber: string
  daysLate: number
  overdueAmount: number
  capitalAtRisk: number
}

export interface LateClient {
  clientId: string
  clientName: string
  loans: number
  maxDaysLate: number
  overdueAmount: number
  capitalAtRisk: number
  /** Sus préstamos atrasados, el más atrasado primero. */
  lateLoans: LateLoan[]
}

/** Clientes con más atraso: primero más días, luego más monto vencido. */
export function lateClients(overdue: readonly OverdueLoan[], limit: number): LateClient[] {
  const byClient = new Map<string, LateClient>()
  for (const o of overdue) {
    const current = byClient.get(o.client_id) ?? {
      clientId: o.client_id,
      clientName: o.client_name,
      loans: 0,
      maxDaysLate: 0,
      overdueAmount: 0,
      capitalAtRisk: 0,
      lateLoans: [],
    }
    current.loans += 1
    current.maxDaysLate = Math.max(current.maxDaysLate, o.days_late)
    current.overdueAmount = round2(current.overdueAmount + o.overdue_amount)
    current.capitalAtRisk = round2(current.capitalAtRisk + o.capital_at_risk)
    current.lateLoans.push({
      loanId: o.loan_id,
      loanNumber: o.loan_number,
      daysLate: o.days_late,
      overdueAmount: o.overdue_amount,
      capitalAtRisk: o.capital_at_risk,
    })
    byClient.set(o.client_id, current)
  }
  for (const c of byClient.values()) {
    c.lateLoans.sort((a, b) => b.daysLate - a.daysLate || a.loanNumber.localeCompare(b.loanNumber))
  }
  return [...byClient.values()]
    .sort((a, b) => b.maxDaysLate - a.maxDaysLate || b.overdueAmount - a.overdueAmount)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Proyección de entradas
// ---------------------------------------------------------------------------

export interface ProjectionRow {
  bucket: number
  installments: number
  capital: number
  interest: number
}

export interface ProjectionPoint {
  key: string
  label: string
  /** Rango de fechas de la semana (vacío para "Atrasado"). */
  range: string
  installments: number
  capital: number
  interest: number
  total: number
}

/**
 * Semana k (k ≥ 1) = desde hoy + 7(k−1) hasta hoy + 7k − 1. El bucket 0 es
 * lo ya atrasado. Las semanas sin cuotas aparecen en 0.
 */
export function projectionSeries(
  rows: readonly ProjectionRow[],
  today: string,
  weeks: number
): {
  overdue: ProjectionPoint
  weeks: ProjectionPoint[]
} {
  const point = (bucket: number, key: string, label: string, range: string): ProjectionPoint => {
    const row = rows.find((r) => r.bucket === bucket)
    const capital = round2(row?.capital ?? 0)
    const interest = round2(row?.interest ?? 0)
    return {
      key,
      label,
      range,
      installments: row?.installments ?? 0,
      capital,
      interest,
      total: round2(capital + interest),
    }
  }
  const list: ProjectionPoint[] = []
  for (let k = 1; k <= weeks; k++) {
    const from = addDaysIso(today, 7 * (k - 1))
    const to = addDaysIso(today, 7 * k - 1)
    list.push(point(k, `w${k}`, `Semana ${k}`, `${formatShortDate(from)} – ${formatShortDate(to)}`))
  }
  return { overdue: point(0, "overdue", "Atrasado", ""), weeks: list }
}

// ---------------------------------------------------------------------------
// Por frecuencia
// ---------------------------------------------------------------------------

export interface FrequencyBreakdown {
  frequency: LoanFrequency
  activeLoans: number
  capitalOutstanding: number
  /** Participación en el capital en la calle (%). */
  share: number | null
  interestCollected: number
  averageCapital: number
  monthlyReturn: number | null
}

export function frequencyBreakdown(
  position: readonly PositionRow[],
  flows: readonly FlowRow[],
  days: number
): FrequencyBreakdown[] {
  const totalCapital = position.reduce((s, r) => s + r.capital_outstanding, 0)
  const frequencies: LoanFrequency[] = ["weekly", "biweekly", "monthly", "daily"]
  return frequencies
    .map((frequency) => {
      const p = position.find((r) => r.frequency === frequency)
      const f = flows.find((r) => r.frequency === frequency)
      const capital = round2(p?.capital_outstanding ?? 0)
      const interest = round2(f?.interest_collected ?? 0)
      const average = round2(f?.avg_capital ?? 0)
      return {
        frequency,
        activeLoans: p?.active_loans ?? 0,
        capitalOutstanding: capital,
        share: shareOf(capital, totalCapital),
        interestCollected: interest,
        averageCapital: average,
        monthlyReturn: monthlyReturn(interest, average, days),
      }
    })
    .filter((r) => r.activeLoans > 0 || r.capitalOutstanding !== 0 || r.interestCollected > 0 || r.averageCapital > 0)
}
