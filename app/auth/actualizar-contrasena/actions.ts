"use server"

import { createClient } from "@/lib/supabase/server"
import { updatePasswordSchema, type UpdatePasswordInput } from "@/lib/validations/auth"
import type { AuthActionResult } from "@/app/login/actions"

export async function updatePasswordAction(input: UpdatePasswordInput): Promise<AuthActionResult> {
  const parsed = updatePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { success: false, message: "No se pudo actualizar la contraseña. Solicita un nuevo enlace." }
  }

  return { success: true }
}
