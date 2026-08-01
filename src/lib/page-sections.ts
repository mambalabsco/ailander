/**
 * Partir una página de Shopify en sus secciones, con el estilo de cada una.
 *
 * Sin imports, probado en `page-sections.test.ts`.
 *
 * ## Para qué
 *
 * Para no tener que pedirle capturas a nadie. La página se descarga igualmente
 * al analizar la tienda; lo que faltaba era **quedarse con el trozo que
 * corresponde a cada sección** y con las reglas de estilo que lo pintan.
 *
 * Con el marcado y su CSS delante, quien escribe la sección nueva ve las
 * medidas: que el titular ocupa media columna, que la foto va a sangre, cuánto
 * aire hay entre las cosas. Eso no se deduce de una descripción en una frase.
 *
 * ## Lo que sale de aquí no se copia
 *
 * Sirve para entender la disposición. El CSS de una tienda está escrito contra
 * el armazón de **su** tema —sus variables, sus clases, su retícula— y pegarlo
 * en otro tema da un diseño roto, no uno idéntico. Se lee para reimplementar.
 *
 * ## Cómo se corta
 *
 * Shopify envuelve cada sección en un elemento con `id="shopify-section-…"`, y
 * ese identificador **lleva dentro el tipo de sección**:
 * `shopify-section-template--123__comparison`. Son hermanos, uno detrás de otro,
 * así que se corta de una marca a la siguiente. No es un analizador de HTML y no
 * pretende serlo: para trozos que son hermanos de primer nivel, acierta.
 */

/* ------------------------------- Las secciones ----------------------------- */

export interface PageSection {
  /** El identificador entero, tal cual viene. */
  id: string;
  /** El tipo de sección: lo que va detrás de `__`, o el identificador entero. */
  type: string;
  html: string;
}

const MARK = 'id="shopify-section-';

/** Dónde empieza la etiqueta que contiene esa posición. */
function tagStart(html: string, at: number): number {
  const open = html.lastIndexOf("<", at);
  return open === -1 ? at : open;
}

export function splitShopifySections(html: string): PageSection[] {
  const marks: { id: string; start: number }[] = [];

  let from = 0;
  for (;;) {
    const found = html.indexOf(MARK, from);
    if (found === -1) break;

    const end = html.indexOf('"', found + MARK.length);
    if (end === -1) break;

    marks.push({
      id: html.slice(found + MARK.length - 0, end).replace(/^id="/, ""),
      start: tagStart(html, found),
    });

    from = end;
  }

  return marks.map((mark, index) => {
    const id = mark.id;
    const stop = index + 1 < marks.length ? marks[index + 1].start : html.length;

    return {
      id,
      // `template--123__comparison` → `comparison`. El número cambia en cada
      // tienda y no dice nada; lo que identifica la sección es lo de después.
      type: id.includes("__") ? id.slice(id.lastIndexOf("__") + 2) : id,
      html: html.slice(mark.start, stop),
    };
  });
}

/* ---------------------------------- El estilo ------------------------------ */

/** Las clases y los identificadores que aparecen en un trozo de HTML. */
export function selectorsIn(html: string): Set<string> {
  const found = new Set<string>();

  for (const match of html.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
    for (const name of match[1].split(/\s+/)) if (name) found.add(`.${name}`);
  }

  for (const match of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    found.add(`#${match[1]}`);
  }

  return found;
}

/** Cuánto CSS se le pasa al modelo por sección. Más allá es ruido y coste. */
export const CSS_LIMIT = 12_000;

/**
 * Las reglas que pintan ese trozo, y solo esas.
 *
 * Una hoja de estilos de un tema de Shopify pasa de los doscientos mil
 * caracteres. Mandarla entera por cada sección costaría más que todo lo demás
 * junto y enterraría lo que importa entre reglas del carrito y del buscador.
 *
 * Se conservan también las variables de `:root` —ahí viven los colores y las
 * medidas del tema— porque sin ellas media regla queda sin resolver.
 */
export function relevantCss(css: string, selectors: Set<string>, limit = CSS_LIMIT): string {
  const kept: string[] = [];

  const matches = (selector: string): boolean => {
    if (/^:root\b/.test(selector.trim())) return true;

    for (const name of selectors) {
      // Con el límite de palabra por detrás: `.card` no debe llevarse
      // `.card-slider`, que suele ser otra cosa con otras medidas.
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`${escaped}(?![\\w-])`).test(selector)) return true;
    }

    return false;
  };

  for (const rule of splitRules(css)) {
    if (rule.selector.startsWith("@")) {
      /*
       * Las consultas de medios se conservan enteras si algo de dentro encaja.
       *
       * Es donde vive el comportamiento en móvil —que dos columnas caigan a una—
       * y quedarse solo con la regla de escritorio daría una sección que se sale
       * de la pantalla en el teléfono, que es donde se compra.
       */
      if (splitRules(rule.body).some((inner) => matches(inner.selector))) {
        kept.push(`${rule.selector}{${rule.body}}`);
      }
      continue;
    }

    if (matches(rule.selector)) kept.push(`${rule.selector}{${rule.body}}`);
  }

  const text = kept.join("\n");
  return text.length > limit ? `${text.slice(0, limit)}\n/* …recortado */` : text;
}

/** Parte una hoja en reglas de primer nivel, contando llaves. */
function splitRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];

  let depth = 0;
  let start = 0;
  let selectorEnd = -1;

  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];

    if (char === "{") {
      if (depth === 0) selectorEnd = index;
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0 && selectorEnd > -1) {
        rules.push({
          selector: css.slice(start, selectorEnd).trim(),
          body: css.slice(selectorEnd + 1, index),
        });
        start = index + 1;
        selectorEnd = -1;
      }
    }
  }

  return rules;
}

/* ------------------------------- Recortar el HTML -------------------------- */

/** Cuánto marcado se le pasa al modelo por sección. */
export const HTML_LIMIT = 14_000;

/**
 * El marcado, sin lo que no aporta a entender la disposición.
 *
 * Fuera los `<script>`, los `<noscript>`, los comentarios y los datos en línea:
 * en una tienda real ocupan más que la propia página y no dicen nada de cómo se
 * ve. Los `<svg>` se resumen porque un icono son mil caracteres de trazado que
 * el modelo no necesita leer para saber que ahí hay un icono.
 */
export function trimSectionHtml(html: string, limit = HTML_LIMIT): string {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "<svg><!-- icono --></svg>")
    .replace(/\s{2,}/g, " ")
    .trim();

  return clean.length > limit ? `${clean.slice(0, limit)}\n<!-- …recortado -->` : clean;
}
