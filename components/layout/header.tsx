import type { UserRole } from "@/types/database.types"
import { MobileNav } from "./mobile-nav"
import { UserMenu } from "./user-menu"

export function Header({
  title,
  user,
}: {
  title?: string
  user: { name: string; email: string; role: UserRole }
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        {title && <h1 className="text-lg font-semibold tracking-tight">{title}</h1>}
      </div>
      <UserMenu name={user.name} email={user.email} role={user.role} />
    </header>
  )
}
