import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"
import type { CapitalTransaction } from "@/types/domain"

const TYPE_LABELS: Record<CapitalTransaction["type"], string> = {
  aporte: "Aporte",
  retiro: "Retiro",
  prestamo: "Préstamo",
  pago: "Pago recibido",
  ajuste: "Ajuste",
}

const INFLOW_TYPES: CapitalTransaction["type"][] = ["aporte", "pago", "ajuste"]

export function CapitalMovementsTable({ items }: { items: CapitalTransaction[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos registrados.</p>
  }

  return (
    <Card className="overflow-x-auto py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((tx) => {
            const isInflow = INFLOW_TYPES.includes(tx.type)
            return (
              <TableRow key={tx.id}>
                <TableCell className="text-muted-foreground">{formatDate(tx.transaction_date)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{TYPE_LABELS[tx.type]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{tx.description || "—"}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    isInflow ? "text-status-good" : "text-status-critical"
                  )}
                >
                  {isInflow ? "+" : "-"}
                  {formatCurrency(tx.amount)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
