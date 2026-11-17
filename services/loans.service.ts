import type { TypedSupabaseClient } from "@/lib/supabase/types"
import { logAudit } from "@/lib/supabase/audit"
import { calculateLoan } from "@/lib/finance/loan-calculator"
import { nextScheduledDate, normalizePaymentDays, validateFixedSchedule, type FixedSchedule } from "@/lib/finance/fixed-days"
import { buildLoanReschedulePlan } from "@/lib/finance/reschedule"
import { todayRD } from "@/lib/utils/date"
import type { LoanStatus } from "@/types/database.types"
import type { Installment, Loan, LoanWithClient } from "@/types/domain"
import type { LoanInput, RescheduleLoanInput } from "@/lib/validations/loan"

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
  const today = todayRD()

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
 * resultado de forma atómica (préstamo + cuotas + movimiento de capital +
 * auditoría en una transacción):
 *  - Automático: RPC original create_loan_with_installments (sin cambios)
 *  - Día fijo: RPC create_loan_with_schedule (migración 0011), que llama a
 *    la original y revalida todas las fechas en la base de datos.
 * La frecuencia SIEMPRE es la que eligió el usuario; el día fijo debe coincidir con ella.
 */
export async function createLoan(supabase: TypedSupabaseClient, input: LoanInput): Promise<Loan> {
  const frequency = input.frequency
  let schedule: FixedSchedule | null = null
  if (input.schedule_type === "fixed_days") {
    schedule = { days: normalizePaymentDays(input.payment_days ?? []), weekday: input.payment_weekday ?? null }
    const error = validateFixedSchedule(frequency, schedule.days, schedule.weekday)
    if (error) throw new Error(error)
  }
  // Con día fijo el servidor decide la primera fecha.
  const firstPaymentDate = schedule ? nextScheduledDate(input.start_date, schedule) : input.first_payment_date

  const calculation = calculateLoan({
    principal: input.principal_amount,
    interestRate: input.interest_rate,
    interestType: input.interest_type,
    numberOfInstallments: input.number_of_installments,
    frequency,
    firstPaymentDate,
    schedule: schedule ? { type: "fixed_days", ...schedule } : undefined,
  })

  const args = {
    p_client_id: input.client_id,
    p_principal_amount: input.principal_amount,
    p_interest_rate: input.interest_rate,
    p_interest_type: input.interest_type,
    p_number_of_installments: input.number_of_installments,
    p_installment_amount: calculation.installmentAmount,
    p_total_interest: calculation.totalInterest,
    p_total_amount: calculation.totalAmount,
    p_frequency: frequency,
    p_start_date: input.start_date,
    p_first_payment_date: firstPaymentDate,
    p_notes: input.notes || null,
    p_installments: calculation.installments.map((i) => ({
      installment_number: i.installmentNumber,
      due_date: i.dueDate,
      principal_amount: i.principalAmount,
      interest_amount: i.interestAmount,
      total_amount: i.totalAmount,
    })),
  }

  const { data, error } = schedule
    ? await supabase.rpc("create_loan_with_schedule", {
        ...args,
        p_schedule_type: "fixed_days",
        p_payment_days: schedule.weekday != null ? null : schedule.days,
        p_payment_weekday: schedule.weekday,
      })
    : await supabase.rpc("create_loan_with_installments", args)

  if (error) throw new Error(error.message)
  return data as Loan
}

/**
 * Cambia la fecha de pago de un préstamo (solo fechas, nunca montos).
 *
 * 1. Recalcula el plan en el servidor con los datos ACTUALES de la BD.
 * 2. Si no coincide con lo que el usuario vio (`expected_dates`), por
 *    ejemplo porque entró un pago mientras tenía el diálogo abierto, no
 *    cambia nada y pide revisar de nuevo.
 * 3. La RPC reschedule_loan_installments vuelve a validar todo bajo lock
 *    (rol, motivo, cuotas sin abono, calendario) y deja el registro en
 *    audit_logs.
 */
export async function rescheduleLoan(supabase: TypedSupabaseClient, input: RescheduleLoanInput): Promise<void> {
  const loan = await getLoanById(supabase, input.loan_id)
  if (!loan) throw new Error("El préstamo no existe")
  if (loan.status !== "activo") throw new Error("Solo se puede cambiar la fecha de un préstamo activo")

  const installments = await listInstallmentsByLoan(supabase, input.loan_id)
  const plan = buildLoanReschedulePlan(loan.frequency, installments, input)

  const today = todayRD()
  if (plan.changes[0].newDate < today) {
    throw new Error("La nueva primera fecha no puede estar en el pasado")
  }

  const planned = plan.changes.map((c) => `${c.installmentId}:${c.newDate}`).sort()
  const expected = input.expected_dates.map((d) => `${d.installment_id}:${d.due_date}`).sort()
  if (planned.join("|") !== expected.join("|")) {
    throw new Error(
      "Las cuotas del préstamo cambiaron mientras revisabas (por ejemplo, entró un pago). Cierra el diálogo y vuelve a abrirlo."
    )
  }

  const { error } = await supabase.rpc("reschedule_loan_installments", {
    p_loan_id: input.loan_id,
    p_schedule_type: input.schedule_type,
    p_payment_days:
      input.schedule_type === "fixed_days" && input.payment_weekday === null ? normalizePaymentDays(input.payment_days) : null,
    p_payment_weekday: input.schedule_type === "fixed_days" ? input.payment_weekday : null,
    p_new_dates: plan.changes.map((c) => ({ installment_id: c.installmentId, due_date: c.newDate })),
    p_reason: input.reason,
  })
  if (error) throw new Error(error.message)
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
