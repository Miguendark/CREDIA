import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { HandCoins, History, Landmark, MessageCircle, Pencil, Plus, Receipt } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getClientById } from "@/services/clients.service"
import { listLoansByClient } from "@/services/loans.service"
import { listPayments } from "@/services/payments.service"
import { listAuditLogs } from "@/services/audit.service"
import { getCurrentStaffUser } from "@/services/users.service"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClientStatusBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ClientSummaryCards } from "@/components/clients/client-summary-cards"
import { LoansTable } from "@/components/loans/loans-table"
import { PaymentsTable } from "@/components/payments/payments-table"
import { formatDate } from "@/lib/utils/format"
import { buildWhatsappLink } from "@/lib/utils/whatsapp"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const client = await getClientById(supabase, id)
  return { title: client?.full_name ?? "Cliente" }
}

export default async function ClienteProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const client = await getClientById(supabase, id)
  if (!client) notFound()

  const [loans, paymentsResult, auditResult, staffUser] = await Promise.all([
    listLoansByClient(supabase, id),
    listPayments(supabase, { clientId: id, pageSize: 50 }),
    listAuditLogs(supabase, { entityId: id, pageSize: 20 }),
    getCurrentStaffUser(supabase),
  ])
  const canVoidReceipts = staffUser?.role === "admin" || staffUser?.role === "supervisor"

  const loansWithClient = loans.map((loan) => ({
    ...loan,
    client: {
      id: client.id,
      full_name: client.full_name,
      client_code: client.client_code,
      identification_number: client.identification_number,
      phone: client.phone,
    },
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.full_name}
        description={`${client.client_code} · Cliente desde ${formatDate(client.created_at)}`}
        action={
          <>
            <Button variant="outline" asChild>
              <Link href={`/clientes/${client.id}/editar`}>
                <Pencil className="size-4" />
                Editar
              </Link>
            </Button>
            {(client.whatsapp || client.phone) && (
              <Button variant="outline" asChild>
                <a
                  href={buildWhatsappLink(
                    client.whatsapp || client.phone || "",
                    `Hola ${client.full_name.split(" ")[0]}, te escribimos de NEXA.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" />
                  WhatsApp
                </a>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/pagos/nuevo?clienteId=${client.id}`}>
                <Receipt className="size-4" />
                Registrar pago
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/prestamos/nuevo?clienteId=${client.id}`}>
                <Plus className="size-4" />
                Nuevo préstamo
              </Link>
            </Button>
          </>
        }
      />

      <ClientSummaryCards loans={loans} />

      <Tabs defaultValue="informacion">
        <TabsList>
          <TabsTrigger value="informacion">Información</TabsTrigger>
          <TabsTrigger value="prestamos">Préstamos ({loans.length})</TabsTrigger>
          <TabsTrigger value="pagos">Pagos ({paymentsResult.total})</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="informacion" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <InfoRow label="Código" value={client.client_code} />
              <InfoRow label="Estado" value={<ClientStatusBadge status={client.status} />} />
              <InfoRow label="Cédula" value={client.identification_number || "—"} />
              <InfoRow label="Teléfono" value={client.phone || "—"} />
              <InfoRow label="WhatsApp" value={client.whatsapp || "—"} />
              <InfoRow label="Correo" value={client.email || "—"} />
              <InfoRow label="Dirección" value={client.address || "—"} />
              <InfoRow
                label="Fecha de nacimiento"
                value={client.birth_date ? formatDate(client.birth_date) : "—"}
              />
              {client.notes && <InfoRow label="Observaciones" value={client.notes} full />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prestamos" className="mt-4">
          {loans.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="Sin préstamos"
              description="Este cliente aún no tiene préstamos registrados."
              action={
                <Button size="sm" asChild>
                  <Link href={`/prestamos/nuevo?clienteId=${client.id}`}>
                    <Plus className="size-4" />
                    Nuevo préstamo
                  </Link>
                </Button>
              }
            />
          ) : (
            <LoansTable items={loansWithClient} showClient={false} />
          )}
        </TabsContent>

        <TabsContent value="pagos" className="mt-4">
          {paymentsResult.items.length === 0 ? (
            <EmptyState icon={HandCoins} title="Sin pagos" description="Este cliente aún no tiene pagos registrados." />
          ) : (
            <PaymentsTable items={paymentsResult.items} showClient={false} canVoidReceipts={canVoidReceipts} />
          )}
        </TabsContent>

        <TabsContent value="historial" className="mt-4">
          {auditResult.items.length === 0 ? (
            <EmptyState icon={History} title="Sin actividad registrada" />
          ) : (
            <Card>
              <CardContent className="space-y-4">
                {auditResult.items.map((log) => (
                  <div key={log.id} className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{log.description || log.action}</p>
                      <p className="text-xs text-muted-foreground">{log.action}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">{formatDate(log.created_at)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoRow({ label, value, full = false }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  )
}
