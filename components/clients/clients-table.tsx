import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { ClientStatusBadge } from "@/components/shared/badges"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import type { ClientListItem } from "@/types/domain"

export function ClientsTable({ items }: { items: ClientListItem[] }) {
  return (
    <>
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Cédula</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead className="text-center">Préstamos activos</TableHead>
              <TableHead className="text-right">Saldo pendiente</TableHead>
              <TableHead>Próximo pago</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((client) => (
              <TableRow key={client.id} className="group">
                <TableCell className="font-mono text-xs text-muted-foreground">{client.client_code}</TableCell>
                <TableCell className="font-medium">
                  <Link href={`/clientes/${client.id}`} className="hover:underline">
                    {client.full_name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{client.identification_number || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{client.phone || "—"}</TableCell>
                <TableCell className="text-center tabular-nums">{client.active_loans_count}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(client.outstanding_balance)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client.next_payment_date ? formatDate(client.next_payment_date) : "—"}
                </TableCell>
                <TableCell>
                  <ClientStatusBadge status={client.status} />
                </TableCell>
                <TableCell>
                  <Link href={`/clientes/${client.id}`}>
                    <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:hidden">
        {items.map((client) => (
          <Link key={client.id} href={`/clientes/${client.id}`}>
            <Card className="py-4">
              <CardContent className="space-y-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{client.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {client.client_code} · {client.identification_number || "Sin cédula"}
                    </p>
                  </div>
                  <ClientStatusBadge status={client.status} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Saldo pendiente</span>
                  <span className="font-medium tabular-nums">{formatCurrency(client.outstanding_balance)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Próximo pago</span>
                  <span>{client.next_payment_date ? formatDate(client.next_payment_date) : "—"}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
