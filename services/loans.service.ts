import type { TypedSupabaseClient } from "@/lib/supabase/types"
import { logAudit } from "@/lib/supabase/audit"
import { calculateLoan } from "@/lib/finance/loan-calculator"
import type { LoanFrequency, LoanStatus } from "@/types/database.types"
import type { Installment, Loan, LoanWithClient } from "@/types/domain"
import type { LoanInput } from "@/lib/validations/loan"

export type LoanFilterStatus = "todos" | "activo" | "pagado" | "vencido" | "cancelado"

export interface ListLoansParams {
  search?: string
  status?: LoanFilterStatus
  page?: number
  pageSize?: number
}

export interface ListLoansResult {
  items: LoanWithClient[]
  total: number
}

const LOAN_WITH_CLIENT_SELECT =
  "*, client:clients!loans_client_id_fkey(id, full_name, client_code, identification_number, phone)"

export async function listLoans(
  supabase: TypedSupabaseClient,
  params: ListLoansParams = {}
): Promise<ListLoansResult> {
  const { search, status = "todos", page = 1, pageSize = 20 } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const today = new Date().toISOString().slice(0, 10)

  let query = supabase.from("loans").select(LOAN_WITH_CLIENT_SELECT, { count: "exact" })

  if (status === "vencido") {
    query = query.eq("status", "activo").lt("next_payment_date", today)
  } else if (status !== "todos") {
    query = query.eq("status", status as LoanStatus)
  }

  if (search && search.trim() !== "") {
    const term = search.trim()
    const { data: matchingClients } = await supabase
      .from("clients")
      .select("id")
      .or(`full_name.ilike.%${term}%,identification_number.ilike.%${term}%`)

    const clientIds = (matchingClients ?? []).map((c) => c.id)
    const filters = [`loan_number.ilike.%${term}%`]
    if (clientIds.length > 0) {
      filters.push(`client_id.in.(${clientIds.join(",")})`)
    }
    query = query.or(filters.join(","))
  }

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to)
  if (error) throw error

  return { items: data as unknown as LoanWithClient[], total: count ?? 0 }
}

export async function getLoanById(supabase: TypedSupabaseClient, id: string): Promise<LoanWithClient | null> {
  const { data, error } = await supabase.from("loans").select(LOAN_WITH_CLIENT_SELECT).eq("id", id).maybeSingle()
  if (error) throw error
  return data as unknown as LoanWithClient | null
}

export async function listLoansByClient(supabase: TypedSupabaseClient, clientId: string): Promise<Loan[]> {
  const { data, error } = await supabase
    .from("loans")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data
}

export async function listInstallmentsByLoan(supabase: TypedSupabaseClient, loanId: string): Promise<Installment[]> {
  const { data, error } = await supabase
    .from("installments")
    .select("*")
    .eq("loan_id", loanId)
    .order("installment_number", { ascending: true })
  if (error) throw error
  return data
}

/**
 * Calcula el préstamo con lib/finance/loan-calculator y persiste el
 * resultado de forma atómica vía la función RPC create_loan_with_installments
 * (préstamo + cuotas + movimiento de capital + auditoría en una transacción).
 */
export async function createLoan(supabase: TypedSupabaseClient, input: LoanInput): Promise<Loan> {
  const calculation = calculateLoan({
    principal: input.principal_amount,
    interestRate: input.interest_rate,
    interestType: input.interest_type,
    numberOfInstallments: input.number_of_installments,
    frequency: input.frequency as LoanFrequency,
    firstPaymentDate: input.first_payment_date,
  })

  const { data, error } = await supabase.rpc("create_loan_with_installments", {
    p_client_id: input.client_id,
    p_principal_amount: input.principal_amount,
    p_interest_rate: input.interest_rate,
    p_interest_type: input.interest_type,
    p_number_of_installments: input.number_of_installments,
    p_installment_amount: calculation.installmentAmount,
    p_total_interest: calculation.totalInterest,
    p_total_amount: calculation.totalAmount,
    p_frequency: input.frequency,
    p_start_date: input.start_date,
    p_first_payment_date: input.first_payment_date,
    p_notes: input.notes || null,
    p_installments: calculation.installments.map((i) => ({
      installment_number: i.installmentNumber,
      due_date: i.dueDate,
      principal_amount: i.principalAmount,
      interest_amount: i.interestAmount,
      total_amount: i.totalAmount,
    })),
  })

  if (error) throw new Error(error.message)
  return data as Loan
}

export async function cancelLoan(supabase: TypedSupabaseClient, id: string, reason: string): Promise<void> {
  const { data, error } = await supabase
    .from("loans")
    .update({ status: "cancelado", notes: reason })
    .eq("id", id)
    .select("loan_number")
    .single()
  if (error) throw error

  await logAudit(supabase, {
    action: "cancelar_prestamo",
    entity: "loans",
    entity_id: id,
    description: `Préstamo ${data.loan_number} cancelado: ${reason}`,
  })
}
