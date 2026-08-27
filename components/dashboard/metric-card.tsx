import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: string
  icon: LucideIcon
  tone?: "default" | "good" | "warning" | "critical"
  hint?: string
}

const TONE_STYLES: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  good: "bg-status-good/10 text-status-good",
  warning: "bg-status-warning/15 text-warning-foreground",
  critical: "bg-status-critical/10 text-status-critical",
}

export function MetricCard({ label, value, icon: Icon, tone = "default", hint }: MetricCardProps) {
  return (
    <Card className="gap-0 py-5">
      <CardContent className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONE_STYLES[tone])}>
          <Icon className="size-5" strokeWidth={2} />
        </span>
      </CardContent>
    </Card>
  )
}
