import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FREQUENCY_LABELS } from "@/lib/finance/frequency"
import type { FrequencyBreakdown, LateClient } from "@/lib/finance/indicators"
import type { LossSummary } from "@/lib/finance/losses"
import { ClassifyLoanDialog } from "./classify-loan-dialog"
import { ReasonDialog } from "./reason-dialog"
import { formatShortDate } from "@/lib/finance/periods"
import { cn } from "@/lib/utils"
import { formatCount, formatCurrency, formatPct } from "./format"
import { FREQUENCY_COLORS } from "./frequency-colors"
import { InfoHint } from "./info-hint"

export function TableCard({
  title,
  help,
  empty,
  isEmpty,
  children,
  className,
  action,
  summary,
}: {
  title: string
  help: React.ReactNode
  empty: string
  isEmpty: boolean
  children: React.ReactNode
  className?: string
  /** Botón a la derecha del título. */
  action?: React.ReactNode
  /** Resumen que se muestra aunque la tabla esté vacía. */
  summary?: React.ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-1.5 text-base">
          {title}
          <InfoHint title={title}>{help}</InfoHint>
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        {summary}
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

export const TH = "pb-2 text-xs font-medium text-muted-foreground"
export const TD = "py-2.5 tabular-nums"

export function CollectorsTable({
  rows,
  className,
}: {
  rows: {
    userId: string | null
    userName: string
    operations: number
    collected: number
    interest: number
    share: number | null
  }[]
  className?: string
}) {
  return (
    <TableCard
      className={className}
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

export function LateClientsTable({ rows, isAdmin, today }: { rows: LateClient[]; isAdmin: boolean; today: string }) {
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
            {isAdmin && <th className={cn(TH, "w-px")} aria-label="Acciones" />}
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
              {isAdmin && (
                <td className={cn(TD, "pl-3 text-right")}>
                  <ClassifyLoanDialog
                    mode="active"
                    clientName={r.clientName}
                    today={today}
                    loans={r.lateLoans.map((l) => ({
                      loanId: l.loanId,
                      loanNumber: l.loanNumber,
                      detail:
                        formatCount(l.daysLate) + " días de atraso · saldo capital " + formatCurrency(l.capitalAtRisk),
                      defaultDate: today,
                    }))}
                  />
                </td>
              )}
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

const LOSS_BADGE = {
  por_clasificar: { label: "Por clasificar", className: "bg-status-warning/15 text-warning-foreground" },
  incobrable: { label: "Incobrable", className: "bg-status-critical/10 text-status-critical" },
  error: { label: "Error", className: "bg-muted text-muted-foreground" },
} as const

/**
 * Cancelados e incobrables. Pérdida = capital no recuperado de los
 * marcados incobrables, en la fecha en que se marcan. Los marcados "error"
 * no son pérdida. Los cancelados sin clasificar quedan "por clasificar".
 */
export function LossesTable({ summary, isAdmin, today }: { summary: LossSummary; isAdmin: boolean; today: string }) {
  const { rows } = summary
  return (
    <TableCard
      title="Cancelados e incobrables"
      help={
        <>
          <b>Incobrable</b>: el cliente no va a pagar; su capital no recuperado es pérdida en la fecha en que se marca y
          se resta de la ganancia neta. <b>Error</b>: préstamo creado por error; no es pérdida. <b>Por clasificar</b>:
          cancelados que todavía no se han clasificado (no se restan). Marcar un préstamo no lo cambia: Dashboard,
          Capital y Cobros lo siguen mostrando igual.
        </>
      }
      empty="No hay préstamos cancelados ni incobrables."
      isEmpty={rows.length === 0}
      summary={
        rows.length > 0 && (
          <dl className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Pérdida reconocida</dt>
              <dd className="text-lg font-semibold tabular-nums text-status-critical">
                {formatCurrency(summary.loss)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {formatCount(summary.lossLoans)} {summary.lossLoans === 1 ? "préstamo" : "préstamos"}
                {summary.periodLossLoans > 0 && <> · {formatCurrency(summary.periodLoss)} en el período</>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Por clasificar</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatCurrency(summary.pending)}</dd>
              <dd className="text-xs text-muted-foreground">
                {formatCount(summary.pendingLoans)} {summary.pendingLoans === 1 ? "cancelado" : "cancelados"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Errores (no es pérdida)</dt>
              <dd className="text-lg font-semibold tabular-nums text-muted-foreground">
                {formatCurrency(summary.errors)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {formatCount(summary.errorLoans)} {summary.errorLoans === 1 ? "préstamo" : "préstamos"}
              </dd>
            </div>
          </dl>
        )
      }
    >
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left">
            <th className={TH}>Préstamo</th>
            <th className={TH}>Estado</th>
            <th className={TH}>Fecha</th>
            <th className={cn(TH, "text-right")}>No recuperado</th>
            {isAdmin && <th className={cn(TH, "w-px")} aria-label="Acciones" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const badge = LOSS_BADGE[r.status]
            const note = r.writeoff?.reason ?? r.notes
            const date = r.writeoff?.date ?? r.cancelledOn
            const loanState =
              r.loanStatus === "cancelado"
                ? "Cancelado"
                : r.loanStatus === "pagado"
                  ? "Se pagó después"
                  : "Sigue activo"
            return (
              <tr key={r.loanId}>
                <td className={TD}>
                  <Link href={`/prestamos/${r.loanId}`} className="font-medium hover:underline">
                    {r.loanNumber}
                  </Link>
                  <span
                    className="block max-w-[15rem] truncate text-xs text-muted-foreground"
                    title={note ?? undefined}
                  >
                    {r.clientName}
                    {note ? ` · ${note}` : ""}
                  </span>
                </td>
                <td className={TD}>
                  <span
                    className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", badge.className)}
                  >
                    {badge.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{loanState}</span>
                </td>
                <td className={cn(TD, "whitespace-nowrap", r.inPeriod ? "font-medium" : "text-muted-foreground")}>
                  {date ? formatShortDate(date) : "—"}
                  {r.writeoff && r.cancelledOn && r.cancelledOn !== r.writeoff.date && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      cancelado {formatShortDate(r.cancelledOn)}
                    </span>
                  )}
                </td>
                <td
                  className={cn(
                    TD,
                    "text-right font-medium",
                    r.status === "incobrable" && "text-status-critical",
                    r.status === "error" && "text-muted-foreground line-through"
                  )}
                >
                  {formatCurrency(r.capitalLost)}
                </td>
                {isAdmin && (
                  <td className={cn(TD, "pl-3 text-right")}>
                    {r.writeoff ? (
                      <ReasonDialog
                        kind="writeoff"
                        id={r.writeoff.id}
                        description={`${r.loanNumber} (${r.clientName}) volverá a quedar ${
                          r.loanStatus === "cancelado" ? "por clasificar" : "en la cartera de Finanzas"
                        }. Lo clasificó ${r.writeoff.by}: «${r.writeoff.reason}».`}
                      />
                    ) : (
                      <ClassifyLoanDialog
                        mode="cancelled"
                        clientName={r.clientName}
                        today={today}
                        loans={[
                          {
                            loanId: r.loanId,
                            loanNumber: r.loanNumber,
                            detail: [
                              r.principal !== null ? `Prestado ${formatCurrency(r.principal)}` : null,
                              r.collectedBefore !== null ? `cobrado ${formatCurrency(r.collectedBefore)}` : null,
                              `no recuperado ${formatCurrency(r.capitalLost)}`,
                              r.cancelledOn ? `cancelado el ${formatShortDate(r.cancelledOn)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · "),
                            defaultDate: r.cancelledOn && r.cancelledOn <= today ? r.cancelledOn : today,
                          },
                        ]}
                      />
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableCard>
  )
}
