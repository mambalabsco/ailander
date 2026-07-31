/**
 * Sacar texto y scripts de un HTML.
 *
 * Sin imports, probado en `html-text.test.ts`.
 *
 * Vive aparte del rastreador por el mismo motivo que los ayudantes de Higgsfield:
 * aquel lleva `server-only` y eso impide probarlo fuera de un contexto de
 * servidor. Estas tres funciones son las que de verdad tienen casos raros
 * —código dentro del texto, pixeles en línea—, así que tienen que poder probarse.
 */

/**
 * El texto visible de una página.
 *
 * Se quitan `script`, `style`, `noscript` y `svg` **con su contenido**. Quitando
 * solo las etiquetas, el JavaScript se queda dentro del texto y quien lo lea
 * después —una persona o un modelo— lo toma por contenido de la página.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    /*
     * El salto entre bloques se conserva.
     *
     * Sin él, el titular y el párrafo siguiente se pegan en una sola línea y se
     * pierde dónde acaba cada sección — que es justo lo que hay que leer para
     * entender la estructura de la página.
     */
    .replace(/<\/(p|div|section|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // El `&amp;` va el último: hacerlo antes convertiría `&amp;lt;` en `<`.
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Las direcciones de los scripts que carga la página.
 *
 * Mira los `src` **y el contenido de los scripts en línea**. El pixel de Meta se
 * instala como código en línea que carga `fbevents.js` desde dentro, así que
 * mirar solo los `src` se salta justo el que más importa detectar.
 */
export function scriptSources(html: string): string[] {
  const sources: string[] = [];

  const withSrc = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = withSrc.exec(html)) !== null) sources.push(match[1]);

  const inline = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = inline.exec(html)) !== null) {
    sources.push(...(match[1].match(/https?:\/\/[^\s"')]+/g) ?? []));
  }

  return sources;
}

export function pageTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? htmlToText(match[1]).slice(0, 120) : "";
}
