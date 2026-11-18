import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FREQUENCY_LABELS } from "@/lib/finance/frequency"
import type { CancelledSummary, FrequencyBreakdown, LateClient } from "@/lib/finance/indicators"
import { formatShortDate } from "@/lib/finance/periods"
import { cn } from "@/lib/utils"
import { formatCount, formatCurrency, formatPct } from "./format"
import { FREQUENCY_COLORS } from "./frequency-colors"
import { InfoHint } from "./info-hint"

function TableCard({
  title,
  help,
  empty,
  isEmpty,
  children,
  className,
}: {
  title: string
  help: React.ReactNode
  empty: string
  isEmpty: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          {title}
          <InfoHint title={title}>{help}</InfoHint>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

const TH = "pb-2 text-xs font-medium text-muted-foreground"
const TD = "py-2.5 tabular-nums"

export function CollectorsTable({
  rows,
}: {
  rows: {
    userId: string | null
    userName: string
    operations: number
    collected: number
    interest: number
    share: number | null
  }[]
}) {
  return (
    <TableCard
      title="Cobrado por usuario"
      help={
        <>
          Lo cobrado en el período según el usuario que registró cada pago. «Sin usuario» son pagos antiguos sin ese
          dato. La asignación de cartera por cobrador (asignado vs. cobrado) llegará con la ruta de cobro.
        </>
      }
      empty="No hay pagos en este período."
      isEmpty={rows.length === 0}
    >
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left">
            <th className={TH}>Usuario</th>
            <th className={cn(TH, "text-right")}>Pagos</th>
            <th className={cn(TH, "text-right")}>Cobrado</th>
            <th className={cn(TH, "text-right")}>Ganancia</th>
            <th className={cn(TH, "w-28 text-right")}>% del total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.userId ?? "none"}>
              <td className={cn(TD, "font-medium", !r.userId && "text-muted-foreground")}>{r.userName}</td>
              <td className={cn(TD, "text-right")}>{formatCount(r.operations)}</td>
              <td className={cn(TD, "text-right")}>{formatCurrency(r.collected)}</td>
              <td className={cn(TD, "text-right text-status-good")}>{formatCurrency(r.interest)}</td>
              <td className={cn(TD, "text-right")}>
                <div className="flex items-center justify-end gap-2">
                  <div className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-muted sm:block">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(r.share ?? 0, 100)}%` }}
                    />
                  </div>
                  {formatPct(r.share, 0)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

export function TopClientsTable({
  rows,
}: {
  rows: {
    clientId: string
    clientName: string
    interest: number
    principal: number
    loans: number
  }[]
}) {
  return (
    <TableCard
      title="Mejores clientes"
      help="Clientes que más ganancia (interés cobrado) generaron en el período."
      empty="No hay interés cobrado en este período."
      isEmpty={rows.length === 0}
    >
      <table className="w-full min-w-[360px] text-sm">
        <thead>
          <tr className="text-left">
            <th className={cn(TH, "w-8")}>#</th>
            <th className={TH}>Cliente</th>
            <th className={cn(TH, "text-right")}>Préstamos</th>
            <th className={cn(TH, "text-right")}>Ganancia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={r.clientId}>
              <td className={cn(TD, "text-muted-foreground")}>{i + 1}</td>
              <td className={TD}>
                <Link href={`/clientes/${r.clientId}`} className="font-medium hover:underline">
                  {r.clientName}
                </Link>
              </td>
              <td className={cn(TD, "text-right")}>{formatCount(r.loans)}</td>
              <td className={cn(TD, "text-right font-medium text-status-good")}>{formatCurrency(r.interest)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

function daysTone(days: number) {
  if (days > 30) return "bg-status-critical/10 text-status-critical"
  if (days > 7) return "bg-chart-4/10 text-chart-4"
  return "bg-status-warning/15 text-warning-foreground"
}

export function LateClientsTable({ rows }: { rows: LateClient[] }) {
  return (
    <TableCard
      title="Clientes con más atraso"
      help="Al cierre del período: días desde la cuota impaga más vieja, y monto vencido sin pagar (todos sus préstamos)."
      empty="Ningún cliente tiene atraso."
      isEmpty={rows.length === 0}
    >
      <table className="w-full min-w-[400px] text-sm">
        <thead>
          <tr className="text-left">
            <th className={TH}>Cliente</th>
            <th className={cn(TH, "text-right")}>Atraso</th>
            <th className={cn(TH, "text-right")}>Vencido</th>
            <th className={cn(TH, "text-right")}>Saldo capital</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.clientId}>
              <td className={TD}>
                <Link href={`/clientes/${r.clientId}`} className="font-medium hover:underline">
                  {r.clientName}
                </Link>
                {r.loans > 1 && <span className="ml-1 text-xs text-muted-foreground">({r.loans} préstamos)</span>}
              </td>
              <td className={cn(TD, "text-right")}>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", daysTone(r.maxDaysLate))}>
                  {formatCount(r.maxDaysLate)} {r.maxDaysLate === 1 ? "día" : "días"}
                </span>
              </td>
              <td className={cn(TD, "text-right font-medium text-status-critical")}>
                {formatCurrency(r.overdueAmount)}
              </td>
              <td className={cn(TD, "text-right")}>{formatCurrency(r.capitalAtRisk)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

export function FrequencyTable({ rows }: { rows: FrequencyBreakdown[] }) {
  return (
    <TableCard
      title="Rentabilidad por tipo de préstamo"
      help={
        <>
          Por frecuencia de pago. <b>Rentabilidad mensual</b> = ganancia cobrada en el período ÷ capital en la calle
          promedio de esa frecuencia ÷ meses del período.
        </>
      }
      empty="No hay préstamos en este período."
      isEmpty={rows.length === 0}
      className="lg:col-span-2"
    >
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left">
            <th className={TH}>Tipo</th>
            <th className={cn(TH, "text-right")}>Activos</th>
            <th className={cn(TH, "text-right")}>Capital en la calle</th>
            <th className={cn(TH, "text-right")}>Capital promedio</th>
            <th className={cn(TH, "text-right")}>Ganancia cobrada</th>
            <th className={cn(TH, "text-right")}>Rentabilidad mensual</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.frequency}>
              <td className={cn(TD, "font-medium")}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: FREQUENCY_COLORS[r.frequency] }}
                  />
                  {FREQUENCY_LABELS[r.frequency]}
                </span>
              </td>
              <td className={cn(TD, "text-right")}>{formatCount(r.activeLoans)}</td>
              <td className={cn(TD, "text-right")}>
                {formatCurrency(r.capitalOutstanding)}
                <span className="ml-1 text-xs text-muted-foreground">{formatPct(r.share, 0)}</span>
              </td>
              <td className={cn(TD, "text-right")}>{formatCurrency(r.averageCapital)}</td>
              <td className={cn(TD, "text-right text-status-good")}>{formatCurrency(r.interestCollected)}</td>
              <td className={cn(TD, "text-right font-semibold")}>{formatPct(r.monthlyReturn, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

/**
 * Préstamos cancelados: capital que salió y no volvió. Mientras no exista
 * "incobrable" (fase 2), es la forma de ver esa pérdida en Finanzas.
 */
export function CancelledLoansTable({ summary }: { summary: CancelledSummary }) {
  const { rows } = summary
  return (
    <TableCard
      title="Préstamos cancelados"
      help={
        <>
          Préstamos marcados «Cancelado» hasta el cierre del período. <b>No recuperado</b> = capital prestado − capital
          cobrado antes de cancelar. No se resta de la ganancia ni de la caja (la caja ya refleja el desembolso); solo
          muestra cuánto capital se perdió. Si un préstamo se canceló por error al crearlo, no es una pérdida real.
        </>
      }
      empty="No hay préstamos cancelados."
      isEmpty={rows.length === 0}
    >
      <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-status-critical">
          {formatCurrency(summary.capitalLost)}
        </p>
        <p className="pb-0.5 text-sm text-muted-foreground">
          de capital no recuperado en {formatCount(summary.loans)} {summary.loans === 1 ? "préstamo" : "préstamos"}
          {summary.periodLoans > 0 && (
            <>
              {" "}
              · {formatCount(summary.periodLoans)} en este período ({formatCurrency(summary.periodCapitalLost)})
            </>
          )}
        </p>
      </div>
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="text-left">
            <th className={TH}>Préstamo</th>
            <th className={TH}>Cancelado</th>
            <th className={cn(TH, "text-right")}>Prestado</th>
            <th className={cn(TH, "text-right")}>Cobrado</th>
            <th className={cn(TH, "text-right")}>No recuperado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.loanId}>
              <td className={TD}>
                <Link href={`/prestamos/${r.loanId}`} className="font-medium hover:underline">
                  {r.loanNumber}
                </Link>
                <span
                  className="block max-w-[14rem] truncate text-xs text-muted-foreground"
                  title={r.notes ?? undefined}
                >
                  {r.clientName}
                  {r.notes ? ` · ${r.notes}` : ""}
                </span>
              </td>
              <td className={cn(TD, "whitespace-nowrap", r.inPeriod ? "font-medium" : "text-muted-foreground")}>
                {formatShortDate(r.cancelledOn)}
              </td>
              <td className={cn(TD, "text-right")}>{formatCurrency(r.principal)}</td>
              <td className={cn(TD, "text-right text-muted-foreground")}>
                {r.payments > 0 ? formatCurrency(r.principalCollected + r.interestCollected) : "—"}
              </td>
              <td className={cn(TD, "text-right font-medium text-status-critical")}>{formatCurrency(r.capitalLost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}
