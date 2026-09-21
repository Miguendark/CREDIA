import type { TypedSupabaseClient } from "@/lib/supabase/types"
import type { Database, InstallmentStatus } from "@/types/database.types"

export type Receipt = Database["public"]["Tables"]["receipts"]["Row"]

export interface ReceiptInstallmentEntry {
  installment_number: number
  amount: number
  status: InstallmentStatus
}

/**
 * Reconstruye el grupo completo de filas de `payments` que produjo UNA sola
 * llamada a register_payment (comparten loan_id + created_at exacto, porque
 * `now()` en Postgres es estable dentro de una misma transacción). Se usa
 * para que generar un recibo a partir de un solo pago de una cascada (ej.
 * reimpresión de un pago antiguo sin recibo) igual cubra todas las cuotas
 * del evento original, no solo la que se tocó.
 */
async function expandToPaymentGroup(
  supabase: TypedSupabaseClient,
  paymentIds: string[]
): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from("payments")
    .select("loan_id, created_at")
    .in("id", paymentIds)
  if (error) throw new Error(error.message)
  if (rows.length === 0) return paymentIds

  const { loan_id, created_at } = rows[0]
  const { data: group, error: groupError } = await supabase
    .from("payments")
    .select("id")
    .eq("loan_id", loan_id)
    .eq("created_at", created_at)
  if (groupError) throw new Error(groupError.message)

  return group.map((p) => p.id)
}

/**
 * Genera el recibo de un grupo de pagos, o devuelve el ya existente si
 * create_receipt responde que ya hay uno vigente (nunca se trata como error:
 * la interfaz debe mostrar ese recibo, no un mensaje de fallo).
 */
export async function createOrFetchReceipt(
  supabase: TypedSupabaseClient,
  paymentIds: string[]
): Promise<Receipt> {
  const groupIds = await expandToPaymentGroup(supabase, paymentIds)

  const { data, error } = await supabase.rpc("create_receipt", { p_payment_ids: groupIds })
  if (error) {
    if (error.message.includes("Ya existe un recibo vigente") || error.code === "23505") {
      const existing = await findReceiptByPaymentIds(supabase, groupIds)
      if (existing) return existing
    }
    throw new Error(error.message)
  }
  return data
}

/** Busca el recibo vigente que cubre cualquiera de los pagos indicados. */
export async function findReceiptByPaymentIds(
  supabase: TypedSupabaseClient,
  paymentIds: string[]
): Promise<Receipt | null> {
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("status", "activo")
    .overlaps("covered_payment_ids", paymentIds)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function getReceiptById(
  supabase: TypedSupabaseClient,
  id: string
): Promise<Receipt | null> {
  const { data, error } = await supabase.from("receipts").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  return data
}

export async function voidReceipt(
  supabase: TypedSupabaseClient,
  receiptId: string,
  reason: string
): Promise<Receipt> {
  const { data, error } = await supabase.rpc("void_receipt", {
    p_receipt_id: receiptId,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
  return data
}
