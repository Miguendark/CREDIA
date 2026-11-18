import { formatCurrency } from "@/lib/utils/format"

/** "5.2 %" o "—" si no hay dato. */
export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${value.toLocaleString("es-DO", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`
}

/** Montos compactos para ejes de gráficos: RD$950, RD$12.5k, RD$1.2M. */
export function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}RD$${(abs / 1_000_000).toLocaleString("es-DO", { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000) return `${sign}RD$${(abs / 1_000).toLocaleString("es-DO", { maximumFractionDigits: 1 })}k`
  return `${sign}RD$${abs.toLocaleString("es-DO", { maximumFractionDigits: 0 })}`
}

export { formatCurrency }

export function formatCount(value: number): string {
  return value.toLocaleString("es-DO")
}
