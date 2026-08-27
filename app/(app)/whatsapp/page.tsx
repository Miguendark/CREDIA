import type { Metadata } from "next"
import Link from "next/link"
import { MessageCircle, WifiOff } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { listConversations, getConversationMessages } from "@/services/whatsapp.service"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { ReplyForm } from "@/components/whatsapp/reply-form"
import { formatDate } from "@/lib/utils/format"

export const metadata: Metadata = { title: "WhatsApp / Chatbot" }
export const revalidate = 0

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-status-warning/15 text-warning-foreground border-status-warning/25" },
  atendida: { label: "Atendida", className: "bg-status-good/10 text-status-good border-status-good/20" },
  cerrada: { label: "Cerrada", className: "bg-muted text-muted-foreground border-transparent" },
}

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { c: conversationId } = await searchParams
  const supabase = await createClient()

  const conversations = await listConversations(supabase)
  const selected = conversationId ? conversations.find((c) => c.id === conversationId) : conversations[0]
  const messages = selected ? await getConversationMessages(supabase, selected.id) : []

  const pendingCount = conversations.filter((c) => c.status === "pendiente").length
  const attendedCount = conversations.filter((c) => c.status === "atendida").length

  return (
    <div className="space-y-6">
      <PageHeader title="WhatsApp / Chatbot" description="Bandeja de atención al cliente y estado del chatbot." />

      <Alert>
        <WifiOff className="size-4" />
        <AlertTitle>Chatbot no conectado</AlertTitle>
        <AlertDescription>
          La interfaz está preparada, pero la integración con la API oficial de WhatsApp y el chatbot automático aún
          no están activas. Los mensajes de esta bandeja se registran manualmente.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Conversaciones" value={conversations.length} />
        <StatCard label="Pendientes" value={pendingCount} tone="warning" />
        <StatCard label="Atendidas" value={attendedCount} tone="good" />
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Sin conversaciones"
          description="Cuando se conecte WhatsApp, las conversaciones de los clientes aparecerán aquí automáticamente."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 overflow-hidden rounded-xl border border-border lg:grid-cols-3">
          <div className="divide-y divide-border overflow-y-auto lg:col-span-1 lg:max-h-[32rem]">
            {conversations.map((conversation) => {
              const status = STATUS_LABELS[conversation.status]
              const isActive = selected?.id === conversation.id
              return (
                <Link
                  key={conversation.id}
                  href={`/whatsapp?c=${conversation.id}`}
                  className={cn("block px-4 py-3 hover:bg-muted/60", isActive && "bg-muted")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">
                      {conversation.client?.full_name ?? conversation.phone_number}
                    </p>
                    <Badge variant="outline" className={cn("shrink-0", status.className)}>
                      {status.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{conversation.phone_number}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(conversation.last_message_at)}</p>
                </Link>
              )
            })}
          </div>

          <div className="flex flex-col lg:col-span-2 lg:max-h-[32rem]">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Selecciona una conversación
              </div>
            ) : (
              <>
                <div className="border-b border-border px-4 py-3">
                  <p className="font-medium">{selected.client?.full_name ?? selected.phone_number}</p>
                  <p className="text-xs text-muted-foreground">{selected.phone_number}</p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">Sin mensajes en esta conversación.</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn("flex", message.sender === "cliente" ? "justify-start" : "justify-end")}
                      >
                        <div
                          className={cn(
                            "max-w-xs rounded-2xl px-3.5 py-2 text-sm",
                            message.sender === "cliente"
                              ? "bg-muted text-foreground"
                              : "bg-primary text-primary-foreground"
                          )}
                        >
                          <p>{message.content}</p>
                          <p className="mt-1 text-[10px] opacity-70">{formatDate(message.created_at)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <ReplyForm conversationId={selected.id} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "good" | "warning" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "good" && "text-status-good",
          tone === "warning" && "text-warning-foreground"
        )}
      >
        {value}
      </p>
    </div>
  )
}
