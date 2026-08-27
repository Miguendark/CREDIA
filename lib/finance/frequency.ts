import { addDays, addMonths, formatISO } from "date-fns"
import type { LoanFrequency } from "@/types/database.types"

/** Suma un período (según la frecuencia del préstamo) a una fecha ISO (YYYY-MM-DD). */
export function addPeriod(isoDate: string, frequency: LoanFrequency, periods = 1): string {
  const date = new Date(`${isoDate}T00:00:00`)

  const result = (() => {
    switch (frequency) {
      case "daily":
        return addDays(date, periods)
      case "weekly":
        return addDays(date, periods * 7)
      case "biweekly":
        return addDays(date, periods * 14)
      case "monthly":
        return addMonths(date, periods)
    }
  })()

  return formatISO(result, { representation: "date" })
}

export const FREQUENCY_LABELS: Record<LoanFrequency, string> = {
  daily: "Diaria",
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
}
