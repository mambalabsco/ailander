import "server-only";

import { classifyScripts, type DetectedScript } from "@/lib/store-blueprint";
import { readVisualIdentity, type VisualIdentity } from "@/lib/visual-identity";
import { htmlToText, pageTitle, scriptSources } from "@/lib/html-text";

/**
 * Recorre una tienda y trae lo que hace falta para analizarla.
 *
 * ## Qué trae y qué no
 *
 * Trae el **texto** de las páginas y la lista de **scripts** que cargan. No trae
 * las imágenes: no hacen falta para entender cómo está construida una página, y
 * descargarlas sería empezar a acumular obra ajena sin motivo.
 *
 * El HTML se reduce a texto antes de mandárselo al modelo. Una página de Shopify
 * son cientos de kilobytes de los que el 95% es marcado, y mandarlos enteros
 * cuesta dinero por tokens y encima empeora el análisis: el modelo se pierde
 * entre atributos.
 *
 * ## Buena vecindad
 *
 * Se identifica, respeta un límite de páginas y espera entre peticiones. No es
 * cortesía: una ráfaga desde una IP fija contra una tienda pequeña se parece a un
 * ataque y acaba con el servidor bloqueando el acceso.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; PlataformaIA/1.0; analisis-de-estructura)";

export interface CrawledPage {
  url: string;
  kind: "home" | "catalogo" | "producto" | "otra";
  title: string;
  /** El texto visible, ya limpio. */
  text: string;
  /** Cuántos caracteres tenía el HTML original, para ver cuánto se recortó. */
  htmlSize: number;
}

export interface CrawlResult {
  origin: string;
  storeName: string;
  pages: CrawledPage[];
  scripts: DetectedScript[];
  /**
   * Los colores y las tipografías, leídos de la portada.
   *
   * De la portada y no de una página cualquiera porque es donde el tema aplica
   * su esquema principal; una ficha de producto puede estar en un esquema
   * secundario y daría la paleta de la excepción por la de la marca.
   */
  identity: VisualIdentity;
  /** Lo que no se pudo abrir, con su motivo. */
  failed: { url: string; reason: string }[];
}

/* ------------------------------- El recorrido ------------------------------ */

function classifyUrl(url: string, origin: string): CrawledPage["kind"] {
  const path = url.replace(origin, "");

  if (path === "" || path === "/") return "home";
  if (/\/products\//.test(path)) return "producto";
  if (/\/collections\//.test(path)) return "catalogo";
  return "otra";
}

async function fetchPage(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) throw new Error(`respondió ${response.status}`);

    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) throw new Error("no es una página HTML");

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Las páginas que hay que mirar de una tienda.
 *
 * Tres tipos y no todo el sitio: la home dice cómo se presenta la marca, el
 * catálogo cómo ordena su oferta y la ficha de producto es donde está la venta.
 * Recorrer un sitio entero multiplicaría el coste del análisis sin añadir nada:
 * la página doce de un blog no cambia la estructura de la oferta.
 *
 * El producto sale de la propia home o del catálogo, siguiendo el primer enlace
 * a `/products/`. Es el que la tienda decidió poner delante, que suele ser el
 * que más vende.
 */
export async function crawlStore(
  input: string,
  options: { maxPages?: number; delayMs?: number; timeoutMs?: number } = {},
): Promise<CrawlResult> {
  const maxPages = Math.min(options.maxPages ?? 4, 8);
  const delayMs = options.delayMs ?? 800;
  const timeoutMs = options.timeoutMs ?? 20_000;

  let origin: string;
  try {
    const parsed = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
    origin = parsed.origin;
  } catch {
    throw new Error("Esa dirección no es válida. Escríbela completa, como https://tienda.com.");
  }

  const pages: CrawledPage[] = [];
  const failed: { url: string; reason: string }[] = [];
  const scripts: string[] = [];
  let identity: VisualIdentity = { colors: [], fonts: [], buttonRadius: null };

  const queue = [origin, `${origin}/collections/all`];
  const seen = new Set<string>();

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const html = await fetchPage(url, timeoutMs);

      scripts.push(...scriptSources(html));

      // La portada es la primera de la cola, así que esto se cumple una vez y
      // con la página correcta.
      if (pages.length === 0) identity = readVisualIdentity(html);

      const text = htmlToText(html);
      pages.push({
        url,
        kind: classifyUrl(url, origin),
        title: pageTitle(html),
        /*
         * Aquí va el texto **entero**.
         *
         * Antes se recortaba a doce mil caracteres pensando solo en el coste del
         * análisis, pero el mismo texto sirve después de modelo para escribir la
         * página propia, y ahí doce mil se quedan a media oferta. El recorte para
         * el análisis se hace al montar su prompt, que es donde importa.
         */
        text,
        htmlSize: html.length,
      });

      // Encolar la primera ficha de producto que aparezca, si aún no hay ninguna.
      if (!pages.some((page) => page.kind === "producto")) {
        const link = /href=["'](\/products\/[^"'?#]+)/i.exec(html);
        if (link) queue.push(`${origin}${link[1]}`);
      }
    } catch (error) {
      failed.push({
        url,
        reason: error instanceof Error ? error.message : "no se pudo abrir",
      });
    }

    // Espera entre peticiones: una ráfaga contra una tienda pequeña se parece a
    // un ataque y acaba con el servidor bloqueando el acceso.
    if (queue.length > 0 && pages.length < maxPages) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (pages.length === 0) {
    throw new Error(
      `No se pudo abrir ninguna página de ${origin}. ${failed[0]?.reason ?? "Comprueba la dirección."}`,
    );
  }

  return {
    origin,
    storeName: pages[0].title.split(/[|–—-]/)[0].trim() || new URL(origin).hostname,
    pages,
    scripts: classifyScripts(scripts),
    identity,
    failed,
  };
}
