import { z } from "zod"

/**
 * Motivo de anulación de un recibo — void_receipt (migración 0010) exige al
 * menos 10 caracteres, esta validación replica esa regla en el cliente para
 * dar el error antes de llamar al servidor.
 */
export const voidReceiptSchema = z.object({
  reason: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres").max(500),
})

export type VoidReceiptInput = z.infer<typeof voidReceiptSchema>
