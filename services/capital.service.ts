import type { TypedSupabaseClient } from "@/lib/supabase/types"
import type { CapitalTransaction } from "@/types/domain"
import type { CapitalMovementInput } from "@/lib/validations/capital"

export interface CapitalSummary {
  initialCapital: number
  availableCapital: number
  lentCapital: number
  recoveredCapital: number
  interestGenerated: number
  totalContributions: number
  totalWithdrawals: number
}

export async function getCapitalSummary(supabase: TypedSupabaseClient): Promise<CapitalSummary> {
  const { data: metrics, error: metricsError } = await supabase.from("dashboard_metrics").select("*").single()
  if (metricsError) throw metricsError

  const { data: transactions, error: txError } = await supabase
    .from("capital_transactions")
    .select("type, amount")
  if (txError) throw txError

  const sumByType = (type: CapitalTransaction["type"]) =>
    transactions.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount, 0)

  return {
    initialCapital: sumByType("aporte") - sumByType("retiro"),
    availableCapital: metrics.available_capital,
    lentCapital: metrics.lent_capital,
    recoveredCapital: metrics.total_received,
    interestGenerated: metrics.total_interest_generated,
    totalContributions: sumByType("aporte"),
    totalWithdrawals: sumByType("retiro"),
  }
}

export interface ListCapitalMovementsParams {
  type?: CapitalTransaction["type"]
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export async function listCapitalMovements(
  supabase: TypedSupabaseClient,
  params: ListCapitalMovementsParams = {}
): Promise<{ items: CapitalTransaction[]; total: number }> {
  const { type, dateFrom, dateTo, page = 1, pageSize = 20 } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from("capital_transactions").select("*", { count: "exact" })
  if (type) query = query.eq("type", type)
  if (dateFrom) query = query.gte("transaction_date", dateFrom)
  if (dateTo) query = query.lte("transaction_date", dateTo)

  const { data, error, count } = await query.order("transaction_date", { ascending: false }).range(from, to)
  if (error) throw error

  return { items: data, total: count ?? 0 }
}

export async function registerCapitalMovement(
  supabase: TypedSupabaseClient,
  input: CapitalMovementInput
): Promise<CapitalTransaction> {
  const { data, error } = await supabase.rpc("register_capital_movement", {
    p_type: input.type,
    p_amount: input.amount,
    p_description: input.description || null,
    p_transaction_date: input.transaction_date,
  })

  if (error) throw new Error(error.message)
  return data as CapitalTransaction
}
