import { Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { compare, type Change } from "@/lib/finance/indicators"
import { EXPENSE_CATEGORY_LABELS, type ExpenseSummary } from "@/lib/finance/losses"
import { formatShortDate } from "@/lib/finance/periods"
import { cn } from "@/lib/utils"
import { DeltaBadge } from "./delta-badge"
import { ExpenseDialog } from "./expense-dialog"
import { TableCard, TD, TH } from "./finance-tables"
import { formatCount, formatCurrency, formatPct } from "./format"
import { InfoHint } from "./info-hint"
import { ReasonDialog } from "./reason-dialog"

/**
 * Gastos del período: total contra el período anterior, reparto por
 * categoría y la lista (los anulados se ven tachados). Admin y supervisor
 * registran; solo admin anula.
 */
export function ExpensesCard({
  summary,
  previousTotal,
  isAdmin,
}: {
  summary: ExpenseSummary
  previousTotal: number
  isAdmin: boolean
}) {
  const change: Change = compare(summary.total, previousTotal)
  return (
    <TableCard
      title="Gastos"
      help={
        <>
          Gastos de operación registrados en el período, por fecha del gasto. Se restan de la ganancia neta y de «Caja
          después de gastos». No cambian el disponible de Capital. Un gasto anulado no cuenta.
        </>
      }
      action={<ExpenseDialog />}
      empty="No hay gastos en este período."
      isEmpty={summary.rows.length === 0}
      summary={
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(summary.total)}</p>
            <DeltaBadge change={change} polarity="higher_is_worse" className="mb-1" />
            <span className="mb-1 text-xs text-muted-foreground">{formatCurrency(previousTotal)} antes</span>
          </div>
          {summary.byCategory.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {summary.byCategory.map((c) => (
                <li key={c.category} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{c.label}</span>
                    <span className="text-xs text-muted-foreground">({formatCount(c.count)})</span>
                  </span>
                  <span className="text-right tabular-nums">
                    {formatCurrency(c.amount)}
                    <span className="ml-1.5 text-xs text-muted-foreground">{formatPct(c.share, 0)}</span>
                  </span>
                  <span className="col-span-2 h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-chart-4"
                      style={{ width: `${Math.min(c.share ?? 0, 100)}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    >
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="text-left">
            <th className={TH}>Fecha</th>
            <th className={TH}>Gasto</th>
            <th className={cn(TH, "text-right")}>Monto</th>
            {isAdmin && <th className={cn(TH, "w-px")} aria-label="Acciones" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {summary.rows.map((e) => {
            const voided = !!e.voided_at
            return (
              <tr key={e.id} className={cn(voided && "text-muted-foreground")}>
                <td className={cn(TD, "whitespace-nowrap")}>{formatShortDate(e.expense_date)}</td>
                <td className={TD}>
                  <span className={cn("font-medium", voided && "line-through")}>
                    {EXPENSE_CATEGORY_LABELS[e.category]}
                  </span>
                  <span
                    className="block max-w-[16rem] truncate text-xs text-muted-foreground"
                    title={voided ? `Anulado: ${e.void_reason}` : (e.description ?? undefined)}
                  >
                    {voided
                      ? `Anulado por ${e.voided_by_name ?? "—"}: ${e.void_reason}`
                      : [e.description, e.created_by_name].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td className={cn(TD, "text-right font-medium", voided && "line-through")}>
                  {formatCurrency(e.amount)}
                </td>
                {isAdmin && (
                  <td className={cn(TD, "pl-3 text-right")}>
                    {!voided && (
                      <ReasonDialog
                        kind="expense"
                        id={e.id}
                        description={`${EXPENSE_CATEGORY_LABELS[e.category]} de ${formatCurrency(e.amount)} del ${formatShortDate(
                          e.expense_date
                        )}. Deja de contar en la ganancia neta y en la caja después de gastos.`}
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

/** Mora (cargos por atraso): todavía no existe; se deja el lugar reservado. */
export function MoraCard() {
  return (
    <Card className="border-dashed bg-transparent shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base text-muted-foreground">
          Mora cobrada
          <InfoHint title="Mora cobrada">
            Cargos por atraso cobrados a los clientes. Todavía no se registran en NEXA; cuando existan se sumarán a la
            ganancia neta.
          </InfoHint>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="size-4" />
        Próximamente
      </CardContent>
    </Card>
  )
}
