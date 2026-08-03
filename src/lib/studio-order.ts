/**
 * El orden de las piezas del estudio.
 *
 * Sin imports, probado en `studio-order.test.ts`.
 *
 * ## Por qué el orden vive aquí y no en la base de datos
 *
 * Reordenar es la operación que más se hace en una mesa de montaje y la que peor
 * envejece si se resuelve a lo bruto. Renumerar todas las piezas cada vez que se
 * mueve una es una escritura por pieza —y con treinta piezas, treinta— para un
 * gesto que se repite cada pocos segundos.
 *
 * Con hueco entre posiciones, mover una es **una sola escritura**: se le da un
 * número entre sus dos vecinas nuevas. Solo cuando no cabe ninguno entre ellas
 * hay que renumerar, y eso pasa muy de vez en cuando.
 */

/** El hueco que se deja entre piezas. Veinte da unos cuantos movimientos. */
export const STEP = 20;

export interface Ordered {
  id: string;
  position: number;
}

/** Las posiciones iniciales de una lista: 20, 40, 60… */
export function initialPositions(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * STEP);
}

export interface MoveResult {
  /** Lo que hay que escribir. Casi siempre una sola pieza. */
  changes: Ordered[];
  /** Si hubo que renumerar todo porque no cabía ningún número en medio. */
  renumbered: boolean;
}

/**
 * Mueve una pieza a otro sitio y devuelve **solo lo que cambia**.
 *
 * `to` es el índice donde queda dentro de la lista ya sin ella. Es el que da un
 * arrastre: se saca de donde estaba y se suelta entre otras dos.
 */
export function move(items: Ordered[], id: string, to: number): MoveResult {
  const ordered = items.slice().sort((a, b) => a.position - b.position);
  const from = ordered.findIndex((item) => item.id === id);

  if (from === -1) return { changes: [], renumbered: false };

  const rest = ordered.filter((item) => item.id !== id);
  const target = Math.max(0, Math.min(rest.length, to));

  const before = rest[target - 1];
  const after = rest[target];

  // Entre las dos nuevas vecinas. Sin vecina por un lado, se sale por fuera.
  const low = before ? before.position : (after ? after.position : STEP) - STEP * 2;
  const high = after ? after.position : low + STEP * 2;

  const middle = Math.floor((low + high) / 2);

  /*
   * Si no cabe ningún entero entre las vecinas, se renumera todo.
   *
   * Pasa después de muchos movimientos en el mismo punto, y es el único caso que
   * cuesta varias escrituras. Detectarlo es comparar dos números; no detectarlo
   * es dejar dos piezas con la misma posición y un orden que cambia solo.
   */
  if (middle <= low || middle >= high) {
    const next = rest.slice();
    next.splice(target, 0, ordered[from]);

    return {
      changes: next.map((item, index) => ({ id: item.id, position: (index + 1) * STEP })),
      renumbered: true,
    };
  }

  return { changes: [{ id, position: middle }], renumbered: false };
}

/** La lista ordenada, para pintarla. */
export function sorted<T extends Ordered>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.position - b.position);
}

/** La posición para una pieza nueva: detrás de todas. */
export function nextPosition(items: Ordered[]): number {
  return items.reduce((max, item) => Math.max(max, item.position), 0) + STEP;
}
