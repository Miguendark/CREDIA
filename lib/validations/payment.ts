import { z } from "zod"

export const paymentSchema = z.object({
  client_id: z.string().uuid("Selecciona un cliente"),
  loan_id: z.string().uuid("Selecciona un préstamo"),
  installment_id: z.string().uuid("Selecciona una cuota"),
  amount: z.number().positive("El monto debe ser mayor a cero"),
  payment_method: z.enum(["efectivo", "transferencia", "deposito", "tarjeta", "otro"]),
  payment_date: z.string().min(1, "La fecha es obligatoria"),
  receipt_number: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

export type PaymentInput = z.infer<typeof paymentSchema>
