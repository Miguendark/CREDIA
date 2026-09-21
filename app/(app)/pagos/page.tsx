import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Receipt } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { listPayments } from "@/services/payments.service"
import { getCurrentStaffUser } from "@/services/users.service"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"
import { Button } from "@/components/ui/button"
import { PaymentsFilters } from "@/components/payments/payments-filters"
import { PaymentsTable } from "@/components/payments/payments-table"
import type { PaymentMethod } from "@/types/database.types"

export const metadata: Metadata = { title: "Pagos" }

const PAGE_SIZE = 25

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; method?: string; page?: string }>
}) {
  const { from, to, method, page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const supabase = await createClient()

  const [{ items, total }, staffUser] = await Promise.all([
    listPayments(supabase, {
      dateFrom: from,
      dateTo: to,
      paymentMethod: method as PaymentMethod | undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    getCurrentStaffUser(supabase),
  ])
  const canVoidReceipts = staffUser?.role === "admin" || staffUser?.role === "supervisor"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        description="Historial de todos los pagos registrados."
        action={
          <Button asChild>
            <Link href="/pagos/nuevo">
              <Plus className="size-4" />
              Registrar pago
            </Link>
          </Button>
        }
      />

      <PaymentsFilters />

      {items.length === 0 ? (
        <EmptyState icon={Receipt} title="Sin pagos" description="Aún no se han registrado pagos." />
      ) : (
        <>
          <PaymentsTable items={items} canVoidReceipts={canVoidReceipts} />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            buildHref={(p) => {
              const params = new URLSearchParams()
              if (from) params.set("from", from)
              if (to) params.set("to", to)
              if (method) params.set("method", method)
              params.set("page", String(p))
              return `/pagos?${params.toString()}`
            }}
          />
        </>
      )}
    </div>
  )
}
