import type { Selection } from "@/lib/market-price";

/**
 * En qué mercado se está mirando un producto, y qué se ve desde ahí.
 *
 * Probado en `market-selection.test.ts`. El `import type` de arriba se borra al
 * compilar, así que el módulo se sigue pudiendo cargar desde un test.
 *
 * ## Por qué el modo vive en la URL
 *
 * Porque sobrevive a la recarga, se puede enlazar y lo leen los componentes de
 * servidor sin cliente de por medio. En estado de React se perdería en cada
 * navegación entre pestañas de la ficha.
 *
 * ## Por qué con un solo mercado no aparece
 *
 * Porque el modo general es «lo que vale en todos los países» y con un país eso
 * es el país. Enseñar el selector ahí sería ofrecer una ficha sin precio a quien
 * no ha pedido varios mercados: toda la plataforma existente empeoraría para que
 * funcionara un caso que todavía no tiene.
 */

export const SELECTION_PARAM = "mercado";

const GENERAL = "general";

export function showSelector(marketIds: string[]): boolean {
  return marketIds.length > 1;
}

export function parseSelection(raw: string | undefined, marketIds: string[]): Selection {
  if (!showSelector(marketIds)) {
    // Con un solo mercado siempre se está en él, se pida lo que se pida.
    return marketIds[0] ? { kind: "market", marketId: marketIds[0] } : { kind: "general" };
  }

  if (!raw || raw === GENERAL) return { kind: "general" };

  /*
   * Un mercado desconocido cae a general y **no** al primero de la lista.
   *
   * Pasa con un enlace viejo a un mercado borrado. Caer al primero enseñaría el
   * precio de un país bajo el nombre de otro, que es el fallo caro de todo esto;
   * caer a general no enseña ningún precio, que es incómodo pero cierto.
   */
  return marketIds.includes(raw) ? { kind: "market", marketId: raw } : { kind: "general" };
}

/** Si una pieza se ve desde el modo actual. `null` en la pieza es «vale en todos». */
export function visibleIn(selection: Selection, pieceMarketId: string | null): boolean {
  if (selection.kind === "general") return pieceMarketId === null;
  return pieceMarketId === null || pieceMarketId === selection.marketId;
}

/** Con qué mercado se sella lo que se genere ahora. */
export function stampFor(selection: Selection): string | null {
  return selection.kind === "general" ? null : selection.marketId;
}

export interface MarketBrief {
  countryName: string;
  languageName: string;
}

/**
 * El país y el idioma que ve un encargo.
 *
 * En general no hay país, y **no basta con callarlo**: sin decir nada, el modelo
 * se inventa uno al escribir —«aquí en Chile el invierno»— y el texto deja de
 * valer para los demás mercados, que era justo el propósito del modo. Así que en
 * general se escribe la prohibición explícita.
 *
 * El idioma sí existe siempre: es el del mercado, o el del producto cuando se
 * escribe en general. Un idioma en blanco haría que el modelo eligiera, y elige
 * inglés.
 */
export function marketLines(
  selection: Selection,
  market: MarketBrief | null,
  fallbackLanguage: string,
): string[] {
  if (selection.kind === "market" && market) {
    return [`País: ${market.countryName}`, `Idioma de salida: ${market.languageName}`];
  }

  return [
    "País: varios (NO nombres ningún país, ciudad ni moneda: este texto vale para todos)",
    `Idioma de salida: ${fallbackLanguage}`,
  ];
}
