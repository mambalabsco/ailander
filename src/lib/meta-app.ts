/**
 * Con qué app de Meta se conecta cada tienda, y el estado anti-CSRF.
 *
 * Aparte de `meta-oauth.ts` porque aquel lleva `server-only` —hace peticiones—
 * y esto no toca la red. Son dos decisiones, y las dos hay que poder probarlas:
 * elegir mal la app conecta la tienda contra el Business Manager equivocado, y
 * aceptar un estado que no se firmó aquí deja que alguien conecte sus cuentas a
 * tu tienda.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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
 * La app de reserva, la del entorno.
 *
 * Aquí decía que una sola app de Meta bastaba para todo, porque sirve para
 * todas las cuentas a las que el usuario tenga acceso. **Y es falso en cuanto
 * hay un segundo Business Manager en otro perfil de Facebook**: ahí Meta obliga
 * a otra app, y con la configuración en el entorno solo cabe una.
 *
 * Así que esta es la de por defecto y cada tienda puede tener la suya. Quien
 * trabaje con un solo BM no nota el cambio: sigue funcionando con las variables
 * de siempre.
 */
export function envAppConfig(): MetaAppConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;

  return { appId, appSecret, configId: process.env.META_CONFIG_ID?.trim() || undefined };
}

/**
 * La app que le toca a esa tienda: la suya si la tiene, y si no la del entorno.
 *
 * Las dos partes tienen que ir juntas —identificador y secreto— o no se usa
 * ninguna. Media configuración propia mezclada con media del entorno daría un
 * diálogo de Facebook que falla al canjear el código, y el error de Meta ahí no
 * dice cuál de las dos mitades sobra.
 */
export function pickAppConfig(
  stored: { appId?: string | null; appSecret?: string | null; configId?: string | null } | null,
): MetaAppConfig | null {
  const appId = stored?.appId?.trim();
  const appSecret = stored?.appSecret?.trim();

  if (appId && appSecret) {
    return { appId, appSecret, configId: stored?.configId?.trim() || undefined };
  }

  return envAppConfig();
}

export function isConfigured(): boolean {
  return envAppConfig() !== null;
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

/**
 * La tienda que dice el `state`, **sin comprobar la firma**.
 *
 * Hace falta por el orden de las cosas: cada tienda puede tener su propia app de
 * Meta, así que para saber con qué secreto verificar la firma hay que saber
 * antes de qué tienda se habla — y eso viene dentro del propio `state`.
 *
 * Es seguro porque esto no decide nada: solo elige con qué llave comprobar. Un
 * `state` con una tienda inventada carga el secreto de esa tienda y la firma no
 * cuadra, así que `readState` lo rechaza igual. Y las credenciales que se leen
 * pasan por RLS, de modo que ni siquiera se pueden mirar las de otro.
 *
 * Lo que **no** se puede hacer es usar este valor para nada más.
 */
export function peekStore(state: string): string {
  const [storeId] = state.split(".");
  return storeId ?? "";
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

