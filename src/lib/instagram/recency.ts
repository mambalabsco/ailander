/**
 * Las piezas más recientes de una cuenta, para no repetirse.
 *
 * ## Por qué no vale recortar el orden de `listPosts`
 *
 * `listPosts` ordena por `scheduled_at` ascendente —lo próximo primero, con los
 * borradores sin fecha al final— porque es lo que hay que ver en la pantalla
 * de la cola. Recortando ese mismo orden para «las últimas quince» se cogen
 * las quince con la fecha de publicación **más próxima**, y con más de quince
 * piezas en la cuenta eso no es lo mismo que lo más nuevo: una pieza publicada
 * hace medio año conserva un `scheduled_at` pequeño y sigue colándose delante
 * de lo que se escribió ayer. El filtro que existe justo para no repetir el
 * gancho de la semana pasada acaba comparando contra el del año pasado, y deja
 * pasar sin avisar exactamente lo que se acaba de escribir — que es lo único
 * que de verdad hay que pillar.
 *
 * ## Por qué `scheduledAt ?? publishedAt` y no `created_at`
 *
 * Lo que habría que ordenar de verdad es cuándo se **escribió** cada pieza,
 * pero el tipo `Post` no trae esa fecha: la tabla la guarda (`created_at`) y
 * `listPosts` la usa por dentro como desempate de los borradores, pero no la
 * expone fuera del módulo. Sin inventarla ni tocar el tipo, lo más parecido a
 * «cuándo pasó» que hay es `scheduledAt` — y `publishedAt` si por lo que sea
 * falta el primero, aunque en la práctica uno implica el otro, porque el cron
 * solo publica lo que antes tuvo fecha.
 *
 * Un borrador sin ninguna de las dos fechas todavía no se programó, así que es
 * lo último que salió del generador: cuenta como lo más reciente de todo. Es
 * justo el caso que más importa no perder, porque una tanda que genera y no
 * programa de inmediato es el escenario más probable de repetirse a sí misma.
 */

export interface ConFecha {
  scheduledAt: string | null;
  publishedAt: string | null;
}

/** Milisegundos desde época, o infinito si no hay fecha: sin fecha es lo más nuevo. */
const marca = (one: ConFecha): number => {
  const iso = one.scheduledAt ?? one.publishedAt;
  return iso ? Date.parse(iso) : Number.POSITIVE_INFINITY;
};

// Antes de restar: dos infinitos («Infinity - Infinity») dan NaN, y un
// comparador que devuelve NaN deja el orden sin definir según el motor.
const porRecencia = (a: ConFecha, b: ConFecha): number => {
  const ma = marca(a);
  const mb = marca(b);
  return ma === mb ? 0 : mb - ma;
};

/**
 * Las `max` piezas más recientes, sin tocar el array de entrada.
 *
 * No muta ni reordena `posts`: la pantalla de la cola depende de que
 * `listPosts` siga saliendo en su propio orden, y esto trabaja sobre una
 * copia aparte pensada solo para no repetirse.
 */
export function mostRecent<T extends ConFecha>(posts: T[], max = 15): T[] {
  return [...posts].sort(porRecencia).slice(0, max);
}
