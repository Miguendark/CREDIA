"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CalendarClock, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FixedDayInput, type FixedDayValue } from "@/components/loans/fixed-day-input"
import {
  FIXED_DAY_HINTS,
  FIXED_DAY_LABELS,
  fixedScheduleAllowed,
  formatLoanSchedule,
  normalizePaymentDays,
  validateFixedSchedule,
} from "@/lib/finance/fixed-days"
import { todayRD } from "@/lib/utils/date"
import { addPeriod, FREQUENCY_LABELS } from "@/lib/finance/frequency"
import { buildLoanReschedulePlan, defaultRescheduleStart, isReschedulable } from "@/lib/finance/reschedule"
import { formatDate } from "@/lib/utils/format"
import { rescheduleLoanAction } from "@/app/(app)/prestamos/actions"
import type { Installment, Loan } from "@/types/domain"
import type { LoanScheduleType } from "@/types/database.types"

const MIN_REASON = 10

type RescheduleInstallmentRow = Pick<Installment, "id" | "installment_number" | "due_date" | "status" | "amount_paid">

export function RescheduleLoanDialog({
  loan,
  installments,
}: {
  loan: Pick<Loan, "id" | "loan_number" | "frequency" | "schedule_type" | "payment_days" | "payment_weekday">
  installments: RescheduleInstallmentRow[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Al reabrir, el formulario arranca de cero con los datos actuales.
        if (next) setFormKey((k) => k + 1)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarClock className="size-4" />
          Cambiar fecha de pago
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <RescheduleForm
          key={formKey}
          loan={loan}
          installments={installments}
          onDone={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function RescheduleForm({
  loan,
  installments,
  onDone,
}: {
  loan: Pick<Loan, "id" | "loan_number" | "frequency" | "schedule_type" | "payment_days" | "payment_weekday">
  installments: RescheduleInstallmentRow[]
  onDone: () => void
}) {
  const [today] = useState(todayRD)
  const baseStart = defaultRescheduleStart(installments, today)
  const movable = installments.filter((i) => isReschedulable({ ...i, amount_paid: Number(i.amount_paid) }))
  const firstMovable = movable[0]
  const lockedCount = installments.length - movable.length

  const fixedAllowed = fixedScheduleAllowed(loan.frequency)
  const [scheduleType, setScheduleType] = useState<LoanScheduleType>(fixedAllowed ? loan.schedule_type : "interval")
  const [fixedDay, setFixedDay] = useState<FixedDayValue>({
    days: loan.payment_days ?? [],
    weekday: loan.payment_weekday,
  })
  const [afterDate, setAfterDate] = useState(baseStart)
  const [firstDate, setFirstDate] = useState(() =>
    firstMovable && firstMovable.due_date > baseStart ? firstMovable.due_date : addPeriod(baseStart, "daily")
  )
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isFixed = scheduleType === "fixed_days"
  // La frecuencia es la del préstamo (no se cambia aquí): el día fijo debe coincidir con ella.
  const daysError = isFixed ? validateFixedSchedule(loan.frequency, fixedDay.days, fixedDay.weekday) : null
  const startFrom = isFixed ? afterDate : firstDate

  const result = useMemo(() => {
    if (daysError) return { plan: null, error: daysError }
    if (!startFrom) return { plan: null, error: "Elige una fecha" }
    try {
      const plan = buildLoanReschedulePlan(loan.frequency, installments, {
        schedule_type: scheduleType,
        payment_days: isFixed ? fixedDay.days : [],
        payment_weekday: isFixed ? fixedDay.weekday : null,
        start_from: startFrom,
      })
      if (plan.changes[0].newDate < today) return { plan: null, error: "La nueva primera fecha no puede estar en el pasado" }
      return { plan, error: null }
    } catch (e) {
      return { plan: null, error: e instanceof Error ? e.message : "No se pudo calcular" }
    }
  }, [daysError, startFrom, loan.frequency, installments, scheduleType, isFixed, fixedDay, today])

  const reasonOk = reason.trim().length >= MIN_REASON
  const unchanged =
    result.plan?.changes.every((c) => c.oldDate === c.newDate) &&
    scheduleType === loan.schedule_type &&
    (!isFixed ||
      ((loan.payment_days ?? []).join(",") === normalizePaymentDays(fixedDay.days).join(",") &&
        loan.payment_weekday === fixedDay.weekday))

  async function handleConfirm() {
    if (!result.plan) return
    setIsSubmitting(true)
    const response = await rescheduleLoanAction({
      loan_id: loan.id,
      schedule_type: scheduleType,
      payment_days: isFixed && fixedDay.weekday === null ? fixedDay.days : [],
      payment_weekday: isFixed ? fixedDay.weekday : null,
      start_from: startFrom,
      reason: reason.trim(),
      expected_dates: result.plan.changes.map((c) => ({ installment_id: c.installmentId, due_date: c.newDate })),
    })
    setIsSubmitting(false)

    if (!response.success) {
      toast.error(response.message)
      return
    }
    toast.success("Fecha de pago actualizada")
    onDone()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cambiar fecha de pago · {loan.loan_number}</DialogTitle>
        <DialogDescription>
          Solo cambian las fechas de las cuotas pendientes sin abono. Los montos, lo pagado y los saldos no cambian. El
          cambio queda registrado en auditoría con el motivo.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Frecuencia</Label>
            <Input value={FREQUENCY_LABELS[loan.frequency]} readOnly disabled />
            <p className="text-xs text-muted-foreground">La frecuencia del préstamo no se cambia aquí.</p>
          </div>
          <div className="grid gap-2">
            <Label>Fechas de pago</Label>
            <Select
              value={scheduleType}
              onValueChange={(v) => setScheduleType(v as LoanScheduleType)}
              disabled={isSubmitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interval">Automático</SelectItem>
                <SelectItem value="fixed_days" disabled={!fixedAllowed}>
                  Día fijo
                </SelectItem>
              </SelectContent>
            </Select>
            {!fixedAllowed && (
              <p className="text-xs text-muted-foreground">La frecuencia diaria no permite día fijo; solo Automático.</p>
            )}
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          Calendario actual: <span className="font-medium text-foreground">{formatLoanSchedule(loan)}</span>
        </div>

        {isFixed ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{FIXED_DAY_LABELS[loan.frequency]}</Label>
              <FixedDayInput
                key={loan.frequency}
                frequency={loan.frequency}
                value={fixedDay}
                onChange={setFixedDay}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">{FIXED_DAY_HINTS[loan.frequency]}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reschedule-after">A partir de</Label>
              <Input
                id="reschedule-after"
                type="date"
                min={baseStart}
                value={afterDate}
                onChange={(e) => setAfterDate(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">La primera cuota cae el siguiente día fijo después de esta fecha.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="reschedule-first">Fecha de la próxima cuota</Label>
            <Input
              id="reschedule-first"
              type="date"
              value={firstDate}
              onChange={(e) => setFirstDate(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Las demás cuotas siguen la frecuencia {FREQUENCY_LABELS[loan.frequency].toLowerCase()} desde esa fecha.
            </p>
          </div>
        )}

        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Vista previa</div>
          {result.error ? (
            <p className="px-3 py-3 text-sm text-status-critical">{result.error}</p>
          ) : (
            <div className="max-h-56 overflow-y-auto px-3 py-2 text-sm">
              {result.plan!.changes.map((c) => (
                <div key={c.installmentId} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-muted-foreground">Cuota #{c.installmentNumber}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span className={c.oldDate !== c.newDate ? "text-muted-foreground line-through" : "text-muted-foreground"}>
                      {formatDate(c.oldDate)}
                    </span>
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <span className="font-medium">{formatDate(c.newDate)}</span>
                  </span>
                </div>
              ))}
              {lockedCount > 0 && (
                <p className="pt-2 text-xs text-muted-foreground">
                  {lockedCount === 1 ? "1 cuota pagada o con abono no se mueve." : `${lockedCount} cuotas pagadas o con abono no se mueven.`}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="reschedule-reason">Motivo *</Label>
          <Textarea
            id="reschedule-reason"
            rows={3}
            placeholder="Por ejemplo: el cliente cobra los días 15 y 30"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
          />
          {!reasonOk && reason.length > 0 && (
            <p className="text-xs text-muted-foreground">Mínimo {MIN_REASON} caracteres.</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={handleConfirm}
          disabled={isSubmitting || !result.plan || !reasonOk || unchanged}
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Confirmar cambio
        </Button>
      </DialogFooter>
    </>
  )
}
