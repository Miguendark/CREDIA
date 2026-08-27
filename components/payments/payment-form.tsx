"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ClientCombobox } from "@/components/shared/client-combobox"
import { paymentSchema, type PaymentInput } from "@/lib/validations/payment"
import { allocatePayment } from "@/lib/finance/payment-allocator"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { registerPaymentAction } from "@/app/(app)/pagos/actions"
import {
  listActiveLoansByClientAction,
  type LoanOption,
} from "@/app/(app)/prestamos/actions"
import {
  listPendingInstallmentsByLoanAction,
  type InstallmentOption,
} from "@/app/(app)/pagos/actions"
import type { PaymentMethod } from "@/types/database.types"

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "deposito", label: "Depósito" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
]

const today = new Date().toISOString().slice(0, 10)

export function PaymentForm({
  preselectedClientId,
  preselectedClientLabel,
  preselectedLoanId,
  preselectedInstallmentId,
}: {
  preselectedClientId?: string
  preselectedClientLabel?: string
  preselectedLoanId?: string
  preselectedInstallmentId?: string
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loans, setLoans] = useState<LoanOption[]>([])
  const [installments, setInstallments] = useState<InstallmentOption[]>([])
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [loadingInstallments, setLoadingInstallments] = useState(false)

  const form = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      client_id: preselectedClientId ?? "",
      loan_id: preselectedLoanId ?? "",
      installment_id: preselectedInstallmentId ?? "",
      amount: 0,
      payment_method: "efectivo",
      payment_date: today,
      receipt_number: "",
      notes: "",
    },
  })

  const [clientId, loanId, installmentId, amount] = form.watch([
    "client_id",
    "loan_id",
    "installment_id",
    "amount",
  ])

  useEffect(() => {
    if (!clientId) {
      setLoans([])
      return
    }
    setLoadingLoans(true)
    listActiveLoansByClientAction(clientId)
      .then(setLoans)
      .finally(() => setLoadingLoans(false))
  }, [clientId])

  useEffect(() => {
    if (!loanId) {
      setInstallments([])
      return
    }
    setLoadingInstallments(true)
    listPendingInstallmentsByLoanAction(loanId)
      .then((data) => {
        setInstallments(data)
        const selected = data.find((i) => i.id === installmentId)
        if (selected) {
          form.setValue("amount", selected.remaining_amount)
        } else if (data.length > 0 && !preselectedInstallmentId) {
          form.setValue("installment_id", data[0].id)
          form.setValue("amount", data[0].remaining_amount)
        }
      })
      .finally(() => setLoadingInstallments(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId])

  const selectedInstallment = installments.find((i) => i.id === installmentId)

  const allocationPreview = useMemo(() => {
    if (!selectedInstallment || !amount || amount <= 0) return null
    const targets = installments
      .filter((i) => i.installment_number >= selectedInstallment.installment_number)
      .map((i) => ({
        id: i.id,
        installmentNumber: i.installment_number,
        interestAmount: i.interest_amount,
        totalAmount: i.total_amount,
        remainingAmount: i.remaining_amount,
      }))
    return allocatePayment(targets, amount)
  }, [selectedInstallment, installments, amount])

  const cascades = (allocationPreview?.allocations.length ?? 0) > 1
  const exceedsAvailable = (allocationPreview?.unallocatedAmount ?? 0) > 0

  async function submitPayment(values: PaymentInput) {
    setIsSubmitting(true)
    const result = await registerPaymentAction(values)
    setIsSubmitting(false)

    if (!result.success) {
      toast.error(result.message)
      return
    }

    toast.success("Pago registrado")
    router.push(`/prestamos/${loanId}`)
    router.refresh()
  }

  function onSubmit(values: PaymentInput) {
    if (exceedsAvailable) {
      toast.error("El monto excede el saldo pendiente total del préstamo")
      return
    }
    if (cascades) {
      setConfirmOpen(true)
      return
    }
    submitPayment(values)
  }

  return (
    <>
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
                        onChange={(id) => {
                          field.onChange(id)
                          form.setValue("loan_id", "")
                          form.setValue("installment_id", "")
                        }}
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
                name="loan_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Préstamo *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v)
                        form.setValue("installment_id", "")
                      }}
                      disabled={isSubmitting || !clientId || loadingLoans}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={loadingLoans ? "Cargando..." : "Selecciona un préstamo"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {loans.map((loan) => (
                          <SelectItem key={loan.id} value={loan.id}>
                            {loan.loan_number} · Saldo{" "}
                            {formatCurrency(loan.outstanding_principal + loan.outstanding_interest)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {clientId && !loadingLoans && loans.length === 0 && (
                      <p className="text-xs text-muted-foreground">Este cliente no tiene préstamos activos.</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="installment_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuota *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting || !loanId || loadingInstallments}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={loadingInstallments ? "Cargando..." : "Selecciona una cuota"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {installments.map((installment) => (
                          <SelectItem key={installment.id} value={installment.id}>
                            #{installment.installment_number} · {formatDate(installment.due_date)} · Restante{" "}
                            {formatCurrency(installment.remaining_amount)}
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
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto (RD$) *</FormLabel>
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
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de pago *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
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
                name="payment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha *</FormLabel>
                    <FormControl>
                      <Input type="date" disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="receipt_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de recibo</FormLabel>
                    <FormControl>
                      <Input disabled={isSubmitting} {...field} />
                    </FormControl>
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
                <CardTitle>Resumen del pago</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!allocationPreview ? (
                  <p className="text-sm text-muted-foreground">
                    Selecciona préstamo, cuota y monto para ver cómo se aplicará el pago.
                  </p>
                ) : (
                  <>
                    {allocationPreview.allocations.map((allocation) => {
                      const installment = installments.find((i) => i.id === allocation.installmentId)
                      return (
                        <div key={allocation.installmentId} className="text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Cuota #{installment?.installment_number}
                            </span>
                            <span className="font-medium tabular-nums">{formatCurrency(allocation.amount)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              Capital {formatCurrency(allocation.principalApplied)} · Interés{" "}
                              {formatCurrency(allocation.interestApplied)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    <Separator />
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Total aplicado</span>
                      <span className="tabular-nums">
                        {formatCurrency(allocationPreview.allocations.reduce((s, a) => s + a.amount, 0))}
                      </span>
                    </div>
                    {cascades && (
                      <Alert>
                        <AlertTriangle className="size-4" />
                        <AlertDescription>
                          El monto cubre {allocationPreview.allocations.length} cuotas. Se pedirá confirmación antes
                          de registrar.
                        </AlertDescription>
                      </Alert>
                    )}
                    {exceedsAvailable && (
                      <Alert variant="destructive">
                        <AlertTriangle className="size-4" />
                        <AlertDescription>
                          Sobran {formatCurrency(allocationPreview.unallocatedAmount)} sin aplicar: excede el saldo
                          pendiente disponible en cuotas de este préstamo.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button type="submit" size="lg" disabled={isSubmitting || !allocationPreview || exceedsAvailable}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Registrar pago
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                Cancelar
              </Button>
            </div>
          </div>
        </form>
      </Form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmas este pago de {formatCurrency(amount)}?</AlertDialogTitle>
            <AlertDialogDescription>
              El monto excede la cuota seleccionada y se aplicará en cascada a las siguientes cuotas pendientes de
              este préstamo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={() => {
                setConfirmOpen(false)
                form.handleSubmit(submitPayment)()
              }}
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Confirmar pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
