"use server"

import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { voidReceiptSchema } from "@/lib/validations/receipt"
import * as receiptsService from "@/services/receipts.service"
import type { Receipt } from "@/services/receipts.service"

export type ReceiptActionResult =
  | { success: true; receipt: Receipt }
  | { success: false; message: string }

/** Genera el recibo de un grupo de pagos, o devuelve el ya vigente (nunca es un error). */
export async function createReceiptAction(paymentIds: string[]): Promise<ReceiptActionResult> {
  if (paymentIds.length === 0) {
    return { success: false, message: "No se indicó ningún pago" }
  }
  try {
    const supabase = await createSupabaseClient()
    const receipt = await receiptsService.createOrFetchReceipt(supabase, paymentIds)
    return { success: true, receipt }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo generar el recibo" }
  }
}

/** Busca el recibo vigente que cubre este pago (reimpresión). null si no existe ninguno todavía. */
export async function findReceiptByPaymentIdAction(paymentId: string): Promise<Receipt | null> {
  const supabase = await createSupabaseClient()
  return receiptsService.findReceiptByPaymentIds(supabase, [paymentId])
}

export type VoidReceiptActionResult =
  | { success: true; receipt: Receipt }
  | { success: false; message: string }

export async function voidReceiptAction(receiptId: string, reason: string): Promise<VoidReceiptActionResult> {
  const parsed = voidReceiptSchema.safeParse({ reason })
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Motivo inválido" }
  }
  try {
    const supabase = await createSupabaseClient()
    const receipt = await receiptsService.voidReceipt(supabase, receiptId, parsed.data.reason)
    return { success: true, receipt }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo anular el recibo" }
  }
}
