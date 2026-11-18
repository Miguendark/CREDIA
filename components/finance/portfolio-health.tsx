import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { compare, type AgingSummary, type Change } from "@/lib/finance/indicators"
import { cn } from "@/lib/utils"
import { DeltaBadge } from "./delta-badge"
import { formatCount, formatCurrency, formatPct } from "./format"
import { InfoHint } from "./info-hint"

const BUCKET_COLORS: Record<string, string> = {
  "1-7": "var(--status-warning)",
  "8-30": "var(--chart-4)",
  "31+": "var(--status-critical)",
}

function CardTitleWithHint({ title, help }: { title: string; help: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-1.5 text-base">
      {title}
      <InfoHint title={title}>{help}</InfoHint>
    </CardTitle>
  )
}

export function PortfolioRiskCard({ current, previous }: { current: AgingSummary; previous: AgingSummary }) {
  const total = current.capitalAtRisk + current.currentCapital
  const segments = [
    {
      key: "ok",
      label: "Al día",
      value: current.currentCapital,
      color: "var(--status-good)",
    },
    ...current.buckets.map((b) => ({
      key: b.key,
      label: b.label,
      value: b.capitalAtRisk,
      color: BUCKET_COLORS[b.key],
    })),
  ].filter((s) => s.value > 0)
  const change = current.pct !== null && previous.pct !== null ? compare(current.pct, previous.pct) : null

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitleWithHint
          title="Cartera en riesgo"
          help={
            <>
              Préstamos con al menos una cuota vencida y sin pagar. Se mide con el <b>saldo de capital</b> del préstamo
              (estándar del sector) sobre el capital en la calle. «Monto vencido» es solo lo atrasado.
            </>
          }
        />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatPct(current.pct)}</p>
          <div className="pb-1 text-sm text-muted-foreground">
            {formatCurrency(current.capitalAtRisk)} en {formatCount(current.loans)}{" "}
            {current.loans === 1 ? "préstamo" : "préstamos"}
          </div>
          <DeltaBadge change={change} polarity="higher_is_worse" format="points" className="mb-1" />
        </div>

        {total > 0 ? (
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label="Distribución de la cartera por atraso"
          >
            {segments.map((s) => (
              <div
                key={s.key}
                style={{
                  width: `${(s.value / total) * 100}%`,
                  backgroundColor: s.color,
                }}
                title={s.label}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay capital en la calle.</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Atraso</th>
                <th className="pb-2 text-right font-medium">Préstamos</th>
                <th className="pb-2 text-right font-medium">Saldo de capital</th>
                <th className="pb-2 text-right font-medium">Monto vencido</th>
                <th className="pb-2 text-right font-medium">% cartera</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-status-good" /> Al día
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{formatCount(current.currentLoans)}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(current.currentCapital)}</td>
                <td className="py-2 text-right tabular-nums">—</td>
                <td className="py-2 text-right tabular-nums">
                  {formatPct(total > 0 ? (current.currentCapital / total) * 100 : null)}
                </td>
              </tr>
              {current.buckets.map((b) => (
                <tr key={b.key}>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: BUCKET_COLORS[b.key] }} />{" "}
                      {b.label}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatCount(b.loans)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(b.capitalAtRisk)}</td>
                  <td className="py-2 text-right tabular-nums text-status-critical">
                    {b.overdueAmount > 0 ? formatCurrency(b.overdueAmount) : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatPct(b.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export function EfficiencyCard({
  current,
  previous,
  due,
  collected,
  installmentsDue,
  installmentsPaid,
}: {
  current: number | null
  previous: number | null
  due: number
  collected: number
  installmentsDue: number
  installmentsPaid: number
}) {
  const change = current !== null && previous !== null ? compare(current, previous) : null
  const tone =
    current === null
      ? "bg-muted"
      : current >= 90
        ? "bg-status-good"
        : current >= 70
          ? "bg-status-warning"
          : "bg-status-critical"
  return (
    <Card>
      <CardHeader>
        <CardTitleWithHint
          title="Eficiencia de cobro"
          help={
            <>
              De las cuotas que vencían en el período, cuánto se cobró de ellas hasta el cierre del período. Ejemplo:
              vencían RD$10,000 y se cobraron RD$8,500 de esas cuotas → 85 %.
            </>
          }
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatPct(current)}</p>
          <DeltaBadge change={change} polarity="higher_is_better" format="points" className="mb-1" />
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(current ?? 0, 100)}%` }} />
        </div>
        {installmentsDue === 0 ? (
          <p className="text-sm text-muted-foreground">No vencía ninguna cuota en este período.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Tocaba cobrar</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(due)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Se cobró</dt>
              <dd className="font-medium tabular-nums text-status-good">{formatCurrency(collected)}</dd>
            </div>
            <div className="col-span-2 text-xs text-muted-foreground">
              {formatCount(installmentsPaid)} de {formatCount(installmentsDue)} cuotas pagadas completas
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  )
}

export function LoanCountsCard({
  active,
  created,
  paid,
  overdue,
}: {
  active: Change
  created: Change
  paid: Change
  overdue: Change
}) {
  const items = [
    {
      label: "Activos",
      change: active,
      polarity: "neutral" as const,
      hint: "al cierre",
    },
    {
      label: "Nuevos",
      change: created,
      polarity: "higher_is_better" as const,
      hint: "en el período",
    },
    {
      label: "Pagados",
      change: paid,
      polarity: "higher_is_better" as const,
      hint: "en el período",
    },
    {
      label: "Vencidos",
      change: overdue,
      polarity: "higher_is_worse" as const,
      hint: "al cierre",
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitleWithHint
          title="Préstamos"
          help={
            <>
              <b>Activos</b>: con saldo al cierre. <b>Nuevos</b>: otorgados en el período. <b>Pagados</b>: su último
              pago cayó en el período. <b>Vencidos</b>: con alguna cuota atrasada al cierre.
            </>
          }
        />
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5">
        {items.map((i) => (
          <div key={i.label} className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {i.label} <span className="text-muted-foreground/70">· {i.hint}</span>
            </p>
            <p className="text-2xl font-semibold tabular-nums">{formatCount(i.change.current)}</p>
            <DeltaBadge change={i.change} polarity={i.polarity} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
