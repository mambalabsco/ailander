/** Estado de un copy guardado como referencia. */
export type SwipeStatus = "funciona" | "malo" | "sin-probar";

export const SWIPE_STATUS_LABELS: Record<SwipeStatus, string> = {
  funciona: "Funcionó",
  malo: "No funcionó",
  "sin-probar": "Sin probar",
};

export interface SwipeCopy {
  id: string;
  /** Nulo cuando es de otro producto o de otra marca. */
  productId?: string;
  title: string;
  body: string;
  status: SwipeStatus;
  /** De dónde salió: la marca, la cuenta, el anuncio. */
  source?: string;
  format?: string;
  note?: string;
  /**
   * De quién es.
   *
   * De lo propio se puede heredar una promesa y sus cifras: están comprobadas.
   * De lo ajeno, solo la construcción — una cifra de otro anuncio es algo que
   * dijo otro sobre otro producto, y darla por nuestra es afirmar lo que nadie
   * ha comprobado aquí.
   */
  ownership: "propio" | "ajeno";
  createdAt: string;
}
