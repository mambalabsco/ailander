/**
 * Una cola por proveedor, para toda la plataforma.
 *
 * Sin imports, probada en `queue.test.ts`.
 *
 * ## Qué problema resuelve
 *
 * Cada pantalla se protegía sola. El adaptador de imágenes manda de cuatro en
 * cuatro, el flujo va de una en una, el estudio manda lo que le pidan. Cada uno
 * respeta un tope **suyo**, y el proveedor no cuenta por pantalla: cuenta por
 * cuenta. Así que cuatro imágenes y un flujo y alguien en el estudio son seis
 * llamadas a la vez que nadie pidió, y el cupo salta.
 *
 * Y cuando salta, cada pantalla lo descubre por su cuenta y reintenta por su
 * cuenta — todas a la vez, que es exactamente lo que vuelve a hacerlo saltar.
 *
 * Esto es el sitio por el que pasa todo. Un tope por proveedor, sumando lo que
 * mande quien lo mande.
 *
 * ## Y lo que la hace distinta de un simple tope
 *
 * Cuando una llamada choca con el cupo, **frena el proveedor entero**, no solo
 * esa llamada. Es lo que dice el error: no es «tú has ido rápido», es «vamos
 * demasiado rápido». Si solo esperara la que falló, las otras cinco que están en
 * vuelo seguirían chocando y cada una empezaría su propia espera, escalonadas,
 * durante minutos.
 *
 * Con la pausa compartida, se para todo el rato que diga el proveedor y después
 * sigue la cola por donde iba. Nada se pierde y nada se reenvía a mano.
 *
 * ## Por qué en memoria
 *
 * Porque es una sola instancia, igual que la caché. Con varias haría falta algo
 * compartido y, sobre todo, un tope repartido entre ellas — y eso es un problema
 * mayor que el que se está resolviendo.
 */

/** Lo que se permite a la vez por proveedor, salvo que se diga otra cosa. */
export const DEFAULT_LIMIT = 4;

/** Cuántas veces se reintenta antes de rendirse. */
export const DEFAULT_RETRIES = 4;

/** La primera espera. Después se dobla: 2, 4, 8, 16 segundos. */
export const BASE_DELAY_MS = 2_000;

export interface Verdict {
  retry: boolean;
  /** Lo que el proveedor pidió esperar, cuando lo dice. */
  afterMs?: number;
}

/**
 * Si merece la pena reintentar, leído del error.
 *
 * Los 429 y los 5xx sí: el primero es cupo y el segundo es que al proveedor le
 * pasa algo, y las dos cosas se arreglan solas. Un 400 no — mandar otra vez el
 * mismo cuerpo mal formado da el mismo 400, y reintentarlo cuatro veces solo
 * retrasa el mensaje de error cuarenta segundos.
 */
export function defaultRetryable(error: unknown): Verdict {
  const record = (error ?? {}) as { status?: unknown; retryAfterMs?: unknown; message?: unknown };

  const status = Number(record.status);
  const afterMs = Number(record.retryAfterMs);

  if (status === 429 || (status >= 500 && status < 600)) {
    return { retry: true, afterMs: Number.isFinite(afterMs) && afterMs > 0 ? afterMs : undefined };
  }

  /*
   * Y los cortes de red, que no traen estado.
   *
   * Un `fetch failed` a mitad de una generación de treinta segundos es casi
   * siempre la red y no el proveedor: no reintentarlo tira algo que estaba a
   * punto de salir.
   */
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";

  if (/fetch failed|econnreset|etimedout|socket hang up|network/.test(message)) {
    return { retry: true };
  }

  return { retry: false };
}

export interface QueueOptions {
  limit?: number;
  retries?: number;
  baseDelayMs?: number;
  retryable?: (error: unknown) => Verdict;
  /** Se inyectan para poder probar las esperas sin esperarlas. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface QueueStats {
  running: number;
  waiting: number;
  /** Milisegundos que queda de pausa, o 0. */
  pausedFor: number;
}

interface Lane {
  running: number;
  waiting: (() => void)[];
  pausedUntil: number;
}

export function createQueue(options: QueueOptions = {}) {
  const limit = Math.max(1, Math.round(options.limit ?? DEFAULT_LIMIT));
  const retries = Math.max(0, Math.round(options.retries ?? DEFAULT_RETRIES));
  const baseDelayMs = options.baseDelayMs ?? BASE_DELAY_MS;
  const retryable = options.retryable ?? defaultRetryable;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const lanes = new Map<string, Lane>();

  const lane = (key: string): Lane => {
    const found = lanes.get(key);
    if (found) return found;

    const fresh: Lane = { running: 0, waiting: [], pausedUntil: 0 };
    lanes.set(key, fresh);

    return fresh;
  };

  async function acquire(key: string): Promise<void> {
    const current = lane(key);

    for (;;) {
      const left = current.pausedUntil - now();

      // La pausa la respetan todos, no solo el que chocó.
      if (left > 0) {
        await sleep(left);
        continue;
      }

      // Sin `await` entre mirar y sumar: en un solo hilo, eso lo hace atómico.
      if (current.running < limit) {
        current.running += 1;
        return;
      }

      await new Promise<void>((resolve) => current.waiting.push(resolve));
    }
  }

  function release(key: string): void {
    const current = lane(key);

    current.running = Math.max(0, current.running - 1);
    current.waiting.shift()?.();
  }

  return {
    /**
     * Ejecuta la tarea respetando el tope del proveedor, y la reintenta sola.
     *
     * El hueco se suelta **antes** de esperar entre reintentos: quedarse con él
     * mientras se espera dieciséis segundos deja el tope ocupado por algo que no
     * está haciendo nada.
     */
    async run<T>(key: string, task: () => Promise<T>): Promise<T> {
      for (let attempt = 0; ; attempt += 1) {
        await acquire(key);

        try {
          return await task();
        } catch (error) {
          const verdict = retryable(error);

          if (!verdict.retry) throw error;

          /*
           * Frena el proveedor entero, no solo esta llamada.
           *
           * Si solo esperara la que falló, las otras que están en vuelo
           * seguirían chocando y cada una empezaría su propia espera,
           * escalonadas, durante minutos.
           *
           * Y se frena **también al rendirse**. Que esta llamada agote sus
           * intentos no cambia lo que dijo el proveedor: vamos demasiado
           * rápido. Las que vengan detrás tienen que esperar igual, o repiten
           * el choque una por una.
           */
          const wait = verdict.afterMs ?? baseDelayMs * 2 ** attempt;
          const current = lane(key);

          current.pausedUntil = Math.max(current.pausedUntil, now() + wait);

          if (attempt >= retries) throw error;
        } finally {
          release(key);
        }
      }
    },

    /** Frenar a mano, para cuando el cupo se sabe desde fuera. */
    pause(key: string, ms: number): void {
      const current = lane(key);
      current.pausedUntil = Math.max(current.pausedUntil, now() + Math.max(0, ms));
    },

    stats(key: string): QueueStats {
      const current = lanes.get(key);
      if (!current) return { running: 0, waiting: 0, pausedFor: 0 };

      return {
        running: current.running,
        waiting: current.waiting.length,
        pausedFor: Math.max(0, current.pausedUntil - now()),
      };
    },

    /** Lo que hay en marcha en toda la plataforma, para poder enseñarlo. */
    all(): Record<string, QueueStats> {
      const out: Record<string, QueueStats> = {};

      for (const key of lanes.keys()) out[key] = this.stats(key);

      return out;
    },
  };
}

export type Queue = ReturnType<typeof createQueue>;
