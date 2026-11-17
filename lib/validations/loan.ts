import { z } from "zod"
import { nextScheduledDate, normalizePaymentDays, validateFixedSchedule } from "@/lib/finance/fixed-days"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const scheduleType = z.enum(["interval", "fixed_days"])
const paymentDays = z.array(z.number().int("Los días de pago deben ser números enteros"))
/** 1 = lunes … 7 = domingo. Solo frecuencia semanal con "Día fijo". */
const paymentWeekday = z.number().int("Día de la semana inválido").nullable()

export const loanSchema = z
  .object({
    client_id: z.string().uuid("Selecciona un cliente"),
    principal_amount: z.number().positive("El capital debe ser mayor a cero"),
    interest_type: z.enum(["fixed_capital", "declining_balance"]),
    interest_rate: z.number().min(0, "La tasa no puede ser negativa"),
    number_of_installments: z.number().int().positive("Debe tener al menos 1 cuota"),
    frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]),
    /** Migración 0011. Si se omite: 'interval' (comportamiento original). */
    schedule_type: scheduleType.optional(),
    /** Mensual: 1 día; quincenal: 2 días. Vacío u omitido en 'interval' y en semanal. */
    payment_days: paymentDays.optional(),
    /** Semanal con día fijo. Null u omitido en los demás casos. */
    payment_weekday: paymentWeekday.optional(),
    start_date: z.string().min(1, "La fecha de inicio es obligatoria"),
    first_payment_date: z.string().min(1, "La fecha del primer pago es obligatoria"),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    const days = value.payment_days ?? []
    const weekday = value.payment_weekday ?? null
    if (value.schedule_type !== "fixed_days") {
      if (days.length > 0 || weekday !== null) {
        ctx.addIssue({ code: "custom", path: ["payment_days"], message: "El día fijo solo aplica con \"Fechas de pago: Día fijo\"" })
      }
      return
    }
    const error = validateFixedSchedule(value.frequency, days, weekday)
    if (error) {
      ctx.addIssue({ code: "custom", path: [value.frequency === "weekly" ? "payment_weekday" : "payment_days"], message: error })
      return
    }
    if (!ISO_DATE.test(value.start_date)) return
    const expected = nextScheduledDate(value.start_date, { days: normalizePaymentDays(days), weekday })
    if (value.first_payment_date !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["first_payment_date"],
        message: `Con días fijos, el primer vencimiento debe ser el siguiente día fijo después de la fecha de inicio (${expected})`,
      })
    }
  })

export type LoanInput = z.infer<typeof loanSchema>

/**
 * Cambiar fecha de pago (RPC reschedule_loan_installments, migración 0011).
 * El servidor recalcula el plan con lib/finance/reschedule y lo compara con
 * `expected_dates` (lo que el usuario vio en pantalla): si no coinciden, no
 * se cambia nada.
 */
export const rescheduleLoanSchema = z
  .object({
    loan_id: z.string().uuid("Préstamo inválido"),
    schedule_type: scheduleType,
    payment_days: paymentDays,
    payment_weekday: paymentWeekday,
    /** La frecuencia NO se cambia aquí: el día fijo se valida contra la del préstamo (en el servidor). */
    /** fixed_days: las cuotas caen en el siguiente día fijo después de esta fecha. interval: fecha de la próxima cuota. */
    start_from: z.string().regex(ISO_DATE, "Fecha inválida"),
    reason: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres").max(500, "Máximo 500 caracteres"),
    expected_dates: z
      .array(z.object({ installment_id: z.string().uuid(), due_date: z.string().regex(ISO_DATE) }))
      .min(1, "No hay cuotas para reprogramar"),
  })
  .superRefine((value, ctx) => {
    if (value.schedule_type !== "fixed_days" && (value.payment_days.length > 0 || value.payment_weekday !== null)) {
      ctx.addIssue({ code: "custom", path: ["payment_days"], message: "El día fijo solo aplica con \"Fechas de pago: Día fijo\"" })
    }
  })

export type RescheduleLoanInput = z.infer<typeof rescheduleLoanSchema>
