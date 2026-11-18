import type { TypedSupabaseClient } from "@/lib/supabase/types"
import { daysInclusive, type Period } from "@/lib/finance/periods"
import {
  agingSummary,
  collectionEfficiency,
  compare,
  frequencyBreakdown,
  lateClients,
  monthlyReturn,
  projectionSeries,
  sumFlows,
  sumPosition,
  type AgingSummary,
  type CancelledLoanRow,
  type Change,
  type FlowRow,
  type FrequencyBreakdown,
  type LateClient,
  type OverdueLoan,
  type PositionRow,
  type ProjectionPoint,
} from "@/lib/finance/indicators"
import { round2 } from "@/lib/finance/round"
import {
  expenseSummary,
  lossSummary,
  netProfit,
  writeoffLossBetween,
  type ExpenseRow,
  type ExpenseSummary,
  type LossSummary,
  type WriteoffRow,
} from "@/lib/finance/losses"
import type { ExpenseCategory, WriteoffKind } from "@/types/database.types"
import type { ClassifyLoanInput, ExpenseInput, VoidInput } from "@/lib/validations/finance"

/**
 * Panel de Finanzas. Las sumas las hacen las funciones finance_* en la base
 * (migraciones 0013 y 0014, solo admin/supervisor); aquí solo se
 * piden en paralelo y se combinan con lib/finance/indicators.
 *
 * Cierre "hoy": si el período termina hoy, la cartera y la caja incluyen
 * también lo fechado después de hoy (préstamos o movimientos con fecha
 * futura), para coincidir con Capital y el Dashboard. Se informa aparte
 * cuánto es (`futureDated`).
 */

export const PROJECTION_WEEKS = 4
export const MONTHS_IN_CHART = 12
const TOP_LIMIT = 8

export interface FinanceKpis {
  interestCollected: Change
  interestOutstanding: Change
  capitalOutstanding: Change
  principalCollected: Change
  cash: Change
  /** Ganancia cobrada − gastos − pérdida por incobrables (del período). */
  netProfit: Change
  /** Caja − gastos registrados hasta el cierre. */
  cashAfterExpenses: Change
  /** % mensual; null si no hubo capital en la calle. */
  monthlyReturn: {
    current: number | null
    previous: number | null
    change: Change | null
  }
}

export interface FinanceDashboard {
  kpis: FinanceKpis
  futureDated: { cash: number; capital: number }
  totals: {
    collected: number
    operations: number
    disbursed: number
    averageCapital: number
  }
  efficiency: {
    current: number | null
    previous: number | null
    due: number
    collected: number
    installmentsDue: number
    installmentsPaid: number
  }
  loans: { active: Change; new: Change; paid: Change; overdue: Change }
  aging: { current: AgingSummary; previous: AgingSummary }
  monthly: {
    monthStart: string
    interest: number
    principal: number
    collected: number
    disbursed: number
  }[]
  projection: { overdue: ProjectionPoint; weeks: ProjectionPoint[] }
  byFrequency: FrequencyBreakdown[]
  byUser: {
    userId: string | null
    userName: string
    operations: number
    collected: number
    principal: number
    interest: number
    share: number | null
  }[]
  topClients: {
    clientId: string
    clientName: string
    interest: number
    principal: number
    loans: number
  }[]
  lateClients: LateClient[]
  /** Gastos del período (y el total hasta el cierre). */
  expenses: ExpenseSummary & { previousTotal: number; totalUntilClose: number }
  /** Cancelados e incobrables. */
  losses: LossSummary
}

async function call<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data as T
}

const n = (v: unknown) => Number(v ?? 0)

const toPosition = (rows: PositionRow[]): PositionRow[] =>
  rows.map((r) => ({
    frequency: r.frequency,
    active_loans: n(r.active_loans),
    capital_outstanding: n(r.capital_outstanding),
    interest_outstanding: n(r.interest_outstanding),
  }))

const toFlows = (rows: FlowRow[]): FlowRow[] =>
  rows.map((r) => ({
    frequency: r.frequency,
    interest_collected: n(r.interest_collected),
    principal_collected: n(r.principal_collected),
    operations: n(r.operations),
    disbursed: n(r.disbursed),
    new_loans: n(r.new_loans),
    paid_loans: n(r.paid_loans),
    avg_capital: n(r.avg_capital),
  }))

const toOverdue = (rows: OverdueLoan[]): OverdueLoan[] =>
  rows.map((r) => ({
    ...r,
    days_late: n(r.days_late),
    capital_at_risk: n(r.capital_at_risk),
    overdue_amount: n(r.overdue_amount),
    overdue_installments: n(r.overdue_installments),
  }))

const toExpenses = (rows: ExpenseRow[]): ExpenseRow[] =>
  rows.map((r) => ({ ...r, category: r.category as ExpenseCategory, amount: n(r.amount) }))

const toWriteoffs = (rows: WriteoffRow[]): WriteoffRow[] =>
  rows.map((r) => ({
    ...r,
    kind: r.kind as WriteoffKind,
    capital_lost: n(r.capital_lost),
    interest_lost: n(r.interest_lost),
  }))

