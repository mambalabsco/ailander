import "server-only";

import { roleOf } from "@/lib/theme-structure";
import {
  relevantCss,
  sectionFonts,
  sectionImages,
  sectionPalette,
  selectorsIn,
  splitShopifySections,
  trimSectionHtml,
  type PageSection,
} from "@/lib/page-sections";

/**
 * Descargar la página de referencia y quedarse con lo que pinta cada sección.
 *
 * ## Por qué se descarga otra vez
 *
 * Podría guardarse al analizar, pero son cientos de kilobytes de HTML y CSS por
 * tienda que solo hacen falta el rato que dura una generación. Y una tienda que
 * rediseñó su portada la semana pasada estaría guardada como era antes, que es
 * justo lo contrario de lo que se busca.
 *
 * ## Lo que se hace con esto
 *
 * Se lee para entender la disposición y se escribe Liquid nuevo. El CSS de una
 * tienda está atado al armazón de su tema —sus variables, sus clases, su
 * retícula— y pegarlo en otro tema da un diseño roto, no uno idéntico.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; PlataformaIA/1.0; analisis-de-estructura)";

/**
 * Cuántas hojas de estilo se bajan.
 *
 * Eran cuatro, y esa era la razón de fondo de que las secciones no se parecieran.
 * La portada real de la referencia enlaza **veintiséis**: los temas de Shopify
 * parten su CSS por secciones —`section-hero.css`, `component-card.css`— así que
 * con cuatro se bajaba lo genérico y se perdía justo lo que pinta cada bloque.
 *
 * Se bajan en paralelo y una vez por generación, no por sección. Lo que evita
 * que crezca sin control no es este número sino el filtro: de todo lo bajado solo
 * viaja lo que toca el trozo que se está copiando.
 */
const MAX_SHEETS = 26;

async function get(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) throw new Error(`respondió ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Las hojas que enlaza la página, resueltas contra su origen. */
function sheetUrls(html: string, origin: string): string[] {
    /*
   * Un conjunto y no una lista: la misma hoja puede estar enlazada dos veces.
   *
   * No es raro ni es un error de la página: una app de Shopify la mete en la
   * cabecera y la plantilla vuelve a meterla en su sección. Medido en
   * trysculptique, `kaching-cart.css` venía **dos veces** y son 97 KB cada una —
   * casi cien kilobytes de CSS idéntico descargado, guardado y servido dos
   * veces, sin que nada falle.
   */
  const urls = new Set<string>();

  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const markup = tag[0];
    if (!/rel\s*=\s*["'][^"']*stylesheet/i.test(markup)) continue;

    const href = /href\s*=\s*["']([^"']+)["']/i.exec(markup)?.[1];
    if (!href) continue;

    const url = href.startsWith("//")
      ? `https:${href}`
      : href.startsWith("/")
        ? `${origin}${href}`
        : /^https?:\/\//i.test(href)
          ? href
          : "";

    if (url) urls.add(url);
  }

  return [...urls].slice(0, MAX_SHEETS);
}

export type { ReferenceSection } from "@/lib/page-sections";

import { bodyOf, collectImages, stripChrome } from "@/lib/landing-copy-html";
import type { ReferenceSection } from "@/lib/page-sections";

/**
 * Las secciones de una página de referencia, cada una con su marcado y su CSS.
 *
 * Devuelve lista vacía si algo falla. Quedarse sin referencia no puede impedir
 * escribir la sección: sale peor, pero sale — y el resumen lo dice.
 */
export async function readReferenceSections(
  pageUrl: string,
  timeoutMs = 20_000,
): Promise<ReferenceSection[]> {
  let html: string;
  let origin: string;

  try {
    origin = new URL(pageUrl).origin;
    html = await get(pageUrl, timeoutMs);
  } catch {
    return [];
  }

  const sections = splitShopifySections(html);
  if (sections.length === 0) return [];

  /*
   * El estilo en línea va primero.
   *
   * Muchos temas meten ahí lo crítico —las variables de color, la retícula— y
   * si el recorte por tamaño llega a cortar, más vale que corte por las hojas
   * externas, que suelen traer lo accesorio.
   */
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join("\n");

  const sheets = await Promise.all(
    sheetUrls(html, origin).map((url) => get(url, timeoutMs).catch(() => "")),
  );

  const css = [inline, ...sheets].join("\n");

  return sections.map((section: PageSection) => {
    const trimmed = trimSectionHtml(section.html);

    const own = relevantCss(css, selectorsIn(trimmed));

    return {
      role: roleOf(section.type),
      type: section.type,
      html: trimmed,
      css: own,
      palette: sectionPalette(own),
      images: (trimmed.match(/<img\b/gi) ?? []).length,
      // Del marcado sin recortar: el recorte por tamaño puede cortar justo por
      // el medio de la lista de imágenes y dejar fuera las de abajo.
      imageUrls: sectionImages(section.html, origin),
      fonts: sectionFonts(own),
    };
  });
}

export { takeForRole } from "@/lib/page-sections";

/* ------------------------------ El modo copia ------------------------------- */

export interface PageForCopy {
  /** Todo el CSS de la página, junto y una sola vez. */
  css: string;
  /** El cuerpo entero, sin el armazón de la tienda. */
  body: string;
  /** Las direcciones de todas sus imágenes, para poder adaptarlas después. */
  images: string[];
}

/**
 * La página entera, para copiarla tal cual.
 *
 * ## Por qué el cuerpo entero y no sección a sección
 *
 * Porque partirla y volver a montarla **cambia la página**. Cada trozo acababa
 * envuelto en un contenedor que no estaba, y el CSS de un constructor mira la
 * jerarquía: `body > .shopify-section`, `.gps > div`, un `grid` que reparte
 * entre sus hijos directos. Con un envoltorio de más, la sección deja de ser
 * hija de quien era y sale con otro ancho — que es exactamente lo que se veía,
 * anchos distintos según la sección.
 *
 * Copiando el cuerpo y quitando solo el armazón de la tienda, la jerarquía es la
 * misma y los anchos salen solos.
 *
 * ## Y el CSS entero
 *
 * Repartirlo por secciones con un tope por sección era el otro fallo: en una
 * página de constructor ese tope se gastaba en las variables de color del tema y
 * la clase que lleva la maqueta no llegaba a entrar. Se coge entero, incluidas
 * las hojas del CDN — donde vive la mitad de la maqueta.
 */
export async function readPageForCopy(
  pageUrl: string,
  timeoutMs = 25_000,
): Promise<PageForCopy> {
  let html: string;
  let origin: string;

  try {
    origin = new URL(pageUrl).origin;
    html = await get(pageUrl, timeoutMs);
  } catch {
    return { css: "", body: "", images: [] };
  }

  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join("\n");

  /*
   * Las hojas externas también, y las de otros dominios.
   *
   * El CSS de un tema de Shopify vive en su CDN y el de las apps del escaparate
   * en el de Shopify: dejarlas fuera por venir de otro dominio quita justo la
   * mitad de la maqueta.
   */
  const sheets = await Promise.all(
    sheetUrls(html, origin)
      .slice(0, 12)
      .map((url) => get(url, timeoutMs).catch(() => "")),
  );

  const css = [inline, ...sheets].join("\n").slice(0, 800_000);
  const body = stripChrome(bodyOf(html)).slice(0, 800_000);

  return { css, body, images: collectImages(body, css) };
}
