/**
 * Las proporciones y sus medidas.
 *
 * Sin imports, probado en `aspect.test.ts`.
 *
 * ## Por qué esto existe
 *
 * En el estudio no se podía elegir la forma del vídeo: todo salía vertical
 * porque estaba escrito «9:16» en el código, que es lo que quiere un anuncio de
 * Reels pero no lo único que se hace. Una miniatura de YouTube es apaisada y una
 * publicación de feed es cuadrada, y no había forma de pedirlas.
 *
 * ## Y por qué no es solo una lista de textos
 *
 * Porque los generadores no aceptan los mismos. Casi todos entienden 16:9, 9:16
 * y 1:1; los intermedios —4:3, 3:4, 21:9— van y vienen según el modelo, y uno
 * que no reconoce **no da error**: devuelve su forma por defecto. Así que cada
 * generador declara cuáles admite y la pantalla solo enseña esos.
 */

export interface Aspect {
  id: string;
  label: string;
  /** Para qué se usa, que es lo que de verdad ayuda a elegir. */
  note: string;
  width: number;
  height: number;
}

export const ASPECTS: Aspect[] = [
  { id: "9:16", label: "Vertical", note: "Reels, TikTok, Shorts", width: 720, height: 1280 },
  { id: "1:1", label: "Cuadrado", note: "Feed y carrusel", width: 1024, height: 1024 },
  { id: "16:9", label: "Apaisado", note: "YouTube y web", width: 1280, height: 720 },
  { id: "4:5", label: "Vertical corto", note: "Feed de Instagram", width: 1024, height: 1280 },
  { id: "3:4", label: "Retrato", note: "Fotos de producto", width: 960, height: 1280 },
  { id: "4:3", label: "Clásico", note: "Presentaciones", width: 1280, height: 960 },
];

/** Las tres que entiende todo el mundo. */
export const UNIVERSAL_ASPECTS = ["9:16", "1:1", "16:9"];

export function findAspect(id: string): Aspect {
  return ASPECTS.find((aspect) => aspect.id === id) ?? ASPECTS[0];
}

/** Las que se pueden ofrecer, de entre las que admite ese generador. */
export function aspectsFor(allowed: string[]): Aspect[] {
  if (allowed.length === 0) return ASPECTS.filter((aspect) => UNIVERSAL_ASPECTS.includes(aspect.id));

  return ASPECTS.filter((aspect) => allowed.includes(aspect.id));
}

/**
 * La proporción admitida más parecida a la que se pide.
 *
 * Sirve al cambiar de generador: quien tenía elegido 4:5 y se pasa a uno que no
 * lo admite acaba con la forma por defecto sin enterarse. Con esto se queda en
 * la más cercana, que es lo que esperaba.
 */
export function nearestAspect(wanted: string, allowed: string[]): string {
  const options = aspectsFor(allowed);
  if (options.some((aspect) => aspect.id === wanted)) return wanted;

  const target = findAspect(wanted);

  /*
   * La distancia se mide sobre el logaritmo de la proporción.
   *
   * Restar las proporciones a secas no sirve: de 1:1 a 2:1 hay una unidad y de
   * 1:1 a 1:2 hay media, aunque una es tumbar la otra. En logaritmo las dos
   * quedan a la misma distancia, que es como se ven.
   */
  const ratio = Math.log(target.width / target.height);

  let best = options[0];
  let distance = Infinity;

  for (const aspect of options) {
    const gap = Math.abs(Math.log(aspect.width / aspect.height) - ratio);
    if (gap < distance) {
      distance = gap;
      best = aspect;
    }
  }

  return best.id;
}

/** «720 × 1280», para enseñarlo al lado del nombre. */
export function pixels(id: string): string {
  const aspect = findAspect(id);
  return `${aspect.width} × ${aspect.height}`;
}
