import type { Metadata } from "next"
import { AlertTriangle, Clock, HandCoins, Landmark, Receipt, TrendingUp, Users, Wallet } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import {
  getDashboardMetrics,
  getLoanStatusChartData,
  getPaymentsChartData,
  getPortfolioChartData,
} from "@/services/dashboard.service"
import { formatCurrency } from "@/lib/utils/format"
import { MetricCard } from "@/components/dashboard/metric-card"
import { PortfolioChart } from "@/components/dashboard/portfolio-chart"
import { PaymentsChart } from "@/components/dashboard/payments-chart"
import { LoanStatusChart } from "@/components/dashboard/loan-status-chart"

export const metadata: Metadata = { title: "Dashboard" }
export const revalidate = 0

export default async function DashboardPage() {
  const supabase = await createClient()

  const [metrics, portfolio, payments, loanStatus] = await Promise.all([
    getDashboardMetrics(supabase),
    getPortfolioChartData(supabase),
    getPaymentsChartData(supabase),
    getLoanStatusChartData(supabase),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Vista general de la cartera de préstamos, calculada en tiempo real.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Capital disponible" value={formatCurrency(metrics.availableCapital)} icon={Wallet} />
        <MetricCard label="Capital prestado" value={formatCurrency(metrics.lentCapital)} icon={HandCoins} />
        <MetricCard
          label="Total recibido"
          value={formatCurrency(metrics.totalReceived)}
          icon={Receipt}
          tone="good"
        />
        <MetricCard
          label="Intereses generados"
          value={formatCurrency(metrics.totalInterestGenerated)}
          icon={TrendingUp}
          tone="good"
        />
        <MetricCard label="Préstamos activos" value={String(metrics.activeLoansCount)} icon={Landmark} />
        <MetricCard label="Clientes activos" value={String(metrics.activeClientsCount)} icon={Users} />
        <MetricCard
          label="Cuotas pendientes"
          value={String(metrics.pendingInstallmentsCount)}
          icon={Clock}
          tone="warning"
        />
        <MetricCard
          label="Préstamos vencidos"
          value={String(metrics.overdueLoansCount)}
          icon={AlertTriangle}
          tone="critical"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PortfolioChart data={portfolio} />
        <PaymentsChart data={payments} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <LoanStatusChart data={loanStatus} />
      </div>
    </div>
  )
}
