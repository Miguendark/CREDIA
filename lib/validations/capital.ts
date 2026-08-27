import { z } from "zod"

export const capitalMovementSchema = z.object({
  type: z.enum(["aporte", "retiro", "ajuste"]),
  amount: z.number().positive("El monto debe ser mayor a cero"),
  description: z.string().trim().max(255).optional().or(z.literal("")),
  transaction_date: z.string().min(1, "La fecha es obligatoria"),
})

export type CapitalMovementInput = z.infer<typeof capitalMovementSchema>
