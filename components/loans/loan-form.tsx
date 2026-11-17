"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import { ClientCombobox } from "@/components/shared/client-combobox"
import { FixedDayInput } from "@/components/loans/fixed-day-input"
import { loanSchema, type LoanInput } from "@/lib/validations/loan"
import { calculateLoan } from "@/lib/finance/loan-calculator"
import { addPeriod, FREQUENCY_LABELS } from "@/lib/finance/frequency"
import {
  FIXED_DAY_HINTS,
  FIXED_DAY_LABELS,
  fixedScheduleAllowed,
  formatLoanSchedule,
  nextScheduledDate,
  normalizePaymentDays,
  validateFixedSchedule,
} from "@/lib/finance/fixed-days"
import { todayRD } from "@/lib/utils/date"
import { INTEREST_TYPE_LABELS } from "@/lib/finance/loan-calculator"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { createLoanAction } from "@/app/(app)/prestamos/actions"
import type { LoanFrequency, LoanInterestType } from "@/types/database.types"

const NO_DAYS: number[] = []

export function LoanForm({
  preselectedClientId,
  preselectedClientLabel,
}: {
  preselectedClientId?: string
  preselectedClientLabel?: string
}) {
  const router = useRouter()
  const [today] = useState(todayRD)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [firstPaymentTouched, setFirstPaymentTouched] = useState(false)

  const form = useForm<LoanInput>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      client_id: preselectedClientId ?? "",
      principal_amount: 0,
      interest_type: "fixed_capital",
      interest_rate: 10,
      number_of_installments: 4,
      frequency: "monthly",
      schedule_type: "interval",
      payment_days: [],
      payment_weekday: null,
      start_date: today,
      first_payment_date: addPeriod(today, "monthly"),
      notes: "",
    },
  })

  const [
    principal,
    interestRate,
    interestType,
    numberOfInstallments,
    frequency,
    scheduleType,
    watchedPaymentDays,
    watchedPaymentWeekday,
    startDate,
    firstPaymentDate,
  ] = form.watch([
    "principal_amount",
    "interest_rate",
    "interest_type",
    "number_of_installments",
    "frequency",
    "schedule_type",
    "payment_days",
    "payment_weekday",
    "start_date",
    "first_payment_date",
  ])

  const paymentDays = watchedPaymentDays ?? NO_DAYS
  const paymentWeekday = watchedPaymentWeekday ?? null
  const isFixedDays = scheduleType === "fixed_days"
  const fixedAllowed = fixedScheduleAllowed(frequency as LoanFrequency)
  const fixedError = isFixedDays ? validateFixedSchedule(frequency as LoanFrequency, paymentDays, paymentWeekday) : null
  const fixedSchedule = useMemo(
    () => ({ days: normalizePaymentDays(paymentDays), weekday: paymentWeekday }),
    [paymentDays, paymentWeekday]
  )

  useEffect(() => {
    if (!startDate) return
    if (isFixedDays) {
      // Con día fijo la primera cuota se calcula sola (la frecuencia la elige el usuario).
      if (fixedError) return
      form.setValue("first_payment_date", nextScheduledDate(startDate, fixedSchedule))
      return
    }
    if (firstPaymentTouched) return
    form.setValue("first_payment_date", addPeriod(startDate, frequency as LoanFrequency))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, frequency, isFixedDays, fixedError, fixedSchedule])

  /** Al cambiar la frecuencia se borra el día fijo (no sirve para la nueva); diaria vuelve a Automático. */
  function handleFrequencyChange(next: LoanFrequency) {
    form.setValue("frequency", next)
    form.setValue("payment_days", [])
    form.setValue("payment_weekday", null)
    if (!fixedScheduleAllowed(next)) form.setValue("schedule_type", "interval")
    setFirstPaymentTouched(false)
  }

  const calculation = useMemo(() => {
    if (!principal || principal <= 0 || !numberOfInstallments || numberOfInstallments <= 0) return null
    if (!firstPaymentDate) return null
    if (isFixedDays && fixedError) return null
    try {
      return calculateLoan({
        principal: Number(principal),
        interestRate: Number(interestRate) || 0,
        interestType: interestType as LoanInterestType,
        numberOfInstallments: Number(numberOfInstallments),
        frequency: frequency as LoanFrequency,
        firstPaymentDate,
        schedule: isFixedDays ? { type: "fixed_days", ...fixedSchedule } : undefined,
      })
    } catch {
      return null
    }
  }, [principal, interestRate, interestType, numberOfInstallments, frequency, firstPaymentDate, isFixedDays, fixedError, fixedSchedule])

  async function onSubmit(values: LoanInput) {
    setIsSubmitting(true)
    const result = await createLoanAction(values)
    setIsSubmitting(false)

    if (!result.success) {
      toast.error(result.message)
      return
    }

    toast.success("Préstamo creado")
    router.push(`/prestamos/${result.loanId}`)
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Cliente *</FormLabel>
                  <FormControl>
                    <ClientCombobox
                      value={field.value}
                      onChange={(id) => field.onChange(id)}
                      initialLabel={preselectedClientLabel}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="principal_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capital (RD$) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={isSubmitting}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="interest_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de interés *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(INTEREST_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="interest_rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Tasa de interés (%) * {interestType === "declining_balance" && "— por período"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={isSubmitting}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="number_of_installments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de cuotas *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      disabled={isSubmitting}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frecuencia *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => handleFrequencyChange(value as LoanFrequency)}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="schedule_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fechas de pago *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      form.setValue("payment_days", [])
                      form.setValue("payment_weekday", null)
                      setFirstPaymentTouched(false)
                    }}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="interval">Automático</SelectItem>
                      <SelectItem value="fixed_days" disabled={!fixedAllowed}>
                        Día fijo
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {!fixedAllowed && (
                    <FormDescription>La frecuencia diaria no permite día fijo; solo Automático.</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {isFixedDays && (
              <FormItem className="sm:col-span-2">
                <FormLabel>{FIXED_DAY_LABELS[frequency as LoanFrequency]} *</FormLabel>
                <FixedDayInput
                  key={frequency}
                  frequency={frequency as LoanFrequency}
                  value={fixedSchedule}
                  onChange={(v) => {
                    form.setValue("payment_days", v.days)
                    form.setValue("payment_weekday", v.weekday)
                  }}
                  disabled={isSubmitting}
                />
                {fixedError ? (
                  <p className="text-sm text-status-critical">{fixedError}</p>
                ) : (
                  <FormDescription>{FIXED_DAY_HINTS[frequency as LoanFrequency]}</FormDescription>
                )}
              </FormItem>
            )}

            <FormField
              control={form.control}
              name="start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de inicio *</FormLabel>
                  <FormControl>
                    <Input type="date" disabled={isSubmitting} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="first_payment_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primer vencimiento *</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      disabled={isSubmitting}
                      readOnly={isFixedDays}
                      {...field}
                      onChange={(e) => {
                        if (isFixedDays) return
                        setFirstPaymentTouched(true)
                        field.onChange(e)
                      }}
                    />
                  </FormControl>
                  {isFixedDays && (
                    <FormDescription>Se calcula solo: el siguiente día fijo después de la fecha de inicio.</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea rows={3} disabled={isSubmitting} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Resumen del préstamo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!calculation ? (
                <p className="text-sm text-muted-foreground">
                  Completa el capital, la tasa y el número de cuotas para ver el cálculo.
                </p>
              ) : (
                <>
                  <SummaryRow label="Capital" value={formatCurrency(principal)} />
                  <SummaryRow label="Interés" value={formatCurrency(calculation.totalInterest)} />
                  <SummaryRow label="Total a pagar" value={formatCurrency(calculation.totalAmount)} strong />
                  <Separator />
                  <SummaryRow label="Cuotas" value={String(numberOfInstallments)} />
                  <SummaryRow
                    label="Calendario"
                    value={
                      isFixedDays
                        ? formatLoanSchedule({
                            frequency: frequency as LoanFrequency,
                            schedule_type: "fixed_days",
                            payment_days: fixedSchedule.days,
                            payment_weekday: fixedSchedule.weekday,
                          })
                        : `${FREQUENCY_LABELS[frequency as LoanFrequency]} · automático`
                    }
                  />
                  <SummaryRow label="Valor de cuota" value={formatCurrency(calculation.installmentAmount)} strong />
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Próximas cuotas</p>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 text-xs">
                      {calculation.installments.slice(0, 6).map((i) => (
                        <div key={i.installmentNumber} className="flex justify-between text-muted-foreground">
                          <span>
                            #{i.installmentNumber} · {formatDate(i.dueDate)}
                          </span>
                          <span className="tabular-nums text-foreground">{formatCurrency(i.totalAmount)}</span>
                        </div>
                      ))}
                      {calculation.installments.length > 6 && (
                        <p className="text-muted-foreground">
                          +{calculation.installments.length - 6} cuotas más
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={isSubmitting || !calculation} size="lg">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Crear préstamo
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  )
}
