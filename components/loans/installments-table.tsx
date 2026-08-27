import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { InstallmentStatusBadge } from "@/components/shared/badges"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { isInstallmentOverdue } from "@/types/domain"
import type { Installment } from "@/types/domain"

export function InstallmentsTable({ items, loanId }: { items: Installment[]; loanId: string }) {
  return (
    <Card className="overflow-x-auto py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead className="text-right">Capital</TableHead>
            <TableHead className="text-right">Interés</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Pagado</TableHead>
            <TableHead className="text-right">Restante</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((installment) => {
            const overdue = isInstallmentOverdue(installment)
            const payable = installment.status === "pendiente" || installment.status === "parcial"
            return (
              <TableRow key={installment.id}>
                <TableCell>{installment.installment_number}</TableCell>
                <TableCell className={overdue ? "font-medium text-status-critical" : undefined}>
                  {formatDate(installment.due_date)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(installment.principal_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(installment.interest_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(installment.total_amount)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCurrency(installment.amount_paid)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(installment.remaining_amount)}
                </TableCell>
                <TableCell>
                  <InstallmentStatusBadge status={installment.status} overdue={overdue} />
                </TableCell>
                <TableCell>
                  {payable && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/pagos/nuevo?loanId=${loanId}&installmentId=${installment.id}`}>Pagar</Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
