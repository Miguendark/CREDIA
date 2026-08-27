import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCollectionsBuckets, getDelinquentClients } from "@/services/collections.service"
import { PageHeader } from "@/components/shared/page-header"
import { CollectionsList } from "@/components/collections/collections-list"
import { DelinquentClientsList } from "@/components/collections/delinquent-clients-list"

export const metadata: Metadata = { title: "Cobros" }
export const revalidate = 0

export default async function CobrosPage() {
  const supabase = await createClient()
  const buckets = await getCollectionsBuckets(supabase)
  const delinquentClients = getDelinquentClients(buckets.overdue)

  return (
    <div className="space-y-8">
      <PageHeader title="Cobros" description="Seguimiento de cuotas por vencer, vencidas y clientes morosos." />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Pagos de hoy <span className="text-sm font-normal text-muted-foreground">({buckets.dueToday.length})</span>
        </h2>
        <CollectionsList items={buckets.dueToday} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Próximos pagos{" "}
          <span className="text-sm font-normal text-muted-foreground">(7 días · {buckets.upcoming.length})</span>
        </h2>
        <CollectionsList items={buckets.upcoming} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-status-critical">
          Pagos vencidos{" "}
          <span className="text-sm font-normal text-muted-foreground">({buckets.overdue.length})</span>
        </h2>
        <CollectionsList items={buckets.overdue} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Clientes morosos{" "}
          <span className="text-sm font-normal text-muted-foreground">({delinquentClients.length})</span>
        </h2>
        <DelinquentClientsList items={delinquentClients} />
      </section>
    </div>
  )
}
