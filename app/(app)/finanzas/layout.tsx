import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaffUser } from "@/services/users.service"

/**
 * Finanzas es solo para admin y supervisor. Se verifica aquí (antes de la
 * pantalla de carga) para que un cobrador reciba un 404 limpio. La página y
 * cada función finance_* de la base lo vuelven a verificar.
 */
export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const staffUser = await getCurrentStaffUser(supabase)
  if (!staffUser || !["admin", "supervisor"].includes(staffUser.role)) {
    notFound()
  }
  return children
}
