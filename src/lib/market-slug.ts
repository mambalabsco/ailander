/**
 * El identificador de la página de una landing en un mercado.
 *
 * Sin imports, probado en `market-slug.test.ts`.
 *
 * ## Por qué el mercado va dentro del slug
 *
 * Porque una landing se publica como página de Shopify con `handle: slug`, y si
 * dos mercados publican con el mismo, **la segunda publicación pisa la página de
 * la primera** sin dar ningún error. Es el fallo más caro posible aquí: se pierde
 * una página que estaba vendiendo y nadie se entera hasta que alguien la mira.
 *
 * El sufijo es idioma-país y no el id del mercado: sale en la URL, así que tiene
 * que poder leerlo una persona.
 *
 * ## Por qué sin mercado no toca nada
 *
 * Los productos de un solo mercado publican como siempre. Añadirles un sufijo
 * ahora crearía una página nueva y dejaría la anterior publicada y huérfana —con
 * los anuncios en marcha apuntando a la vieja—.
 */
export function slugForMarket(
  baseSlug: string,
  market: { countryCode: string; languageCode: string } | null,
): string {
  const clean = baseSlug.replace(/\/+$/, "");
  if (!market) return clean;

  const suffix = `${market.languageCode}-${market.countryCode}`.toLowerCase();

  // Republicar no puede ir acumulando sufijos: sería una página nueva cada vez.
  return clean.endsWith(`-${suffix}`) ? clean : `${clean}-${suffix}`;
}
