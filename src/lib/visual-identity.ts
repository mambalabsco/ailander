/**
 * La identidad visual de una tienda, leída de su HTML.
 *
 * Sin imports, probado en `visual-identity.test.ts`.
 *
 * ## Por qué esto pesa más que el orden de las secciones
 *
 * Reordenar secciones cambia la estructura, pero dos tiendas con la misma
 * estructura y distinta paleta no se parecen en nada. Lo que hace que una web
 * «se vea igual» es, por este orden: los colores, la tipografía y el radio de
 * los botones. Todo eso son cuatro o cinco valores, y están escritos en el HTML.
 *
 * ## Qué se lee y qué no
 *
 * Colores y tipografías **son datos, no obra**: una paleta no se registra y una
 * familia tipográfica se licencia por uso, no por parecido. Lo que no se toca es
 * el código del tema —eso sí tiene licencia—, su logo, sus imágenes y sus
 * textos. Aquí solo salen números de color y nombres de fuente.
 *
 * ## De dónde salen
 *
 * Los temas de Shopify escriben su configuración como variables CSS en la propia
 * página, así que no hace falta ir a buscar la hoja de estilos:
 *
 * ```css
 * .color-scheme-1 { --color-background: 255,255,255; --color-foreground: 18,18,18 }
 * ```
 *
 * Y sirven las fuentes desde su propio dominio, con el identificador dentro de
 * la dirección:
 *
 * ```
 * https://fonts.shopifycdn.com/assistant/assistant_n4.abc.woff2
 * ```
 *
 * Esa última parte es la que hace esto fiable. El campo de fuente de un tema no
 * acepta «Poppins»: acepta `poppins_n4`, y adivinar el identificador a partir del
 * nombre rompe el tema. Leerlo de la dirección da el identificador exacto que
 * Shopify ya está sirviendo.
 */

/* -------------------------------- Colores ---------------------------------- */

export interface ExtractedColor {
  /** Siempre en formato `#rrggbb` y en minúsculas. */
  hex: string;
  /** Cuántas veces aparece: el más repetido manda. */
  uses: number;
  /** Qué papel cumple, si la variable CSS lo dice. */
  role: string;
}

/** Normaliza a `#rrggbb`. Devuelve vacío si no es un color legible. */
export function normalizeHex(value: string): string {
  const clean = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(clean);
  if (hex) {
    const digits = hex[1];
    return digits.length === 3
      ? `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
      : `#${digits}`;
  }

  /*
   * Los temas de Shopify guardan el color como tres números sueltos —`18,18,18`—
   * porque después los meten en `rgba(var(--color-foreground), 0.5)` para poder
   * variar la opacidad. Sin esta rama se perdería la paleta entera de cualquier
   * tema moderno.
   */
  const triplet = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(clean);
  if (triplet) {
    const parts = [triplet[1], triplet[2], triplet[3]].map(Number);
    if (parts.some((part) => part > 255)) return "";
    return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }

  return "";
}

/** El papel que declara el nombre de la variable CSS. */
function roleOfVariable(name: string): string {
  if (/background|bg\b/.test(name)) return "fondo";
  if (/foreground|text|body/.test(name)) return "texto";
  if (/button|btn|cta/.test(name)) return "botón";
  if (/border|line|outline/.test(name)) return "borde";
  if (/accent|highlight|brand|primary/.test(name)) return "acento";
  return "otro";
}

/**
 * Los colores de la página, del más usado al menos.
 *
 * Se cuentan **las apariciones**, no los colores distintos. Un tema declara
 * media docena de esquemas de color y solo uno o dos se usan de verdad; el
 * recuento es lo que separa el color de la marca del que quedó en un esquema
 * que nadie aplicó.
 */
