"use client"

import { useState, type RefObject } from "react"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import type { Receipt } from "@/services/receipts.service"

const HEADER_BLUE = "#0B1F4B"
const FOOTER_GREEN = "#5CC332"
const AMOUNT_GREEN = "#16A34A"

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-DO", { hour: "2-digit", minute: "2-digit", hour12: true }).format(
    new Date(value)
  )
}

/**
 * Comprobante de pago, dibujado siempre a 1080x1080px exactos (el tamaño
 * real, no depende del zoom con el que se muestre en pantalla) para que
 * lib/utils/receipt-image.ts lo capture como PNG cuadrado listo para
 * compartir. `installments_label` se muestra tal cual — si empieza con
 * "Abono a" (pago parcial), no se reformatea.
 */
export function ReceiptCard({
  receipt,
  isCopy = false,
  cardRef,
}: {
  receipt: Receipt
  isCopy?: boolean
  cardRef?: RefObject<HTMLDivElement | null>
}) {
  const [logoFailed, setLogoFailed] = useState(false)

  const percent =
    receipt.total_installments > 0
      ? Math.min(100, Math.round((receipt.installments_paid_count / receipt.total_installments) * 100))
      : 0

  return (
    <div
      ref={cardRef}
      className="relative flex h-[1080px] w-[1080px] flex-col overflow-hidden bg-white text-neutral-900"
    >
      {isCopy && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="-rotate-[30deg] select-none text-[110px] font-bold uppercase tracking-widest text-black/10">
            Copia
          </span>
        </div>
      )}

      <header
        className="flex items-center justify-between px-16 py-12 text-white"
        style={{ backgroundColor: HEADER_BLUE }}
      >
        <div className="flex items-center gap-6">
          {logoFailed ? (
            <div className="flex size-20 items-center justify-center rounded-full bg-white/10 text-lg font-bold tracking-tight">
              CREDIA
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/logo-credia.png"
              alt="CREDIA"
              className="size-20 object-contain"
              onError={() => setLogoFailed(true)}
            />
          )}
          <div>
            <p className="text-3xl font-bold">Comprobante de pago</p>
            <p className="text-lg text-white/70">{receipt.receipt_number}</p>
          </div>
        </div>
        <div className="text-right text-lg text-white/80">
          <p>{formatDate(receipt.created_at)}</p>
          <p>{formatTime(receipt.created_at)}</p>
        </div>
      </header>

      {receipt.status === "anulado" && (
        <div className="bg-red-600 px-16 py-4 text-center text-2xl font-bold uppercase tracking-wide text-white">
          Anulado — {receipt.void_reason}
        </div>
      )}

      <main className="flex flex-1 flex-col gap-10 px-16 py-12">
        <div>
          <p className="text-sm uppercase tracking-wide text-neutral-500">Cliente</p>
          <p className="text-2xl font-semibold">{receipt.client_name}</p>
          <p className="text-neutral-500">
            {receipt.client_code} · Préstamo {receipt.loan_number}
          </p>
        </div>

        <div>
          <p className="text-sm uppercase tracking-wide text-neutral-500">Monto pagado</p>
          <p className="text-6xl font-bold" style={{ color: AMOUNT_GREEN }}>
            {formatCurrency(receipt.amount_paid)}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xl font-medium">{receipt.installments_label}</p>
            <p className="text-xl font-medium text-neutral-500">{percent}%</p>
          </div>
          <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full"
              style={{ width: `${percent}%`, backgroundColor: FOOTER_GREEN }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 border-t border-neutral-200 pt-8">
          <div>
            <p className="text-sm uppercase tracking-wide text-neutral-500">Saldo pendiente</p>
            <p className="text-2xl font-semibold">{formatCurrency(receipt.outstanding_balance)}</p>
          </div>
          <div>
            <p className="text-sm uppercase tracking-wide text-neutral-500">Próxima cuota</p>
            <p className="text-2xl font-semibold">
              {receipt.next_payment_date ? formatDate(receipt.next_payment_date) : "Préstamo saldado"}
            </p>
          </div>
        </div>
      </main>

      <footer
        className="flex items-center justify-between px-16 py-10 text-white"
        style={{ backgroundColor: FOOTER_GREEN }}
      >
        <p className="text-xl font-semibold">Préstamos que impulsan tus sueños</p>
        <p className="text-lg">Cobró: {receipt.collector_name}</p>
      </footer>
    </div>
  )
}