const toCancelled = (rows: CancelledLoanRow[]): CancelledLoanRow[] =>
  rows.map((c) => ({
    ...c,
    principal_amount: n(c.principal_amount),
    principal_collected: n(c.principal_collected),
    interest_collected: n(c.interest_collected),
    payments: n(c.payments),
    capital_lost: n(c.capital_lost),
  }))

export async function getFinanceDashboard(
  supabase: TypedSupabaseClient,
  period: Period,
  today: string
): Promise<FinanceDashboard> {
  const endsToday = period.to === today
  // 'infinity' = sin límite de fecha (incluye lo fechado en el futuro).
  const stockDate = endsToday ? "infinity" : period.to
  const riskDate = period.to > today ? today : period.to

  const [
    position,
    positionUntilToday,
    positionPrev,
    cash,
    cashUntilToday,
    cashPrev,
    flows,
    flowsPrev,
    efficiency,
    efficiencyPrev,
    overdue,
    overduePrev,
    monthly,
    projection,
    byUser,
    topClients,
    cancelled,
    expenses,
    expensesPrev,
    expensesTotal,
    expensesTotalPrev,
    writeoffs,
  ] = await Promise.all([
    call(supabase.rpc("finance_position", { p_date: stockDate })),
    call(supabase.rpc("finance_position", { p_date: period.to })),
    call(supabase.rpc("finance_position", { p_date: period.prevTo })),
    call(supabase.rpc("finance_cash", { p_date: stockDate })),
    call(supabase.rpc("finance_cash", { p_date: period.to })),
    call(supabase.rpc("finance_cash", { p_date: period.prevTo })),
    call(supabase.rpc("finance_flows", { p_from: period.from, p_to: period.to })),
    call(
      supabase.rpc("finance_flows", {
        p_from: period.prevFrom,
        p_to: period.prevTo,
      })
    ),
    call(
      supabase.rpc("finance_collection_efficiency", {
        p_from: period.from,
        p_to: period.to,
      })
    ),
    call(
      supabase.rpc("finance_collection_efficiency", {
        p_from: period.prevFrom,
        p_to: period.prevTo,
      })
    ),
    call(supabase.rpc("finance_overdue_loans", { p_date: riskDate })),
    call(supabase.rpc("finance_overdue_loans", { p_date: period.prevTo })),
    call(
      supabase.rpc("finance_monthly", {
        p_to: period.to,
        p_months: MONTHS_IN_CHART,
      })
    ),
    call(
      supabase.rpc("finance_projection", {
        p_date: today,
        p_weeks: PROJECTION_WEEKS,
      })
    ),
    call(supabase.rpc("finance_by_user", { p_from: period.from, p_to: period.to })),
    call(
      supabase.rpc("finance_top_clients", {
        p_from: period.from,
        p_to: period.to,
        p_limit: TOP_LIMIT,
      })
    ),
    call(supabase.rpc("finance_cancelled_loans")),
    call(supabase.rpc("finance_expenses", { p_from: period.from, p_to: period.to })),
    call(supabase.rpc("finance_expenses", { p_from: period.prevFrom, p_to: period.prevTo })),
    call(supabase.rpc("finance_expenses_total", { p_date: stockDate })),
    call(supabase.rpc("finance_expenses_total", { p_date: period.prevTo })),
    call(supabase.rpc("finance_writeoffs")),
  ])

  const pos = sumPosition(toPosition(position))
  const posUntilToday = sumPosition(toPosition(positionUntilToday))
  const posPrev = sumPosition(toPosition(positionPrev))
  const flowRows = toFlows(flows)
  const fl = sumFlows(flowRows)
  const flPrev = sumFlows(toFlows(flowsPrev))
  const eff = efficiency[0]
  const effPrev = efficiencyPrev[0]
  const overdueRows = toOverdue(overdue)
  const overduePrevRows = toOverdue(overduePrev)

  const returnNow = monthlyReturn(fl.interestCollected, fl.averageCapital, period.days)
  // El período anterior puede durar distinto (p. ej. octubre 31 días vs. septiembre 30).
  const returnPrev = monthlyReturn(
    flPrev.interestCollected,
    flPrev.averageCapital,
    daysInclusive(period.prevFrom, period.prevTo)
  )
  const effNow = collectionEfficiency(n(eff?.due_amount), n(eff?.collected_amount))
  const effPrevValue = collectionEfficiency(n(effPrev?.due_amount), n(effPrev?.collected_amount))

  const cashNow = n(cash)
  const cashPrevValue = n(cashPrev)

  const expenseRows = toExpenses(expenses)
  const exp = expenseSummary(expenseRows)
  const expPrev = expenseSummary(toExpenses(expensesPrev))
  const writeoffRows = toWriteoffs(writeoffs)
  const losses = lossSummary(toCancelled(cancelled), writeoffRows, period.from, period.to)
  const lossPrev = writeoffLossBetween(writeoffRows, period.prevFrom, period.prevTo)
  const netNow = netProfit(fl.interestCollected, exp.total, losses.periodLoss)
  const netPrev = netProfit(flPrev.interestCollected, expPrev.total, lossPrev)
  const afterExpensesNow = round2(cashNow - n(expensesTotal))
  const afterExpensesPrev = round2(cashPrevValue - n(expensesTotalPrev))

  return {
    kpis: {
      interestCollected: compare(fl.interestCollected, flPrev.interestCollected),
      interestOutstanding: compare(pos.interestOutstanding, posPrev.interestOutstanding),
      capitalOutstanding: compare(pos.capitalOutstanding, posPrev.capitalOutstanding),
      principalCollected: compare(fl.principalCollected, flPrev.principalCollected),
      cash: compare(cashNow, cashPrevValue),
      netProfit: compare(netNow, netPrev),
      cashAfterExpenses: compare(afterExpensesNow, afterExpensesPrev),
      monthlyReturn: {
        current: returnNow,
        previous: returnPrev,
        change: returnNow !== null && returnPrev !== null ? compare(returnNow, returnPrev) : null,
      },
    },
    futureDated: {
      cash: endsToday ? round2(cashNow - n(cashUntilToday)) : 0,
      capital: endsToday ? round2(pos.capitalOutstanding - posUntilToday.capitalOutstanding) : 0,
    },
    totals: {
      collected: fl.totalCollected,
      operations: fl.operations,
      disbursed: fl.disbursed,
      averageCapital: fl.averageCapital,
    },
    efficiency: {
      current: effNow,
      previous: effPrevValue,
      due: n(eff?.due_amount),
      collected: n(eff?.collected_amount),
      installmentsDue: n(eff?.installments_due),
      installmentsPaid: n(eff?.installments_paid),
    },
    loans: {
      active: compare(pos.activeLoans, posPrev.activeLoans),
      new: compare(fl.newLoans, flPrev.newLoans),
      paid: compare(fl.paidLoans, flPrev.paidLoans),
      overdue: compare(overdueRows.length, overduePrevRows.length),
    },
    aging: {
      current: agingSummary(overdueRows, posUntilToday.capitalOutstanding, posUntilToday.activeLoans),
      previous: agingSummary(overduePrevRows, posPrev.capitalOutstanding, posPrev.activeLoans),
    },
    monthly: monthly.map((m) => {
      const interest = n(m.interest_collected)
      const principal = n(m.principal_collected)
      return {
        monthStart: String(m.month_start).slice(0, 10),
        interest,
        principal,
        collected: round2(interest + principal),
        disbursed: n(m.disbursed),
      }
    }),
    projection: projectionSeries(
      projection.map((p) => ({
        bucket: n(p.bucket),
        installments: n(p.installments),
        capital: n(p.capital),
        interest: n(p.interest),
      })),
      today,
      PROJECTION_WEEKS
    ),
    byFrequency: frequencyBreakdown(toPosition(position), flowRows, period.days),
    byUser: byUser.map((u) => ({
      userId: u.user_id,
      userName: u.user_name,
      operations: n(u.operations),
      collected: n(u.collected),
      principal: n(u.principal),
      interest: n(u.interest),
      share: fl.totalCollected > 0 ? (n(u.collected) / fl.totalCollected) * 100 : null,
    })),
    topClients: topClients.map((c) => ({
      clientId: c.client_id,
      clientName: c.client_name,
      interest: n(c.interest),
      principal: n(c.principal),
      loans: n(c.loans),
    })),
    lateClients: lateClients(overdueRows, TOP_LIMIT),
    expenses: { ...exp, previousTotal: expPrev.total, totalUntilClose: round2(n(expensesTotal)) },
    losses,
  }
}

// ---------------------------------------------------------------------------
// Escritura (fase 2). Los permisos los verifica la base en cada función:
// gastos → admin o supervisor; anular gasto, clasificar y quitar
// clasificación → solo admin.
// ---------------------------------------------------------------------------

export async function registerExpense(supabase: TypedSupabaseClient, input: ExpenseInput) {
  return call(
    supabase.rpc("register_expense", {
      p_category: input.category,
      p_amount: input.amount,
      p_description: input.description || null,
      p_expense_date: input.expense_date,
    })
  )
}

export async function voidExpense(supabase: TypedSupabaseClient, input: VoidInput) {
  return call(supabase.rpc("void_expense", { p_expense_id: input.id, p_reason: input.reason }))
}

export async function classifyLoan(supabase: TypedSupabaseClient, input: ClassifyLoanInput) {
  return call(
    supabase.rpc("classify_loan", {
      p_loan_id: input.loan_id,
      p_kind: input.kind,
      p_reason: input.reason,
      p_writeoff_date: input.writeoff_date,
    })
  )
}

export async function voidWriteoff(supabase: TypedSupabaseClient, input: VoidInput) {
  return call(supabase.rpc("void_writeoff", { p_writeoff_id: input.id, p_reason: input.reason }))
}
