import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Banknote, HandCoins, Landmark, Percent, PiggyBank, TrendingUp } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaffUser } from "@/services/users.service"
import { getFinanceDashboard, MONTHS_IN_CHART, PROJECTION_WEEKS } from "@/services/finance.service"
import { periodFromParams, formatRange, type PeriodKey } from "@/lib/finance/periods"
import { todayRD } from "@/lib/utils/date"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/finance/kpi-card"
import { InfoHint } from "@/components/finance/info-hint"
import { PeriodFilter } from "@/components/finance/period-filter"
import { CashflowChart, FrequencyChart, ProfitChart, ProjectionChart } from "@/components/finance/finance-charts"
import { EfficiencyCard, LoanCountsCard, PortfolioRiskCard } from "@/components/finance/portfolio-health"
import {
  CancelledLoansTable,
  CollectorsTable,
  FrequencyTable,
  LateClientsTable,
  TopClientsTable,
} from "@/components/finance/finance-tables"
import { formatCount, formatCurrency, formatPct } from "@/components/finance/format"

export const metadata: Metadata = { title: "Finanzas" }
export const revalidate = 0

function SectionTitle({ children, description }: { children: React.ReactNode; description?: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

function ChartCard({
  title,
  help,
  subtitle,
  className,
  children,
}: {
  title: string
  help: React.ReactNode
  subtitle?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-1.5 text-base">
          {title}
          <InfoHint title={title}>{help}</InfoHint>
        </CardTitle>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>
}) {
  const supabase = await createClient()
  const staffUser = await getCurrentStaffUser(supabase)
  if (!staffUser || !["admin", "supervisor"].includes(staffUser.role)) {
    notFound()
  }

  const today = todayRD()
  const period = periodFromParams(await searchParams, today)
  const data = await getFinanceDashboard(supabase, period, today)
  const { kpis } = data
  const prev = (value: number) => `${formatCurrency(value)} antes`
  const projectionTotal = data.projection.weeks.reduce((s, w) => s + w.total, 0)
  const projectionInterest = data.projection.weeks.reduce((s, w) => s + w.interest, 0)

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <PageHeader
          title="Finanzas"
          description="Ganancia, cartera y flujo de dinero de CREDIA."
          action={<PeriodFilter periodKey={period.key as PeriodKey} from={period.from} to={period.to} today={today} />}
        />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatRange(period.from, period.to)}</span>
          <span className="mx-1.5">·</span>
          comparado con {formatRange(period.prevFrom, period.prevTo)}
        </p>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Ganancia cobrada"
          value={formatCurrency(kpis.interestCollected.current)}
          icon={TrendingUp}
          accent="profit"
          change={kpis.interestCollected}
          polarity="higher_is_better"
          previousLabel={prev(kpis.interestCollected.previous)}
          help="Interés cobrado en el período: la parte de interés de cada pago registrado (por fecha de pago). Es la ganancia real que ya entró."
        />
        <KpiCard
          label="Ganancia por cobrar"
          value={formatCurrency(kpis.interestOutstanding.current)}
          icon={Landmark}
          accent="profit"
          change={kpis.interestOutstanding}
          polarity="neutral"
          previousLabel={prev(kpis.interestOutstanding.previous)}
          help="Interés pactado de los préstamos vigentes que todavía no se ha cobrado, al cierre del período. Es ganancia futura si los clientes pagan."
        />
        <KpiCard
          label="Capital en la calle"
          value={formatCurrency(kpis.capitalOutstanding.current)}
          icon={HandCoins}
          accent="capital"
          change={kpis.capitalOutstanding}
          polarity="neutral"
          previousLabel={prev(kpis.capitalOutstanding.previous)}
          help="Capital prestado que falta por recuperar, al cierre del período: capital de los préstamos vigentes menos el capital ya cobrado. No incluye cancelados."
          footnote={
            (data.futureDated.capital !== 0 || data.cancelled.capitalLost > 0) && (
              <>
                {data.futureDated.capital !== 0 && (
                  <span className="block">
                    Incluye {formatCurrency(data.futureDated.capital)} de préstamos con fecha de inicio futura.
                  </span>
                )}
                {data.cancelled.capitalLost > 0 && (
                  <span className="block text-status-critical">
                    No incluye {formatCurrency(data.cancelled.capitalLost)} de capital no recuperado en{" "}
                    {formatCount(data.cancelled.loans)}{" "}
                    {data.cancelled.loans === 1 ? "préstamo cancelado" : "préstamos cancelados"}.
                  </span>
                )}
              </>
            )
          }
        />
        <KpiCard
          label="Capital recuperado"
          value={formatCurrency(kpis.principalCollected.current)}
          icon={Banknote}
          accent="capital"
          change={kpis.principalCollected}
          polarity="higher_is_better"
          previousLabel={prev(kpis.principalCollected.previous)}
          help="La parte de capital de los pagos cobrados en el período. Junto con la ganancia cobrada suma todo lo cobrado."
          footnote={`Total cobrado: ${formatCurrency(data.totals.collected)} en ${formatCount(data.totals.operations)} ${data.totals.operations === 1 ? "pago" : "pagos"}.`}
        />
        <KpiCard
          label="Disponible en caja"
          value={formatCurrency(kpis.cash.current)}
          icon={PiggyBank}
          accent={kpis.cash.current < 0 ? "risk" : "profit"}
          change={kpis.cash}
          polarity="neutral"
          deltaFormat="amount"
          previousLabel={prev(kpis.cash.previous)}
          help="Aportes + pagos cobrados + ajustes − retiros − préstamos desembolsados, al cierre del período. Es el mismo cálculo de la pantalla Capital."
          footnote={
            data.futureDated.cash !== 0
              ? `Incluye ${formatCurrency(data.futureDated.cash)} de movimientos con fecha futura (igual que Capital).`
              : undefined
          }
        />
        <KpiCard
          label="Rentabilidad mensual"
          value={formatPct(kpis.monthlyReturn.current, 2)}
          icon={Percent}
          accent="profit"
          change={kpis.monthlyReturn.change}
          polarity="higher_is_better"
          deltaFormat="points"
          previousLabel={
            kpis.monthlyReturn.previous !== null ? `${formatPct(kpis.monthlyReturn.previous, 2)} antes` : undefined
          }
          help={
            <>
              Ganancia cobrada ÷ capital en la calle promedio del período, llevada a un mes. Ejemplo: RD$10,000 de
              ganancia sobre RD$200,000 en la calle durante un mes = 5 % mensual.
            </>
          }
          footnote={`Capital en la calle promedio: ${formatCurrency(data.totals.averageCapital)}.`}
        />
      </section>

      {/* Salud de la cartera */}
      <section className="space-y-4">
        <SectionTitle description="Atraso, cumplimiento de pagos y movimiento de préstamos.">
          Salud de la cartera
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <PortfolioRiskCard current={data.aging.current} previous={data.aging.previous} />
          <EfficiencyCard {...data.efficiency} />
          <LoanCountsCard
            active={data.loans.active}
            created={data.loans.new}
            paid={data.loans.paid}
            overdue={data.loans.overdue}
          />
        </div>
      </section>

      {/* Gráficos */}
      <section className="space-y-4">
        <SectionTitle description={`Últimos ${MONTHS_IN_CHART} meses y próximas ${PROJECTION_WEEKS} semanas.`}>
          Tendencias
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Ganancia mes a mes"
            help="Interés cobrado cada mes (por fecha de pago)."
            className="lg:col-span-2"
          >
            <ProfitChart data={data.monthly} />
          </ChartCard>
          <ChartCard
            title="Cartera por frecuencia"
            help="Cómo se reparte hoy el capital en la calle entre préstamos semanales, quincenales y mensuales. Entre paréntesis, cuántos préstamos."
          >
            <FrequencyChart data={data.byFrequency} />
          </ChartCard>
          <ChartCard
            title="Entradas vs. préstamos desembolsados"
            help="Por mes: lo cobrado (capital + interés) contra el dinero que salió en préstamos nuevos."
            className="lg:col-span-2"
          >
            <CashflowChart data={data.monthly} />
          </ChartCard>
          <ChartCard
            title="Proyección de entradas"
            help="Lo que falta cobrar de las cuotas que vencen en cada una de las próximas semanas, separado en capital e interés. Es lo esperado si todos pagan a tiempo."
            subtitle={
              <>
                {formatCurrency(projectionTotal)} esperados · {formatCurrency(projectionInterest)} de ganancia
                {data.projection.overdue.total > 0 && (
                  <span className="mt-1 block text-status-critical">
                    + {formatCurrency(data.projection.overdue.total)} ya atrasado (
                    {formatCount(data.projection.overdue.installments)}{" "}
                    {data.projection.overdue.installments === 1 ? "cuota" : "cuotas"})
                  </span>
                )}
              </>
            }
          >
            <ProjectionChart weeks={data.projection.weeks} />
          </ChartCard>
        </div>
      </section>

      {/* Detalle */}
      <section className="space-y-4">
        <SectionTitle description="Quién cobra, qué se perdió, quién genera más ganancia y quién está atrasado.">
          Detalle
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CollectorsTable rows={data.byUser} />
          <CancelledLoansTable summary={data.cancelled} />
          <TopClientsTable rows={data.topClients} />
          <LateClientsTable rows={data.lateClients} />
          <FrequencyTable rows={data.byFrequency} />
        </div>
      </section>
    </div>
  )
}
