"use server"

import { revalidatePath } from "next/cache"
import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { loanSchema, type LoanInput } from "@/lib/validations/loan"
import * as loansService from "@/services/loans.service"

export type LoanActionResult = { success: true; loanId: string } | { success: false; message: string }

export async function createLoanAction(input: LoanInput): Promise<LoanActionResult> {
  const parsed = loanSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  try {
    const supabase = await createSupabaseClient()
    const loan = await loansService.createLoan(supabase, parsed.data)
    revalidatePath("/prestamos")
    revalidatePath("/dashboard")
    revalidatePath(`/clientes/${parsed.data.client_id}`)
    return { success: true, loanId: loan.id }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo crear el préstamo" }
  }
}

export interface LoanOption {
  id: string
  loan_number: string
  outstanding_principal: number
  outstanding_interest: number
  status: string
}

/** Préstamos activos de un cliente, usados por el selector del formulario de pagos. */
export async function listActiveLoansByClientAction(clientId: string): Promise<LoanOption[]> {
  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from("loans")
    .select("id, loan_number, outstanding_principal, outstanding_interest, status")
    .eq("client_id", clientId)
    .eq("status", "activo")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function cancelLoanAction(id: string, reason: string): Promise<{ success: boolean; message?: string }> {
  try {
    const supabase = await createSupabaseClient()
    await loansService.cancelLoan(supabase, id, reason)
    revalidatePath("/prestamos")
    revalidatePath(`/prestamos/${id}`)
    return { success: true }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo cancelar el préstamo" }
  }
}
