/**
 * Enlaces etiquetados para los anuncios.
 *
 * **La etiqueta es lo que hace posible medir**: Shopify guarda estos parámetros
 * en la primera visita del cliente, y de ahí sale qué anuncio trajo qué pedido.
 * Un anuncio sin etiquetar aparece en los informes como «sin anuncio» y no se
 * puede comparar con nada.
 *
 * El reparto de trabajo entre parámetros no es arbitrario:
 *
 * - La **página** no necesita parámetro: la ruta ya la identifica.
 * - `utm_content` lleva el **anuncio**, que es lo que se compara entre sí.
 * - `utm_campaign` agrupa la prueba, para poder separar dos experimentos
 *   distintos que corran a la vez sobre las mismas páginas.
 */

/** Los UTM no admiten espacios ni acentos sin ensuciar los informes. */
function tag(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

export function buildAdUrl(options: {
  /** La URL de la página ya publicada. */
  pageUrl: string;
  campaign: string;
  /** El anuncio: lo que se compara. */
  ad: string;
  source?: string;
  medium?: string;
}): string {
  const url = new URL(options.pageUrl);

  url.searchParams.set("utm_source", tag(options.source || "facebook"));
  url.searchParams.set("utm_medium", tag(options.medium || "paid"));
  url.searchParams.set("utm_campaign", tag(options.campaign));
  url.searchParams.set("utm_content", tag(options.ad));

  return url.toString();
}
