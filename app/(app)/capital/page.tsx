import type { Metadata } from "next"
import { HandCoins, PiggyBank, TrendingUp, Wallet } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getCapitalSummary, listCapitalMovements } from "@/services/capital.service"
import { PageHeader } from "@/components/shared/page-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { CapitalMovementDialog } from "@/components/capital/capital-movement-dialog"
import { CapitalMovementsTable } from "@/components/capital/capital-movements-table"
import { Pagination } from "@/components/shared/pagination"
import { formatCurrency } from "@/lib/utils/format"

export const metadata: Metadata = { title: "Capital" }
export const revalidate = 0

const PAGE_SIZE = 25

export default async function CapitalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const supabase = await createClient()

  const [summary, movements] = await Promise.all([
    getCapitalSummary(supabase),
    listCapitalMovements(supabase, { page, pageSize: PAGE_SIZE }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capital"
        description="Aportes, retiros y estado del capital de la empresa."
        action={<CapitalMovementDialog />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Capital inicial" value={formatCurrency(summary.initialCapital)} icon={Wallet} />
        <MetricCard
          label="Capital disponible"
          value={formatCurrency(summary.availableCapital)}
          icon={PiggyBank}
          tone="good"
        />
        <MetricCard label="Capital prestado" value={formatCurrency(summary.lentCapital)} icon={HandCoins} />
        <MetricCard
          label="Capital recuperado"
          value={formatCurrency(summary.recoveredCapital)}
          icon={TrendingUp}
          tone="good"
        />
        <MetricCard label="Intereses cobrados" value={formatCurrency(summary.interestGenerated)} icon={TrendingUp} />
        <MetricCard label="Total aportes" value={formatCurrency(summary.totalContributions)} icon={Wallet} />
        <MetricCard
          label="Total retiros"
          value={formatCurrency(summary.totalWithdrawals)}
          icon={Wallet}
          tone="warning"
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Historial de movimientos</h2>
        <CapitalMovementsTable items={movements.items} />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={movements.total}
          buildHref={(p) => `/capital?page=${p}`}
        />
      </div>
    </div>
  )
}
