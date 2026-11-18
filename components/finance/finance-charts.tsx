"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChartEmptyState, ChartTooltip } from "@/components/dashboard/chart-tooltip"
import { FREQUENCY_LABELS } from "@/lib/finance/frequency"
import type { FrequencyBreakdown, ProjectionPoint } from "@/lib/finance/indicators"
import { formatMonthLabel } from "@/lib/finance/periods"
import { formatCompactCurrency, formatCurrency, formatPct } from "./format"
import { FREQUENCY_COLORS } from "./frequency-colors"

const AXIS = {
  tickLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 12 },
} as const
const LEGEND = {
  iconType: "circle" as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 12, color: "var(--muted-foreground)" },
}

const COLORS = {
  profit: "var(--status-good)",
  capital: "var(--chart-1)",
  disbursed: "var(--chart-5)",
  risk: "var(--status-critical)",
}

export interface MonthlyPoint {
  monthStart: string
  interest: number
  principal: number
  collected: number
  disbursed: number
}

const hasValues = (rows: object[], keys: string[]) =>
  rows.some((r) => keys.some((k) => Number((r as Record<string, unknown>)[k] ?? 0) !== 0))

/** Ganancia (interés cobrado) de los últimos 12 meses. */
export function ProfitChart({ data }: { data: MonthlyPoint[] }) {
  const rows = data.map((d) => ({
    label: formatMonthLabel(d.monthStart),
    interest: d.interest,
  }))
  if (!hasValues(rows, ["interest"]))
    return <ChartEmptyState message="Todavía no hay interés cobrado en estos 12 meses." />
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" axisLine={{ stroke: "var(--border)" }} {...AXIS} />
        <YAxis axisLine={false} width={64} tickFormatter={formatCompactCurrency} {...AXIS} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="interest" name="Ganancia cobrada" fill={COLORS.profit} radius={[4, 4, 0, 0]} maxBarSize={34} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Entradas (capital + interés cobrado) vs. préstamos desembolsados por mes. */
export function CashflowChart({ data }: { data: MonthlyPoint[] }) {
  const rows = data.map((d) => ({
    label: formatMonthLabel(d.monthStart),
    collected: d.collected,
    disbursed: d.disbursed,
  }))
  if (!hasValues(rows, ["collected", "disbursed"]))
    return <ChartEmptyState message="Todavía no hay cobros ni desembolsos en estos 12 meses." />
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} barGap={3} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" axisLine={{ stroke: "var(--border)" }} {...AXIS} />
        <YAxis axisLine={false} width={64} tickFormatter={formatCompactCurrency} {...AXIS} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Legend {...LEGEND} />
        <Bar dataKey="collected" name="Entradas (cobros)" fill={COLORS.profit} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar
          dataKey="disbursed"
          name="Préstamos desembolsados"
          fill={COLORS.disbursed}
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Próximas semanas: capital e interés por cobrar de las cuotas pendientes. */
export function ProjectionChart({ weeks }: { weeks: ProjectionPoint[] }) {
  if (!hasValues(weeks, ["total"]))
    return <ChartEmptyState message="No hay cuotas pendientes en las próximas semanas." />
  const rows = weeks.map((w) => ({
    label: w.label,
    range: w.range,
    capital: w.capital,
    interest: w.interest,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" axisLine={{ stroke: "var(--border)" }} {...AXIS} />
        <YAxis axisLine={false} width={64} tickFormatter={formatCompactCurrency} {...AXIS} />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={({ active, payload, label }) => (
            <ChartTooltip
              active={active}
              label={`${label} · ${(payload?.[0]?.payload as { range?: string } | undefined)?.range ?? ""}`}
              payload={payload?.map((p) => ({
                name: String(p.name),
                value: Number(p.value),
                color: String(p.color),
              }))}
            />
          )}
        />
        <Legend {...LEGEND} />
        <Bar dataKey="capital" name="Capital" stackId="p" fill={COLORS.capital} maxBarSize={44} />
        <Bar
          dataKey="interest"
          name="Interés (ganancia)"
          stackId="p"
          fill={COLORS.profit}
          radius={[4, 4, 0, 0]}
          maxBarSize={44}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Composición de la cartera (capital en la calle) por frecuencia. */
export function FrequencyChart({ data }: { data: FrequencyBreakdown[] }) {
  const rows = data
    .filter((d) => d.capitalOutstanding > 0)
    .map((d) => ({
      key: d.frequency,
      name: FREQUENCY_LABELS[d.frequency],
      value: d.capitalOutstanding,
      loans: d.activeLoans,
      share: d.share,
    }))
  if (rows.length === 0) return <ChartEmptyState message="No hay capital en la calle." />
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_auto]">
      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {rows.map((r) => (
                <Cell key={r.key} fill={FREQUENCY_COLORS[r.key]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <ChartTooltip
                    active
                    label={`${payload[0].name} · ${formatPct((payload[0].payload as { share: number | null }).share)}`}
                    payload={[
                      {
                        name: "Capital en la calle",
                        value: Number(payload[0].value),
                        color: String(payload[0].payload.fill),
                      },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-sm font-semibold tabular-nums">{formatCompactCurrency(total)}</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: FREQUENCY_COLORS[r.key] }} />
              {r.name}
              <span className="text-xs text-muted-foreground">({r.loans})</span>
            </span>
            <span className="text-right tabular-nums">
              <span className="font-medium">{formatPct(r.share)}</span>
              <span className="block text-xs text-muted-foreground">{formatCurrency(r.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
