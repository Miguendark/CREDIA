import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

export function Logo({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShieldCheck className="size-4.5" strokeWidth={2.25} />
      </span>
      {!iconOnly && (
        <span className="text-lg font-semibold tracking-tight">
          NEXA
        </span>
      )}
    </div>
  )
}
