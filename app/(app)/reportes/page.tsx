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
import { ExportButtons } from "@/components/reports/export-buttons"
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

      <ReportSection
        title="Reporte de préstamos"
        exportButtons={
          <ExportButtons
            filename="reporte-prestamos.csv"
            rows={loansResult.items}
            columns={[
              { header: "Número", accessor: (r) => r.loan_number },
              { header: "Cliente", accessor: (r) => r.client.full_name },
              { header: "Capital", accessor: (r) => r.principal_amount },
              { header: "Interés", accessor: (r) => r.total_interest },
              { header: "Total", accessor: (r) => r.total_amount },
              { header: "Saldo", accessor: (r) => r.outstanding_principal + r.outstanding_interest },
              { header: "Estado", accessor: (r) => r.status },
              { header: "Inicio", accessor: (r) => r.start_date },
            ]}
          />
        }
      >
        <p className="text-sm text-muted-foreground">{loansResult.total} préstamos en total.</p>
      </ReportSection>

      <ReportSection
        title="Reporte de pagos"
        exportButtons={
          <ExportButtons
            filename="reporte-pagos.csv"
            rows={paymentsResult.items}
            columns={[
              { header: "Recibo", accessor: (r) => r.payment_number },
              { header: "Cliente", accessor: (r) => r.client.full_name },
              { header: "Préstamo", accessor: (r) => r.loan.loan_number },
              { header: "Monto", accessor: (r) => r.amount },
              { header: "Capital", accessor: (r) => r.principal_applied },
              { header: "Interés", accessor: (r) => r.interest_applied },
              { header: "Método", accessor: (r) => r.payment_method },
              { header: "Fecha", accessor: (r) => r.payment_date },
            ]}
          />
        }
      >
        <p className="text-sm text-muted-foreground">
          {paymentsResult.total} pagos {from || to ? "en el rango seleccionado" : "en total"} por{" "}
          {formatCurrency(paymentsResult.items.reduce((s, p) => s + p.amount, 0))}.
        </p>
      </ReportSection>

      <ReportSection
        title="Reporte de clientes"
        exportButtons={
          <ExportButtons
            filename="reporte-clientes.csv"
            rows={clientsResult.items}
            columns={[
              { header: "Código", accessor: (r) => r.client_code },
              { header: "Nombre", accessor: (r) => r.full_name },
              { header: "Cédula", accessor: (r) => r.identification_number ?? "" },
              { header: "Teléfono", accessor: (r) => r.phone ?? "" },
              { header: "Préstamos activos", accessor: (r) => r.active_loans_count },
              { header: "Saldo pendiente", accessor: (r) => r.outstanding_balance },
              { header: "Estado", accessor: (r) => r.status },
              { header: "Registrado", accessor: (r) => r.created_at },
            ]}
          />
        }
      >
        <p className="text-sm text-muted-foreground">{clientsResult.total} clientes registrados.</p>
      </ReportSection>

      <ReportSection
        title="Reporte de intereses"
        exportButtons={
          <ExportButtons
            filename="reporte-intereses.csv"
            rows={interestReport}
            columns={[
              { header: "Préstamo", accessor: (r) => r.loanNumber },
              { header: "Cliente", accessor: (r) => r.clientName },
              { header: "Interés pactado", accessor: (r) => r.interestPactado },
              { header: "Interés cobrado", accessor: (r) => r.interestCobrado },
              { header: "Estado", accessor: (r) => r.status },
            ]}
          />
        }
      >
        <p className="text-sm text-muted-foreground">
          Pactado {formatCurrency(interestReport.reduce((s, r) => s + r.interestPactado, 0))} · Cobrado{" "}
          {formatCurrency(interestReport.reduce((s, r) => s + r.interestCobrado, 0))}
        </p>
      </ReportSection>

      <ReportSection
        title="Reporte de morosidad"
        exportButtons={
          <ExportButtons
            filename="reporte-morosidad.csv"
            rows={delinquentClients}
            columns={[
              { header: "Cliente", accessor: (r) => r.full_name },
              { header: "Código", accessor: (r) => r.client_code },
              { header: "Cuotas vencidas", accessor: (r) => r.overdueInstallments },
              { header: "Monto vencido", accessor: (r) => r.overdueAmount },
            ]}
          />
        }
      >
        <p className="text-sm text-muted-foreground">
          {delinquentClients.length} clientes morosos por{" "}
          {formatCurrency(delinquentClients.reduce((s, c) => s + c.overdueAmount, 0))}.
        </p>
      </ReportSection>

      <ReportSection
        title="Reporte de capital"
        exportButtons={
          <ExportButtons
            filename="reporte-capital.csv"
            rows={capitalMovements.items}
            columns={[
              { header: "Fecha", accessor: (r) => r.transaction_date },
              { header: "Tipo", accessor: (r) => r.type },
              { header: "Descripción", accessor: (r) => r.description ?? "" },
              { header: "Monto", accessor: (r) => r.amount },
            ]}
          />
        }
      >
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
