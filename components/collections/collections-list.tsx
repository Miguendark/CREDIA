import Link from "next/link"
import { Phone, MessageCircle, Receipt, Eye } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { buildWhatsappLink } from "@/lib/utils/whatsapp"
import type { CollectionInstallment } from "@/services/collections.service"

export function CollectionsList({ items }: { items: CollectionInstallment[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin cuotas en este grupo.</p>
  }

  return (
    <Card className="overflow-x-auto py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Préstamo</TableHead>
            <TableHead>Cuota</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="w-56">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((installment) => (
            <TableRow key={installment.id}>
              <TableCell className="font-medium">{installment.loan.client.full_name}</TableCell>
              <TableCell className="font-mono text-xs">{installment.loan.loan_number}</TableCell>
              <TableCell>#{installment.installment_number}</TableCell>
              <TableCell>{formatDate(installment.due_date)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrency(installment.remaining_amount)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon-sm" variant="ghost" asChild>
                    <Link href={`/clientes/${installment.loan.client.id}`} title="Ver cliente">
                      <Eye className="size-4" />
                    </Link>
                  </Button>
                  {installment.loan.client.phone && (
                    <Button size="icon-sm" variant="ghost" asChild>
                      <a href={`tel:${installment.loan.client.phone}`} title="Llamar">
                        <Phone className="size-4" />
                      </a>
                    </Button>
                  )}
                  {(installment.loan.client.whatsapp || installment.loan.client.phone) && (
                    <Button size="icon-sm" variant="ghost" asChild>
                      <a
                        href={buildWhatsappLink(
                          installment.loan.client.whatsapp || installment.loan.client.phone || "",
                          `Hola ${installment.loan.client.full_name.split(" ")[0]}, te recordamos tu cuota #${installment.installment_number} del préstamo ${installment.loan.loan_number} por ${formatCurrency(installment.remaining_amount)}.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="WhatsApp"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/pagos/nuevo?loanId=${installment.loan.id}&installmentId=${installment.id}`}>
                      <Receipt className="size-4" />
                      Cobrar
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
