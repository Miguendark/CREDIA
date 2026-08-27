import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { ClientForm } from "@/components/clients/client-form"

export const metadata: Metadata = { title: "Nuevo cliente" }

export default function NuevoClientePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Nuevo cliente" description="Registra un nuevo cliente en el sistema." />
      <ClientForm />
    </div>
  )
}
