/**
 * Hacer varias cosas a la vez, pero no todas.
 *
 * Sin imports, probado en `batch.test.ts`.
 *
 * ## Por qué en paralelo
 *
 * Las generaciones iban de una en una. Y no es que tarden mucho de CPU: se pide
 * la tarea al proveedor y se **espera** a que la termine, que son veinte o
 * treinta segundos sin hacer nada. Treinta imágenes en fila son quince minutos
 * de reloj cuando el trabajo real cabría en dos.
 *
 * ## Y por qué no todas de golpe
 *
 * Porque los proveedores limitan llamadas por minuto y ninguno documenta cuánto.
 * Treinta a la vez es la forma de descubrirlo con treinta errores de cupo — y
 * peor: algunos cobran el intento fallido. Un tope pequeño se lleva casi toda la
 * mejora sin arriesgar nada: con cuatro a la vez, treinta imágenes pasan de
 * quince minutos a menos de cuatro.
 *
 * ## Lo que falla no tumba lo demás
 *
 * Cada resultado viene con su suerte. En una tanda de treinta, que la número
 * siete falle no puede tirar las veintitrés que ya salieron —están pagadas— ni
 * impedir las que faltan.
 */

export interface Outcome<T> {
  ok: boolean;
  value?: T;
  error?: string;
  /** En qué posición iba, para poder decir cuál falló. */
  index: number;
}

/**
 * Cuántas a la vez por defecto.
 *
 * Cuatro. Es el punto donde la espera deja de dominar sin acercarse a ningún
 * límite conocido; subirlo solo tiene sentido con un número documentado
 * delante, y ninguno de los proveedores lo publica.
 */
export const CONCURRENCY = 4;

/**
 * Ejecuta las tareas con un tope de simultáneas, en orden de entrada.
 *
 * Los resultados vuelven **en el orden en que se pidieron**, no en el que
 * acabaron. Para seis planos de un vídeo eso no es un detalle: el orden es el
 * montaje.
 */
export async function inBatches<I, T>(
  items: I[],
  run: (item: I, index: number) => Promise<T>,
  options: { concurrency?: number; onDone?: (done: number, total: number) => void } = {},
): Promise<Outcome<T>[]> {
  const limit = Math.max(1, Math.round(options.concurrency ?? CONCURRENCY));
  const results: Outcome<T>[] = new Array(items.length);

  let next = 0;
  let done = 0;

  /*
   * Cada obrero coge la siguiente que quede, no un trozo repartido de antemano.
   *
   * Repartiendo en bloques, el que toca las tres lentas acaba mucho después que
   * los demás y el tope deja de servir de nada durante la última mitad.
   */
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;

      if (index >= items.length) return;

      try {
        results[index] = { ok: true, value: await run(items[index], index), index };
      } catch (error) {
        results[index] = {
          ok: false,
          error: error instanceof Error ? error.message : "falló",
          index,
        };
      }

      done += 1;
      options.onDone?.(done, items.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));

  return results;
}

/** Los que salieron, en orden. */
export function values<T>(outcomes: Outcome<T>[]): T[] {
  return outcomes.filter((item) => item.ok).map((item) => item.value as T);
}

/** Lo que falló, para contarlo sin esconderlo. */
export function failures<T>(outcomes: Outcome<T>[]): { index: number; error: string }[] {
  return outcomes
    .filter((item) => !item.ok)
    .map((item) => ({ index: item.index, error: item.error ?? "falló" }));
}
