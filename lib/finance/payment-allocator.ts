import { round2 } from "./round"

export interface AllocatableInstallment {
  id: string
  installmentNumber: number
  interestAmount: number
  totalAmount: number
  remainingAmount: number
}

export interface PaymentAllocation {
  installmentId: string
  amount: number
  principalApplied: number
  interestApplied: number
}

export interface AllocationResult {
  allocations: PaymentAllocation[]
  unallocatedAmount: number
}

/**
 * Reparte un monto de pago entre una cuota seleccionada y, si sobra,
 * en cascada hacia las siguientes cuotas pendientes/parciales del préstamo
 * (en orden de número de cuota).
 *
 * Regla de reparto capital/interés dentro de cada cuota: PROPORCIONAL a la
 * composición original de la cuota (interestAmount / totalAmount). Es una
 * simplificación razonable para el MVP con interés fijo; si el negocio
 * requiere "interés primero" u otra política, ese es un cambio de regla de
 * negocio a definir explícitamente (ver sección 42) y solo afecta esta
 * función — el resto de la app no conoce el detalle del reparto.
 */
export function allocatePayment(
  targetInstallments: AllocatableInstallment[],
  amount: number
): AllocationResult {
  let remainingToAllocate = round2(amount)
  const allocations: PaymentAllocation[] = []

  const sorted = [...targetInstallments].sort((a, b) => a.installmentNumber - b.installmentNumber)

  for (const installment of sorted) {
    if (remainingToAllocate <= 0) break
    if (installment.remainingAmount <= 0) continue

    const applied = round2(Math.min(remainingToAllocate, installment.remainingAmount))
    const interestRatio = installment.totalAmount > 0 ? installment.interestAmount / installment.totalAmount : 0
    const interestApplied = round2(applied * interestRatio)
    const principalApplied = round2(applied - interestApplied)

    allocations.push({
      installmentId: installment.id,
      amount: applied,
      principalApplied,
      interestApplied,
    })

    remainingToAllocate = round2(remainingToAllocate - applied)
  }

  return { allocations, unallocatedAmount: Math.max(remainingToAllocate, 0) }
}

/** La base marca "pagada" una cuota si le queda RD$0.01 o menos (register_payment). */
export const CENT_TOLERANCE = 0.01

/**
 * Si el monto deja a una cuota con 1 centavo (o menos) pendiente, la base la
 * dará por pagada y el préstamo quedará con ese centavo de saldo para
 * siempre (caso PR-00017). Devuelve cuánto falta para cobrarla exacta, o
 * null si no pasa. Solo mira la última cuota que toca el pago: las
 * anteriores se cubren completas.
 */
export function centShortfall(result: AllocationResult, targetInstallments: AllocatableInstallment[]): number | null {
  const last = result.allocations[result.allocations.length - 1]
  if (!last) return null
  const installment = targetInstallments.find((i) => i.id === last.installmentId)
  if (!installment) return null
  const left = round2(installment.remainingAmount - last.amount)
  return left > 0 && left <= CENT_TOLERANCE ? left : null
}
