import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findStore } from "@/lib/store-registry";
import { updateStore } from "@/lib/data/stores";
import { exchangeCode, isShopifyDomain, verifyHmac } from "@/lib/shopify-oauth";
import { siteOrigin } from "@/lib/site-url";

/**
 * La vuelta de Shopify: valida y guarda el token.
 *
 * Tres comprobaciones antes de tocar nada, y las tres importan:
 *
 * 1. **El `state`** debe coincidir con el de la cookie. Sin esto, alguien podría
 *    hacerte abrir un enlace suyo y conectar su tienda a tu cuenta.
 * 2. **La firma `hmac`**, calculada con el secreto de la app. Sin esto,
 *    cualquiera podría llamar aquí con parámetros inventados.
 * 3. **El dominio** debe ser un `.myshopify.com` real, no lo que venga.
 */

export const dynamic = "force-dynamic";

function fallo(mensaje: string) {
  return new NextResponse(
    `<p style="font-family:system-ui;padding:32px">${mensaje}</p><p style="font-family:system-ui;padding:0 32px"><a href="/stores">Volver a Tiendas</a></p>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const shop = params.get("shop") ?? "";
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";

  if (!shop || !code || !state) return fallo("Shopify no devolvió los datos esperados.");
  if (!isShopifyDomain(shop)) return fallo("El dominio que devolvió Shopify no es válido.");

  const jar = await cookies();
  const guardado = jar.get("shopify_oauth")?.value ?? "";
  const [estadoGuardado, storeId] = guardado.split(":");

  if (!estadoGuardado || estadoGuardado !== state) {
    return fallo("La instalación no coincide con la que empezaste. Vuelve a intentarlo desde Tiendas.");
  }

  const store = await findStore(storeId ?? "");
  if (!store?.shopifyApiKey || !store.shopifyApiSecret) {
    return fallo("Faltan las credenciales de la app de esta tienda.");
  }

  if (!verifyHmac(params, store.shopifyApiSecret)) {
    return fallo("La firma de Shopify no es válida. No se ha guardado nada.");
  }

  try {
    const { token } = await exchangeCode({
      shop,
      apiKey: store.shopifyApiKey,
      apiSecret: store.shopifyApiSecret,
      code,
    });

    await updateStore(store.id, { shopifyAdminToken: token });
  } catch (error) {
    return fallo(error instanceof Error ? error.message : "No se pudo obtener el token.");
  }

  // La cookie ya no sirve para nada y es de un solo uso.
  jar.delete("shopify_oauth");

  // El origen del proxy, no el del socket: `url.origin` es localhost aquí.
  return NextResponse.redirect(new URL("/stores?shopify=conectada", await siteOrigin()));
}