export function extractColors(html: string): ExtractedColor[] {
  const found = new Map<string, { uses: number; roles: Set<string> }>();

  const add = (raw: string, role: string) => {
    const hex = normalizeHex(raw);
    if (!hex) return;

    const entry = found.get(hex) ?? { uses: 0, roles: new Set<string>() };
    entry.uses += 1;
    if (role !== "otro") entry.roles.add(role);
    found.set(hex, entry);
  };

  // Las variables CSS primero: son las que traen el papel puesto.
  for (const match of html.matchAll(/--([a-z0-9-]*colou?r[a-z0-9-]*)\s*:\s*([^;}]+)/gi)) {
    add(match[2], roleOfVariable(match[1].toLowerCase()));
  }

  // Y después cualquier hexadecimal suelto, para las tiendas que no usan
  // variables. Sin papel, pero cuenta para saber cuál domina.
  for (const match of html.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    add(match[0], "otro");
  }

  return [...found.entries()]
    .map(([hex, entry]) => ({
      hex,
      uses: entry.uses,
      // Un mismo color puede ser fondo en un sitio y borde en otro; se queda el
      // primero que lo nombró, que es el que la hoja de estilos declara antes.
      role: [...entry.roles][0] ?? "otro",
    }))
    .sort((a, b) => b.uses - a.uses);
}

/* ------------------------------ Tipografías -------------------------------- */

export interface ExtractedFont {
  /** El nombre legible: «Assistant», «Poppins». */
  family: string;
  /**
   * El identificador que acepta el campo de fuente de un tema, si Shopify la
   * sirve. `null` cuando la fuente viene de fuera y el tema no puede usarla.
   */
  handle: string | null;
}

/** Convierte `assistant_n4` en «Assistant» para poder enseñarlo. */
function readableName(handle: string): string {
  return handle
    .replace(/_[a-z]\d.*$/, "")
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Las tipografías de la página.
 *
 * Las que sirve Shopify salen con su identificador exacto y son las únicas que
 * se pueden aplicar a un tema sin tocar código. Las de Google Fonts salen
 * **sin** identificador a propósito: puede que Shopify tenga esa misma familia,
 * pero inventarse el identificador para averiguarlo deja el tema sin fuente. Se
 * enseñan para que se elijan a mano si hace falta.
 */
export function extractFonts(html: string): ExtractedFont[] {
  const byHandle = new Map<string, ExtractedFont>();

  for (const match of html.matchAll(
    /fonts\.shopifycdn\.com\/[a-z0-9_-]+\/([a-z0-9_]+?)(?:\.[a-z0-9]+)*\.(?:woff2?|ttf|otf)/gi,
  )) {
    const handle = match[1].toLowerCase();
    if (!byHandle.has(handle)) {
      byHandle.set(handle, { family: readableName(handle), handle });
    }
  }

  for (const match of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>]+)/gi)) {
    for (const family of match[1].matchAll(/family=([^&:]+)/g)) {
      const name = decodeURIComponent(family[1]).replace(/\+/g, " ").trim();
      const key = `google:${name.toLowerCase()}`;
      if (name && !byHandle.has(key)) byHandle.set(key, { family: name, handle: null });
    }
  }

  return [...byHandle.values()];
}

/* ------------------------------ El conjunto -------------------------------- */

export interface VisualIdentity {
  colors: ExtractedColor[];
  fonts: ExtractedFont[];
  /** El radio de las esquinas, tal cual lo declara: «8px», «0», «2rem». */
  buttonRadius: string | null;
}

/** Cuántos colores se conservan. Más allá del sexto ya es ruido de un esquema sin usar. */
export const COLOR_LIMIT = 8;

export function readVisualIdentity(html: string): VisualIdentity {
  const radius =
    /--(?:buttons?|btn)[a-z0-9-]*radius\s*:\s*([^;}]+)/i.exec(html) ??
    /border-radius\s*:\s*([^;}]+)/i.exec(html);

  return {
    colors: extractColors(html).slice(0, COLOR_LIMIT),
    fonts: extractFonts(html),
    buttonRadius: radius ? radius[1].trim() : null,
  };
}
