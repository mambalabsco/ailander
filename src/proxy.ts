import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Refresco de sesión y comprobación optimista de acceso.
 *
 * **En Next 16 esto ya no es `middleware.ts`.** El convenio se renombró a
 * `proxy.ts` y la función se llama `proxy`; `middleware` sigue funcionando pero
 * está marcado como obsoleto. La documentación de Supabase todavía habla de
 * middleware: el contenido es el mismo, cambia el nombre del archivo.
 *
 * Qué hace y por qué en este orden:
 *
 * 1. Crea un cliente de servidor que escribe las cookies **en la respuesta**.
 *    Esto es lo que permite que el token se renueve, porque desde un Server
 *    Component no se pueden escribir cookies.
 *
 * 2. Llama a `getClaims()`. Hay que llamar a algo que valide el token; si solo
 *    se creara el cliente, la sesión no se refrescaría y el usuario acabaría
 *    desconectado sin motivo aparente.
 *
 * 3. Redirige a `/auth/login` si no hay sesión. Es una comprobación
 *    **optimista**: sirve para no renderizar páginas que van a fallar, pero no
 *    es la que protege los datos. Eso lo hacen RLS y `requireUser()`, que están
 *    pegados al dato y no se pueden esquivar.
 */

/** Rutas accesibles sin sesión. */
const PUBLIC_PATHS = ["/auth/login", "/auth/signup", "/auth/callback", "/auth/error"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  // Sin credenciales configuradas no hay sesión que refrescar ni a dónde
  // redirigir: la aplicación tiene que poder arrancar para poder configurarse.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // La respuesta se recrea a partir de la petición ya actualizada, que
          // es lo que hace que las cookies nuevas viajen en ambos sentidos.
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Importante: nada entre crear el cliente y esta llamada. Si se mete lógica
  // en medio, las sesiones caducan de forma aleatoria y es muy difícil de ver.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  if (!isSignedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    // Para volver a donde iba después de entrar.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isSignedIn && (pathname === "/auth/login" || pathname === "/auth/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo menos estáticos e imágenes. Se deja fuera lo que no puede llevar
     * sesión para no pagar una comprobación por cada archivo servido.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
