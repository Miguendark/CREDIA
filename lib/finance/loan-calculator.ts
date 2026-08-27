import type { LoanFrequency, LoanInterestType } from "@/types/database.types"
import { addPeriod } from "./frequency"
import { round2 } from "./round"

export interface LoanCalculatorInput {
  principal: number
  interestRate: number
  interestType: LoanInterestType
  numberOfInstallments: number
  frequency: LoanFrequency
  firstPaymentDate: string
}

export interface InstallmentPreview {
  installmentNumber: number
  dueDate: string
  principalAmount: number
  interestAmount: number
  totalAmount: number
}

export interface LoanCalculationResult {
  totalInterest: number
  totalAmount: number
  installmentAmount: number
  installments: InstallmentPreview[]
}

/**
 * Punto único de cálculo financiero de préstamos. Toda pantalla o proceso
 * que necesite saber "cuánto interés / cuál cuota" debe pasar por aquí —
 * nunca reimplementar la fórmula en un componente.
 *
 * Estrategias implementadas para el MVP (ver enum loan_interest_type):
 *  - fixed_capital: interés fijo calculado UNA sola vez sobre el capital
 *    original, repartido en partes iguales entre las cuotas. Es el modelo
 *    más común en casas de préstamo de consumo en RD.
 *  - declining_balance: interés sobre saldo insoluto con cuota nivelada
 *    (amortización tipo francés / fórmula de anualidad estándar).
 *
 * Para agregar una estrategia nueva (interés simple puro, interés por
 * períodos, etc.) añadir un caso al switch sin tocar el resto del código:
 * ningún componente visual conoce la fórmula, solo consume este resultado.
 */
export function calculateLoan(input: LoanCalculatorInput): LoanCalculationResult {
  if (input.principal <= 0) throw new Error("El capital debe ser mayor a cero")
  if (input.numberOfInstallments <= 0) throw new Error("El número de cuotas debe ser mayor a cero")
  if (input.interestRate < 0) throw new Error("La tasa de interés no puede ser negativa")

  switch (input.interestType) {
    case "fixed_capital":
      return calculateFixedCapital(input)
    case "declining_balance":
      return calculateDecliningBalance(input)
  }
}

function buildDueDates(input: LoanCalculatorInput): string[] {
  const dates: string[] = []
  for (let i = 0; i < input.numberOfInstallments; i++) {
    dates.push(i === 0 ? input.firstPaymentDate : addPeriod(input.firstPaymentDate, input.frequency, i))
  }
  return dates
}

function calculateFixedCapital(input: LoanCalculatorInput): LoanCalculationResult {
  const { principal, interestRate, numberOfInstallments } = input
  const totalInterest = round2(principal * (interestRate / 100))
  const totalAmount = round2(principal + totalInterest)
  const dueDates = buildDueDates(input)

  const basePrincipal = round2(principal / numberOfInstallments)
  const baseInterest = round2(totalInterest / numberOfInstallments)

  const installments: InstallmentPreview[] = dueDates.map((dueDate, index) => ({
    installmentNumber: index + 1,
    dueDate,
    principalAmount: basePrincipal,
    interestAmount: baseInterest,
    totalAmount: round2(basePrincipal + baseInterest),
  }))

  // La última cuota absorbe el residuo del redondeo para que la suma de
  // cuotas coincida exactamente con el total del préstamo.
  reconcileRounding(installments, principal, totalInterest)

  const installmentAmount = installments[0]?.totalAmount ?? 0

  return { totalInterest, totalAmount, installmentAmount, installments }
}

function calculateDecliningBalance(input: LoanCalculatorInput): LoanCalculationResult {
  const { principal, interestRate, numberOfInstallments } = input
  const periodRate = interestRate / 100
  const dueDates = buildDueDates(input)

  const levelPayment =
    periodRate === 0
      ? principal / numberOfInstallments
      : (principal * periodRate) / (1 - Math.pow(1 + periodRate, -numberOfInstallments))

  let balance = principal
  const installments: InstallmentPreview[] = []

  for (let index = 0; index < numberOfInstallments; index++) {
    const isLast = index === numberOfInstallments - 1
    const interestAmount = round2(balance * periodRate)
    const principalAmount = isLast ? round2(balance) : round2(levelPayment - interestAmount)
    balance = round2(balance - principalAmount)

    installments.push({
      installmentNumber: index + 1,
      dueDate: dueDates[index],
      principalAmount,
      interestAmount,
      totalAmount: round2(principalAmount + interestAmount),
    })
  }

  const totalInterest = round2(installments.reduce((sum, i) => sum + i.interestAmount, 0))
  const totalAmount = round2(principal + totalInterest)
  const installmentAmount = round2(levelPayment)

  return { totalInterest, totalAmount, installmentAmount, installments }
}

/** Ajusta la última cuota para que la suma exacta de capital e interés cuadre con el total del préstamo. */
function reconcileRounding(installments: InstallmentPreview[], principal: number, totalInterest: number) {
  const last = installments[installments.length - 1]
  if (!last) return

  const principalSum = round2(installments.reduce((sum, i) => sum + i.principalAmount, 0))
  const interestSum = round2(installments.reduce((sum, i) => sum + i.interestAmount, 0))

  last.principalAmount = round2(last.principalAmount + (principal - principalSum))
  last.interestAmount = round2(last.interestAmount + (totalInterest - interestSum))
  last.totalAmount = round2(last.principalAmount + last.interestAmount)
}

export const INTEREST_TYPE_LABELS: Record<LoanInterestType, string> = {
  fixed_capital: "Fijo sobre capital",
  declining_balance: "Sobre saldo insoluto",
}
