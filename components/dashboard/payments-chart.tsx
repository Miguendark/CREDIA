"use client"

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PaymentsChartPoint } from "@/types/domain"
import { ChartEmptyState, ChartTooltip } from "./chart-tooltip"

const SERIES = [
  { key: "paid", name: "Pagados", color: "var(--status-good)" },
  { key: "pending", name: "Pendientes", color: "var(--status-warning)" },
  { key: "overdue", name: "Vencidos", color: "var(--status-critical)" },
] as const

export function PaymentsChart({ data }: { data: PaymentsChartPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagos</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} barCategoryGap={20}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                width={40}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
              />
              {SERIES.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.name}
                  stackId="installments"
                  fill={series.color}
                  radius={
                    index === SERIES.length - 1 ? [4, 4, 0, 0] : index === 0 ? [0, 0, 4, 4] : undefined
                  }
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
