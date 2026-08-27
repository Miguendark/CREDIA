import Link from "next/link"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { Logo } from "@/components/shared/logo"
import { ResetPasswordForm } from "./reset-form"

export const metadata: Metadata = {
  title: "Recuperar contraseña — NEXA",
}

export default function RecuperarContrasenaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <Logo />

        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">Recuperar contraseña</h2>
          <p className="text-sm text-muted-foreground">
            Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
          </p>
        </div>

        <ResetPasswordForm />

        <Link
          href="/login"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a iniciar sesión
        </Link>
      </div>
    </div>
  )
}
