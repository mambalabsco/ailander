import type { Selection } from "@/lib/market-price";

/**
 * El filtro de mercado, en el idioma de PostgREST.
 *
 * En un mercado se ve lo suyo **y** lo general; en general solo lo general. Vive
 * en un sitio y no en cada lector porque doce copias de una condición son doce
 * sitios donde escribirla al revés, y escrita al revés no falla: enseña de menos
 * o —peor— enseña el copy de otro país.
 *
 * La regla en sí está probada en `market-selection.test.ts`, sobre `visibleIn`.
 * Esto es solo su traducción a lo que entiende `.or()`.
 */
export function marketFilter(selection: Selection | undefined): string {
  /*
   * Sin selección se ve **todo**, que es exactamente lo de antes.
   *
   * Es la dirección segura para los lectores a los que todavía no se les pasa el
   * mercado: enseñan de más —lo que ya hacían— en vez de esconder trabajo que
   * alguien está buscando y no encuentra.
   *
   * Se escribe como una condición siempre cierta y no como «sin `.or()`» porque
   * así la consulta tiene la misma forma en los tres casos, y una forma sola es
   * una forma que se puede leer de un vistazo.
   */
  if (!selection) return "market_id.is.null,market_id.not.is.null";

  if (selection.kind === "general") return "market_id.is.null";
  return `market_id.is.null,market_id.eq.${selection.marketId}`;
}
