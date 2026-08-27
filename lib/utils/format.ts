const currencyFormatter = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formatea un monto como pesos dominicanos: RD$5,000.00 */
export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount).replace("$", "RD$")
}

const dateFormatter = new Intl.DateTimeFormat("es-DO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
})

/** Formatea una fecha ISO (YYYY-MM-DD) o timestamp como DD/MM/YYYY, sin desfase de zona horaria. */
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value
  return dateFormatter.format(date)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}
