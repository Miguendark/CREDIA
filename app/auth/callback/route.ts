import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/** Intercambia el código de un enlace de Supabase Auth (reset de contraseña, invitación) por una sesión. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/auth/actualizar-contrasena"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=enlace_invalido`)
}
