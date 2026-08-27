import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getClientById } from "@/services/clients.service"
import { PageHeader } from "@/components/shared/page-header"
import { LoanForm } from "@/components/loans/loan-form"

export const metadata: Metadata = { title: "Nuevo préstamo" }

export default async function NuevoPrestamoPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>
}) {
  const { clienteId } = await searchParams

  let preselectedClientLabel: string | undefined
  if (clienteId) {
    const supabase = await createClient()
    const client = await getClientById(supabase, clienteId)
    if (client) preselectedClientLabel = `${client.full_name} · ${client.client_code}`
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo préstamo" description="Calcula y registra un nuevo préstamo para un cliente." />
      <LoanForm preselectedClientId={clienteId} preselectedClientLabel={preselectedClientLabel} />
    </div>
  )
}
