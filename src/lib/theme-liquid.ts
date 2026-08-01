/**
 * Revisar una sección de Shopify escrita por el modelo, antes de escribirla.
 *
 * Sin imports, probado en `theme-liquid.test.ts`.
 *
 * ## Por qué existe este archivo
 *
 * Dejar que el modelo escriba el Liquid es lo que permite que una sección se
 * parezca de verdad a la de referencia: siete disposiciones fijas dan siempre el
 * mismo aire genérico, y ese era justo el problema. Pero código generado que se
 * escribe a ciegas en un tema es otra cosa.
 *
 * Shopify no ayuda: un `{% schema %}` con una coma de más **no da error**. La
 * sección simplemente no aparece en el editor, y hay que ir a buscar por qué. Un
 * `{% for %}` sin cerrar rompe la plantilla entera. Un ajuste que se usa pero no
 * se declara sale vacío, así que la sección se ve pero sin texto.
 *
 * Los tres fallan **en silencio o lejos de su causa**, que es la peor
 * combinación. Por eso se comprueban aquí y no se descubren en la tienda.
 *
 * ## Qué no comprueba
 *
 * Que quede bonito. Eso se mira en la vista previa, que es para lo que está.
 */

/* ------------------------------ Lo que se mira ----------------------------- */

export interface LiquidReview {
  ok: boolean;
  problems: string[];
  /** El esquema ya leído, cuando se pudo. */
  schema: SectionSchema | null;
}

export interface SectionSchema {
  name?: string;
  settings?: { id?: string; type?: string }[];
  blocks?: { type?: string; settings?: { id?: string }[] }[];
  presets?: unknown[];
  [key: string]: unknown;
}

/** Un archivo de sección no debería pasar de esto ni de lejos. */
export const MAX_SECTION_BYTES = 60_000;

/**
 * Etiquetas de bloque de Liquid: las que abren y hay que cerrar.
 *
 * `style` y `javascript` están porque Shopify las trata como etiquetas de
 * sección y su cierre se olvida con la misma facilidad que el de un `for`.
 */
const BLOCK_TAGS = [
  "if",
  "unless",
  "for",
  "case",
  "capture",
  "comment",
  "raw",
  "form",
  "paginate",
  "tablerow",
  "style",
  "javascript",
  "stylesheet",
  "schema",
];

/**
 * Lo que no puede aparecer, con el motivo.
 *
 * No es una lista de seguridad: es una lista de cosas que **no funcionan aquí**.
 * Una sección nueva no puede depender de fragmentos del tema porque no sabemos
 * cuáles trae, y un `{% layout %}` dentro de una sección no significa nada.
 */
