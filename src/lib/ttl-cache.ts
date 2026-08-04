/**
 * Guardar un rato lo que cuesta traer y casi nunca cambia.
 *
 * Sin imports, probado en `ttl-cache.test.ts`.
 *
 * ## Qué problema resuelve
 *
 * Hay pantallas que en **cada carga** lanzan el CLI de Higgsfield tres o cuatro
 * veces —una por `version`, otra por `auth token`, otra por cada catálogo— y
 * además preguntan las voces a ElevenLabs. Cada una es un proceso hijo o una
 * ida y vuelta por red, y en un servidor de dos núcleos eso son segundos por
 * navegación. La plataforma se siente lenta y no es el código: es que está
 * preguntando lo mismo una y otra vez.
 *
 * Y son datos que cambian cada mucho: el catálogo de un proveedor, las voces de
 * la cuenta, si hay sesión. Guardarlos unos minutos no envejece nada y quita
 * casi toda la espera.
 *
 * ## Los fallos se guardan menos
 *
 * Un catálogo que llegó bien puede esperar cinco minutos. Un fallo, no: quien
 * acaba de arreglar la sesión en el servidor entra a mirar **enseguida**, y
 * hacerle esperar cinco minutos para volver a intentarlo es el peor momento
 * posible para cachear. Medio minuto es bastante para no repetir la llamada en
 * cada clic y poco para no desesperar.
 *
 * ## Y por qué en memoria
 *
 * Porque es una sola instancia. Con varias haría falta algo compartido, pero
 * entonces también habría que invalidarlo entre ellas — y eso es un problema
 * mayor que el que se está resolviendo.
 */

interface Entry<T> {
  value?: T;
  /**
   * El fallo, cuando lo hubo.
   *
   * Va aparte del valor y no como un valor vacío. Guardar un fallo como
   * `undefined` hace que quien llame después lo reciba **como bueno**: un
   * catálogo vacío en vez de un error, y la pantalla diciendo «no hay modelos»
   * cuando lo que hay es una sesión caducada. Es el mismo fallo silencioso de
   * siempre, metido en la caché.
   */
  error?: unknown;
  /** Cuándo deja de valer, en milisegundos desde el origen. */
  until: number;
}

/** Lo que dura un acierto y lo que dura un fallo. */
export const OK_MS = 5 * 60_000;
export const FAIL_MS = 30_000;

export interface CacheOptions {
  okMs?: number;
  failMs?: number;
  /** El reloj. Se inyecta para poder probar el vencimiento sin esperar. */
  now?: () => number;
}

/**
 * Un almacén con vencimiento y **una sola llamada en vuelo por clave**.
 *
 * Lo segundo importa tanto como lo primero. Al abrir la pantalla se piden a la
 * vez el estado del CLI y dos catálogos; sin esto, tres pestañas abiertas a la
 * vez lanzan doce procesos en vez de cuatro. Compartiendo la promesa, quien
 * llega mientras otro está preguntando espera la misma respuesta.
 */
export function createCache(options: CacheOptions = {}) {
  const okMs = options.okMs ?? OK_MS;
  const failMs = options.failMs ?? FAIL_MS;
  const now = options.now ?? Date.now;

  const entries = new Map<string, Entry<unknown>>();
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    /**
     * Devuelve lo guardado si vale, y si no llama y lo guarda.
     *
     * Un fallo **también se guarda**, con su plazo corto: si no, una pantalla
     * que se recarga sola reintentaría una llamada que falla en cada vuelta.
     */
    async get<T>(key: string, load: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);

      if (hit && hit.until > now()) {
        // Lo que falló sigue fallando mientras dure su plazo, con su error: así
        // quien llama ve lo mismo que vería preguntando.
        if ("error" in hit) throw hit.error;
        return hit.value as T;
      }

      const running = inFlight.get(key);
      if (running) return running as Promise<T>;

      const promise = load()
        .then((value) => {
          entries.set(key, { value, until: now() + okMs });
          return value;
        })
        .catch((error: unknown) => {
          entries.set(key, { error, until: now() + failMs });
          throw error;
        })
        .finally(() => {
          inFlight.delete(key);
        });

      inFlight.set(key, promise);

      return promise;
    },

    /** Olvida una clave, para cuando algo la deja vieja a propósito. */
    forget(key: string) {
      entries.delete(key);
      inFlight.delete(key);
    },

    /** Cuántas claves hay guardadas. Para poder afirmarlo en una prueba. */
    size() {
      return entries.size;
    },
  };
}
