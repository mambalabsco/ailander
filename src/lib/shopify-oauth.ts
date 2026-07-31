import "server-only";

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * OAuth de Shopify para conseguir el token de acceso.
 *
 * **Existe porque las apps del Dev Dashboard no dan el token en pantalla.** Las
 * antiguas, creadas desde el panel de la tienda, sí lo hacían; Shopify retiró esa
 * opción y ahora el token solo se obtiene con este intercambio.
 *
 * Todo lo de aquí está verificado contra la documentación del flujo
 * «authorization code grant», incluido el detalle que decide si el token sirve a
 * largo plazo: **sin `grant_options[]` y sin `expiring=1`, el token es
 * permanente**. Con cualquiera de los dos caduca, y habría que renovarlo a mano
 * cada pocas horas.
 */

/** Los permisos que necesita la plataforma. */
/**
 * Los permisos que se piden al instalar.
 *
 * `write_products` y `read_themes` se añadieron para poder gestionar la tienda
 * entera desde la plataforma. **Cambiar esta lista obliga a reconectar cada
 * tienda**: el token guardado lleva grabados los permisos con los que se
 * concedió, y los nuevos no aparecen solos. Si algo devuelve un error de acceso
 * después de tocar aquí, es por eso.
 *
 * **Los permisos de tema son dos, no uno.** En el panel de Shopify aparecen en
 * filas separadas: `read_themes` y `write_themes` bajo «Theme templates», y
 * `write_theme_code` bajo «Theme Code». La documentación de `themeFilesUpsert`
 * solo menciona el segundo grupo y una exención, pero el panel enseña ese
 * tercero aparte — así que se piden los tres y que Shopify conceda lo que
 * conceda.
 *
 * `write_theme_code` viene **desmarcado** por defecto en el panel. Pedirlo aquí
 * no basta: hay que marcarlo también allí, en la configuración de la app, antes
 * de reconectar la tienda.
 */
export const SHOPIFY_SCOPES = [
  "write_content",
  "write_files",
  "read_orders",
  "write_products",
  "read_themes",
  "write_themes",
  "write_theme_code",
];

/** El dominio limpio, sin protocolo ni rutas. */
export function shopDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
}

export function newState(): string {
  return randomBytes(16).toString("hex");
}

export function authorizeUrl(options: {
  shop: string;
  apiKey: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`https://${shopDomain(options.shop)}/admin/oauth/authorize`);

  url.searchParams.set("client_id", options.apiKey);
  url.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.state);

  // Ni `grant_options[]` ni `expiring`: así el token no caduca.
  return url.toString();
}

/**
 * Comprueba la firma de lo que devuelve Shopify.
 *
 * **Sin esto, cualquiera podría llamar a la ruta de vuelta con parámetros
 * inventados** y hacer que la plataforma pida un token a un dominio ajeno. La
 * firma se calcula sobre todos los parámetros menos `hmac`, ordenados
 * alfabéticamente.
 */
export function verifyHmac(params: URLSearchParams, secret: string): boolean {
  const received = params.get("hmac");
  if (!received) return false;

  const rest = new URLSearchParams(params);
  rest.delete("hmac");

  const ordered = [...rest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const expected = createHmac("sha256", secret).update(ordered).digest("hex");

  // Comparación de tiempo constante: comparar con `===` filtra información sobre
  // cuántos caracteres acertó quien lo intenta.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

/** Un dominio de Shopify y no cualquier cosa: el parámetro llega de fuera. */
export function isShopifyDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain(shop));
}

export async function exchangeCode(options: {
  shop: string;
  apiKey: string;
  apiSecret: string;
  code: string;
}): Promise<{ token: string; scope: string }> {
  const response = await fetch(`https://${shopDomain(options.shop)}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: options.apiKey,
      client_secret: options.apiSecret,
      code: options.code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify rechazó el intercambio (${response.status}).`);
  }

  const payload = (await response.json()) as { access_token?: string; scope?: string };
  if (!payload.access_token) throw new Error("Shopify no devolvió ningún token.");

  return { token: payload.access_token, scope: payload.scope ?? "" };
}
