/**
 * Los textos de una sección de tema, con su sitio.
 *
 * Sin imports, probado en `theme-texts.test.ts`.
 *
 * ## Para qué
 *
 * Una portada copiada desde el panel de tienda queda escrita en secciones
 * Liquid, y su texto vive dentro de los ajustes de cada sección y de sus
 * bloques. Hasta ahora, cambiar ese texto obligaba a **tirar la página y
 * rehacerla entera** —diez u once llamadas al modelo, pagadas otra vez, y con
 * otra estructura al final—. Esto permite reescribir solo los textos.
 *
 * ## Por qué esto tiene tests
 *
 * Porque los dos fallos posibles son silenciosos. Si un texto vuelve a la clave
 * equivocada, la sección se pinta igual pero con el titular en el sitio del
 * botón. Y si se cuela un enlace o una imagen entre lo que se manda a reescribir,
 * la portada acaba con un botón que no lleva a ninguna parte. Ninguno de los dos
 * da error: se ven mirando la tienda, que es tarde.
 */

export interface DraftLike {
  settings: Record<string, unknown>;
  blocks: { type: string; settings: Record<string, unknown> }[];
}

export interface DraftText {
  /** `settings.heading` o `blocks.2.settings.title`. */
  path: string;
  value: string;
}

/*
 * Los ajustes que no son texto, por lo que **son** y no por lo que parecen.
 *
 * Un `button_link` puede tener perfectamente pinta de frase —`/products/lo-que-sea`—
 * y un titular puede contener una barra. Por eso se mira la clave además del
 * valor: es lo único que distingue de verdad un destino de una frase.
 */
const NO_ES_TEXTO = [
  "link",
  "url",
  "href",
  "image",
  "img",
  "src",
  "video",
  "color",
  "handle",
  "slug",
  "icon",
  "id",
  "align",
  "size",
  "width",
  "height",
  "padding",
  "margin",
  "ratio",
  "style",
  "type",
  "position",
  "layout",
];

function esClaveDeTexto(key: string): boolean {
  const lower = key.toLowerCase();
  return !NO_ES_TEXTO.some((word) => lower === word || lower.endsWith(`_${word}`));
}

