import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Iniciar sesión en Meta, sin pegar ningún token.
 *
 * Verificado contra la documentación de Facebook Login y de la Marketing API:
 * el diálogo es `facebook.com/v26.0/dialog/oauth`, el canje es
 * `GET /oauth/access_token` con `code`, el token largo se obtiene con
 * `grant_type=fb_exchange_token` y la caducidad se lee en `/debug_token`.
 *
 * ## Lo que hay que saber antes de leer el código
 *
 * **`ads_read` es suficiente.** No se pide `ads_management`: la plataforma solo
 * lee gasto. Pedir permiso de gestión obligaría a pasar revisión de Facebook y
 * daría a esta app la capacidad de tocar campañas, que no necesita.
 *
 * **No hace falta revisión de Facebook** mientras quien inicia sesión sea
 * administrador, desarrollador o tester de la propia app. Es el caso: son tus
 * cuentas y tu app. El «acceso estándar» que se concede solo limita el volumen
 * de llamadas, que para leer gasto diario de unas cuantas cuentas sobra.
 *
 * **El token dura unos sesenta días y no se puede renovar solo.** Es una
 * limitación de Meta, no una decisión de aquí: no existe un *refresh token* para
 * tokens de usuario. Se intenta re-canjear en cada sincronización —cuesta una
 * llamada y a veces amplía el plazo— pero **no se confía en que funcione**: la
 * caducidad se guarda y la interfaz avisa con antelación con un botón de un clic.
 * Fingir que se renueva solo sería el fallo peor: el gasto aparecería a cero un
 * martes cualquiera, sin error y sin pista.
 */

const DEFAULT_VERSION = "v26.0";
const GRAPH = "https://graph.facebook.com";
const DIALOG = "https://www.facebook.com";

/** Solo `ads_read`. Ver la cabecera: no se pide gestión de anuncios. */
export const META_SCOPES = ["ads_read"];

function version(): string {
  return process.env.META_API_VERSION?.trim() || DEFAULT_VERSION;
}

export interface MetaAppConfig {
  appId: string;
  appSecret: string;
  /**
   * Identificador de la «configuración» de Facebook Login for Business.
   *
   * Las apps de tipo Empresa usan **Login for Business**, que no pide los
   * permisos con `scope` sino con `config_id`: la lista de permisos y el tipo de
   * token se declaran una vez en el panel de Meta y el diálogo se invoca
   * apuntando a esa configuración.
   *
   * Es opcional porque `scope` **sigue funcionando** —Meta solo recomienda no
   * usarlo— y así una app con Login clásico también sirve. Cuando está, se
   * prefiere: es el camino que Meta mantiene, y permite elegir un token de
   * usuario de sistema, que no caduca.
   */
  configId?: string;
}

/**
 * Las credenciales de la app, del entorno.
 *
 * **Del entorno y no de la base de datos, al contrario que las de Shopify.** Es
 * la diferencia entre las dos plataformas: Shopify exige una app distinta por
 * tienda, mientras que una sola app de Meta sirve para todas las cuentas
 * publicitarias a las que el usuario tenga acceso. Guardar lo mismo por tienda
 * sería pedir el mismo dato varias veces.
 */
export function appConfig(): MetaAppConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;

  return { appId, appSecret, configId: process.env.META_CONFIG_ID?.trim() || undefined };
}

export function isConfigured(): boolean {
  return appConfig() !== null;
}

/* ---------------------------- Estado anti-CSRF ------------------------------ */

/**
 * El `state` lleva la tienda dentro, firmado.
 *
 * Hace dos trabajos a la vez y los dos hacen falta. Protege de que alguien te
 * mande a un callback con un `code` suyo, y **transporta a qué tienda hay que
 * asociar la cuenta** —el callback de Meta no puede llevar parámetros propios—.
 *
 * Va firmado con el secreto de la app y se compara en tiempo constante: sin la
 * firma, cualquiera podría cambiar el id de la tienda en la URL de vuelta y
 * conectar sus cuentas a otra.
 */
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

/**
 * El diálogo, con configuración o con permisos sueltos.
 *
 * Los dos caminos llevan al mismo sitio y no se pueden mezclar: si hay
 * `config_id`, los permisos ya están declarados en la configuración y mandar
 * además `scope` es lo que Meta desaconseja explícitamente. Por eso es un
 * o lo uno o lo otro, no los dos.
 */
export function authorizeUrl(options: {
  appId: string;
  redirectUri: string;
  state: string;
  configId?: string;
}): string {
  const url = new URL(`${DIALOG}/${version()}/dialog/oauth`);
  url.searchParams.set("client_id", options.appId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.state);
  url.searchParams.set("response_type", "code");

  if (options.configId) url.searchParams.set("config_id", options.configId);
  else url.searchParams.set("scope", META_SCOPES.join(","));

  return url.toString();
}

