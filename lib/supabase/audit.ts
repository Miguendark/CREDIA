import type { TypedSupabaseClient } from "./types"

export interface AuditLogInput {
  action: string
  entity: string
  entity_id?: string | null
  description?: string | null
}

/** Registra una entrada de auditoría a nombre del usuario autenticado actual. */
export async function logAudit(supabase: TypedSupabaseClient, input: AuditLogInput): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: input.action,
    entity: input.entity,
    entity_id: input.entity_id ?? null,
    description: input.description ?? null,
  })
}
