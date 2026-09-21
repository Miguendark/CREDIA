"use client"

import { useEffect, useRef, useState } from "react"
import { Ban, Download, Loader2, Receipt as ReceiptIcon, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ReceiptCard } from "@/components/payments/receipt-card"
import { downloadReceiptImage, receiptCardToBlob, shareReceiptImage } from "@/lib/utils/receipt-image"
import {
  createReceiptAction,
  findReceiptByPaymentIdAction,
  voidReceiptAction,
} from "@/app/(app)/pagos/receipt-actions"
import { voidReceiptSchema } from "@/lib/validations/receipt"
import type { Receipt } from "@/services/receipts.service"

type DialogState = "loading" | "ready" | "error" | "not_found"

const RECEIPT_PREVIEW_SCALE = 0.361
const RECEIPT_PREVIEW_SIZE = Math.round(1080 * RECEIPT_PREVIEW_SCALE)

/**
 * mode "generate": se acaba de registrar un pago (paymentIds = todas las
 * filas que produjo esa llamada) y hay que generar su recibo.
 * mode "reprint": ver/reimprimir el recibo de un pago ya existente
 * (paymentIds = [ese pago]); si no tiene recibo todavía, ofrece generarlo.
 *
 * canVoid: decidido por el servidor (rol del usuario), nunca por este
 * componente — el botón "Anular recibo" solo aparece si viene en true. La
 * seguridad real está en void_receipt (migración 0010), esto solo evita
 * mostrar un botón que igual sería rechazado.
 */
export function ReceiptDialog({
  open,
  onOpenChange,
  paymentIds,
  mode,
  onContinue,
  canVoid = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentIds: string[]
  mode: "generate" | "reprint"
  onContinue?: () => void
  canVoid?: boolean
}) {
  const [state, setState] = useState<DialogState>("loading")
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [isProcessingImage, setIsProcessingImage] = useState(false)
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [voidReason, setVoidReason] = useState("")
  const [voidError, setVoidError] = useState("")
  const [isVoiding, setIsVoiding] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || paymentIds.length === 0) return
    let cancelled = false

    async function generate() {
      setState("loading")
      setErrorMessage("")
      const result = await createReceiptAction(paymentIds)
      if (cancelled) return
      if (result.success) {
        setReceipt(result.receipt)
        setState("ready")
      } else {
        setErrorMessage(result.message)
        setState("error")
      }
    }

    async function load() {
      setVoidDialogOpen(false)
      setVoidReason("")
      setVoidError("")

      if (mode === "generate") {
        await generate()
        return
      }

      setState("loading")
      const existing = await findReceiptByPaymentIdAction(paymentIds[0])
      if (cancelled) return
      if (existing) {
        setReceipt(existing)
        setState("ready")
      } else {
        setState("not_found")
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleGenerateOrRetry() {
    setState("loading")
    setErrorMessage("")
    const result = await createReceiptAction(paymentIds)
    if (result.success) {
      setReceipt(result.receipt)
      setState("ready")
    } else {
      setErrorMessage(result.message)
      setState("error")
    }
  }

  async function handleShare() {
    if (!cardRef.current || !receipt) return
    setIsProcessingImage(true)
    try {
      const blob = await receiptCardToBlob(cardRef.current)
      const outcome = await shareReceiptImage(blob, `${receipt.receipt_number}.png`)
      if (outcome === "unsupported") {
        downloadReceiptImage(blob, `${receipt.receipt_number}.png`)
        toast.success("Comprobante descargado")
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      toast.error("No se pudo generar la imagen del comprobante")
    } finally {
      setIsProcessingImage(false)
    }
  }

  async function handleDownload() {
    if (!cardRef.current || !receipt) return
    setIsProcessingImage(true)
    try {
      const blob = await receiptCardToBlob(cardRef.current)
      downloadReceiptImage(blob, `${receipt.receipt_number}.png`)
      toast.success("Comprobante descargado")
    } catch {
      toast.error("No se pudo generar la imagen del comprobante")
    } finally {
      setIsProcessingImage(false)
    }
  }

  async function handleConfirmVoid() {
    if (!receipt) return
    const parsed = voidReceiptSchema.safeParse({ reason: voidReason })
    if (!parsed.success) {
      setVoidError(parsed.error.issues[0]?.message ?? "Motivo inválido")
      return
    }

    setIsVoiding(true)
    const result = await voidReceiptAction(receipt.id, parsed.data.reason)
    setIsVoiding(false)

    if (result.success) {
      setReceipt(result.receipt)
      setVoidDialogOpen(false)
      setVoidReason("")
      setVoidError("")
      toast.success("Recibo anulado")
    } else {
      setVoidError(result.message)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen && state === "ready" && mode === "generate") {
      onContinue?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Comprobante de pago</DialogTitle>
        </DialogHeader>

        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" />
            <p>Generando comprobante...</p>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="font-medium">Pago registrado, no se pudo generar el recibo</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button onClick={handleGenerateOrRetry}>Reintentar</Button>
          </div>
        )}

        {state === "not_found" && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <ReceiptIcon className="size-8 text-muted-foreground" />
            <p>Este pago todavía no tiene un comprobante generado.</p>
            <Button onClick={handleGenerateOrRetry}>Generar recibo</Button>
          </div>
        )}

        {state === "ready" && receipt && (
          <div className="flex flex-col items-center gap-4">
            <div
              className="overflow-hidden rounded-lg border"
              style={{ width: RECEIPT_PREVIEW_SIZE, height: RECEIPT_PREVIEW_SIZE }}
            >
              <div
                className="origin-top-left"
                style={{ transform: `scale(${RECEIPT_PREVIEW_SCALE})`, width: 1080, height: 1080 }}
              >
                <ReceiptCard receipt={receipt} isCopy={mode === "reprint"} cardRef={cardRef} />
              </div>
            </div>

            <DialogFooter className="w-full flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={handleShare}
                disabled={isProcessingImage || receipt.status === "anulado"}
                className="flex-1"
                title={receipt.status === "anulado" ? "Un recibo anulado no se puede compartir" : undefined}
              >
                {isProcessingImage ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                Compartir por WhatsApp
              </Button>
              <Button variant="outline" onClick={handleDownload} disabled={isProcessingImage} className="flex-1">
                <Download className="size-4" />
                Descargar PNG
              </Button>
            </DialogFooter>

            {canVoid && receipt.status === "activo" && (
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => setVoidDialogOpen(true)}
              >
                <Ban className="size-4" />
                Anular recibo
              </Button>
            )}
          </div>
        )}
      </DialogContent>

      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular el recibo {receipt?.receipt_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anular el recibo no anula el pago ni cambia el saldo del préstamo. El pago sigue registrado tal cual
              está; solo este comprobante queda marcado como anulado. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Textarea
              placeholder="Motivo de la anulación (mínimo 10 caracteres)"
              value={voidReason}
              onChange={(e) => {
                setVoidReason(e.target.value)
                setVoidError("")
              }}
              disabled={isVoiding}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {voidReason.trim().length}/10 caracteres mínimo
            </p>
            {voidError && <p className="text-sm text-destructive">{voidError}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVoiding}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isVoiding || voidReason.trim().length < 10}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmVoid()
              }}
            >
              {isVoiding && <Loader2 className="size-4 animate-spin" />}
              Confirmar anulación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
