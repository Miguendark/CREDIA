import type { TypedSupabaseClient } from "@/lib/supabase/types"
import type { AuditLog } from "@/types/domain"

export async function listAuditLogs(
  supabase: TypedSupabaseClient,
  params: { page?: number; pageSize?: number; entityId?: string } = {}
): Promise<{ items: AuditLog[]; total: number }> {
  const { page = 1, pageSize = 30, entityId } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from("audit_logs").select("*", { count: "exact" })
  if (entityId) query = query.eq("entity_id", entityId)

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to)

  if (error) throw error
  return { items: data, total: count ?? 0 }
}
