import { NextResponse } from "next/server";
import { findStore } from "@/lib/store-registry";
import { requireContext } from "@/lib/supabase/session";
import { siteOrigin } from "@/lib/site-url";
import { appConfig, authorizeUrl, signState } from "@/lib/meta-oauth";

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

  const store = await findStore(storeId);
  if (!store) return NextResponse.json({ error: "No se encontró la tienda." }, { status: 404 });

  const app = appConfig();
  if (!app) {
    return NextResponse.json(
      {
        error:
          "Faltan META_APP_ID y META_APP_SECRET en el entorno del servidor. Están en docs/anuncios.md.",
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
      state: signState(store.id, app.appSecret),
      configId: app.configId,
    }),
  );
}
