import { Logo } from "@/components/shared/logo"
import { SidebarNav } from "./sidebar-nav"

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <SidebarNav />
      </div>
      <div className="border-t border-sidebar-border/60 px-5 py-4 text-xs text-sidebar-foreground/50">
        NEXA v0.1 · MVP
      </div>
    </aside>
  )
}
