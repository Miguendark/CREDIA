"use client"

import { useState } from "react"
import Link from "next/link"
import { Receipt as ReceiptIcon } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PaymentMethodBadge } from "@/components/shared/badges"
import { ReceiptDialog } from "@/components/payments/receipt-dialog"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import type { PaymentWithRelations } from "@/types/domain"

export function PaymentsTable({
  items,
  showClient = true,
  canVoidReceipts = false,
}: {
  items: PaymentWithRelations[]
  showClient?: boolean
  canVoidReceipts?: boolean
}) {
  const [reprintPaymentId, setReprintPaymentId] = useState<string | null>(null)

  function openReceipt(paymentId: string) {
    setReprintPaymentId(paymentId)
  }

  return (
    <>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recibo</TableHead>
              {showClient && <TableHead>Cliente</TableHead>}
              <TableHead>Préstamo</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-right">Capital</TableHead>
              <TableHead className="text-right">Interés</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead className="text-right">Comprobante</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-mono text-xs">{payment.payment_number}</TableCell>
                {showClient && (
                  <TableCell>
                    <Link href={`/clientes/${payment.client.id}`} className="hover:underline">
                      {payment.client.full_name}
                    </Link>
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/prestamos/${payment.loan.id}`} className="font-mono text-xs hover:underline">
                    {payment.loan.loan_number}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(payment.amount)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCurrency(payment.principal_applied)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCurrency(payment.interest_applied)}
                </TableCell>
                <TableCell>
                  <PaymentMethodBadge method={payment.payment_method} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(payment.payment_date)}</TableCell>
                <TableCell className="text-muted-foreground">{payment.created_by_user?.name ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title="Ver recibo" onClick={() => openReceipt(payment.id)}>
                    <ReceiptIcon className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:hidden">
        {items.map((payment) => (
          <Card key={payment.id} className="py-4">
            <CardContent className="space-y-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{payment.payment_number}</p>
                  {showClient && <p className="font-medium">{payment.client.full_name}</p>}
                </div>
                <PaymentMethodBadge method={payment.payment_method} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Monto</span>
                <span className="font-medium tabular-nums">{formatCurrency(payment.amount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Fecha</span>
                <span>{formatDate(payment.payment_date)}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => openReceipt(payment.id)}
              >
                <ReceiptIcon className="size-4" />
                Ver recibo
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <ReceiptDialog
        open={reprintPaymentId !== null}
        onOpenChange={(open) => {
          if (!open) setReprintPaymentId(null)
        }}
        paymentIds={reprintPaymentId ? [reprintPaymentId] : []}
        mode="reprint"
        canVoid={canVoidReceipts}
      />
    </>
  )
}
