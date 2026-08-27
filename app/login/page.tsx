import type { Metadata } from "next"
import { ShieldCheck, TrendingUp, Users } from "lucide-react"
import { Logo } from "@/components/shared/logo"
import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Iniciar sesión — NEXA",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const { redirectTo } = await searchParams

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklch,var(--sidebar-primary),transparent_82%),transparent_45%)]" />
        <div className="relative">
          <Logo />
        </div>

        <div className="relative space-y-8">
          <h1 className="max-w-md text-3xl font-semibold text-balance">
            Gestiona tu cartera de préstamos con seguridad y control total.
          </h1>
          <ul className="space-y-4 text-sm text-sidebar-foreground/80">
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Users className="size-4" />
              </span>
              Clientes, préstamos y cuotas en un solo lugar
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <TrendingUp className="size-4" />
              </span>
              Estadísticas de capital y cobros en tiempo real
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <ShieldCheck className="size-4" />
              </span>
              Auditoría y control de acceso por roles
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} NEXA — Sistema de Gestión de Préstamos
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 lg:hidden">
            <Logo />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">
              Ingresa tus credenciales para acceder al panel administrativo.
            </p>
          </div>

          <LoginForm redirectTo={redirectTo || "/dashboard"} />
        </div>
      </div>
    </div>
  )
}
