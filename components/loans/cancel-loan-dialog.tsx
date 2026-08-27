"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Ban, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cancelLoanAction } from "@/app/(app)/prestamos/actions"

export function CancelLoanDialog({ loanId, loanNumber }: { loanId: string; loanNumber: string }) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleConfirm() {
    setIsSubmitting(true)
    const result = await cancelLoanAction(loanId, reason || "Sin motivo especificado")
    setIsSubmitting(false)

    if (!result.success) {
      toast.error(result.message ?? "No se pudo cancelar el préstamo")
      return
    }

    toast.success("Préstamo cancelado")
    setOpen(false)
    router.refresh()
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-status-critical hover:text-status-critical">
          <Ban className="size-4" />
          Cancelar préstamo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar el préstamo {loanNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción marca el préstamo como cancelado. Las cuotas ya pagadas no se revierten. Indica el motivo
            para el registro de auditoría.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Motivo de la cancelación..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Volver</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Confirmar cancelación
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
