import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { listLoans } from "@/services/loans.service"
import { listPayments } from "@/services/payments.service"
import { listClients } from "@/services/clients.service"
import { getInterestReport } from "@/services/reports.service"
import { getCapitalSummary, listCapitalMovements } from "@/services/capital.service"
import { getCollectionsBuckets, getDelinquentClients } from "@/services/collections.service"
import { PageHeader } from "@/components/shared/page-header"
import { ReportsFilters } from "@/components/reports/reports-filters"
import {
  CapitalExport,
  ClientsExport,
  DelinquencyExport,
  InterestExport,
  LoansExport,
  PaymentsExport,
} from "@/components/reports/report-exports"
import { formatCurrency, formatDate } from "@/lib/utils/format"

export const metadata: Metadata = { title: "Reportes" }
export const revalidate = 0

const REPORT_PAGE_SIZE = 500

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams
  const supabase = await createClient()

  const [loansResult, paymentsResult, clientsResult, interestReport, capitalSummary, capitalMovements, collections] =
    await Promise.all([
      listLoans(supabase, { pageSize: REPORT_PAGE_SIZE }),
      listPayments(supabase, { dateFrom: from, dateTo: to, pageSize: REPORT_PAGE_SIZE }),
      listClients(supabase, { pageSize: REPORT_PAGE_SIZE }),
      getInterestReport(supabase),
      getCapitalSummary(supabase),
      listCapitalMovements(supabase, { dateFrom: from, dateTo: to, pageSize: REPORT_PAGE_SIZE }),
      getCollectionsBuckets(supabase),
    ])

  const delinquentClients = getDelinquentClients(collections.overdue)

  return (
    <div className="space-y-8">
      <PageHeader title="Reportes" description="Reportes básicos de la operación, exportables a Excel." />

      <ReportsFilters />

      <ReportSection title="Reporte de préstamos" exportButtons={<LoansExport rows={loansResult.items} />}>
        <p className="text-sm text-muted-foreground">{loansResult.total} préstamos en total.</p>
      </ReportSection>

      <ReportSection title="Reporte de pagos" exportButtons={<PaymentsExport rows={paymentsResult.items} />}>
        <p className="text-sm text-muted-foreground">
          {paymentsResult.total} pagos {from || to ? "en el rango seleccionado" : "en total"} por{" "}
          {formatCurrency(paymentsResult.items.reduce((s, p) => s + p.amount, 0))}.
        </p>
      </ReportSection>

      <ReportSection title="Reporte de clientes" exportButtons={<ClientsExport rows={clientsResult.items} />}>
        <p className="text-sm text-muted-foreground">{clientsResult.total} clientes registrados.</p>
      </ReportSection>

      <ReportSection title="Reporte de intereses" exportButtons={<InterestExport rows={interestReport} />}>
        <p className="text-sm text-muted-foreground">
          Pactado {formatCurrency(interestReport.reduce((s, r) => s + r.interestPactado, 0))} · Cobrado{" "}
          {formatCurrency(interestReport.reduce((s, r) => s + r.interestCobrado, 0))}
        </p>
      </ReportSection>

      <ReportSection title="Reporte de morosidad" exportButtons={<DelinquencyExport rows={delinquentClients} />}>
        <p className="text-sm text-muted-foreground">
          {delinquentClients.length} clientes morosos por{" "}
          {formatCurrency(delinquentClients.reduce((s, c) => s + c.overdueAmount, 0))}.
        </p>
      </ReportSection>

      <ReportSection title="Reporte de capital" exportButtons={<CapitalExport rows={capitalMovements.items} />}>
        <p className="text-sm text-muted-foreground">
          Disponible {formatCurrency(capitalSummary.availableCapital)} · Prestado{" "}
          {formatCurrency(capitalSummary.lentCapital)} · {capitalMovements.total} movimientos
          {(from || to) && ` entre ${from ? formatDate(from) : "…"} y ${to ? formatDate(to) : "…"}`}.
        </p>
      </ReportSection>
    </div>
  )
}

function ReportSection({
  title,
  exportButtons,
  children,
}: {
  title: string
  exportButtons: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2 border-b border-border pb-6 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {exportButtons}
      </div>
      {children}
    </section>
  )
}
