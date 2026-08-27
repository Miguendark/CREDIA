import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaffUser } from "@/services/users.service"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const staffUser = await getCurrentStaffUser(supabase)

  if (!staffUser) {
    redirect("/login")
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={staffUser} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
