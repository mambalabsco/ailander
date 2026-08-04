/**
 * El aspecto de una landing, sacado de la página que se está calcando.
 *
 * Sin imports, probado en `landing-theme.test.ts`.
 *
 * ## Qué problema resuelve
 *
 * Todas las landings salían **iguales**. El generador elegía qué secciones poner
 * y qué decir en cada una, pero los colores, la letra y las medidas estaban
 * escritos a fuego en el que las dibuja: mismo gris, misma tipografía, mismo
 * ancho. Calcar dos páginas muy distintas daba dos páginas que solo se
 * diferenciaban en el texto.
 *
 * Y esa es justo la mitad que importa. Lo que hace que un publirreportaje
 * parezca un artículo de un medio y no un anuncio es su aire: el serif del
 * titular, el fondo hueso, la línea fina entre secciones. Copiar el orden de las
 * secciones y no el aire es copiar el esqueleto sin la piel.
 *
 * ## Qué se copia y qué no
 *
 * **Los colores, la letra y las medidas.** No el CSS: el de una página está
 * atado al armazón de su tema —sus variables, sus clases, su retícula— y pegarlo
 * en otro sitio da un diseño roto, no uno idéntico. Se leen sus decisiones y se
 * vuelven a aplicar con marcado propio.
 *
 * ## Y por qué hay tantos valores por defecto
 *
 * Porque de una página se saca lo que se saca. Si no trae fuente declarada o el
 * fondo es una imagen, hay que seguir dibujando algo: un hueco sin valor deja
 * una regla de CSS sin cerrar y con ella se cae el resto de la hoja.
 */

export interface LandingTheme {
  /** El color del texto principal. */
  ink: string;
  /** El del texto secundario: pies, fechas, notas. */
  muted: string;
  /** Las líneas finas que separan. */
  line: string;
  /** El fondo de las cajas destacadas. */
  surface: string;
  /** El fondo de la página. */
  background: string;
  /** El de los botones y los detalles. */
  accent: string;
  /** El texto sobre el acento. */
  onAccent: string;
  /** La familia del titular. */
  headingFont: string;
  /** La del cuerpo. */
  bodyFont: string;
  /** El ancho de la columna de lectura, en píxeles. */
  width: number;
  /** El redondeo de cajas y botones. */
  radius: number;
}

/**
 * El aspecto por defecto: el que tenía la plataforma escrito a fuego.
 *
 * Se conserva tal cual para que una landing sin referencia salga exactamente
 * como salía antes. Cambiar de paso el aspecto de todo lo ya generado sería
 * arreglar una cosa y mover otra que nadie pidió.
 */
export const DEFAULT_THEME: LandingTheme = {
  ink: "#1c1e21",
  muted: "#65676b",
  line: "#e4e6eb",
  surface: "#f7f8fa",
  background: "#ffffff",
  accent: "#1877f2",
  onAccent: "#ffffff",
  headingFont:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  width: 680,
  radius: 10,
};

/* ------------------------------ Leer un color ------------------------------ */

/** `#abc` → `#aabbcc`. Un color de tres cifras es válido y no compara igual. */
function expand(hex: string): string {
  const clean = hex.replace("#", "").toLowerCase();

  if (clean.length === 3) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
  }

  // Con transparencia se queda el color y se tira el canal alfa: el fondo de la
  // página no puede ser medio transparente.
  return `#${clean.slice(0, 6)}`;
}

function isHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim());
}

/**
 * Cuánta luz tiene un color, de 0 a 1.
 *
 * Con los pesos de la norma de accesibilidad y no la media de los tres canales:
 * el verde pesa siete veces más que el azul para el ojo, y con la media un azul
 * oscuro y un verde medio salen iguales.
 */
