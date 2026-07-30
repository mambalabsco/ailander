import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Iniciar sesión en Google Ads, sin pegar ningún token.
 *
 * Al revés que Meta, aquí el permiso **sí** es permanente: el flujo devuelve un
 * *refresh token* que no caduca, así que se autoriza una vez y ya está. Con dos
 * trampas que hay que conocer:
 *
 * **`access_type=offline` y `prompt=consent` son obligatorios.** Sin el primero
 * Google no da refresh token; sin el segundo, en la segunda autorización del
 * mismo usuario **no lo vuelve a dar** —solo lo entrega la primera vez— y el
 * flujo parece funcionar mientras guarda un permiso vacío.
 *
 * **La app tiene que estar publicada.** En «modo de prueba» el refresh token
 * caduca a los siete días. Ese es el `invalid_grant` que aparece la semana
 * siguiente y que no tiene ninguna relación aparente con lo que se hizo.
 *
 * El *developer token* es aparte y no se resuelve con ningún login: lo aprueba
 * una persona en Google. Está explicado en `docs/anuncios.md`.
 */

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

/**
 * `adwords` para leer el gasto, más `openid email` para saber quién autorizó.
 *
 * Los dos últimos no son sensibles y no añaden requisitos de verificación, pero
 * sin ellos no se puede consultar el correo — y entonces «hay que reconectar»
 * no dice a quién hay que pedírselo, que en una cuenta con varias personas es la
 * mitad del problema.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "openid",
  "email",
];

export interface GoogleAppConfig {
  clientId: string;
  clientSecret: string;
  /** Del entorno si está: así no hay que pegarlo en cada tienda. */
  developerToken?: string;
}

export function appConfig(): GoogleAppConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || undefined,
  };
}

export function isConfigured(): boolean {
  return appConfig() !== null;
}

/* ---------------------------- Estado anti-CSRF ------------------------------ */

export function signState(storeId: string, secret: string): string {
  const nonce = randomBytes(12).toString("hex");
  const payload = `${storeId}.${nonce}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function readState(state: string, secret: string): { storeId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;

  const [storeId, nonce, signature] = parts;
  const expected = createHmac("sha256", secret).update(`${storeId}.${nonce}`).digest("hex");

  const given = Buffer.from(signature, "hex");
  const mine = Buffer.from(expected, "hex");
  if (given.length !== mine.length) return null;
  if (!timingSafeEqual(given, mine)) return null;

  return { storeId };
}

/* --------------------------------- Diálogo --------------------------------- */

export function authorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTH);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", options.state);
  // Los dos parámetros de la cabecera. Sin ellos no hay refresh token, o lo hay
  // solo la primera vez y la segunda autorización guarda un permiso vacío.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

/* ---------------------------------- Canje ---------------------------------- */

export interface GoogleToken {
  refreshToken: string;
  accessToken: string;
  email: string | null;
}

export async function exchangeCode(options: {
  app: GoogleAppConfig;
  code: string;
  redirectUri: string;
}): Promise<GoogleToken> {
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: options.code,
      client_id: options.app.clientId,
      client_secret: options.app.clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google rechazó el código: ${payload.error_description || payload.error || response.status}`,
    );
  }

  /*
   * Sin refresh token no se guarda nada.
   *
   * Es el caso de quien ya había autorizado antes: Google devuelve el token de
   * acceso y omite el de refresco. Guardar solo el de acceso daría una conexión
   * que funciona una hora y muere, así que es mejor fallar aquí con una
   * explicación que dejar una conexión zombi.
   */
  if (!payload.refresh_token) {
    throw new Error(
      "Google no devolvió permiso permanente. Suele pasar cuando ya habías autorizado esta app: quita el acceso en myaccount.google.com/permissions y vuelve a intentarlo.",
    );
  }

  return {
    refreshToken: payload.refresh_token,
    accessToken: payload.access_token,
    email: await emailOf(payload.access_token),
  };
}

/** Quién autorizó, para poder decir a quién hay que pedirle que reconecte. */
async function emailOf(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { email?: string };
    return payload.email ?? null;
  } catch {
    // Cortesía para la interfaz; no justifica tirar el flujo.
    return null;
  }
}
