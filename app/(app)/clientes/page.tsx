import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { listClients } from "@/services/clients.service"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"
import { Button } from "@/components/ui/button"
import { ClientsFilters } from "@/components/clients/clients-filters"
import { ClientsTable } from "@/components/clients/clients-table"
import type { ClientStatus } from "@/types/database.types"

export const metadata: Metadata = { title: "Clientes" }

const PAGE_SIZE = 20

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  const { q, status, page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const supabase = await createClient()

  const { items, total } = await listClients(supabase, {
    search: q,
    status: (status as ClientStatus) || "todos",
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Administra la información de tus clientes."
        action={
          <Button asChild>
            <Link href="/clientes/nuevo">
              <Plus className="size-4" />
              Nuevo cliente
            </Link>
          </Button>
        }
      />

      <ClientsFilters />

      {items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || status ? "Sin resultados" : "Aún no hay clientes"}
          description={
            q || status
              ? "Ajusta la búsqueda o los filtros para encontrar clientes."
              : "Registra tu primer cliente para empezar a otorgar préstamos."
          }
          action={
            !q && !status ? (
              <Button asChild size="sm">
                <Link href="/clientes/nuevo">
                  <Plus className="size-4" />
                  Nuevo cliente
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ClientsTable items={items} />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            buildHref={(p) => {
              const params = new URLSearchParams()
              if (q) params.set("q", q)
              if (status) params.set("status", status)
              params.set("page", String(p))
              return `/clientes?${params.toString()}`
            }}
          />
        </>
      )}
    </div>
  )
}
