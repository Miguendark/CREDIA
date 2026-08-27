import type { TypedSupabaseClient } from "@/lib/supabase/types"
import { logAudit } from "@/lib/supabase/audit"
import type { WhatsappConversationWithClient, WhatsappMessage } from "@/types/domain"

const CONVERSATION_WITH_CLIENT_SELECT = "*, client:clients(id, full_name, client_code)"

export async function listConversations(supabase: TypedSupabaseClient): Promise<WhatsappConversationWithClient[]> {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select(CONVERSATION_WITH_CLIENT_SELECT)
    .order("last_message_at", { ascending: false })

  if (error) throw error
  return data as unknown as WhatsappConversationWithClient[]
}

export async function getConversationMessages(
  supabase: TypedSupabaseClient,
  conversationId: string
): Promise<WhatsappMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return data
}

export async function sendAgentMessage(
  supabase: TypedSupabaseClient,
  conversationId: string,
  content: string
): Promise<WhatsappMessage> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .insert({ conversation_id: conversationId, sender: "agente", content })
    .select()
    .single()
  if (error) throw error

  await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString(), status: "atendida" })
    .eq("id", conversationId)

  await logAudit(supabase, {
    action: "responder_whatsapp",
    entity: "whatsapp_conversations",
    entity_id: conversationId,
    description: "Mensaje registrado manualmente (sin integración real con WhatsApp aún)",
  })

  return data
}
