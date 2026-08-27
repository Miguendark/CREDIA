import {
  LayoutDashboard,
  Users,
  HandCoins,
  Receipt,
  PhoneCall,
  Wallet,
  FileBarChart,
  MessageCircle,
  Settings,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Préstamos", href: "/prestamos", icon: HandCoins },
  { label: "Pagos", href: "/pagos", icon: Receipt },
  { label: "Cobros", href: "/cobros", icon: PhoneCall },
  { label: "Capital", href: "/capital", icon: Wallet },
  { label: "Reportes", href: "/reportes", icon: FileBarChart },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
  { label: "Configuración", href: "/configuracion", icon: Settings },
]
