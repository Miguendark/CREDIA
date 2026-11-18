import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { changeTone, type Change, type Polarity } from "@/lib/finance/indicators"
import { cn } from "@/lib/utils"
import { formatCurrency, formatPct } from "./format"

const TONE = {
  good: "bg-status-good/10 text-status-good",
  bad: "bg-status-critical/10 text-status-critical",
  neutral: "bg-muted text-muted-foreground",
} as const

/** Cómo se expresa la diferencia contra el período anterior. */
export type DeltaFormat = "pct" | "points" | "amount"

/**
 * Flecha y diferencia contra el período anterior.
 * - Color: verde/rojo solo si subir es claramente bueno o malo (`polarity`);
 *   gris si es neutral (subir o bajar no es ni bueno ni malo por sí solo).
 * - Formato: % (por defecto), puntos porcentuales para valores que ya son %,
 *   o RD$ para saldos que pueden ser negativos o cercanos a cero (caja).
 */
export function DeltaBadge({
  change,
  polarity,
  format = "pct",
  className,
}: {
  change: Change | null
  polarity: Polarity
  format?: DeltaFormat
  className?: string
}) {
  if (!change) return <span className={cn("text-xs text-muted-foreground", className)}>Sin comparación</span>

  const tone = changeTone(change, polarity)
  const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus
  const diff = change.current - change.previous
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : ""
  let text: string
  if (change.direction === "flat") {
    text = "Sin cambio"
  } else if (format === "points") {
    text = `${sign}${Math.abs(diff).toLocaleString("es-DO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} p. p.`
  } else if (format === "amount") {
    text = `${sign}${formatCurrency(Math.abs(diff))}`
  } else if (change.pct === null) {
    text = change.isNew ? "Nuevo" : "Sin cambio"
  } else {
    text = `${sign}${formatPct(Math.abs(change.pct))}`
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
        TONE[tone],
        className
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} />
      {text}
    </span>
  )
}
