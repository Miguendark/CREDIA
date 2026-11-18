import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { Change, Polarity } from "@/lib/finance/indicators"
import type { DeltaFormat } from "./delta-badge"
import { cn } from "@/lib/utils"
import { DeltaBadge } from "./delta-badge"
import { InfoHint } from "./info-hint"

const ACCENT = {
  profit: "bg-status-good/10 text-status-good",
  capital: "bg-primary/10 text-primary",
  risk: "bg-status-critical/10 text-status-critical",
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-status-warning/15 text-warning-foreground",
} as const

export function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "capital",
  change,
  polarity,
  deltaFormat,
  previousLabel,
  help,
  footnote,
}: {
  label: string
  value: string
  icon: LucideIcon
  accent?: keyof typeof ACCENT
  change: Change | null
  polarity: Polarity
  deltaFormat?: DeltaFormat
  /** Texto del valor anterior, p. ej. "RD$12,000.00 el período anterior". */
  previousLabel?: string
  help: React.ReactNode
  footnote?: React.ReactNode
}) {
  return (
    <Card className="gap-0 py-5 transition-shadow hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-3 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
            <InfoHint title={label}>{help}</InfoHint>
          </div>
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", ACCENT[accent])}>
            <Icon className="size-[18px]" strokeWidth={2} />
          </span>
        </div>
        <p className="truncate text-[1.65rem] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1">
          <DeltaBadge change={change} polarity={polarity} format={deltaFormat} />
          {previousLabel && <span className="text-xs text-muted-foreground">{previousLabel}</span>}
        </div>
        {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  )
}
