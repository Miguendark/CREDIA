import type { TypedSupabaseClient } from "@/lib/supabase/types"
import type { Installment } from "@/types/domain"

export interface CollectionInstallment extends Installment {
  loan: {
    id: string
    loan_number: string
    client: {
      id: string
      full_name: string
      client_code: string
      phone: string | null
      whatsapp: string | null
    }
  }
}

export interface CollectionsBuckets {
  dueToday: CollectionInstallment[]
  upcoming: CollectionInstallment[]
  overdue: CollectionInstallment[]
}

/**
 * Cuotas pendientes/parciales de préstamos activos, agrupadas para la
 * pantalla de Cobros: vencen hoy, próximas (siguientes 7 días) y vencidas.
 */
export async function getCollectionsBuckets(supabase: TypedSupabaseClient): Promise<CollectionsBuckets> {
  const { data, error } = await supabase
    .from("installments")
    .select(
      "*, loan:loans!inner(id, loan_number, status, client:clients!inner(id, full_name, client_code, phone, whatsapp))"
    )
    .in("status", ["pendiente", "parcial"])
    .eq("loan.status", "activo")
    .order("due_date", { ascending: true })

  if (error) throw error

  const today = new Date().toISOString().slice(0, 10)
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const items = data as unknown as CollectionInstallment[]
  const buckets: CollectionsBuckets = { dueToday: [], upcoming: [], overdue: [] }

  for (const item of items) {
    if (item.due_date < today) buckets.overdue.push(item)
    else if (item.due_date === today) buckets.dueToday.push(item)
    else if (item.due_date <= in7Days) buckets.upcoming.push(item)
  }

  return buckets
}

export interface DelinquentClient {
  id: string
  full_name: string
  client_code: string
  phone: string | null
  whatsapp: string | null
  overdueInstallments: number
  overdueAmount: number
}

export function getDelinquentClients(overdue: CollectionInstallment[]): DelinquentClient[] {
  const byClient = new Map<string, DelinquentClient>()

  for (const installment of overdue) {
    const client = installment.loan.client
    const existing = byClient.get(client.id) ?? {
      id: client.id,
      full_name: client.full_name,
      client_code: client.client_code,
      phone: client.phone,
      whatsapp: client.whatsapp,
      overdueInstallments: 0,
      overdueAmount: 0,
    }
    existing.overdueInstallments += 1
    existing.overdueAmount += installment.remaining_amount
    byClient.set(client.id, existing)
  }

  return Array.from(byClient.values()).sort((a, b) => b.overdueAmount - a.overdueAmount)
}
