"use server"

import { revalidatePath } from "next/cache"
import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { paymentSchema, type PaymentInput } from "@/lib/validations/payment"
import * as paymentsService from "@/services/payments.service"

export type PaymentActionResult =
  | { success: true; unallocatedAmount: number }
  | { success: false; message: string }

export async function registerPaymentAction(input: PaymentInput): Promise<PaymentActionResult> {
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  try {
    const supabase = await createSupabaseClient()
    const { unallocatedAmount } = await paymentsService.registerPayment(supabase, parsed.data)
    revalidatePath("/pagos")
    revalidatePath("/prestamos")
    revalidatePath(`/prestamos/${parsed.data.loan_id}`)
    revalidatePath(`/clientes/${parsed.data.client_id}`)
    revalidatePath("/dashboard")
    revalidatePath("/cobros")
    revalidatePath("/capital")
    return { success: true, unallocatedAmount }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo registrar el pago" }
  }
}

export interface InstallmentOption {
  id: string
  installment_number: number
  due_date: string
  interest_amount: number
  total_amount: number
  remaining_amount: number
  status: string
}

/** Cuotas pendientes/parciales de un préstamo, usadas por el selector del formulario de pagos. */
export async function listPendingInstallmentsByLoanAction(loanId: string): Promise<InstallmentOption[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from("installments")
    .select("id, installment_number, due_date, interest_amount, total_amount, remaining_amount, status")
    .eq("loan_id", loanId)
    .in("status", ["pendiente", "parcial"])
    .order("installment_number", { ascending: true })

  if (error) throw error
  return data
}
