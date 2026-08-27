import type { TypedSupabaseClient } from "@/lib/supabase/types"
import type { DashboardMetrics, LoanStatusChartPoint, PaymentsChartPoint, PortfolioChartPoint } from "@/types/domain"

export async function getDashboardMetrics(supabase: TypedSupabaseClient): Promise<DashboardMetrics> {
  const { data, error } = await supabase.from("dashboard_metrics").select("*").single()
  if (error) throw error

  return {
    availableCapital: data.available_capital,
    lentCapital: data.lent_capital,
    totalReceived: data.total_received,
    totalInterestGenerated: data.total_interest_generated,
    activeLoansCount: data.active_loans_count,
    activeClientsCount: data.active_clients_count,
    pendingInstallmentsCount: data.pending_installments_count,
    overdueLoansCount: data.overdue_loans_count,
  }
}

/** Cartera: capital prestado (histórico por mes de desembolso) vs. recuperado vs. saldo pendiente. */
export async function getPortfolioChartData(supabase: TypedSupabaseClient): Promise<PortfolioChartPoint[]> {
  const { data: loans, error } = await supabase
    .from("loans")
    .select("start_date, principal_amount, outstanding_principal, total_paid")
    .order("start_date", { ascending: true })
  if (error) throw error

  const buckets = new Map<string, PortfolioChartPoint>()
  for (const loan of loans) {
    const label = monthLabel(loan.start_date)
    const bucket = buckets.get(label) ?? { label, lent: 0, recovered: 0, outstanding: 0 }
    bucket.lent += loan.principal_amount
    bucket.recovered += loan.total_paid
    bucket.outstanding += loan.outstanding_principal
    buckets.set(label, bucket)
  }

  return Array.from(buckets.values())
}

/** Pagos: cuotas pagadas vs. pendientes vs. vencidas, agrupadas por mes de vencimiento. */
export async function getPaymentsChartData(supabase: TypedSupabaseClient): Promise<PaymentsChartPoint[]> {
  const { data: installments, error } = await supabase
    .from("installments")
    .select("due_date, status, total_amount")
    .order("due_date", { ascending: true })
  if (error) throw error

  const today = new Date().toISOString().slice(0, 10)
  const buckets = new Map<string, PaymentsChartPoint>()

  for (const installment of installments) {
    const label = monthLabel(installment.due_date)
    const bucket = buckets.get(label) ?? { label, paid: 0, pending: 0, overdue: 0 }

    if (installment.status === "pagada") {
      bucket.paid += installment.total_amount
    } else if (installment.due_date < today) {
      bucket.overdue += installment.total_amount
    } else {
      bucket.pending += installment.total_amount
    }

    buckets.set(label, bucket)
  }

  return Array.from(buckets.values())
}

export async function getLoanStatusChartData(supabase: TypedSupabaseClient): Promise<LoanStatusChartPoint[]> {
  const { data: loans, error } = await supabase.from("loans").select("status, next_payment_date")
  if (error) throw error

  const today = new Date().toISOString().slice(0, 10)
  const counts: Record<string, number> = { Activos: 0, Vencidos: 0, Pagados: 0, Cancelados: 0 }

  for (const loan of loans) {
    if (loan.status === "activo") {
      const overdue = loan.next_payment_date !== null && loan.next_payment_date < today
      counts[overdue ? "Vencidos" : "Activos"]++
    } else if (loan.status === "pagado") {
      counts["Pagados"]++
    } else if (loan.status === "cancelado") {
      counts["Cancelados"]++
    }
  }

  return Object.entries(counts).map(([status, count]) => ({ status, count }))
}

function monthLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("es-DO", { month: "short", year: "2-digit" })
}
