"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import * as whatsappService from "@/services/whatsapp.service"

export async function sendAgentMessageAction(
  conversationId: string,
  content: string
): Promise<{ success: boolean; message?: string }> {
  if (!content.trim()) return { success: false, message: "El mensaje no puede estar vacío" }

  try {
    const supabase = await createClient()
    await whatsappService.sendAgentMessage(supabase, conversationId, content.trim())
    revalidatePath("/whatsapp")
    return { success: true }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo enviar el mensaje" }
  }
}
