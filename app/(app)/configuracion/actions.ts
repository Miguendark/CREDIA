"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import * as usersService from "@/services/users.service"
import type { UserRole } from "@/types/database.types"

export async function updateUserRoleAction(
  userId: string,
  role: UserRole
): Promise<{ success: boolean; message?: string }> {
  try {
    const supabase = await createClient()
    await usersService.updateUserRole(supabase, userId, role)
    revalidatePath("/configuracion")
    return { success: true }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo actualizar el rol" }
  }
}
