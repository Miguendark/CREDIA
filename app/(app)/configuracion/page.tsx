import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { listUsers, getCurrentStaffUser } from "@/services/users.service"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { UserRoleSelect } from "@/components/settings/user-role-select"
import { INTEREST_TYPE_LABELS } from "@/lib/finance/loan-calculator"
import { FREQUENCY_LABELS } from "@/lib/finance/frequency"
import { formatDate } from "@/lib/utils/format"

export const metadata: Metadata = { title: "Configuración" }
export const revalidate = 0

const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Depósito", "Tarjeta", "Otro"]

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const [users, currentUser] = await Promise.all([listUsers(supabase), getCurrentStaffUser(supabase)])
  const isAdmin = currentUser?.role === "admin"

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Ajustes generales del sistema NEXA." />

      <SettingsSection title="Usuarios" description="Staff con acceso a NEXA y su rol.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead className="w-40">Rol</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(user.created_at)}</TableCell>
                <TableCell>
                  <UserRoleSelect userId={user.id} role={user.role} disabled={!isAdmin} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!isAdmin && (
          <p className="mt-3 text-xs text-muted-foreground">
            Solo un administrador puede cambiar roles de usuario.
          </p>
        )}
      </SettingsSection>

      <SettingsSection title="Empresa" description="Datos de la empresa que aparecerán en recibos y reportes.">
        <PlaceholderNote />
      </SettingsSection>

      <SettingsSection title="Seguridad" description="Autenticación, roles y auditoría.">
        <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
          <li>Autenticación gestionada por Supabase Auth (correo y contraseña).</li>
          <li>Row Level Security activo en todas las tablas — cada rol ve y edita solo lo permitido.</li>
          <li>Las operaciones financieras (crear préstamo, registrar pago, mover capital) quedan auditadas.</li>
          <li>Roles: Admin (acceso completo), Supervisor (operativo), Cobrador (clientes, préstamos, pagos, cobros).</li>
        </ul>
      </SettingsSection>

      <SettingsSection title="Métodos de pago" description="Métodos habilitados para registrar pagos.">
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((method) => (
            <Badge key={method} variant="outline">
              {method}
            </Badge>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Configuración de préstamos"
        description="Estrategias de cálculo de interés disponibles."
      >
        <div className="space-y-2 text-sm">
          {Object.entries(INTEREST_TYPE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span>{label}</span>
              <Badge variant="outline">Activo</Badge>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Frecuencias soportadas: {Object.values(FREQUENCY_LABELS).join(", ")}.
          </p>
        </div>
        <PlaceholderNote text="Penalizaciones por mora, pagos anticipados y refinanciamiento aún no están definidos como regla de negocio — se agregarán aquí cuando se especifiquen (ver lib/finance/loan-calculator.ts)." />
      </SettingsSection>

      <SettingsSection title="Tasas" description="Tasas de interés sugeridas por defecto.">
        <PlaceholderNote />
      </SettingsSection>

      <SettingsSection title="Notificaciones" description="Recordatorios automáticos de pago próximo/vencido.">
        <PlaceholderNote />
      </SettingsSection>

      <SettingsSection title="WhatsApp" description="Conexión con la API oficial de WhatsApp Business.">
        <PlaceholderNote text="La bandeja de conversaciones ya está disponible en /whatsapp. La conexión real con la API de WhatsApp Business y el chatbot automático se configurarán aquí en una fase posterior." />
      </SettingsSection>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function PlaceholderNote({ text }: { text?: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {text ?? "Disponible en una fase posterior."}
    </p>
  )
}
