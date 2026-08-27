import type { Metadata } from "next"
import Link from "next/link"
import { HandCoins, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { listLoans, type LoanFilterStatus } from "@/services/loans.service"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"
import { Button } from "@/components/ui/button"
import { LoansFilters } from "@/components/loans/loans-filters"
import { LoansTable } from "@/components/loans/loans-table"

export const metadata: Metadata = { title: "Préstamos" }

const PAGE_SIZE = 20

export default async function PrestamosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  const { q, status, page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const supabase = await createClient()

  const { items, total } = await listLoans(supabase, {
    search: q,
    status: (status as LoanFilterStatus) || "todos",
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Préstamos"
        description="Consulta y administra los préstamos otorgados."
        action={
          <Button asChild>
            <Link href="/prestamos/nuevo">
              <Plus className="size-4" />
              Nuevo préstamo
            </Link>
          </Button>
        }
      />

      <LoansFilters />

      {items.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={q || status ? "Sin resultados" : "Aún no hay préstamos"}
          description={
            q || status
              ? "Ajusta la búsqueda o los filtros."
              : "Crea el primer préstamo para un cliente registrado."
          }
        />
      ) : (
        <>
          <LoansTable items={items} />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            buildHref={(p) => {
              const params = new URLSearchParams()
              if (q) params.set("q", q)
              if (status) params.set("status", status)
              params.set("page", String(p))
              return `/prestamos?${params.toString()}`
            }}
          />
        </>
      )}
    </div>
  )
}
