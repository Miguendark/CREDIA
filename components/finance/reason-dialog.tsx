"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { voidExpenseAction, voidWriteoffAction } from "@/app/(app)/finanzas/actions"

const ACTIONS = {
  expense: {
    run: voidExpenseAction,
    button: "Anular",
    title: "Anular gasto",
    confirm: "Anular gasto",
    done: "Gasto anulado",
  },
  writeoff: {
    run: voidWriteoffAction,
    button: "Quitar",
    title: "Quitar clasificación",
    confirm: "Quitar clasificación",
    done: "Clasificación quitada",
  },
} as const

/**
 * Acción de solo admin que pide motivo: anular un gasto o quitar la
 * clasificación de un préstamo. No se borra nada: queda registrado quién,
 * cuándo y por qué.
 */
export function ReasonDialog({
  kind,
  id,
  description,
}: {
  kind: keyof typeof ACTIONS
  id: string
  /** Qué se va a anular, en una línea. */
  description: string
}) {
  const a = ACTIONS[kind]
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const tooShort = reason.trim().length < 3

  async function onConfirm() {
    setIsSubmitting(true)
    const result = await a.run({ id, reason: reason.trim() })
    setIsSubmitting(false)
    if (!result.success) {
      toast.error(result.message)
      return
    }
    toast.success(a.done)
    setReason("")
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-status-critical">
          {a.button}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{a.title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`reason-${id}`}>Motivo *</Label>
          <Textarea
            id={`reason-${id}`}
            rows={3}
            maxLength={255}
            value={reason}
            disabled={isSubmitting}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: registrado dos veces"
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={isSubmitting || tooShort} onClick={onConfirm}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {a.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
