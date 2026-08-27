import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getClientById } from "@/services/clients.service"
import { PageHeader } from "@/components/shared/page-header"
import { ClientForm } from "@/components/clients/client-form"

export const metadata: Metadata = { title: "Editar cliente" }

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const client = await getClientById(supabase, id)
  if (!client) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Editar cliente" description={client.full_name} />
      <ClientForm client={client} />
    </div>
  )
}
