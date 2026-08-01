/**
 * Las imágenes de una página, para poder montar la maqueta con algo dentro.
 *
 * Sin imports, probado en `store-images.test.ts`.
 *
 * ## Para qué son
 *
 * Para ver la disposición llena mientras se construye. Una sección con el hueco
 * vacío no se puede juzgar: no se sabe si la foto va a la izquierda, cuánto pesa
 * al lado del texto ni si el titular respira. Con una imagen del tamaño correcto
 * puesta, sí.
 *
 * **Son de otra tienda.** Sirven para maquetar y hay que sustituirlas por las
 * propias antes de publicar; por eso van marcadas y hay una acción que las quita
 * todas de golpe.
 *
 * ## Qué se guarda
 *
 * La dirección, no el archivo. Las imágenes se enlazan a donde ya están: nada se
 * descarga ni se sube a la tienda propia, así que quitarlas es borrar un texto y
 * no queda ningún rastro que limpiar después.
 */

/* -------------------------------- Lo que sale ------------------------------ */

export interface PageImage {
  url: string;
  /** El texto alternativo, que dice qué se ve. */
  alt: string;
  /** El ancho declarado, cuando lo hay: sirve para descartar iconos. */
  width: number;
}

/** Cuántas se guardan por análisis. Más allá ya es repetición de fichas. */
export const IMAGE_LIMIT = 24;

/**
 * Por debajo de esto es un icono, no una foto.
 *
 * Muchas páginas declaran el ancho, y las que no lo declaran se filtran por el
 * nombre. Ninguna de las dos comprobaciones es perfecta sola; juntas dejan fuera
 * casi todo lo que no es una imagen de contenido.
 */
const MIN_WIDTH = 300;

const NOT_CONTENT =
  /sprite|icon|logo|favicon|badge|placeholder|loader|spinner|1x1|pixel|blank|payment|visa|mastercard|paypal|amex/i;

/* -------------------------------- Sacarlas --------------------------------- */

/** Resuelve una dirección relativa contra el origen de la tienda. */
function absolute(url: string, origin: string): string {
  const clean = url.trim();

  if (clean.startsWith("//")) return `https:${clean}`;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith("/")) return `${origin}${clean}`;

  return "";
}

/**
 * La versión más ancha de un `srcset`.
 *
 * Un `srcset` lleva la misma foto en cinco tamaños. Coger la primera daría la de
 * móvil —trescientos y pico de ancho— y en un héroe a pantalla completa se ve
 * borrosa, que es justo lo que se está intentando juzgar.
 */
export function widestFromSrcset(srcset: string): { url: string; width: number } | null {
  let best: { url: string; width: number } | null = null;

  for (const candidate of srcset.split(",")) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    if (!url) continue;

    const width = Number(/^(\d+)w$/.exec(descriptor ?? "")?.[1] ?? 0);
    if (!best || width > best.width) best = { url, width };
  }

  return best;
}

/**
 * Lo que identifica a una imagen aunque cambie el tamaño pedido.
 *
 * El CDN de Shopify sirve la misma foto con `?width=400`, `?width=800` y
 * `&v=1712`. Sin quitar eso, la misma imagen aparece seis veces y la maqueta
 * sale repitiendo una sola foto en todos los huecos.
 */
export function imageKey(url: string): string {
  return url.split("?")[0].replace(/_\d+x\d*(?=\.[a-z]+$)/i, "");
}

/**
 * Las imágenes de contenido de una página, de la más ancha a la menos.
 *
 * En orden de tamaño porque el hueco más grande —el héroe— es el primero que se
 * rellena, y ahí una miniatura estirada se ve peor que un hueco vacío.
 */
export function extractImages(html: string, origin: string): PageImage[] {
  const found = new Map<string, PageImage>();

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const markup = tag[0];

    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(markup)?.[1] ?? "";

    const srcset = attr("srcset") || attr("data-srcset");
    const widest = srcset ? widestFromSrcset(srcset) : null;

    // `data-src` es lo que usan las páginas que cargan las imágenes al bajar; sin
    // mirarlo, de una tienda moderna no sale casi ninguna.
    const raw = widest?.url || attr("src") || attr("data-src");
    const url = absolute(raw, origin);

    if (!url || url.startsWith("data:") || /\.svg(\?|$)/i.test(url)) continue;
    if (NOT_CONTENT.test(url)) continue;

    const declared = Number(attr("width")) || widest?.width || 0;
    const fromUrl = Number(/[?&]width=(\d+)/.exec(url)?.[1] ?? 0);
    const width = Math.max(declared, fromUrl);

    // Sin ancho conocido se deja pasar: muchas fotos buenas no lo declaran, y el
    // filtro por nombre ya ha quitado los iconos.
    if (width > 0 && width < MIN_WIDTH) continue;

    const key = imageKey(url);
    const existing = found.get(key);

    if (!existing || width > existing.width) {
      found.set(key, { url, alt: attr("alt"), width });
    }
  }

  return [...found.values()].sort((a, b) => b.width - a.width).slice(0, IMAGE_LIMIT);
}
