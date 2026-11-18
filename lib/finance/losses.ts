/**
 * Finanzas fase 2: gastos, pérdidas (cancelados e incobrables) y ganancia
 * neta. Cálculo puro, sin BD; las filas vienen de las funciones finance_*
 * (migraciones 0013 y 0014).
 *
 * Reglas:
 * - Gastos: cuentan los no anulados, por fecha del gasto. No mueven Capital;
 *   "Caja después de gastos" = caja − gastos hasta el cierre.
 * - Pérdida = capital no recuperado de los préstamos marcados INCOBRABLES,
 *   en la fecha en que se marcan (writeoff_date). Los marcados ERROR no
 *   son pérdida. Los cancelados sin clasificar se muestran "por clasificar"
 *   y todavía no restan.
 * - Ganancia neta = ganancia cobrada − gastos − pérdida por incobrables
 *   (todo dentro del período).
 */
import type { ExpenseCategory, LoanStatus, WriteoffKind } from "@/types/database.types"
import type { CancelledLoanRow } from "./indicators"
import { round2 } from "./round"

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES: readonly { value: ExpenseCategory; label: string }[] = [
  { value: "gasolina_transporte", label: "Gasolina y transporte" },
  { value: "telefono_internet", label: "Teléfono e internet" },
  { value: "papeleria_impresion", label: "Papelería e impresión" },
  { value: "sueldos", label: "Sueldos" },
  { value: "comisiones", label: "Comisiones" },
  { value: "alquiler", label: "Alquiler" },
  { value: "otros", label: "Otros" },
]

export const EXPENSE_CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label])) as Record<
  ExpenseCategory,
  string
>

export interface ExpenseRow {
  id: string
  expense_date: string
  category: ExpenseCategory
  amount: number
  description: string | null
  created_by_name: string
  voided_at: string | null
  voided_by_name: string | null
  void_reason: string | null
}

export interface ExpenseSummary {
  /** Σ gastos no anulados. */
  total: number
  count: number
  /** Por categoría (solo las que tienen gastos), de mayor a menor. */
  byCategory: { category: ExpenseCategory; label: string; amount: number; count: number; share: number | null }[]
  /** Todos, incluidos los anulados (para mostrarlos tachados), más recientes primero. */
  rows: ExpenseRow[]
}

