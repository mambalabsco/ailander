/**
 * El nombre de una creatividad de anuncio.
 *
 * Un anuncio ya no tiene una sola imagen —el lote genera varias y «Rehacer»
 * añade más— y **cada una es un anuncio distinto en el gestor de Facebook**. Así
 * que el archivo que te bajas tiene que llamarse como lo vas a llamar allí: el
 * nombre del anuncio, y un correlativo al final tras un guion bajo.
 *
 * Aparte de `buildImageName`, que sigue sirviendo a todo lo que no cuelga de un
 * anuncio: aquel antepone producto y concepto, y dejaba el nombre del anuncio
 * recortado a la mitad — `…en-8-seman_98`.
 *
 * Puro y sin imports con alias, para poder cargarlo desde `node --test`.
 */

/** Sin espacios ni acentos: un espacio en el nombre rompe la descarga. */
function normaliza(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildAdImageName(options: { adName: string; sequence: number }): string {
  // A dos dígitos, pero sin recortar: la 100 es `_100`. Truncar daría `_00`, que
  // se confunde con la primera.
  const sufijo = String(options.sequence).padStart(2, "0");
  return `${normaliza(options.adName)}_${sufijo}`;
}

/**
 * El correlativo siguiente, a partir del **máximo** ya usado.
 *
 * Máximo y no cuenta: un número entregado no vuelve a salir aunque su imagen se
 * descarte o se borre. Contar es exactamente lo que hace hoy el generador de
 * patrones —`existing.length`—, y por eso había cinco grupos de nombres
 * repetidos en la base.
 */
export function siguienteSecuencia(maximoActual: number | null): number {
  return (maximoActual ?? 0) + 1;
}
