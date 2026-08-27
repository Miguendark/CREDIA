"use client"

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { LoanStatusChartPoint } from "@/types/domain"
import { ChartEmptyState } from "./chart-tooltip"

const STATUS_COLORS: Record<string, string> = {
  Activos: "var(--chart-1)",
  Vencidos: "var(--status-critical)",
  Pagados: "var(--status-good)",
  Cancelados: "var(--status-neutral)",
}

export function LoanStatusChart({ data }: { data: LoanStatusChartPoint[] }) {
  const hasData = data.some((d) => d.count > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado de préstamos</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <ChartEmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="status"
                tickLine={false}
                axisLine={false}
                width={80}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null
                  const point = payload[0].payload as LoanStatusChartPoint
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
                      <span className="font-medium">{point.status}:</span> {point.count}
                    </div>
                  )
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {data.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "var(--chart-5)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