export function expenseSummary(rows: readonly ExpenseRow[]): ExpenseSummary {
  const active = rows.filter((r) => !r.voided_at)
  const total = round2(active.reduce((s, r) => s + r.amount, 0))
  const byCategory = EXPENSE_CATEGORIES.map((c) => {
    const items = active.filter((r) => r.category === c.value)
    const amount = round2(items.reduce((s, r) => s + r.amount, 0))
    return {
      category: c.value,
      label: c.label,
      amount,
      count: items.length,
      share: total > 0 ? (amount / total) * 100 : null,
    }
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.amount - a.amount)
  const sorted = [...rows].sort((a, b) =>
    a.expense_date === b.expense_date ? 0 : a.expense_date < b.expense_date ? 1 : -1
  )
  return { total, count: active.length, byCategory, rows: sorted }
}

// ---------------------------------------------------------------------------
// Pérdidas: cancelados e incobrables
// ---------------------------------------------------------------------------

export interface WriteoffRow {
  id: string
  loan_id: string
  loan_number: string
  client_id: string
  client_name: string
  loan_status: LoanStatus
  kind: WriteoffKind
  writeoff_date: string
  reason: string
  capital_lost: number
  interest_lost: number
  created_by_name: string
}

export type LossStatus = "incobrable" | "error" | "por_clasificar"

export interface LossLoan {
  loanId: string
  loanNumber: string
  clientId: string
  clientName: string
  loanStatus: LoanStatus
  /** Cancelado: fecha de cancelación. Activo incobrable: null. */
  cancelledOn: string | null
  principal: number | null
  /** Cobrado antes (capital + interés). null si no se conoce (activo incobrable). */
  collectedBefore: number | null
  status: LossStatus
  /** Incobrable/error: la clasificación vigente. */
  writeoff: { id: string; date: string; reason: string; by: string } | null
  /** Capital no recuperado (al clasificar, o hoy si está por clasificar). */
  capitalLost: number
  /** Notas del préstamo (motivo de la cancelación). */
  notes: string | null
  /** La pérdida (o la cancelación, si está por clasificar) cae dentro del período. */
  inPeriod: boolean
}

export interface LossSummary {
  /** Pérdida reconocida (incobrables marcados hasta el cierre). */
  loss: number
  lossLoans: number
  /** Pérdida de los marcados dentro del período (para la ganancia neta). */
  periodLoss: number
  periodLossLoans: number
  /** Cancelados sin clasificar: capital no recuperado que todavía no se reconoce. */
  pending: number
  pendingLoans: number
  /** Marcados como error: no es pérdida. */
  errors: number
  errorLoans: number
  rows: LossLoan[]
}

const day = (v: string) => String(v).slice(0, 10)

/**
 * Une los cancelados (finance_cancelled_loans) con las clasificaciones
 * vigentes (finance_writeoffs). Considera lo ocurrido hasta `to`: un
 * cancelado después del cierre no aparece, y una clasificación posterior
 * al cierre todavía no cuenta (se ve "por clasificar").
 */
export function lossSummary(
  cancelled: readonly CancelledLoanRow[],
  writeoffs: readonly WriteoffRow[],
  from: string,
  to: string
): LossSummary {
  const byLoan = new Map(writeoffs.filter((w) => day(w.writeoff_date) <= to).map((w) => [w.loan_id, w]))
  const rows: LossLoan[] = []

  for (const c of cancelled) {
    const cancelledOn = day(c.cancelled_on)
    if (cancelledOn > to) continue
    const w = byLoan.get(c.loan_id)
    byLoan.delete(c.loan_id)
    const date = w ? day(w.writeoff_date) : cancelledOn
    rows.push({
      loanId: c.loan_id,
      loanNumber: c.loan_number,
      clientId: c.client_id,
      clientName: c.client_name,
      loanStatus: "cancelado",
      cancelledOn,
      principal: c.principal_amount,
      collectedBefore: round2(c.principal_collected + c.interest_collected),
      status: w ? w.kind : "por_clasificar",
      writeoff: w ? { id: w.id, date, reason: w.reason, by: w.created_by_name } : null,
      capitalLost: w ? w.capital_lost : c.capital_lost,
      notes: c.notes,
      inPeriod: date >= from,
    })
  }

  // Préstamos activos marcados incobrables (siguen "activos" fuera de Finanzas).
  for (const w of byLoan.values()) {
    const date = day(w.writeoff_date)
    rows.push({
      loanId: w.loan_id,
      loanNumber: w.loan_number,
      clientId: w.client_id,
      clientName: w.client_name,
      loanStatus: w.loan_status,
      cancelledOn: null,
      principal: null,
      collectedBefore: null,
      status: w.kind,
      writeoff: { id: w.id, date, reason: w.reason, by: w.created_by_name },
      capitalLost: w.capital_lost,
      notes: null,
      inPeriod: date >= from,
    })
  }

  const order: Record<LossStatus, number> = { por_clasificar: 0, incobrable: 1, error: 2 }
  rows.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    const da = a.writeoff?.date ?? a.cancelledOn ?? ""
    const db = b.writeoff?.date ?? b.cancelledOn ?? ""
    return da === db ? a.loanNumber.localeCompare(b.loanNumber) : da < db ? 1 : -1
  })

  const sumOf = (list: LossLoan[]) => round2(list.reduce((s, r) => s + r.capitalLost, 0))
  const losses = rows.filter((r) => r.status === "incobrable")
  const periodLosses = losses.filter((r) => r.inPeriod)
  const pending = rows.filter((r) => r.status === "por_clasificar")
  const errors = rows.filter((r) => r.status === "error")
  return {
    loss: sumOf(losses),
    lossLoans: losses.length,
    periodLoss: sumOf(periodLosses),
    periodLossLoans: periodLosses.length,
    pending: sumOf(pending),
    pendingLoans: pending.length,
    errors: sumOf(errors),
    errorLoans: errors.length,
    rows,
  }
}

/**
 * Pérdida reconocida dentro de [from, to] (incobrables por fecha de
 * clasificación). Sirve para la ganancia neta del período anterior.
 */
export function writeoffLossBetween(writeoffs: readonly WriteoffRow[], from: string, to: string): number {
  return round2(
    writeoffs
      .filter((w) => w.kind === "incobrable" && day(w.writeoff_date) >= from && day(w.writeoff_date) <= to)
      .reduce((s, w) => s + w.capital_lost, 0)
  )
}

/** Ganancia neta = ganancia cobrada − gastos − pérdida por incobrables. */
export function netProfit(interestCollected: number, expenses: number, writeoffLoss: number): number {
  return round2(interestCollected - expenses - writeoffLoss)
}
