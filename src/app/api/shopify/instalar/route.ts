import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { findStore } from "@/lib/store-registry";
import { requireContext } from "@/lib/supabase/session";
import { authorizeUrl, isShopifyDomain, newState, shopDomain } from "@/lib/shopify-oauth";

/**
 * Arranca la instalación de la app en una tienda.
 *
 * Se llega desde el botón «Conectar con Shopify» de la pantalla de Tiendas, con
 * el id de la tienda y su dominio `.myshopify.com`.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Solo el dueño de la cuenta puede iniciar esto: si no, cualquiera podría
  // lanzar instalaciones usando las credenciales guardadas.
  await requireContext();

  const url = new URL(request.url);
  const storeId = url.searchParams.get("tienda") ?? "";
  const shopParam = url.searchParams.get("shop") ?? "";

  const store = await findStore(storeId);
  if (!store) return NextResponse.json({ error: "No se encontró la tienda." }, { status: 404 });

  if (!store.shopifyApiKey || !store.shopifyApiSecret) {
    return NextResponse.json(
      { error: "Faltan la clave y el secreto de la app de Shopify de esta tienda." },
      { status: 400 },
    );
  }

  /*
   * El dominio tiene que ser el `.myshopify.com`, no el propio.
   *
   * Shopify solo reconoce el primero para OAuth: con `naturoxmexico.com` la
   * autorización devuelve un error que no explica nada.
   */
  const shop = shopDomain(shopParam);
  if (!isShopifyDomain(shop)) {
    return NextResponse.json(
      { error: "Escribe el dominio .myshopify.com de la tienda, por ejemplo mitienda.myshopify.com." },
      { status: 400 },
    );
  }

  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const proto = incoming.get("x-forwarded-proto") ?? "https";
  const redirectUri = `${proto}://${host}/api/shopify/callback`;

  const state = newState();

  /*
   * El `state` viaja en una cookie y se compara al volver.
   *
   * Es lo que impide que alguien te haga abrir un enlace de autorización
   * preparado por él y acabe conectando su tienda a tu cuenta.
   */
  const jar = await cookies();
  jar.set("shopify_oauth", `${state}:${storeId}`, {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(
    authorizeUrl({ shop, apiKey: store.shopifyApiKey, redirectUri, state }),
  );
}
