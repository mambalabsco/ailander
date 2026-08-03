import { NextResponse } from "next/server";
import { findStore } from "@/lib/store-registry";
import { resolveMetaApp, resolveMetaAppById } from "@/lib/data/meta-apps";
import { requireContext } from "@/lib/supabase/session";
import { siteOrigin } from "@/lib/site-url";
import { authorizeUrl } from "@/lib/meta-oauth";
import { signState } from "@/lib/meta-app";

/**
 * Manda al diálogo de Facebook. Se llega desde «Iniciar sesión con Facebook».
 *
 * `siteOrigin()` y no `request.url`: detrás de Caddy, `request.url` es la
 * dirección del socket —`localhost:3000`— y la URL de retorno saldría apuntando
 * ahí. Ese error ya costó una tarde con el correo de recuperación y con el
 * retorno de Shopify, y es exactamente el mismo aquí.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Solo el dueño de la cuenta arranca esto. Sin esta línea, cualquiera podría
  // iniciar una autorización contra una tienda que no es suya.
  await requireContext();

  const url = new URL(request.url);
  const storeId = url.searchParams.get("tienda") ?? "";

  /*
   * Sin tienda también vale: se inicia sesión desde Configuración.
   *
   * El token es de la persona y sirve para todas las tiendas, así que obligar a
   * elegir una tienda para iniciar sesión era pedir el mismo login cinco veces
   * —y otras cinco cada sesenta días, cuando caduca—.
   *
   * Con tienda se sigue admitiendo: es el camino de quien ya lo tenía así, y
   * además deja traer sus cuentas en el mismo paso.
   */
  if (storeId) {
    const store = await findStore(storeId);
    if (!store) return NextResponse.json({ error: "No se encontró la tienda." }, { status: 404 });
  }

  /*
   * La app: la de esta tienda, la de por defecto, o la del entorno.
   *
   * Cada Business Manager en un perfil de Facebook distinto puede necesitar su
   * propia app, y sin tienda se usa la de por defecto.
   */
  const app = url.searchParams.get("app")
    ? await resolveMetaAppById(url.searchParams.get("app") ?? "")
    : await resolveMetaApp(storeId);

  if (!app) {
    return NextResponse.json(
      {
        error:
          "No hay ninguna app de Meta dada de alta. Añade una en Configuración › Apps de Meta, o define META_APP_ID y META_APP_SECRET en el servidor.",
      },
      { status: 500 },
    );
  }

  const origin = await siteOrigin();

  /*
   * El `state` va firmado y lleva la tienda dentro, no en una cookie.
   *
   * Con cookie funcionaría igual, pero el diálogo de Meta se abre a veces en otra
   * pestaña o después de un login intermedio, y una cookie de diez minutos con
   * `sameSite: lax` es justo lo que se pierde en ese camino. Firmado, el dato
   * viaja con la petición y no depende del navegador.
   */
  return NextResponse.redirect(
    authorizeUrl({
      appId: app.appId,
      redirectUri: `${origin}/api/meta/callback`,
      state: signState(storeId, app.appSecret),
      configId: app.configId,
    }),
  );
}