/* ---------------------------------- Canje ---------------------------------- */

export interface MetaToken {
  accessToken: string;
  /** `null` si Meta no dice cuándo caduca. */
  expiresAt: Date | null;
  scopes: string[];
  userName: string | null;
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${version()}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as T & { error?: { message: string; code?: number } };

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Meta respondió ${response.status}.`);
  }

  return payload;
}

/**
 * Canjea el código por un token largo, en dos pasos y sin atajos.
 *
 * El código da un token de **una hora**. Guardarlo tal cual haría que la
 * conexión funcionase en la prueba y estuviera muerta al día siguiente, que es la
 * clase de fallo que parece intermitente. El segundo canje es lo que lo convierte
 * en uno de sesenta días.
 */
export async function exchangeCode(options: {
  app: MetaAppConfig;
  code: string;
  redirectUri: string;
}): Promise<MetaToken> {
  const short = await graph<{ access_token: string }>("oauth/access_token", {
    client_id: options.app.appId,
    client_secret: options.app.appSecret,
    redirect_uri: options.redirectUri,
    code: options.code,
  });

  return exchangeForLongLived(options.app, short.access_token);
}

/**
 * Convierte un token en uno de larga duración.
 *
 * Sirve para el canje inicial y para el intento de renovación: es la misma
 * llamada. Meta **puede** devolver el mismo plazo en vez de ampliarlo —su
 * documentación no lo garantiza— y por eso quien llama nunca da la renovación por
 * hecha: se guarda la caducidad que venga y se avisa según ella.
 */
export async function exchangeForLongLived(
  app: MetaAppConfig,
  token: string,
): Promise<MetaToken> {
  const long = await graph<{ access_token: string; expires_in?: number }>(
    "oauth/access_token",
    {
      grant_type: "fb_exchange_token",
      client_id: app.appId,
      client_secret: app.appSecret,
      fb_exchange_token: token,
    },
  );

  const details = await inspect(app, long.access_token);

  return {
    accessToken: long.access_token,
    // Se prefiere lo que dice `/debug_token` a `expires_in`: es la fecha real y
    // no un plazo relativo al instante de la respuesta.
    expiresAt:
      details.expiresAt ??
      (long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null),
    scopes: details.scopes,
    userName: details.userName,
  };
}

/**
 * Qué es este token: si vale, cuándo caduca, qué permisos tiene y de quién es.
 *
 * `expires_at` a cero significa «no caduca», no «caducó en 1970». Tratarlo como
 * fecha daría una conexión permanentemente vencida.
 */
export async function inspect(
  app: MetaAppConfig,
  token: string,
): Promise<{
  valid: boolean;
  expiresAt: Date | null;
  scopes: string[];
  userName: string | null;
}> {
  const debug = await graph<{
    data?: {
      is_valid?: boolean;
      expires_at?: number;
      scopes?: string[];
      user_id?: string;
    };
  }>("debug_token", {
    input_token: token,
    // El token de app es literalmente `id|secreto`, y es lo que la
    // documentación indica para inspeccionar un token propio.
    access_token: `${app.appId}|${app.appSecret}`,
  });

  const data = debug.data ?? {};
  const expires = data.expires_at ?? 0;

  let userName: string | null = null;
  try {
    const me = await graph<{ name?: string }>("me", { fields: "name", access_token: token });
    userName = me.name ?? null;
  } catch {
    // El nombre es una cortesía para la interfaz. Si falla, la conexión sigue
    // siendo válida y no tiene sentido tirar todo el flujo por esto.
  }

  return {
    valid: data.is_valid !== false,
    expiresAt: expires > 0 ? new Date(expires * 1000) : null,
    scopes: data.scopes ?? [],
    userName,
  };
}

/* -------------------------------- Caducidad -------------------------------- */

/** Cuántos días quedan, o `null` si el token no caduca. */
export function daysLeft(expiresAt: Date | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Si conviene intentar renovar.
 *
 * Se intenta a partir de los diez días restantes y no cada vez: el re-canje
 * cuesta una llamada y, si Meta no amplía el plazo, hacerlo a diario solo gasta
 * cupo. Diez días es margen de sobra para que alguien vea el aviso y pulse el
 * botón si el re-canje no sirvió.
 */
export function shouldRenew(expiresAt: Date | null, now: Date = new Date()): boolean {
  const left = daysLeft(expiresAt, now);
  return left !== null && left <= 10;
}

/** Si ya no sirve: el gasto que se lea será cero y hay que decirlo. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  const left = daysLeft(expiresAt, now);
  return left !== null && left < 0;
}
