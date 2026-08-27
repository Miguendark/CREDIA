import type { TypedSupabaseClient } from "@/lib/supabase/types"
import { logAudit } from "@/lib/supabase/audit"
import type { UserRole } from "@/types/database.types"
import type { StaffUser } from "@/types/domain"

export async function listUsers(supabase: TypedSupabaseClient): Promise<StaffUser[]> {
  const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: true })
  if (error) throw error
  return data
}

export async function getCurrentStaffUser(supabase: TypedSupabaseClient): Promise<StaffUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.from("users").select("*").eq("id", user.id).maybeSingle()
  if (error) throw error
  return data
}

export async function updateUserRole(
  supabase: TypedSupabaseClient,
  userId: string,
  role: UserRole
): Promise<StaffUser> {
  const { data, error } = await supabase.from("users").update({ role }).eq("id", userId).select().single()
  if (error) throw error

  await logAudit(supabase, {
    action: "cambiar_rol_usuario",
    entity: "users",
    entity_id: userId,
    description: `Rol de ${data.name} cambiado a ${role}`,
  })

  return data
}
