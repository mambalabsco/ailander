/**
 * Una plantilla de producto de Shopify, para rehacerla con otro producto.
 *
 * ## Qué es esto
 *
 * Una página de producto montada con un tema de bloques es un JSON: secciones,
 * dentro bloques, y dentro de cada bloque un montón de `settings`. En una
 * plantilla real conviven dos cosas muy distintas en el mismo saco:
 *
 * - **El diseño**: `#000000`, `42`, `"to right"`, `true`, el SVG de un icono.
 * - **El texto**: el titular, los cuatro beneficios, el «4.7 Excelente | +858
 *   reseñas», el aviso de letra pequeña.
 *
 * Lo que hace que una plantilla sirva de modelo es justamente eso: el diseño ya
 * está decidido y probado, y lo único que cambia de un producto a otro es el
 * texto. Así que aquí se separa lo uno de lo otro y **solo se toca el texto**.
 *
 * ## Por qué no se le pasa el JSON entero al modelo
 *
 * Porque son cientos de kilobytes de los que el 95 % son colores, tamaños y
 * SVG. Mandarlo entero cuesta una fortuna, se sale del contexto y —lo peor—
 * invita a que el modelo devuelva el JSON «mejorado», con los colores cambiados
 * y algún campo perdido por el camino. Se le manda una lista de textos y se
 * reciben los mismos campos reescritos: el diseño no puede romperse porque
 * nunca ha estado en juego.
 */

/** Un texto de la plantilla, con dónde vive para poder devolverlo a su sitio. */
export interface CopyField {
  /** `secciones.X.bloques.Y.ajuste`, ya legible. Es la clave del intercambio. */
  path: string;
  /** El tipo del bloque: `title`, `benefits_grid`… Le dice al modelo qué es. */
  block: string;
  key: string;
  value: string;
}

/*
 * Las claves que **nunca** son texto de venta, aunque lo parezcan.
 *
 * `text_align` y `text_color` llevan «text» dentro y son diseño. Un
 * `custom_icon` es un SVG de dos mil caracteres. Y `custom_liquid` es un
 * widget entero con su HTML, su CSS y su JavaScript: reescribirlo con un
 * modelo es la forma más rápida de romper la página entera.
 */
const NUNCA = /color|font|align|position|type|style|direction|gradient|icon|image|url|link|radius|width|height|size|spacing|padding|margin|weight|opacity|liquid|option|mode/i;

/** Y las que sí lo son, aunque no lleven «text» en el nombre. */
const SIEMPRE = /text|title|heading|subtitle|description|label|badge|question|answer|content|inventory|rating/i;

export function isCopyKey(key: string): boolean {
  if (NUNCA.test(key)) return false;

  return SIEMPRE.test(key);
}

/**
 * Un texto que merezca reescribirse.
 *
 * Se dejan fuera los vacíos y los que son solo marcas de posición del tema
 * —«Custom Product Title», «Add additional descriptive text here»—: pedir que
 * se reescriban gasta y devuelve otro texto de relleno igual de inútil, cuando
 * lo que quiere decir un campo así es que ese bloque no se usa.
 */
const RELLENO = /^(custom |add |your |lorem |variant \d|accent text|badge text)/i;

export function isWorthRewriting(value: string): boolean {
  const clean = value.replace(/<[^>]*>/g, "").trim();

  if (clean.length < 2) return false;
  if (RELLENO.test(clean)) return false;

  return true;
}

interface Block {
  type?: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
}

interface Section {
  type?: string;
  blocks?: Record<string, Block>;
  settings?: Record<string, unknown>;
}

export interface ProductTemplate {
  sections?: Record<string, Section>;
  order?: string[];
}

/**
 * Todos los textos de la plantilla, en orden de lectura.
 *
 * Los bloques **desactivados** se saltan: están en el JSON pero no se ven en la
 * página, y reescribirlos es pagar por texto que nadie va a leer.
 */
export function collectCopy(template: ProductTemplate): CopyField[] {
  const fields: CopyField[] = [];

  const read = (
    settings: Record<string, unknown> | undefined,
    path: string,
    block: string,
  ) => {
    for (const [key, value] of Object.entries(settings ?? {})) {
      if (typeof value !== "string") continue;
      if (!isCopyKey(key) || !isWorthRewriting(value)) continue;

      fields.push({ path: `${path}.${key}`, block, key, value });
    }
  };

  for (const [sectionId, section] of Object.entries(template.sections ?? {})) {
    read(section.settings, sectionId, section.type ?? "section");

    for (const [blockId, block] of Object.entries(section.blocks ?? {})) {
      if (block.disabled) continue;

      read(block.settings, `${sectionId}.${blockId}`, block.type ?? "block");
    }
  }

  return fields;
}

