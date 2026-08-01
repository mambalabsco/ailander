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

/* --------------------------- El color de esa sección ----------------------- */

export interface SectionPalette {
  background: string;
  text: string;
  accent: string;
}

/** Resuelve `var(--x)` con las variables declaradas en la misma hoja. */
function resolveVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();

  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    vars.set(match[1].trim(), match[2].trim());
  }

  return vars;
}

/** Deja un color en `#rrggbb`, resolviendo variables y `rgb()`. */
function readColor(raw: string, vars: Map<string, string>, depth = 0): string {
  const value = raw.trim().toLowerCase();
  if (depth > 3) return "";

  const variable = /^var\(\s*(--[a-z0-9-]+)/i.exec(value);
  if (variable) {
    const found = vars.get(variable[1]);
    return found ? readColor(found, vars, depth + 1) : "";
  }

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\b/.exec(value);
  if (hex) {
    const digits = hex[1];
    return digits.length === 3
      ? `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
      : `#${digits}`;
  }

  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(value);
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (parts.some((part) => part > 255)) return "";
    return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }

  return "";
}

/**
 * Los colores **de esa sección**, no los del tema.
 *
 * Es la diferencia entre una réplica y una página blanca. La paleta global de
 * una tienda suele ser fondo blanco y texto negro —lo es en casi todas— pero un
 * héroe puede estar entero sobre rosa. Pasando la global, la sección salía
 * blanca y no se parecía a nada, por muy bien copiada que estuviera la
 * disposición.
 *
 * Se lee de las reglas que pintan esa sección: el fondo que más veces aparece,
 * el color de texto que más veces aparece, y como acento el primero que no sea
 * ninguno de los dos. Devuelve `null` si no hay nada legible, y entonces manda
 * la del tema, que es mejor que inventarse una.
 */
export function sectionPalette(css: string): SectionPalette | null {
  const vars = resolveVars(css);

  const backgrounds = new Map<string, number>();
  const texts = new Map<string, number>();

  const count = (map: Map<string, number>, hex: string) => {
    if (!hex) return;
    map.set(hex, (map.get(hex) ?? 0) + 1);
  };

  for (const match of css.matchAll(/\bbackground(?:-color)?\s*:\s*([^;}]+)/gi)) {
    count(backgrounds, readColor(match[1], vars));
  }

  for (const match of css.matchAll(/(?:^|[;{\s])color\s*:\s*([^;}]+)/gi)) {
    count(texts, readColor(match[1], vars));
  }

  const top = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const background = top(backgrounds);
  const text = top(texts);

  if (!background && !text) return null;

  /*
   * El acento es el primer color que no es ni el fondo ni el texto.
   *
   * En un héroe suele ser el del botón. Si no hay ninguno distinto se usa el
   * texto: un acento inventado se ve mal en toda la sección, y repetir el texto
   * al menos queda coherente.
   */
  const others = [...backgrounds.keys(), ...texts.keys()].filter(
    (hex) => hex !== background && hex !== text,
  );

  return {
    background: background || "#ffffff",
    text: text || "#121212",
    accent: others[0] ?? text ?? "#121212",
  };
}

/**
 * Las tipografías que usa esa sección, por orden de aparición.
 *
 * Se leen del CSS y no de los archivos de fuente. Un tema puede servirlas desde
 * Google, desde su propio dominio o desde el CDN de Shopify, y la única forma de
 * saber **cuál usa el titular** es mirar la declaración.
 *
 * Se descartan las que apuntan a una variable sin resolver y las genéricas
 * sueltas —`sans-serif`, `inherit`— que no dicen nada de la marca.
 */
export function sectionFonts(css: string): string[] {
  const vars = resolveVars(css);
  const found: string[] = [];

  for (const match of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    let value = match[1].trim();

    const variable = /^var\(\s*(--[a-z0-9-]+)/i.exec(value);
    if (variable) value = vars.get(variable[1]) ?? "";

    // Solo la primera de la pila: las de detrás son el respaldo.
    const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";

    if (!first) continue;
    if (/^(inherit|initial|unset|serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(first)) {
      continue;
    }
    if (first.startsWith("var(")) continue;
    if (found.includes(first)) continue;

    found.push(first);
  }

  return found.slice(0, 4);
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

/* --------------------------- Emparejar con la propia ----------------------- */

export interface ReferenceSection {
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
  palette: SectionPalette | null;
  /** Cuántas imágenes lleva, para declarar los mismos huecos. */
  images: number;
  /** Las tipografías que usa: es la otra mitad de por qué no se parecen. */
  fonts: string[];
}

/**
 * La sección de referencia que le toca, consumiéndola.
 *
 * ## Primero por papel, y si no, por orden
 *
 * El emparejamiento por papel usa el nombre que le puso su tema, y ese nombre lo
 * eligió alguien: en la portada real de la referencia, cinco de doce secciones se
 * llaman `slider`, `standards`, `clinically`, `percents` y `beats`. Ninguno de
 * esos nombres dice qué hace la sección, así que ninguno emparejaba — y esas
 * cinco se escribían **a ciegas**, sin marcado, sin CSS y sin color, que es
 * justo lo que hacía que no se parecieran a nada.
 *
 * Cuando no hay coincidencia de papel se coge **la primera que quede sin usar**.
 * Las secciones del plano salieron de leer esa misma página de arriba abajo, así
 * que el orden es un emparejamiento razonable: la tercera de la lista suele
 * corresponder a la tercera de la página. Y aunque se desvíe, tener delante una
 * sección real de esa tienda —sus colores, su letra, su ritmo— acerca mucho más
 * que no tener ninguna.
 *
 * Se gasta al usarla: una página con dos bloques de preguntas debe emparejar cada
 * uno con el suyo. Es el mismo fallo que rompió el orden de las plantillas —
 * buscar cada vez desde el principio devuelve siempre la primera.
 */
export function takeForRole(pool: ReferenceSection[], role: string): ReferenceSection | null {
  const byRole = pool.findIndex((section) => section.role === role);
  if (byRole !== -1) return pool.splice(byRole, 1)[0];

  /*
   * La cabecera y el pie no se reparten como comodín.
   *
   * Son las dos que **sí** emparejan siempre por nombre, así que si quedan en la
   * bolsa es porque nadie las pidió. Dárselas a una comparativa le pasaría el
   * marcado de un menú, que es peor que no darle nada.
   */
  const byOrder = pool.findIndex(
    (section) => !["cabecera", "pie", "anuncio"].includes(section.role),
  );

  return byOrder === -1 ? null : pool.splice(byOrder, 1)[0];
}
