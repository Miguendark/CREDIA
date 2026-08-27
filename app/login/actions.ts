"use server"

import { createClient } from "@/lib/supabase/server"
import {
  loginSchema,
  requestPasswordResetSchema,
  type LoginInput,
  type RequestPasswordResetInput,
} from "@/lib/validations/auth"

export type AuthActionResult = { success: true } | { success: false; message: string }

const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos"

export async function signInAction(input: LoginInput): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  // rememberMe: la sesión de Supabase vía cookies ya persiste entre visitas;
  // el checkbox queda como preferencia visible al usuario. Si se requiere
  // una sesión que expire al cerrar el navegador, configurar aquí una cookie
  // de sesión (sin maxAge) cuando rememberMe sea false.
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { success: false, message: GENERIC_LOGIN_ERROR }
  }

  return { success: true }
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
}

export async function requestPasswordResetAction(
  input: RequestPasswordResetInput
): Promise<AuthActionResult> {
  const parsed = requestPasswordResetSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

  // No revelamos si el correo existe o no: siempre respondemos éxito.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/actualizar-contrasena`,
  })

  return { success: true }
}
