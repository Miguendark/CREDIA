"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { sendAgentMessageAction } from "@/app/(app)/whatsapp/actions"

export function ReplyForm({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const [content, setContent] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSend() {
    if (!content.trim()) return
    setIsSubmitting(true)
    const result = await sendAgentMessageAction(conversationId, content)
    setIsSubmitting(false)

    if (!result.success) {
      toast.error(result.message)
      return
    }

    setContent("")
    router.refresh()
  }

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escribe una respuesta (registro manual — sin envío real por WhatsApp aún)..."
        rows={2}
        disabled={isSubmitting}
        className="resize-none"
      />
      <Button onClick={handleSend} disabled={isSubmitting || !content.trim()} size="icon">
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </Button>
    </div>
  )
}
