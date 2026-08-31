"use client"

import { ExportButtons } from "./export-buttons"
import type { CsvColumn } from "@/lib/reports/csv"
import type { ClientListItem, LoanWithClient, PaymentWithRelations, CapitalTransaction } from "@/types/domain"
import type { InterestReportRow } from "@/services/reports.service"
import type { DelinquentClient } from "@/services/collections.service"

/**
 * Cada export de abajo define sus propias columnas (con funciones accessor)
 * dentro de este módulo de cliente. Un Server Component NUNCA debe construir
 * ese arreglo de columnas y pasarlo como prop — las funciones no pueden
 * cruzar el límite server -> client. Por eso la página de Reportes solo pasa
 * `rows` (datos planos) a estos componentes.
 */

const loanColumns: CsvColumn<LoanWithClient>[] = [
  { header: "Número", accessor: (r) => r.loan_number },
  { header: "Cliente", accessor: (r) => r.client.full_name },
  { header: "Capital", accessor: (r) => r.principal_amount },
  { header: "Interés", accessor: (r) => r.total_interest },
  { header: "Total", accessor: (r) => r.total_amount },
  { header: "Saldo", accessor: (r) => r.outstanding_principal + r.outstanding_interest },
  { header: "Estado", accessor: (r) => r.status },
  { header: "Inicio", accessor: (r) => r.start_date },
]

export function LoansExport({ rows }: { rows: LoanWithClient[] }) {
  return <ExportButtons rows={rows} columns={loanColumns} filename="reporte-prestamos.csv" />
}

const paymentColumns: CsvColumn<PaymentWithRelations>[] = [
  { header: "Recibo", accessor: (r) => r.payment_number },
  { header: "Cliente", accessor: (r) => r.client.full_name },
  { header: "Préstamo", accessor: (r) => r.loan.loan_number },
  { header: "Monto", accessor: (r) => r.amount },
  { header: "Capital", accessor: (r) => r.principal_applied },
  { header: "Interés", accessor: (r) => r.interest_applied },
  { header: "Método", accessor: (r) => r.payment_method },
  { header: "Fecha", accessor: (r) => r.payment_date },
]

export function PaymentsExport({ rows }: { rows: PaymentWithRelations[] }) {
  return <ExportButtons rows={rows} columns={paymentColumns} filename="reporte-pagos.csv" />
}

const clientColumns: CsvColumn<ClientListItem>[] = [
  { header: "Código", accessor: (r) => r.client_code },
  { header: "Nombre", accessor: (r) => r.full_name },
  { header: "Cédula", accessor: (r) => r.identification_number ?? "" },
  { header: "Teléfono", accessor: (r) => r.phone ?? "" },
  { header: "Préstamos activos", accessor: (r) => r.active_loans_count },
  { header: "Saldo pendiente", accessor: (r) => r.outstanding_balance },
  { header: "Estado", accessor: (r) => r.status },
  { header: "Registrado", accessor: (r) => r.created_at },
]

export function ClientsExport({ rows }: { rows: ClientListItem[] }) {
  return <ExportButtons rows={rows} columns={clientColumns} filename="reporte-clientes.csv" />
}

const interestColumns: CsvColumn<InterestReportRow>[] = [
  { header: "Préstamo", accessor: (r) => r.loanNumber },
  { header: "Cliente", accessor: (r) => r.clientName },
  { header: "Interés pactado", accessor: (r) => r.interestPactado },
  { header: "Interés cobrado", accessor: (r) => r.interestCobrado },
  { header: "Estado", accessor: (r) => r.status },
]

export function InterestExport({ rows }: { rows: InterestReportRow[] }) {
  return <ExportButtons rows={rows} columns={interestColumns} filename="reporte-intereses.csv" />
}

const delinquencyColumns: CsvColumn<DelinquentClient>[] = [
  { header: "Cliente", accessor: (r) => r.full_name },
  { header: "Código", accessor: (r) => r.client_code },
  { header: "Cuotas vencidas", accessor: (r) => r.overdueInstallments },
  { header: "Monto vencido", accessor: (r) => r.overdueAmount },
]

export function DelinquencyExport({ rows }: { rows: DelinquentClient[] }) {
  return <ExportButtons rows={rows} columns={delinquencyColumns} filename="reporte-morosidad.csv" />
}

const capitalColumns: CsvColumn<CapitalTransaction>[] = [
  { header: "Fecha", accessor: (r) => r.transaction_date },
  { header: "Tipo", accessor: (r) => r.type },
  { header: "Descripción", accessor: (r) => r.description ?? "" },
  { header: "Monto", accessor: (r) => r.amount },
]

export function CapitalExport({ rows }: { rows: CapitalTransaction[] }) {
  return <ExportButtons rows={rows} columns={capitalColumns} filename="reporte-capital.csv" />
}
