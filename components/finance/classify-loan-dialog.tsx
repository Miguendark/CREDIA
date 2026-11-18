"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { classifyLoanAction } from "@/app/(app)/finanzas/actions"
import { cn } from "@/lib/utils"
import type { WriteoffKind } from "@/types/database.types"

export interface ClassifiableLoan {
  loanId: string
  loanNumber: string
  /** Una línea: atraso, saldo, etc. */
  detail: string
  /** Fecha sugerida (cancelación o hoy). */
  defaultDate: string
  /** No se puede marcar antes del inicio del préstamo; la base lo valida. */
  minDate?: string
}

const KINDS: { value: WriteoffKind; label: string; help: string }[] = [
  {
    value: "incobrable",
    label: "Incobrable",
    help: "El cliente no va a pagar. El capital no recuperado cuenta como pérdida en la fecha que indiques.",
  },
  {
    value: "error",
    label: "Error al crearlo",
    help: "El préstamo no debió existir. No cuenta como pérdida.",
  },
]

/**
 * Clasificar un préstamo (solo admin, motivo obligatorio). No modifica el
 * préstamo: en Dashboard, Capital y Cobros sigue igual; solo Finanzas lo
 * trata como pérdida.
 * - mode "cancelled": un préstamo cancelado → incobrable o error.
 * - mode "active": préstamos atrasados de un cliente → solo incobrable.
 */
export function ClassifyLoanDialog({
  mode,
  loans,
  today,
  clientName,
}: {
  mode: "cancelled" | "active"
  loans: ClassifiableLoan[]
  today: string
  clientName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loanId, setLoanId] = useState(loans[0]?.loanId ?? "")
  const loan = loans.find((l) => l.loanId === loanId) ?? loans[0]
  const [kind, setKind] = useState<WriteoffKind>("incobrable")
  const [date, setDate] = useState(loan?.defaultDate ?? today)
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const kinds = mode === "active" ? KINDS.filter((k) => k.value === "incobrable") : KINDS
  const valid = !!loan && reason.trim().length >= 3 && !!date && date <= today

  function reset() {
    setLoanId(loans[0]?.loanId ?? "")
    setKind("incobrable")
    setDate(loans[0]?.defaultDate ?? today)
    setReason("")
  }

  async function onConfirm() {
    if (!loan) return
    setIsSubmitting(true)
    const result = await classifyLoanAction({ loan_id: loan.loanId, kind, reason: reason.trim(), writeoff_date: date })
    setIsSubmitting(false)
    if (!result.success) {
      toast.error(result.message)
      return
    }
    toast.success(
      kind === "incobrable" ? `${loan.loanNumber} marcado como incobrable` : `${loan.loanNumber} marcado como error`
    )
    setOpen(false)
    reset()
    router.refresh()
  }

  if (loans.length === 0) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
          {mode === "active" ? "Marcar incobrable" : "Clasificar"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "active" ? "Marcar incobrable" : `Clasificar ${loan?.loanNumber}`}</DialogTitle>
          <DialogDescription>
            {clientName}. El préstamo no cambia: Dashboard, Capital y Cobros lo siguen mostrando igual. Solo Finanzas lo
            trata como pérdida. Se puede quitar después.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "active" && (
            <div className="space-y-2">
              <Label>Préstamo *</Label>
              {loans.length === 1 ? (
                <p className="rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{loan?.loanNumber}</span>
                  <span className="ml-2 text-muted-foreground">{loan?.detail}</span>
                </p>
              ) : (
                <Select
                  value={loanId}
                  onValueChange={(v) => {
                    setLoanId(v)
                    setDate(loans.find((l) => l.loanId === v)?.defaultDate ?? today)
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {loans.map((l) => (
                      <SelectItem key={l.loanId} value={l.loanId}>
                        {l.loanNumber} · {l.detail}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {mode === "cancelled" && <p className="text-sm text-muted-foreground">{loan?.detail}</p>}

          {kinds.length > 1 && (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo">
              {kinds.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.value}
                  disabled={isSubmitting}
                  onClick={() => setKind(k.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm transition-colors",
                    kind === k.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
                  )}
                >
                  <span className="font-medium">{k.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{k.help}</span>
                </button>
              ))}
            </div>
          )}
          {kinds.length === 1 && <p className="text-sm text-muted-foreground">{kinds[0].help}</p>}

          <div className="space-y-2">
            <Label htmlFor="classify-date">{kind === "incobrable" ? "Fecha de la pérdida *" : "Fecha *"}</Label>
            <Input
              id="classify-date"
              type="date"
              value={date}
              min={loan?.minDate}
              max={today}
              disabled={isSubmitting}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="classify-reason">Motivo *</Label>
            <Textarea
              id="classify-reason"
              rows={3}
              maxLength={255}
              value={reason}
              disabled={isSubmitting}
              onChange={(e) => setReason(e.target.value)}
              placeholder={kind === "incobrable" ? "Ej.: no responde desde octubre" : "Ej.: la cuota se creó mal"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting || !valid}
            onClick={onConfirm}
            variant={kind === "incobrable" ? "destructive" : "default"}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {kind === "incobrable" ? "Marcar incobrable" : "Marcar como error"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
