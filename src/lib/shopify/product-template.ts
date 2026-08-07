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

/**
 * El JSON de una plantilla de tema, que **no** es JSON del todo.
 *
 * Shopify escribe una cabecera de comentario en cada plantilla que pasa por su
 * editor: «IMPORTANT: The contents of this file are auto-generated». Es un
 * bloque de comentario delante del objeto, y `JSON.parse` lo rechaza — el fallo
 * salía como «no es un JSON válido», que hacía pensar que la plantilla estaba
 * en Liquid cuando estaba perfectamente bien.
 *
 * Se quitan respetando las cadenas: dos barras dentro de un texto son parte del
 * texto, y en estas plantillas hay URLs a puñados.
 */
export function readTemplateJson(text: string): ProductTemplate | null {
  let out = "";
  let index = 0;
  let inString = false;

  while (index < text.length) {
    const char = text[index];

    if (inString) {
      out += char;

      // Una comilla escapada no cierra la cadena.
      if (char === "\\") {
        out += text[index + 1] ?? "";
        index += 2;
        continue;
      }

      if (char === '"') inString = false;
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }

    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }

    if (char === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
      continue;
    }

    out += char;
    index += 1;
  }

  try {
    const parsed = JSON.parse(out.trim()) as ProductTemplate;

    // Un JSON válido que no sea un objeto no es una plantilla.
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

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
  /**
   * Páginas ajenas que sirven de **referencia**, ya en texto plano.
   *
   * Referencia quiere decir de dónde sacar ángulos, objeciones y qué orden de
   * argumentos funciona en esta categoría. No de dónde sacar frases: copiar una
   * literal es el problema legal de otro convertido en el tuyo, y además suena
   * a lo mismo que ya está en el mercado.
   */
  references?: string[];
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
    ...(input.references && input.references.length > 0
      ? [
          `## Referencias`,
          ``,
          `Estas páginas venden bien en esta categoría. Son **referencia, no material**: mira qué ángulos usan, qué objeciones responden y en qué orden colocan los argumentos. No copies ni una frase, ni sus cifras, ni sus nombres.`,
          ``,
          ...input.references.map((text, index) => `### Referencia ${index + 1}\n\n${text}`),
          ``,
        ]
      : []),
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
    ...(input.references && input.references.length > 0
      ? [
          `- De las referencias sale **el enfoque**, nunca el texto. Si una frase tuya se parece a una suya, reescríbela.`,
          `- Sus cifras son suyas: no las traigas. Ni reseñas, ni «93 mil clientes», ni estudios que no sean de este producto.`,
        ]
      : []),
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

/**
 * La sección de compra del tema, sacada de su plantilla de producto por defecto.
 *
 * Es la que trae el precio, las variantes y el botón de añadir al carrito. Una
 * página de producto calcada de una landing ajena no la lleva —esa landing
 * vendía con un enlace— y sin ella la página es preciosa y no se puede comprar.
 *
 * Se lee de `templates/product.json` en vez de darla por sabida porque cada
 * tema la llama a su manera: `main-product`, `product-information`, `main`… Un
 * nombre inventado no da error: Shopify pinta la plantilla sin esa sección.
 */
export function mainProductSection(defaultTemplate: string): string | null {
  const parsed = readTemplateJson(defaultTemplate);

  if (!parsed) return null;

  const entries = Object.entries(parsed.sections ?? {});

  // Por orden de preferencia: la que el propio tema llama «main», y si no, la
  // primera que lleve «product» en el tipo.
  const main = entries.find(([id, section]) => id === "main" || section.type === "main-product");

  if (main?.[1].type) return main[1].type;

  const conProducto = entries.find(([, section]) => /product/i.test(section.type ?? ""));

  return conProducto?.[1].type ?? null;
}

/**
 * Una plantilla de producto hecha con secciones copiadas.
 *
 * La de compra va **primera**. Es donde está el precio y el botón, y en una
 * página larga copiada de una landing todo lo demás son argumentos: dejarla al
 * final obliga a recorrer la página entera para poder comprar.
 */
export function productTemplateFrom(input: {
  sectionNames: string[];
  /** El tipo de la sección de compra. Sin ella la página no vende. */
  mainSection: string | null;
}): string {
  const sections: Record<string, { type: string }> = {};
  const order: string[] = [];

  if (input.mainSection) {
    sections.main = { type: input.mainSection };
    order.push("main");
  }

  for (const name of input.sectionNames) {
    sections[name] = { type: name };
    order.push(name);
  }

  return JSON.stringify({ sections, order }, null, 2);
}

/**
 * Reparte los textos en tandas que quepan en una respuesta.
 *
 * Una plantilla real trae entre cuarenta y cien textos, y pedirlos todos de
 * golpe agota la respuesta a media lista: se corta, no se puede leer, y la
 * página entera se queda sin reescribir. El síntoma es «la respuesta se cortó
 * por longitud» después de haber pagado la generación.
 *
 * Se mide por **caracteres** y no por número de campos, porque lo que no cabe
 * es la respuesta y la respuesta mide lo que midan los textos: cuarenta
 * titulares caben de sobra, cuarenta párrafos de descripción no.
 *
 * Y se cuenta lo que sale, no lo que entra: el texto vuelve reescrito con una
 * longitud parecida a la que tenía, así que su tamaño es la mejor estimación
 * del sitio que va a ocupar de vuelta.
 */
export function batchFields(fields: CopyField[], maxChars = 6_000): CopyField[][] {
  const batches: CopyField[][] = [];

  let current: CopyField[] = [];
  let size = 0;

  for (const field of fields) {
    // La ruta viaja de ida y de vuelta, así que también ocupa.
    const cost = field.value.length + field.path.length + 20;

    if (current.length > 0 && size + cost > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }

    current.push(field);
    size += cost;
  }

  if (current.length > 0) batches.push(current);

  return batches;
}
