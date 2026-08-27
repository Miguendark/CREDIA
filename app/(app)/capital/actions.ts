"use server"

import { revalidatePath } from "next/cache"
import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { capitalMovementSchema, type CapitalMovementInput } from "@/lib/validations/capital"
import * as capitalService from "@/services/capital.service"

export type CapitalActionResult = { success: true } | { success: false; message: string }

export async function registerCapitalMovementAction(input: CapitalMovementInput): Promise<CapitalActionResult> {
  const parsed = capitalMovementSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  try {
    const supabase = await createSupabaseClient()
    await capitalService.registerCapitalMovement(supabase, parsed.data)
    revalidatePath("/capital")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo registrar el movimiento" }
  }
}
