import { z } from "zod"

export const clientSchema = z.object({
  full_name: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres"),
  identification_number: z.string().trim().max(30).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  address: z.string().trim().max(255).optional().or(z.literal("")),
  birth_date: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

export type ClientInput = z.infer<typeof clientSchema>