/**
 * Devuelve cada texto reescrito a su sitio, sin tocar nada más.
 *
 * Se copia en profundidad y se escribe por ruta en vez de reconstruir el JSON:
 * lo que no está en la lista de cambios llega intacto al otro lado, incluidos
 * los ajustes que este código no entiende. Un tema puede añadir mañana un campo
 * nuevo y esto seguirá funcionando sin enterarse.
 */
export function applyCopy(
  template: ProductTemplate,
  changes: Record<string, string>,
): ProductTemplate {
  const next = JSON.parse(JSON.stringify(template)) as ProductTemplate;

  for (const [path, value] of Object.entries(changes)) {
    const parts = path.split(".");
    const key = parts.pop();

    if (!key) continue;

    const [sectionId, blockId] = parts;
    const section = next.sections?.[sectionId];

    if (!section) continue;

    const target = blockId ? section.blocks?.[blockId]?.settings : section.settings;

    // Solo se pisa lo que ya existía: una ruta inventada por el modelo no puede
    // crear ajustes nuevos, que es como se rompe un tema sin darse cuenta.
    if (target && key in target) target[key] = value;
  }

  return next;
}

/**
 * Conservar las etiquetas es parte del encargo, no un detalle.
 *
 * Muchos ajustes guardan HTML —`<p><strong>REGALO INCLUIDO</strong></p>`— y el
 * tema lo pinta tal cual. Si el texto vuelve en plano, se pierden la negrita y
 * el párrafo; si vuelve con etiquetas inventadas, el tema las pinta también.
 */
export function buildTemplateCopyPrompt(input: {
  fields: CopyField[];
  productName: string;
  audience: string;
  country: string;
  /** Beneficios, ingredientes, oferta: lo que se sepa del producto. */
  context?: string;
}): string {
  const lista = input.fields
    .map((field) => `${field.path} · bloque «${field.block}»\n${field.value}`)
    .join("\n\n");

  return [
    `Eres redactor de páginas de producto de respuesta directa.`,
    ``,
    `Abajo van los textos de una página que **ya funciona**, de otro producto.`,
    `Reescríbelos para ${input.productName}, dirigido a ${input.audience} en ${input.country}.`,
    ``,
    ...(input.context ? [`## Sobre el producto`, ``, input.context, ``] : []),
    `## Los textos`,
    ``,
    lista,
    ``,
    `## Cómo`,
    ``,
    `- Devuelve **la misma ruta** con el texto nuevo. No añadas rutas ni quites ninguna.`,
    `- Respeta las etiquetas HTML que traiga cada texto: si viene «<p><strong>X</strong></p>», devuélvelo igual con el texto cambiado. No añadas etiquetas donde no las había.`,
    `- Respeta la **longitud**: un texto que ocupaba cuatro palabras no puede volver con veinte. La maqueta está hecha a la medida del original y un texto que no cabe rompe la página.`,
    `- Mantén la función de cada texto: si el original era una promesa con número, la nueva también lo es; si era un aviso de letra pequeña, sigue siéndolo.`,
    `- Las cifras de prueba social (reseñas, clientes, estudios) **no se inventan**: si no tienes el dato del producto nuevo, deja la frase sin número en vez de copiar el del original.`,
    `- Sin promesas médicas ni curativas.`,
    `- Escribe en el español de ${input.country}.`,
  ].join("\n");
}

/**
 * Lo que devuelve el modelo, ya filtrado contra lo que se le pidió.
 *
 * Se descarta cualquier ruta que no estuviera en la lista: es la única defensa
 * contra que una respuesta larga se invente un campo y ese campo acabe escrito
 * en el tema de una tienda en marcha.
 */
export function readTemplateCopy(
  fields: CopyField[],
  answer: { path?: string; text?: string }[],
): Record<string, string> {
  const known = new Set(fields.map((field) => field.path));
  const changes: Record<string, string> = {};

  for (const item of answer ?? []) {
    const path = (item.path ?? "").trim();
    const text = (item.text ?? "").trim();

    if (!path || !text || !known.has(path)) continue;

    changes[path] = text;
  }

  return changes;
}