function esValorDeTexto(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const text = value.trim();
  if (!text) return false;

  // Rutas, URLs, referencias de Shopify y colores: destinos, no frases.
  if (/^(https?:\/\/|shopify:\/\/|\/|#[0-9a-f]{3,8}$)/i.test(text)) return false;

  // Un número suelto es un ajuste, no un texto.
  if (/^-?\d+([.,]\d+)?$/.test(text)) return false;

  return true;
}

/** Todo lo que se puede reescribir de una sección, en el orden en que se lee. */
export function collectDraftTexts(draft: DraftLike): DraftText[] {
  const found: DraftText[] = [];

  for (const [key, value] of Object.entries(draft.settings)) {
    if (esClaveDeTexto(key) && esValorDeTexto(value)) {
      found.push({ path: `settings.${key}`, value: value.trim() });
    }
  }

  draft.blocks.forEach((block, index) => {
    for (const [key, value] of Object.entries(block.settings)) {
      if (esClaveDeTexto(key) && esValorDeTexto(value)) {
        found.push({ path: `blocks.${index}.settings.${key}`, value: value.trim() });
      }
    }
  });

  return found;
}

/**
 * Devuelve cada texto a su sitio.
 *
 * Solo escribe donde **ya había** un texto: una ruta que no existe se ignora en
 * vez de crearla. Crear un ajuste que la sección no declara hace que Shopify
 * rechace el tema entero, y el modelo devuelve rutas inventadas de vez en cuando.
 */
export function applyDraftTexts(draft: DraftLike, texts: DraftText[]): DraftLike {
  const next: DraftLike = {
    settings: { ...draft.settings },
    blocks: draft.blocks.map((block) => ({ ...block, settings: { ...block.settings } })),
  };

  for (const { path, value } of texts) {
    if (!esValorDeTexto(value)) continue;

    const parts = path.split(".");

    if (parts.length === 2 && parts[0] === "settings") {
      const key = parts[1];
      if (esClaveDeTexto(key) && esValorDeTexto(next.settings[key])) {
        next.settings[key] = value;
      }
      continue;
    }

    if (parts.length === 4 && parts[0] === "blocks" && parts[2] === "settings") {
      const index = Number(parts[1]);
      const key = parts[3];
      const block = Number.isInteger(index) ? next.blocks[index] : undefined;

      if (block && esClaveDeTexto(key) && esValorDeTexto(block.settings[key])) {
        block.settings[key] = value;
      }
    }
  }

  return next;
}

/* ------------------------------- La plantilla --------------------------------- */

/**
 * Lo mismo, sobre lo que está **vivo** en la tienda.
 *
 * La plantilla —`templates/index.json` y sus hermanas— es lo que Shopify pinta.
 * Los borradores son la copia guardada para no volver a pagar; reescribir solo
 * los borradores no cambiaría nada de lo que ve un cliente.
 *
 * Las claves de sección y de bloque las pone Shopify y hay que respetarlas: por
 * eso la ruta las lleva dentro en vez de usar posiciones.
 */
function parseTemplate(json: string): Record<string, unknown> | null {
  try {
    const data = JSON.parse(json) as unknown;
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    /*
     * Una plantilla ilegible se deja en paz.
     *
     * Shopify escribe una cabecera de comentario que `JSON.parse` rechaza —ya
     * costó un fallo antes, y por eso existe `readTemplateJson`—. Aquí, ante la
     * duda, no tocar: una portada intacta es mejor que una a medio reescribir.
     */
    return null;
  }
}

function sectionsOf(root: Record<string, unknown> | null): Record<string, unknown> | null {
  const sections = root?.sections;
  return typeof sections === "object" && sections !== null
    ? (sections as Record<string, unknown>)
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function collectTemplateTexts(json: string): DraftText[] {
  const sections = sectionsOf(parseTemplate(json));
  if (!sections) return [];

  const found: DraftText[] = [];

  for (const [sectionId, raw] of Object.entries(sections)) {
    const section = asRecord(raw);
    if (!section) continue;

    for (const [key, value] of Object.entries(asRecord(section.settings) ?? {})) {
      if (esClaveDeTexto(key) && esValorDeTexto(value)) {
        found.push({ path: `sections.${sectionId}.settings.${key}`, value: value.trim() });
      }
    }

    for (const [blockId, rawBlock] of Object.entries(asRecord(section.blocks) ?? {})) {
      const block = asRecord(rawBlock);
      if (!block) continue;

      for (const [key, value] of Object.entries(asRecord(block.settings) ?? {})) {
        if (esClaveDeTexto(key) && esValorDeTexto(value)) {
          found.push({
            path: `sections.${sectionId}.blocks.${blockId}.settings.${key}`,
            value: value.trim(),
          });
        }
      }
    }
  }

  return found;
}

/**
 * Devuelve los textos a la plantilla y la deja lista para subir.
 *
 * Como en los borradores: solo escribe donde ya había texto. El orden de las
 * secciones y todo lo que no sea texto se quedan intactos — reescribir el copy
 * de una portada no puede reordenarla ni tirar una sección del tema.
 */
export function applyTemplateTexts(json: string, texts: DraftText[]): string {
  const root = parseTemplate(json);
  const sections = sectionsOf(root);
  if (!root || !sections) return json;

  for (const { path, value } of texts) {
    if (!esValorDeTexto(value)) continue;

    const parts = path.split(".");
    if (parts[0] !== "sections") continue;

    const section = asRecord(sections[parts[1]]);
    if (!section) continue;

    if (parts.length === 4 && parts[2] === "settings") {
      const settings = asRecord(section.settings);
      const key = parts[3];
      if (settings && esClaveDeTexto(key) && esValorDeTexto(settings[key])) settings[key] = value;
      continue;
    }

    if (parts.length === 6 && parts[2] === "blocks" && parts[4] === "settings") {
      const block = asRecord(asRecord(section.blocks)?.[parts[3]]);
      const settings = asRecord(block?.settings);
      const key = parts[5];
      if (settings && esClaveDeTexto(key) && esValorDeTexto(settings[key])) settings[key] = value;
    }
  }

  return JSON.stringify(root, null, 2);
}
