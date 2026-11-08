import type { InstallmentStatus, LoanFrequency } from "@/types/database.types"
import { buildFixedDaySchedule, validatePaymentDays } from "./fixed-days"
import { addPeriod } from "./frequency"

/**
 * Cálculo (puro, sin BD) del cambio de fecha de pago de un préstamo.
 *
 * Solo produce FECHAS nuevas. Nunca devuelve ni modifica montos: la función
 * de base de datos que persiste el cambio solo actualiza `due_date`.
 *
 * Cuotas que se mueven: estado 'pendiente' o 'vencida' y amount_paid = 0.
 * Cuotas que NO se tocan: pagadas, con pago parcial, o con cualquier monto
 * abonado. La primera fecha nueva debe ser posterior a la última de ellas.
 */

export interface RescheduleInstallment {
  id: string
  installment_number: number
  due_date: string
  status: InstallmentStatus
  amount_paid: number
}

export type RescheduleMode =
  /** Días fijos del mes; la primera cuota es el siguiente día fijo después de `afterDate`. */
  | { type: "fixed_days"; days: number[]; afterDate: string }
  /** Mantiene la frecuencia: la próxima cuota pendiente cae en `firstDate` y las demás siguen la frecuencia. */
  | { type: "interval"; frequency: LoanFrequency; firstDate: string }

export interface RescheduleChange {
  installmentId: string
  installmentNumber: number
  oldDate: string
  newDate: string
}

export interface ReschedulePlan {
  changes: RescheduleChange[]
  /** Nueva fecha del próximo pago del préstamo (mínima entre pendientes y parciales). */
  nextPaymentDate: string | null
}

export function isReschedulable(installment: RescheduleInstallment): boolean {
  return (
    (installment.status === "pendiente" || installment.status === "vencida") && Number(installment.amount_paid) === 0
  )
}

export function planReschedule(installments: readonly RescheduleInstallment[], mode: RescheduleMode): ReschedulePlan {
  const sorted = [...installments].sort((a, b) => a.installment_number - b.installment_number)
  const movable = sorted.filter(isReschedulable)
  const locked = sorted.filter((i) => !isReschedulable(i))

  if (movable.length === 0) throw new Error("El préstamo no tiene cuotas pendientes para reprogramar")

  // Las cuotas a mover deben ser todas posteriores (por número) a las bloqueadas.
  const lastLockedNumber = Math.max(0, ...locked.map((i) => i.installment_number))
  if (movable[0].installment_number < lastLockedNumber) {
    throw new Error("Hay cuotas pendientes anteriores a cuotas ya pagadas; no se puede reprogramar automáticamente")
  }

  let newDates: string[]
  if (mode.type === "fixed_days") {
    const error = validatePaymentDays(mode.days)
    if (error) throw new Error(error)
    newDates = buildFixedDaySchedule(mode.afterDate, mode.days, movable.length)
  } else {
    newDates = movable.map((_, index) => (index === 0 ? mode.firstDate : addPeriod(mode.firstDate, mode.frequency, index)))
  }

  const lastLockedDate = locked.reduce<string | null>((max, i) => (max === null || i.due_date > max ? i.due_date : max), null)
  if (lastLockedDate !== null && newDates[0] <= lastLockedDate) {
    throw new Error(`La nueva primera fecha debe ser posterior a ${lastLockedDate} (última cuota pagada o con abono)`)
  }

  const changes: RescheduleChange[] = movable.map((installment, index) => ({
    installmentId: installment.id,
    installmentNumber: installment.installment_number,
    oldDate: installment.due_date,
    newDate: newDates[index],
  }))

  const openDates = [
    ...locked.filter((i) => i.status === "pendiente" || i.status === "parcial" || i.status === "vencida").map((i) => i.due_date),
    ...newDates,
  ].sort()

  return { changes, nextPaymentDate: openDates[0] ?? null }
}

/**
 * Aplica un plan a una lista de cuotas devolviendo copias donde SOLO cambia
 * `due_date`. Se usa en pruebas para garantizar que ningún otro campo cambia.
 */
export function applyReschedule<T extends { id: string; due_date: string }>(
  installments: readonly T[],
  plan: ReschedulePlan
): T[] {
  const byId = new Map(plan.changes.map((c) => [c.installmentId, c.newDate]))
  return installments.map((i) => (byId.has(i.id) ? { ...i, due_date: byId.get(i.id)! } : { ...i }))
}
