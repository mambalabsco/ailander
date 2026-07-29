import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Vuelta del enlace de confirmación de correo y del flujo PKCE.
 *
 * Supabase manda aquí con un `code` de un solo uso que hay que canjear por la
 * sesión. El canje escribe las cookies, así que tiene que ocurrir en el
 * servidor y no en el navegador.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Solo rutas internas: evita convertir esto en un redirector abierto.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?motivo=sin-codigo`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?motivo=canje`);
  }

  return NextResponse.redirect(`${origin}${target}`);
}
