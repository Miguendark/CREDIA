import type { TypedSupabaseClient } from "@/lib/supabase/types"
import { allocatePayment, type AllocatableInstallment } from "@/lib/finance/payment-allocator"
import type { PaymentMethod } from "@/types/database.types"
import type { Installment, Payment, PaymentWithRelations } from "@/types/domain"
import type { PaymentInput } from "@/lib/validations/payment"

export interface ListPaymentsParams {
  clientId?: string
  loanId?: string
  paymentMethod?: PaymentMethod
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export interface ListPaymentsResult {
  items: PaymentWithRelations[]
  total: number
}

const PAYMENT_WITH_RELATIONS_SELECT =
  "*, client:clients!payments_client_id_fkey(id, full_name, client_code), loan:loans!payments_loan_id_fkey(id, loan_number), created_by_user:users!payments_created_by_fkey(id, name)"

export async function listPayments(
  supabase: TypedSupabaseClient,
  params: ListPaymentsParams = {}
): Promise<ListPaymentsResult> {
  const { clientId, loanId, paymentMethod, dateFrom, dateTo, page = 1, pageSize = 20 } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from("payments").select(PAYMENT_WITH_RELATIONS_SELECT, { count: "exact" })

  if (clientId) query = query.eq("client_id", clientId)
  if (loanId) query = query.eq("loan_id", loanId)
  if (paymentMethod) query = query.eq("payment_method", paymentMethod)
  if (dateFrom) query = query.gte("payment_date", dateFrom)
  if (dateTo) query = query.lte("payment_date", dateTo)

  const { data, error, count } = await query.order("payment_date", { ascending: false }).range(from, to)
  if (error) throw error

  return { items: data as unknown as PaymentWithRelations[], total: count ?? 0 }
}

export async function listPaymentsByLoan(supabase: TypedSupabaseClient, loanId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("loan_id", loanId)
    .order("payment_date", { ascending: false })
  if (error) throw error
  return data
}

/**
 * Calcula el reparto del pago con lib/finance/payment-allocator (empezando
 * en la cuota seleccionada y en cascada hacia las siguientes si sobra
 * monto) y lo persiste de forma atómica vía la RPC register_payment, que
 * revalida cada asignación contra el estado real de la base de datos.
 */
export async function registerPayment(
  supabase: TypedSupabaseClient,
  input: PaymentInput
): Promise<{ payments: Payment[]; unallocatedAmount: number }> {
  const { data: pendingInstallments, error: installmentsError } = await supabase
    .from("installments")
    .select("*")
    .eq("loan_id", input.loan_id)
    .in("status", ["pendiente", "parcial"])
    .order("installment_number", { ascending: true })
  if (installmentsError) throw installmentsError

  const selected = pendingInstallments.find((i: Installment) => i.id === input.installment_id)
  if (!selected) {
    throw new Error("La cuota seleccionada ya no está pendiente de pago")
  }

  // Cascada: la cuota elegida primero, luego las siguientes en orden.
  const targets: AllocatableInstallment[] = pendingInstallments
    .filter((i: Installment) => i.installment_number >= selected.installment_number)
    .map((i: Installment) => ({
      id: i.id,
      installmentNumber: i.installment_number,
      interestAmount: i.interest_amount,
      totalAmount: i.total_amount,
      remainingAmount: i.remaining_amount,
    }))

  const { allocations, unallocatedAmount } = allocatePayment(targets, input.amount)

  if (allocations.length === 0) {
    throw new Error("No hay saldo pendiente que aplicar")
  }

  const { data, error } = await supabase.rpc("register_payment", {
    p_loan_id: input.loan_id,
    p_client_id: input.client_id,
    p_allocations: allocations.map((a) => ({
      installment_id: a.installmentId,
      amount: a.amount,
      principal_applied: a.principalApplied,
      interest_applied: a.interestApplied,
    })),
    p_payment_method: input.payment_method,
    p_payment_date: input.payment_date,
    p_receipt_number: input.receipt_number || null,
    p_notes: input.notes || null,
  })

  if (error) throw new Error(error.message)

  return { payments: data as Payment[], unallocatedAmount }
}