export function luminance(hex: string): number {
  const clean = expand(hex).replace("#", "");
  if (clean.length !== 6) return 0;

  const channel = (index: number) => {
    const value = parseInt(clean.slice(index * 2, index * 2 + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Blanco o negro, el que se lea encima. */
export function readableOn(background: string): string {
  return luminance(background) > 0.179 ? "#000000" : "#ffffff";
}

/* --------------------------- Componer el aspecto --------------------------- */

export interface ReferenceLook {
  /** Los colores que se vieron en la página, del más usado al menos. */
  colors?: string[];
  /** Las familias declaradas, la primera para titulares. */
  fonts?: string[];
  /** El ancho de la columna, si se pudo medir. */
  width?: number;
}

/**
 * El aspecto de la referencia, con lo que falte por defecto.
 *
 * ## Cómo se reparten los colores
 *
 * El más claro es el fondo y el más oscuro el texto: en una página de leer eso
 * acierta casi siempre, y cuando no acierta se ve a la primera y se cambia. El
 * acento es el más saturado de los que quedan, que es donde suelen estar los
 * botones.
 *
 * **No se coge el primero como fondo.** El color más usado de una página suele
 * ser el del texto —hay más letras que fondo en píxeles de regla CSS— y usarlo
 * de fondo da una página negra con letras negras.
 */
export function themeFrom(look: ReferenceLook): LandingTheme {
  const colors = (look.colors ?? []).filter(isHex).map(expand);

  const unique = [...new Set(colors)];

  if (unique.length === 0) {
    return {
      ...DEFAULT_THEME,
      ...fontsOf(look.fonts),
      width: widthOf(look.width),
    };
  }

  const sorted = [...unique].sort((a, b) => luminance(b) - luminance(a));

  const background = sorted[0];
  const ink = sorted[sorted.length - 1];

  /*
   * Si el más claro y el más oscuro casi no se distinguen, no hay paleta que
   * sacar: la página traía un solo tono. Se vuelve a lo de siempre antes que
   * entregar una landing con texto del color del fondo.
   */
  if (luminance(background) - luminance(ink) < 0.2) {
    return { ...DEFAULT_THEME, ...fontsOf(look.fonts), width: widthOf(look.width) };
  }

  const accent = mostSaturated(unique.filter((color) => color !== background && color !== ink));

  return {
    ink,
    // El secundario se compone: mezclar el texto con el fondo da un gris que
    // pega con los dos, y buscarlo entre los de la página trae cualquier cosa.
    muted: mix(ink, background, 0.45),
    line: mix(ink, background, 0.88),
    surface: mix(ink, background, 0.96),
    background,
    accent: accent || DEFAULT_THEME.accent,
    onAccent: readableOn(accent || DEFAULT_THEME.accent),
    ...fontsOf(look.fonts),
    width: widthOf(look.width),
    radius: DEFAULT_THEME.radius,
  };
}

/** El más vivo de la lista, que es donde suele estar el botón. */
function mostSaturated(colors: string[]): string {
  let best = "";
  let score = -1;

  for (const color of colors) {
    const clean = color.replace("#", "");
    const values = [0, 1, 2].map((index) => parseInt(clean.slice(index * 2, index * 2 + 2), 16));

    const spread = Math.max(...values) - Math.min(...values);

    if (spread > score) {
      score = spread;
      best = color;
    }
  }

  // Menos de cuarenta de diferencia entre canales es un gris, no un acento.
  return score >= 40 ? best : "";
}

/** Un punto entre dos colores. `amount` a 1 es el segundo. */
export function mix(from: string, to: string, amount: number): string {
  const read = (hex: string, index: number) =>
    parseInt(hex.replace("#", "").slice(index * 2, index * 2 + 2), 16);

  const value = (index: number) =>
    Math.round(read(from, index) * (1 - amount) + read(to, index) * amount)
      .toString(16)
      .padStart(2, "0");

  return `#${value(0)}${value(1)}${value(2)}`;
}

function fontsOf(fonts?: string[]): { headingFont: string; bodyFont: string } {
  const clean = (fonts ?? []).map((font) => font.trim()).filter(Boolean);

  if (clean.length === 0) {
    return { headingFont: DEFAULT_THEME.headingFont, bodyFont: DEFAULT_THEME.bodyFont };
  }

  /*
   * Se añade siempre una alternativa del sistema.
   *
   * La fuente de la referencia se sirve desde **su** dominio, y aquí no está: sin
   * alternativa, el navegador cae a Times New Roman y la página parece de 1998.
   */
  const fallback = "-apple-system, BlinkMacSystemFont, sans-serif";

  return {
    headingFont: `${quote(clean[0])}, ${fallback}`,
    bodyFont: `${quote(clean[1] ?? clean[0])}, ${fallback}`,
  };
}

/** Con comillas si lleva espacios, que si no la regla no vale. */
function quote(font: string): string {
  const clean = font.replace(/["']/g, "");
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

function widthOf(width?: number): number {
  if (!width || !Number.isFinite(width)) return DEFAULT_THEME.width;

  /*
   * Entre 520 y 900.
   *
   * Por debajo no cabe una línea de lectura cómoda, y por encima se pasa de los
   * setenta y cinco caracteres por línea a partir de los cuales el ojo pierde
   * el renglón. Una referencia a pantalla completa daría una landing ilegible.
   */
  return Math.round(Math.min(900, Math.max(520, width)));
}
