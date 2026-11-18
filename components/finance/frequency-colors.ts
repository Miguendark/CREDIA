import type { LoanFrequency } from "@/types/database.types"

/**
 * Un color por frecuencia, igual en el gráfico y en la tabla. Se evitan a
 * propósito el verde (ganancia), el ámbar y el rojo (atraso/riesgo) para que
 * un tipo de préstamo no parezca "bueno" o "malo" por su color.
 */
export const FREQUENCY_COLORS: Record<LoanFrequency, string> = {
  weekly: "var(--chart-1)", // azul
  biweekly: "var(--chart-5)", // violeta
  monthly: "#0e9fb3", // cian (se ve bien en tema claro y oscuro)
  daily: "var(--muted-foreground)",
}
