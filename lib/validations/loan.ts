import { z } from "zod"

export const loanSchema = z.object({
  client_id: z.string().uuid("Selecciona un cliente"),
  principal_amount: z.number().positive("El capital debe ser mayor a cero"),
  interest_type: z.enum(["fixed_capital", "declining_balance"]),
  interest_rate: z.number().min(0, "La tasa no puede ser negativa"),
  number_of_installments: z.number().int().positive("Debe tener al menos 1 cuota"),
  frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]),
  start_date: z.string().min(1, "La fecha de inicio es obligatoria"),
  first_payment_date: z.string().min(1, "La fecha del primer pago es obligatoria"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

export type LoanInput = z.infer<typeof loanSchema>
