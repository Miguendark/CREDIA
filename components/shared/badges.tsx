import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ClientStatus, InstallmentStatus, LoanStatus, PaymentMethod } from "@/types/database.types"

const TONE_CLASSES = {
  good: "bg-status-good/10 text-status-good border-status-good/20",
  warning: "bg-status-warning/15 text-warning-foreground border-status-warning/25",
  critical: "bg-status-critical/10 text-status-critical border-status-critical/20",
  neutral: "bg-muted text-muted-foreground border-transparent",
  primary: "bg-primary/10 text-primary border-primary/20",
} as const

function ToneBadge({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASSES[tone])}>
      {children}
    </Badge>
  )
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return status === "activo" ? (
    <ToneBadge tone="good">Activo</ToneBadge>
  ) : (
    <ToneBadge tone="neutral">Inactivo</ToneBadge>
  )
}

export function LoanStatusBadge({ status, overdue = false }: { status: LoanStatus; overdue?: boolean }) {
  if (status === "activo" && overdue) return <ToneBadge tone="critical">Vencido</ToneBadge>
  if (status === "activo") return <ToneBadge tone="primary">Activo</ToneBadge>
  if (status === "pagado") return <ToneBadge tone="good">Pagado</ToneBadge>
  if (status === "cancelado") return <ToneBadge tone="neutral">Cancelado</ToneBadge>
  return <ToneBadge tone="critical">Vencido</ToneBadge>
}

export function InstallmentStatusBadge({
  status,
  overdue = false,
}: {
  status: InstallmentStatus
  overdue?: boolean
}) {
  if ((status === "pendiente" || status === "parcial") && overdue) return <ToneBadge tone="critical">Vencida</ToneBadge>
  if (status === "pagada") return <ToneBadge tone="good">Pagada</ToneBadge>
  if (status === "parcial") return <ToneBadge tone="warning">Parcial</ToneBadge>
  if (status === "vencida") return <ToneBadge tone="critical">Vencida</ToneBadge>
  return <ToneBadge tone="neutral">Pendiente</ToneBadge>
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  deposito: "Depósito",
  tarjeta: "Tarjeta",
  otro: "Otro",
}

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  return <ToneBadge tone="neutral">{PAYMENT_METHOD_LABELS[method]}</ToneBadge>
}
