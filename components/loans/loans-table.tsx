import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { LoanStatusBadge } from "@/components/shared/badges"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { isLoanOverdue } from "@/types/domain"
import type { LoanWithClient } from "@/types/domain"

export function LoansTable({ items, showClient = true }: { items: LoanWithClient[]; showClient?: boolean }) {
  return (
    <>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              {showClient && <TableHead>Cliente</TableHead>}
              <TableHead className="text-right">Capital</TableHead>
              <TableHead className="text-right">Interés</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Cuota</TableHead>
              <TableHead>Próximo pago</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((loan) => (
              <TableRow key={loan.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/prestamos/${loan.id}`} className="hover:underline">
                    {loan.loan_number}
                  </Link>
                </TableCell>
                {showClient && (
                  <TableCell>
                    <Link href={`/clientes/${loan.client.id}`} className="hover:underline">
                      {loan.client.full_name}
                    </Link>
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">{formatCurrency(loan.principal_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(loan.total_interest)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(loan.total_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(loan.installment_amount)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {loan.next_payment_date ? formatDate(loan.next_payment_date) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(loan.outstanding_principal + loan.outstanding_interest)}
                </TableCell>
                <TableCell>
                  <LoanStatusBadge status={loan.status} overdue={isLoanOverdue(loan)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:hidden">
        {items.map((loan) => (
          <Link key={loan.id} href={`/prestamos/${loan.id}`}>
            <Card className="py-4">
              <CardContent className="space-y-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{loan.loan_number}</p>
                    {showClient && <p className="font-medium">{loan.client.full_name}</p>}
                  </div>
                  <LoanStatusBadge status={loan.status} overdue={isLoanOverdue(loan)} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Saldo</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(loan.outstanding_principal + loan.outstanding_interest)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Próximo pago</span>
                  <span>{loan.next_payment_date ? formatDate(loan.next_payment_date) : "—"}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