const FORBIDDEN: { match: RegExp; why: string }[] = [
  {
    match: /\{%-?\s*(render|include)\s/,
    why: "usa un fragmento del tema (`render`/`include`), y no sabemos qué fragmentos trae ese tema",
  },
  {
    match: /\{%-?\s*(layout|section|sections)\s/,
    why: "usa una etiqueta que no vale dentro de una sección (`layout`/`section`)",
  },
  {
    match: /<script[\s>]/i,
    why: "trae un `<script>`: el comportamiento se hace con CSS o no se hace",
  },
  {
    /*
     * Cargar cosas de fuera no vale: puede caerse o cambiar sin aviso.
     *
     * Se dejan pasar dos. `www.w3.org` no es una descarga, es el espacio de
     * nombres que lleva todo SVG en línea, y los iconos son SVG en línea. Y las
     * fuentes de Shopify las sirve la propia tienda.
     */
    match: /https?:\/\/(?!(?:www\.)?w3\.org|fonts\.shopifycdn\.com)/i,
    why: "carga algo de fuera de la tienda, que puede caerse o cambiar sin aviso",
  },
];

/* -------------------------------- El repaso -------------------------------- */

/** Saca el bloque de esquema tal cual, sin interpretarlo. */
function schemaBlock(source: string): string | null {
  const match = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/.exec(source);
  return match ? match[1] : null;
}

/**
 * Cuenta aperturas y cierres de cada etiqueta de bloque.
 *
 * Se cuentan y se comparan en vez de llevar una pila. Una pila diría además si
 * están mal anidadas, pero también daría falsos positivos con `{% else %}` y
 * `{% elsif %}`; el fallo que aparece de verdad es el cierre que falta, y para
 * eso basta contar.
 */
function unbalanced(source: string): string[] {
  const problems: string[] = [];

  for (const tag of BLOCK_TAGS) {
    const open = source.match(new RegExp(`\\{%-?\\s*${tag}[\\s\\-%]`, "g"))?.length ?? 0;
    const close = source.match(new RegExp(`\\{%-?\\s*end${tag}\\s*-?%\\}`, "g"))?.length ?? 0;

    if (open !== close) {
      problems.push(
        `Hay ${open} \`{% ${tag} %}\` y ${close} \`{% end${tag} %}\`: falta cerrar alguno.`,
      );
    }
  }

  return problems;
}

/** Los ajustes que el esquema declara, por identificador. */
function declaredSettings(schema: SectionSchema): { section: Set<string>; block: Set<string> } {
  const section = new Set<string>();
  const block = new Set<string>();

  for (const setting of schema.settings ?? []) {
    if (typeof setting?.id === "string") section.add(setting.id);
  }

  for (const type of schema.blocks ?? []) {
    for (const setting of type?.settings ?? []) {
      if (typeof setting?.id === "string") block.add(setting.id);
    }
  }

  return { section, block };
}

/**
 * Los ajustes que se usan pero no se declaran.
 *
 * Es el fallo que más se ve y el que peor se diagnostica: la sección aparece,
 * se coloca, y sale sin texto. Nada da error — Liquid resuelve lo que no existe
 * como vacío y sigue.
 */
function undeclared(source: string, schema: SectionSchema): string[] {
  const declared = declaredSettings(schema);
  const problems: string[] = [];

  const used = (pattern: RegExp) =>
    new Set([...source.matchAll(pattern)].map((match) => match[1]));

  for (const id of used(/section\.settings\.([a-zA-Z0-9_]+)/g)) {
    if (!declared.section.has(id)) {
      problems.push(`Usa \`section.settings.${id}\` y el esquema no lo declara: saldría vacío.`);
    }
  }

  for (const id of used(/block\.settings\.([a-zA-Z0-9_]+)/g)) {
    if (!declared.block.has(id)) {
      problems.push(`Usa \`block.settings.${id}\` y ningún bloque lo declara: saldría vacío.`);
    }
  }

  return problems;
}

/**
 * Si el CSS está encerrado en el identificador de la sección.
 *
 * Sin encerrar, una sección le cambia los colores a otra de la misma página —o
 * al tema entero— y el destrozo aparece donde nadie lo está mirando. Se
 * comprueba selector a selector: basta uno suelto para pintar de más.
 */
function unscopedCss(source: string): string[] {
  const problems: string[] = [];

  for (const style of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    /*
     * Primero se quita el Liquid, y esto no es un detalle.
     *
     * Un selector encerrado lleva `{{ section.id }}` dentro, o sea **llaves**.
     * Contando llaves a pelo, `#shopify-section-{{ section.id }} .lp {` se parte
     * en tres y `.lp` aparece como un selector suelto: la comprobación
     * rechazaba justo el CSS que está bien, que es la peor forma de fallar.
     */
    const body = style[1]
      .replace(/\{\{[\s\S]*?\}\}/g, "LIQUID")
      .replace(/\{%[\s\S]*?%\}/g, "LIQUID");

    for (const rule of body.matchAll(/(^|\}|\{)\s*([^{}@]+)\{/g)) {
      const selector = rule[2].trim();

      // Ni los porcentajes de un `@keyframes` ni la propia regla `@media` son
      // selectores: no hay nada que encerrar en ellos.
      if (!selector) continue;
      if (selector.startsWith("@")) continue;
      if (/^\d|^from$|^to$/.test(selector)) continue;

      if (!selector.includes("shopify-section")) {
        problems.push(
          `El selector \`${selector.slice(0, 60)}\` no está encerrado en \`#shopify-section-{{ section.id }}\`: pintaría fuera de la sección.`,
        );
      }
    }
  }

  return problems;
}

/**
 * Repasa una sección entera.
 *
 * Devuelve **todos** los problemas, no el primero. Se le mandan de vuelta al
 * modelo para que corrija de una pasada: devolviendo uno cada vez harían falta
 * cinco vueltas para lo que se arregla en una.
 */
export function reviewSection(source: string): LiquidReview {
  const problems: string[] = [];

  if (source.trim().length === 0) {
    return { ok: false, problems: ["Está vacío."], schema: null };
  }

  if (source.length > MAX_SECTION_BYTES) {
    problems.push(`Ocupa ${source.length} caracteres y el tope son ${MAX_SECTION_BYTES}.`);
  }

  for (const rule of FORBIDDEN) {
    if (rule.match.test(source)) problems.push(`No vale: ${rule.why}.`);
  }

  problems.push(...unbalanced(source));

  const block = schemaBlock(source);
  let schema: SectionSchema | null = null;

  if (block === null) {
    problems.push("No tiene bloque `{% schema %}`: sin él la sección no existe para Shopify.");
    return { ok: false, problems, schema: null };
  }

  try {
    const parsed: unknown = JSON.parse(block);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      problems.push("El `{% schema %}` no es un objeto JSON.");
    } else {
      schema = parsed as SectionSchema;
    }
  } catch (error) {
    /*
     * Shopify no da ningún error por esto: la sección simplemente no aparece en
     * el editor. Por eso el mensaje dice dónde mirar.
     */
    problems.push(
      `El \`{% schema %}\` no es JSON válido (${error instanceof Error ? error.message : "no se pudo leer"}). Shopify no avisa de esto: la sección no aparecería en el editor.`,
    );
  }

  if (schema) {
    if (typeof schema.name !== "string" || schema.name.trim() === "") {
      problems.push("El esquema no tiene `name`.");
    }
    if (!Array.isArray(schema.presets) || schema.presets.length === 0) {
      problems.push("El esquema no tiene `presets`: no se podría añadir desde el editor.");
    }

    problems.push(...undeclared(source, schema));
  }

  problems.push(...unscopedCss(source));

  return { ok: problems.length === 0, problems, schema };
}

/* ------------------------------ Arreglar el esquema ------------------------ */

/**
 * Quita los `default` vacíos del esquema.
 *
 * Shopify rechaza el archivo entero con «setting with id="x" default can't be
 * blank». Es una regla suya que no está en ningún sitio evidente: un ajuste
 * puede **no** tener `default`, pero si lo tiene no puede estar vacío. El modelo
 * escribe `"default": ""` con toda naturalidad —es lo que uno pondría— y tumba
 * la escritura de la página entera.
 *
 * Se arregla aquí y no pidiéndoselo al modelo porque es determinista: un ajuste
 * sin `default` se comporta igual que uno con el valor vacío, así que borrarlo
 * no cambia nada y siempre acierta. Confiar en el prompt sería volver a jugársela
 * en cada generación.
 */
export function stripBlankDefaults(source: string): { source: string; removed: number } {
  const match = /(\{%-?\s*schema\s*-?%\})([\s\S]*?)(\{%-?\s*endschema\s*-?%\})/.exec(source);
  if (!match) return { source, removed: 0 };

  let schema: unknown;
  try {
    schema = JSON.parse(match[2]);
  } catch {
    // Un esquema ilegible ya lo caza la revisión, con un mensaje mejor que este.
    return { source, removed: 0 };
  }

  let removed = 0;

  const clean = (settings: unknown) => {
    if (!Array.isArray(settings)) return;

    for (const setting of settings) {
      if (typeof setting !== "object" || setting === null) continue;

      const record = setting as Record<string, unknown>;
      if (!("default" in record)) continue;

      const value = record.default;
      const blank =
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "");

      if (blank) {
        delete record.default;
        removed += 1;
      }
    }
  };

  const root = schema as Record<string, unknown>;
  clean(root.settings);

  if (Array.isArray(root.blocks)) {
    for (const block of root.blocks) {
      if (typeof block === "object" && block !== null) {
        clean((block as Record<string, unknown>).settings);
      }
    }
  }

  if (removed === 0) return { source, removed: 0 };

  return {
    source: `${source.slice(0, match.index)}${match[1]}\n${JSON.stringify(schema, null, 2)}\n${match[3]}${source.slice(match.index + match[0].length)}`,
    removed,
  };
}

/* --------------------------- Los valores de los ajustes -------------------- */

/**
 * Convierte los valores al tipo que declara el esquema.
 *
 * Llegan todos como texto porque la salida estructurada no admite valores de
 * tipo variable. Aquí ya se sabe qué declaró cada ajuste, así que se convierte:
 * un `checkbox` que llegue como `"true"` tiene que guardarse como booleano —si
 * se guarda como texto, Shopify lo lee como verdadero **siempre**, incluso
 * cuando pone `"false"`, porque cualquier cadena no vacía es verdadera.
 */
export function coerceSettings(
  pairs: { id: string; value: string }[],
  declared: { id?: string; type?: string }[],
): Record<string, unknown> {
  const types = new Map(
    declared.flatMap((setting) =>
      typeof setting.id === "string" ? [[setting.id, setting.type ?? "text"] as const] : [],
    ),
  );

  const settings: Record<string, unknown> = {};

  for (const pair of pairs) {
    // Un ajuste que el esquema no declara no se guarda: el tema no lo leería y
    // solo ensuciaría la plantilla.
    if (!types.has(pair.id)) continue;

    const type = types.get(pair.id);

    if (type === "checkbox") {
      settings[pair.id] = pair.value.trim().toLowerCase() === "true";
      continue;
    }

    if (type === "range" || type === "number") {
      const value = Number(pair.value);
      // Un número ilegible se deja fuera para que mande el valor por defecto del
      // esquema; escribir `NaN` dejaría la sección sin renderizar.
      if (Number.isFinite(value)) settings[pair.id] = value;
      continue;
    }

    settings[pair.id] = pair.value;
  }

  return settings;
}

/** Los ajustes que declara un tipo de bloque del esquema. */
export function blockSettingsOf(schema: SectionSchema, type: string): { id?: string; type?: string }[] {
  return schema.blocks?.find((block) => block.type === type)?.settings ?? [];
}

/* --------------------------------- Las imágenes ---------------------------- */

/**
 * Los huecos de imagen que se pueden rellenar sin subir nada.
 *
 * Una sección declara la imagen por partida doble: un `image_picker` para
 * elegirla en el editor y un texto con su dirección para poder dejarla puesta
 * desde aquí. La razón es que el valor de un `image_picker` es una referencia
 * interna de Shopify que solo se obtiene subiendo el archivo; una dirección del
 * CDN de la propia tienda se escribe y ya.
 *
 * Se busca el par: por cada `image_picker` llamado `foto`, un texto `foto_url`.
 * Sin la pareja no se toca — un texto suelto puede ser cualquier cosa.
 */
export function imageUrlSlots(schema: SectionSchema): string[] {
  const settings = schema.settings ?? [];
  const pickers = new Set(
    settings.flatMap((setting) =>
      setting.type === "image_picker" && typeof setting.id === "string" ? [setting.id] : [],
    ),
  );

  return settings.flatMap((setting) => {
    if (typeof setting.id !== "string" || !setting.id.endsWith("_url")) return [];

    const base = setting.id.slice(0, -"_url".length);
    return pickers.has(base) ? [setting.id] : [];
  });
}

/**
 * Deja puestas las imágenes que haya, sin pisar las que el modelo ya escribió.
 *
 * Se reparten en orden y se repiten cuando hay más huecos que imágenes: una
 * página con la misma foto dos veces se entiende y se arregla; una con dos
 * huecos vacíos parece rota.
 */
export function fillImageUrls(
  settings: Record<string, unknown>,
  slots: string[],
  urls: string[],
  startAt = 0,
): { settings: Record<string, unknown>; used: number } {
  if (urls.length === 0) return { settings, used: 0 };

  const next = { ...settings };
  let used = 0;

  for (const slot of slots) {
    const current = next[slot];
    if (typeof current === "string" && current.trim() !== "") continue;

    next[slot] = urls[(startAt + used) % urls.length];
    used += 1;
  }

  return { settings: next, used };
}

/* ------------------------------ El nombre del archivo ---------------------- */

/**
 * Cómo se llama el archivo de una sección creada.
 *
 * Lleva el prefijo `lp-` para no pisar nunca una del tema, y el papel dentro
 * para que se reconozca en el editor sin abrirla. El número desempata cuando la
 * página pide dos del mismo papel.
 */
export function sectionType(kind: string, index: number): string {
  const slug = kind
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();

  return `lp-${slug}-${index + 1}`;
}

export function sectionFilename(type: string): string {
  return `sections/${type}.liquid`;
}
