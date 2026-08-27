import Link from "next/link"
import { Eye, MessageCircle, Phone } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils/format"
import { buildWhatsappLink } from "@/lib/utils/whatsapp"
import type { DelinquentClient } from "@/services/collections.service"

export function DelinquentClientsList({ items }: { items: DelinquentClient[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No hay clientes morosos actualmente.</p>
  }

  return (
    <Card className="overflow-x-auto py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-center">Cuotas vencidas</TableHead>
            <TableHead className="text-right">Monto vencido</TableHead>
            <TableHead className="w-40">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">{client.full_name}</TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="border-status-critical/20 bg-status-critical/10 text-status-critical">
                  {client.overdueInstallments}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums text-status-critical">
                {formatCurrency(client.overdueAmount)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon-sm" variant="ghost" asChild>
                    <Link href={`/clientes/${client.id}`} title="Ver cliente">
                      <Eye className="size-4" />
                    </Link>
                  </Button>
                  {client.phone && (
                    <Button size="icon-sm" variant="ghost" asChild>
                      <a href={`tel:${client.phone}`} title="Llamar">
                        <Phone className="size-4" />
                      </a>
                    </Button>
                  )}
                  {(client.whatsapp || client.phone) && (
                    <Button size="icon-sm" variant="ghost" asChild>
                      <a
                        href={buildWhatsappLink(client.whatsapp || client.phone || "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="WhatsApp"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
