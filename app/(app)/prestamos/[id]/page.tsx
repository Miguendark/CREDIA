import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { HandCoins, PiggyBank, Receipt, Wallet } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getLoanById, listInstallmentsByLoan } from "@/services/loans.service"
import { listPayments } from "@/services/payments.service"
import { getCurrentStaffUser } from "@/services/users.service"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
import { LoanStatusBadge } from "@/components/shared/badges"
import { InstallmentsTable } from "@/components/loans/installments-table"
import { PaymentsTable } from "@/components/payments/payments-table"
import { CancelLoanDialog } from "@/components/loans/cancel-loan-dialog"
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils/format"
import { INTEREST_TYPE_LABELS } from "@/lib/finance/loan-calculator"
import { FREQUENCY_LABELS } from "@/lib/finance/frequency"
import { isLoanOverdue } from "@/types/domain"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const loan = await getLoanById(supabase, id)
  return { title: loan ? `Préstamo ${loan.loan_number}` : "Préstamo" }
}

export default async function PrestamoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const loan = await getLoanById(supabase, id)
  if (!loan) notFound()

  const [installments, paymentsResult, staffUser] = await Promise.all([
    listInstallmentsByLoan(supabase, id),
    listPayments(supabase, { loanId: id, pageSize: 50 }),
    getCurrentStaffUser(supabase),
  ])

  const canCancel = loan.status === "activo"
  const canVoidReceipts = staffUser?.role === "admin" || staffUser?.role === "supervisor"

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Préstamo ${loan.loan_number}`}
        description={
          <>
            <Link href={`/clientes/${loan.client.id}`} className="hover:underline">
              {loan.client.full_name}
            </Link>
            {" · "}
            {INTEREST_TYPE_LABELS[loan.interest_type]} ({formatPercent(loan.interest_rate)}) ·{" "}
            {FREQUENCY_LABELS[loan.frequency]}
          </>
        }
        action={
          <>
            {canCancel && <CancelLoanDialog loanId={loan.id} loanNumber={loan.loan_number} />}
            <Button asChild>
              <Link href={`/pagos/nuevo?loanId=${loan.id}`}>
                <Receipt className="size-4" />
                Registrar pago
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2">
        <LoanStatusBadge status={loan.status} overdue={isLoanOverdue(loan)} />
        <span className="text-sm text-muted-foreground">
          Inicio {formatDate(loan.start_date)} · Primer pago {formatDate(loan.first_payment_date)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Capital" value={formatCurrency(loan.principal_amount)} icon={HandCoins} />
        <MetricCard label="Total a pagar" value={formatCurrency(loan.total_amount)} icon={Wallet} />
        <MetricCard label="Pagado" value={formatCurrency(loan.total_paid)} icon={PiggyBank} tone="good" />
        <MetricCard
          label="Saldo pendiente"
          value={formatCurrency(loan.outstanding_principal + loan.outstanding_interest)}
          icon={Receipt}
          tone="warning"
        />
      </div>

      {loan.notes && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Observaciones: </span>
            {loan.notes}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Cuotas</h2>
        <InstallmentsTable items={installments} loanId={loan.id} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Pagos</h2>
        {paymentsResult.items.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin pagos registrados" />
        ) : (
          <PaymentsTable items={paymentsResult.items} showClient={false} canVoidReceipts={canVoidReceipts} />
        )}
      </div>
    </div>
  )
}
