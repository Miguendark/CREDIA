import type { Metadata } from "next"
import { Logo } from "@/components/shared/logo"
import { UpdatePasswordForm } from "./update-password-form"

export const metadata: Metadata = {
  title: "Actualizar contraseña — NEXA",
}

export default function ActualizarContrasenaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <Logo />

        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">Crear nueva contraseña</h2>
          <p className="text-sm text-muted-foreground">
            Elige una contraseña segura de al menos 8 caracteres.
          </p>
        </div>

        <UpdatePasswordForm />
      </div>
    </div>
  )
}
