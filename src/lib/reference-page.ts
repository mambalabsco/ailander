import "server-only";

import { roleOf } from "@/lib/theme-structure";
import {
  relevantCss,
  sectionFonts,
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

/** Cuántas hojas de estilo se bajan. Un tema reparte el suyo en dos o tres. */
const MAX_SHEETS = 4;

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
  const urls: string[] = [];

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

    if (url) urls.push(url);
  }

  return urls.slice(0, MAX_SHEETS);
}

export type { ReferenceSection } from "@/lib/page-sections";

interface Built {
  /** El papel, con el mismo vocabulario que el plano: `heroe`, `faq`… */
  role: string;
  /** El tipo tal cual lo llama su tema: `hero-banner`. */
  type: string;
  html: string;
  css: string;
  /**
   * Los colores de **esa** sección, cuando se pueden leer.
   *
   * No los del tema: casi toda tienda tiene fondo blanco global, y un héroe
   * puede estar entero sobre rosa. Pasar el global era lo que hacía que la
   * sección saliera blanca por bien copiada que estuviera la disposición.
   */
  palette: ReturnType<typeof sectionPalette>;
  /** Cuántas imágenes lleva, para declarar los mismos huecos. */
  images: number;
  /** Las tipografías que usa: es la mitad de por qué dos páginas no se parecen. */
  fonts: string[];
}

/**
 * Las secciones de una página de referencia, cada una con su marcado y su CSS.
 *
 * Devuelve lista vacía si algo falla. Quedarse sin referencia no puede impedir
 * escribir la sección: sale peor, pero sale — y el resumen lo dice.
 */
export async function readReferenceSections(
  pageUrl: string,
  timeoutMs = 20_000,
): Promise<Built[]> {
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
      fonts: sectionFonts(own),
    };
  });
}

export { takeForRole } from "@/lib/page-sections";
