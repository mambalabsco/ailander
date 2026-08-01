/**
 * Emparejar un producto de la plataforma con el de la tienda de Shopify.
 *
 * Sin imports, probado en `product-match.test.ts`.
 *
 * ## Por qué hace falta adivinarlo
 *
 * No hay nada guardado que enlace los dos. Un producto de aquí se crea al
 * investigarlo, mucho antes de que exista en Shopify —o existe allí desde antes
 * de usar la plataforma—, así que el enlace se busca por el nombre.
 *
 * Y hace falta porque las fotos que se pueden dejar puestas en un tema son
 * **las que ya están en Shopify**: las de aquí viven en un bucket privado y su
 * dirección va firmada y caduca. Escribir una de esas en una plantilla deja la
 * página con los huecos rotos unas horas después, que es peor que dejarlos
 * vacíos porque el fallo aparece cuando ya nadie está mirando.
 */

/** Quita acentos, signos y palabras que no distinguen nada. */
const NOISE = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "para",
  "con",
  "sin",
  "y",
  "capsulas",
  "capsules",
  "suplemento",
  "supplement",
  "mg",
  "ml",
]);

export function tokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !NOISE.has(word));
}

/**
 * Cuánto se parecen dos nombres, de cero a uno.
 *
 * Se mide sobre el nombre **más corto**: «Lymphatic Drainage» contra «Lymphatic
 * Drainage — 60 cápsulas, envío gratis» es el mismo producto, y dividir entre el
 * total de palabras del largo lo hundiría a la mitad.
 */
export function similarity(a: string, b: string): number {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));

  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;

  return shared / Math.min(left.size, right.size);
}

/**
 * El producto de la tienda que corresponde, o nada.
 *
 * El umbral existe para no acertar por accidente. Con la mitad de las palabras
 * en común hay coincidencia; por debajo, es preferible no poner ninguna foto que
 * poner la de otro producto — en un suplemento el bote **es** el producto, y una
 * página con el frasco equivocado la corrige el cliente cuando abre el paquete.
 */
export function bestMatch<T extends { title: string }>(
  name: string,
  candidates: T[],
  threshold = 0.5,
): T | null {
  let best: { item: T; score: number } | null = null;

  for (const candidate of candidates) {
    const score = similarity(name, candidate.title);
    if (score >= threshold && (!best || score > best.score)) {
      best = { item: candidate, score };
    }
  }

  return best?.item ?? null;
}
