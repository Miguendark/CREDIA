import { HandCoins, PiggyBank, TrendingUp, Wallet } from "lucide-react"
import { MetricCard } from "@/components/dashboard/metric-card"
import { formatCurrency } from "@/lib/utils/format"
import type { Loan } from "@/types/domain"

export function ClientSummaryCards({ loans }: { loans: Loan[] }) {
  const totalLent = loans.reduce((sum, l) => sum + l.principal_amount, 0)
  const totalPaid = loans.reduce((sum, l) => sum + l.total_paid, 0)
  const outstandingBalance = loans
    .filter((l) => l.status === "activo")
    .reduce((sum, l) => sum + l.outstanding_principal + l.outstanding_interest, 0)
  const totalInterest = loans.reduce((sum, l) => sum + l.total_interest, 0)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total prestado" value={formatCurrency(totalLent)} icon={HandCoins} />
      <MetricCard label="Total pagado" value={formatCurrency(totalPaid)} icon={PiggyBank} tone="good" />
      <MetricCard label="Saldo pendiente" value={formatCurrency(outstandingBalance)} icon={Wallet} tone="warning" />
      <MetricCard label="Intereses pactados" value={formatCurrency(totalInterest)} icon={TrendingUp} />
    </div>
  )
}
