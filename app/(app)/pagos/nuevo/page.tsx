import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getClientById } from "@/services/clients.service"
import { getLoanById } from "@/services/loans.service"
import { PageHeader } from "@/components/shared/page-header"
import { PaymentForm } from "@/components/payments/payment-form"

export const metadata: Metadata = { title: "Registrar pago" }

export default async function NuevoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string; loanId?: string; installmentId?: string }>
}) {
  const { clienteId, loanId, installmentId } = await searchParams
  const supabase = await createClient()

  let resolvedClientId = clienteId
  let preselectedClientLabel: string | undefined

  if (loanId && !clienteId) {
    const loan = await getLoanById(supabase, loanId)
    if (loan) {
      resolvedClientId = loan.client_id
      preselectedClientLabel = `${loan.client.full_name} · ${loan.client.client_code}`
    }
  } else if (clienteId) {
    const client = await getClientById(supabase, clienteId)
    if (client) preselectedClientLabel = `${client.full_name} · ${client.client_code}`
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Registrar pago" description="Aplica un pago a una cuota de un préstamo activo." />
      <PaymentForm
        preselectedClientId={resolvedClientId}
        preselectedClientLabel={preselectedClientLabel}
        preselectedLoanId={loanId}
        preselectedInstallmentId={installmentId}
      />
    </div>
  )
}
