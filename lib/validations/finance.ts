import { z } from "zod"
import { isValidIsoDate } from "@/lib/finance/periods"

const isoDate = z.string().refine(isValidIsoDate, "Fecha inválida")
const reason = z.string().trim().min(3, "Escribe el motivo (mínimo 3 caracteres)").max(255, "Máximo 255 caracteres")

export const expenseSchema = z
  .object({
    category: z.enum([
      "gasolina_transporte",
      "telefono_internet",
      "papeleria_impresion",
      "sueldos",
      "comisiones",
      "alquiler",
      "otros",
    ]),
    amount: z
      .number()
      .positive("El monto debe ser mayor a cero")
      .refine((v) => Math.round(v * 100) === v * 100, "Máximo 2 decimales"),
    description: z.string().trim().max(255, "Máximo 255 caracteres").optional().or(z.literal("")),
    expense_date: isoDate,
  })
  .refine((v) => v.category !== "otros" || (v.description ?? "").trim().length > 0, {
    message: 'Describe el gasto cuando la categoría es "Otros"',
    path: ["description"],
  })

export type ExpenseInput = z.infer<typeof expenseSchema>

export const voidSchema = z.object({ id: z.string().uuid(), reason })
export type VoidInput = z.infer<typeof voidSchema>

export const classifyLoanSchema = z.object({
  loan_id: z.string().uuid(),
  kind: z.enum(["incobrable", "error"]),
  reason,
  writeoff_date: isoDate,
})
export type ClassifyLoanInput = z.infer<typeof classifyLoanSchema>
