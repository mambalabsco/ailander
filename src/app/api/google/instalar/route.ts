import { NextResponse } from "next/server";
import { findStore } from "@/lib/store-registry";
import { requireContext } from "@/lib/supabase/session";
import { siteOrigin } from "@/lib/site-url";
import { appConfig, authorizeUrl, signState } from "@/lib/google-oauth";

/** Manda al diálogo de Google. Se llega desde «Iniciar sesión con Google». */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
          "Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el entorno del servidor. Están en docs/anuncios.md.",
      },
      { status: 500 },
    );
  }

  const origin = await siteOrigin();

  return NextResponse.redirect(
    authorizeUrl({
      clientId: app.clientId,
      redirectUri: `${origin}/api/google/callback`,
      state: signState(store.id, app.clientSecret),
    }),
  );
}
