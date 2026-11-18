"use server"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  classifyLoanSchema,
  expenseSchema,
  voidSchema,
  type ClassifyLoanInput,
  type ExpenseInput,
  type VoidInput,
} from "@/lib/validations/finance"
import * as financeService from "@/services/finance.service"

export type FinanceActionResult = { success: true } | { success: false; message: string }

/** Valida, ejecuta y refresca Finanzas. Los permisos los verifica la base. */
async function run<T>(
  schema: z.ZodType<T>,
  input: unknown,
  fn: (supabase: Awaited<ReturnType<typeof createClient>>, data: T) => Promise<unknown>,
  fallback: string
): Promise<FinanceActionResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  try {
    const supabase = await createClient()
    await fn(supabase, parsed.data)
    revalidatePath("/finanzas")
    return { success: true }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : fallback }
  }
}

export async function registerExpenseAction(input: ExpenseInput) {
  return run(expenseSchema, input, financeService.registerExpense, "No se pudo registrar el gasto")
}

export async function voidExpenseAction(input: VoidInput) {
  return run(voidSchema, input, financeService.voidExpense, "No se pudo anular el gasto")
}

export async function classifyLoanAction(input: ClassifyLoanInput) {
  return run(classifyLoanSchema, input, financeService.classifyLoan, "No se pudo clasificar el préstamo")
}

export async function voidWriteoffAction(input: VoidInput) {
  return run(voidSchema, input, financeService.voidWriteoff, "No se pudo quitar la clasificación")
}
