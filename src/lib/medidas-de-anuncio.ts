/**
 * Lo que se le dice al modelo sobre el largo del titular y de la descripción.
 *
 * **Existe porque el encargo y el recorte se separaron.** El encargo de anuncio
 * corto pedía «una o dos frases» de titular y una descripción con el patrón
 * `Marca · Oferta · Envío · Garantía · Zona` — cinco campos—, y al guardar se
 * recortaba a 40 y 30 caracteres sin habérselo dicho al modelo en ningún sitio.
 *
 * El resultado no daba ningún error: titulares partidos a media frase
 * —«Menos que tu café de»— y **la misma descripción en todos los anuncios**,
 * porque de los cinco campos solo cabía el primero: «Soporte tiroídeo en gotas ·».
 *
 * Los números llegan por parámetro y no escritos aquí: son `FACEBOOK_LIMITS`, y
 * el que decide lo que cabe tiene que ser el mismo que decide lo que se pide.
 *
 * Puro y sin imports, para poder cargarlo desde `node --test`.
 */

/**
 * El ejemplo de descripción que se le enseña al modelo.
 *
 * Dos elementos, no cinco. Y **tiene que caber en el límite**: enseñar un patrón
 * que no cabe es pedir algo imposible y quitárselo después.
 */
export const PATRON_DESCRIPCION = "Envío gratis · 30 días";

export function reglaDeMedidas(limites: { headline: number; description: number }): string {
  return [
    `**TÍTULO:** máximo ${limites.headline} caracteres, contando espacios y emojis.`,
    `**Una sola frase**, no dos: en el gestor de anuncios lo que se pase de ahí no se`,
    `recorta con puntos suspensivos, se corta y ya. Escríbelo para que funcione leído`,
    `solo, sin el cuerpo.`,
    ``,
    `**DESCRIPCIÓN:** máximo ${limites.description} caracteres, contando espacios.`,
    `Dos elementos separados por punto medio, del tipo \`${PATRON_DESCRIPCION}\`. Elige`,
    `los dos que más empujen a comprar de lo que ofrezca este producto; si no caben`,
    `dos, pon uno. Refuerza el título en vez de repetirlo.`,
  ].join("\n");
}
