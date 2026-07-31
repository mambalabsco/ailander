import { roleOf, stripLeadingComments, type TemplateSection } from "./theme-structure.ts";

/**
 * Crear en tu tema las secciones que le faltan.
 *
 * Probado en `theme-sections.test.ts`.
 *
 * ## Por qué hay que escribir secciones nuevas y no reutilizar las tuyas
 *
 * Una plantilla de Shopify solo puede nombrar secciones que **existan** en el
 * tema: `templates/product.json` dice `"type": "store-faq"` y Shopify busca
 * `sections/store-faq.liquid`. Si tu tema no trae una comparativa, no hay forma
 * de ponerla reordenando: no existe el archivo. Por eso reordenar se quedaba
 * corto — colocaba bien lo que ya tenías y no podía añadir nada.
 *
 * Así que se escriben. Son **secciones propias**, con su Liquid y su esquema,
 * escritas aquí: no se copia código del tema de nadie. Van con el prefijo `lp-`
 * para no pisar nunca una del tema.
 *
 * ## Siete disposiciones, no una por sección
 *
 * Una comparativa es una tabla, unas preguntas son un acordeón y unos beneficios
 * son una rejilla. Trece tipos de sección se resuelven con siete disposiciones, y
 * cada una es un archivo que no cambia nunca.
 *
 * **El contenido no va dentro del archivo, va en la plantilla.** Es lo que
 * permite reescribir los textos sin volver a tocar el código del tema, y lo que
 * deja que se editen desde el propio editor de Shopify como cualquier otra
 * sección. Los archivos se escriben una vez; los textos, las veces que haga falta.
 *
 * ## Los colores van en cada sección
 *
 * Podrían heredarse del tema con sus variables CSS, pero cada tema las llama de
 * una forma y una sección que hereda mal se ve rota. Llevando los suyos —los que
 * se leyeron de la tienda de referencia— se ve igual en cualquier tema, y se
 * pueden cambiar después desde el editor.
 */

/* ------------------------------ Disposiciones ------------------------------ */

export const LAYOUTS = ["heroe", "texto", "iconos", "tabla", "citas", "acordeon", "oferta"] as const;

export type Layout = (typeof LAYOUTS)[number];

/**
 * Qué disposición le toca a cada papel.
 *
 * Lo que no está aquí no se crea, y es deliberado: la cabecera, el pie, el
 * anuncio y la rejilla de productos son del tema y de la configuración de la
 * tienda. Escribir una cabecera propia dejaría dos menús en la página.
 */
export const LAYOUT_FOR: Record<string, Layout> = {
  heroe: "heroe",
  cta: "heroe",
  beneficios: "iconos",
  "prueba-social": "iconos",
  garantia: "iconos",
  mecanismo: "texto",
  contenido: "texto",
  comparativa: "tabla",
  testimonios: "citas",
  faq: "acordeon",
  oferta: "oferta",
};

/** Si ese papel se puede crear, o es cosa del tema. */
export function canCreate(kind: string): boolean {
  return kind in LAYOUT_FOR;
}

export function layoutType(layout: Layout): string {
  return `lp-${layout}`;
}

export function layoutFilename(layout: Layout): string {
  return `sections/${layoutType(layout)}.liquid`;
}

/* -------------------------------- El contenido ----------------------------- */

export interface SectionItem {
  title: string;
  body: string;
  /** La otra columna, solo en la comparativa. */
  other?: string;
  /** El precio y su tachado, solo en la oferta. */
  price?: string;
  compareAt?: string;
  highlighted?: boolean;
}

export interface SectionContent {
  /** El papel del plano: `comparativa`, `faq`… */
  kind: string;
  heading: string;
  subheading: string;
  /** El cuerpo, para las de texto. */
  body: string;
  items: SectionItem[];
  /** Las cabeceras de las dos columnas de la comparativa. */
  columns?: { mine: string; theirs: string };
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface Palette {
  background: string;
  text: string;
  accent: string;
}

/* ---------------------------- El archivo Liquid ---------------------------- */

const COMMON_SETTINGS = [
  { type: "text", id: "heading", label: "Título" },
  { type: "text", id: "subheading", label: "Subtítulo" },
  { type: "color", id: "bg", label: "Fondo", default: "#ffffff" },
  { type: "color", id: "fg", label: "Texto", default: "#121212" },
  { type: "color", id: "accent", label: "Acento", default: "#121212" },
  {
    type: "range",
    id: "padding",
    label: "Espacio arriba y abajo",
    min: 0,
    max: 120,
    step: 8,
    unit: "px",
    default: 56,
  },
];

/**
 * El CSS común, encerrado en el identificador de la sección.
 *
 * Va dentro de cada sección y no en una hoja aparte porque una sección de
 * Shopify tiene que poder instalarse sola: si el estilo viviera en un archivo
 * suelto y alguien borrara la sección, quedaría el CSS huérfano — y al revés,
 * una sección sin su hoja se ve rota.
 */
function styles(): string {
  return `<style>
  #shopify-section-{{ section.id }} .lp {
    background: {{ section.settings.bg }};
    color: {{ section.settings.fg }};
    padding: {{ section.settings.padding }}px 20px;
  }
  #shopify-section-{{ section.id }} .lp-in { max-width: 1100px; margin: 0 auto; }
  #shopify-section-{{ section.id }} .lp-h {
    font-size: clamp(1.6rem, 4vw, 2.4rem);
    line-height: 1.15;
    margin: 0 0 8px;
    text-align: center;
  }
  #shopify-section-{{ section.id }} .lp-sub {
    margin: 0 auto 28px;
    max-width: 60ch;
    text-align: center;
    opacity: .8;
  }
  #shopify-section-{{ section.id }} .lp-cta {
    display: inline-block;
    margin-top: 20px;
    padding: 14px 28px;
    border-radius: 6px;
    background: {{ section.settings.accent }};
    color: {{ section.settings.bg }};
    text-decoration: none;
    font-weight: 600;
  }
</style>`;
}

const HEAD = `<div class="lp"><div class="lp-in">
  {% if section.settings.heading != blank %}<h2 class="lp-h">{{ section.settings.heading }}</h2>{% endif %}
  {% if section.settings.subheading != blank %}<p class="lp-sub">{{ section.settings.subheading }}</p>{% endif %}`;

const FOOT = `</div></div>`;

interface LayoutSpec {
  name: string;
  markup: string;
  css: string;
  blockSettings: { type: string; id: string; label: string; default?: unknown }[];
  sectionSettings?: { type: string; id: string; label: string; default?: unknown }[];
  /** Si no lleva bloques repetidos. */
  blocks: boolean;
}

const SPECS: Record<Layout, LayoutSpec> = {
  heroe: {
    name: "Héroe",
    blocks: false,
    blockSettings: [],
    sectionSettings: [
      { type: "text", id: "cta_label", label: "Texto del botón" },
      { type: "url", id: "cta_url", label: "Enlace del botón" },
      { type: "image_picker", id: "image", label: "Imagen" },
    ],
    css: `#shopify-section-{{ section.id }} .lp-hero { text-align: center; }
  #shopify-section-{{ section.id }} .lp-hero img { max-width: 100%; height: auto; border-radius: 10px; margin-top: 24px; }`,
    markup: `<div class="lp-hero">
    {% if section.settings.cta_label != blank %}
      <a class="lp-cta" href="{{ section.settings.cta_url | default: '#' }}">{{ section.settings.cta_label }}</a>
    {% endif %}
    {% if section.settings.image %}
      <img src="{{ section.settings.image | image_url: width: 1200 }}" alt="{{ section.settings.heading | escape }}" loading="lazy" width="1200" height="800">
    {% endif %}
  </div>`,
  },

  texto: {
    name: "Texto",
    blocks: false,
    blockSettings: [],
    sectionSettings: [{ type: "richtext", id: "body", label: "Texto" }],
    css: `#shopify-section-{{ section.id }} .lp-text {
    max-width: 68ch; margin: 0 auto; line-height: 1.7; font-size: 1.05rem;
  }`,
    markup: `<div class="lp-text">{{ section.settings.body }}</div>`,
  },

  iconos: {
    name: "Rejilla",
    blocks: true,
    blockSettings: [
      { type: "text", id: "title", label: "Título" },
      { type: "textarea", id: "body", label: "Texto" },
    ],
    css: `#shopify-section-{{ section.id }} .lp-grid {
    display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  }
  #shopify-section-{{ section.id }} .lp-card {
    border: 1px solid {{ section.settings.fg }}22; border-radius: 10px; padding: 20px;
  }
  #shopify-section-{{ section.id }} .lp-card h3 { margin: 0 0 6px; font-size: 1.05rem; }
  #shopify-section-{{ section.id }} .lp-card p { margin: 0; opacity: .85; line-height: 1.6; }`,
    markup: `<div class="lp-grid">
    {% for block in section.blocks %}
      <div class="lp-card" {{ block.shopify_attributes }}>
        <h3>{{ block.settings.title }}</h3>
        <p>{{ block.settings.body }}</p>
      </div>
    {% endfor %}
  </div>`,
  },

  tabla: {
    name: "Comparativa",
    blocks: true,
    blockSettings: [
      { type: "text", id: "title", label: "Fila" },
      { type: "text", id: "body", label: "Nosotros" },
      { type: "text", id: "other", label: "Los demás" },
    ],
    sectionSettings: [
      { type: "text", id: "col_mine", label: "Columna propia", default: "Nosotros" },
      { type: "text", id: "col_theirs", label: "Columna ajena", default: "Los demás" },
    ],
    css: `#shopify-section-{{ section.id }} .lp-tw { overflow-x: auto; }
  #shopify-section-{{ section.id }} table { width: 100%; border-collapse: collapse; min-width: 480px; }
  #shopify-section-{{ section.id }} th, #shopify-section-{{ section.id }} td {
    padding: 14px 12px; text-align: left; border-bottom: 1px solid {{ section.settings.fg }}22;
  }
  #shopify-section-{{ section.id }} .lp-mine { background: {{ section.settings.accent }}14; font-weight: 600; }`,
    markup: `<div class="lp-tw"><table>
    <thead><tr>
      <th></th>
      <th class="lp-mine">{{ section.settings.col_mine }}</th>
      <th>{{ section.settings.col_theirs }}</th>
    </tr></thead>
    <tbody>
      {% for block in section.blocks %}
        <tr {{ block.shopify_attributes }}>
          <td>{{ block.settings.title }}</td>
          <td class="lp-mine">{{ block.settings.body }}</td>
          <td>{{ block.settings.other }}</td>
        </tr>
      {% endfor %}
    </tbody>
  </table></div>`,
  },

  citas: {
    name: "Testimonios",
    blocks: true,
    blockSettings: [
      { type: "textarea", id: "body", label: "Testimonio" },
      { type: "text", id: "title", label: "Quién lo dice" },
    ],
    css: `#shopify-section-{{ section.id }} .lp-grid {
    display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
  #shopify-section-{{ section.id }} figure {
    margin: 0; padding: 22px; border-radius: 10px; background: {{ section.settings.fg }}0d;
  }
  #shopify-section-{{ section.id }} blockquote { margin: 0 0 12px; line-height: 1.6; }
  #shopify-section-{{ section.id }} figcaption { font-weight: 600; font-size: .92rem; }`,
    markup: `<div class="lp-grid">
    {% for block in section.blocks %}
      <figure {{ block.shopify_attributes }}>
        <blockquote>{{ block.settings.body }}</blockquote>
        <figcaption>{{ block.settings.title }}</figcaption>
      </figure>
    {% endfor %}
  </div>`,
  },

  acordeon: {
    name: "Preguntas",
    blocks: true,
    blockSettings: [
      { type: "text", id: "title", label: "Pregunta" },
      { type: "textarea", id: "body", label: "Respuesta" },
    ],
    css: `#shopify-section-{{ section.id }} .lp-faq { max-width: 760px; margin: 0 auto; }
  #shopify-section-{{ section.id }} details {
    border-bottom: 1px solid {{ section.settings.fg }}22; padding: 16px 0;
  }
  #shopify-section-{{ section.id }} summary {
    cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 16px;
  }
  #shopify-section-{{ section.id }} summary::after { content: "+"; }
  #shopify-section-{{ section.id }} details[open] summary::after { content: "\\2212"; }
  #shopify-section-{{ section.id }} details p { margin: 12px 0 0; line-height: 1.65; opacity: .85; }`,
    markup: `<div class="lp-faq">
    {% for block in section.blocks %}
      <details {{ block.shopify_attributes }}>
        <summary>{{ block.settings.title }}</summary>
        <p>{{ block.settings.body }}</p>
      </details>
    {% endfor %}
  </div>`,
  },

  oferta: {
    name: "Oferta",
    blocks: true,
    blockSettings: [
      { type: "text", id: "title", label: "Pack" },
      { type: "text", id: "price", label: "Precio" },
      { type: "text", id: "compare_at", label: "Precio tachado" },
      { type: "text", id: "body", label: "Nota" },
      { type: "checkbox", id: "highlighted", label: "Destacado", default: false },
      { type: "url", id: "url", label: "Enlace" },
    ],
    css: `#shopify-section-{{ section.id }} .lp-grid {
    display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  #shopify-section-{{ section.id }} .lp-tier {
    border: 2px solid {{ section.settings.fg }}22; border-radius: 12px; padding: 24px; text-align: center;
  }
  #shopify-section-{{ section.id }} .lp-tier.is-on { border-color: {{ section.settings.accent }}; }
  #shopify-section-{{ section.id }} .lp-price { font-size: 1.8rem; font-weight: 700; margin: 8px 0 0; }
  #shopify-section-{{ section.id }} .lp-was { opacity: .6; text-decoration: line-through; margin: 0; }
  #shopify-section-{{ section.id }} .lp-note { opacity: .8; margin: 8px 0 0; font-size: .9rem; }`,
    markup: `<div class="lp-grid">
    {% for block in section.blocks %}
      <div class="lp-tier{% if block.settings.highlighted %} is-on{% endif %}" {{ block.shopify_attributes }}>
        <strong>{{ block.settings.title }}</strong>
        {% if block.settings.compare_at != blank %}<p class="lp-was">{{ block.settings.compare_at }}</p>{% endif %}
        <p class="lp-price">{{ block.settings.price }}</p>
        {% if block.settings.body != blank %}<p class="lp-note">{{ block.settings.body }}</p>{% endif %}
        {% if block.settings.url != blank %}<a class="lp-cta" href="{{ block.settings.url }}">Lo quiero</a>{% endif %}
      </div>
    {% endfor %}
  </div>`,
  },
};

/**
 * El archivo de una disposición: Liquid, estilo y esquema.
 *
 * El esquema se serializa con `JSON.stringify` y no se escribe a mano. Shopify
 * rechaza el archivo entero si ese bloque no es JSON válido, y una coma de más
 * escrita a mano deja la sección sin aparecer en el editor sin decir por qué.
 */
export function buildLayoutFile(layout: Layout): string {
  const spec = SPECS[layout];

  const schema = {
    name: spec.name,
    tag: "section",
    settings: [...COMMON_SETTINGS, ...(spec.sectionSettings ?? [])],
    ...(spec.blocks
      ? {
          blocks: [{ type: "item", name: "Elemento", settings: spec.blockSettings }],
          max_blocks: 24,
        }
      : {}),
    presets: [{ name: spec.name }],
  };

  return `{% comment %}
  Sección generada por la plataforma. Se puede editar desde el editor de temas
  como cualquier otra: los textos viven en la plantilla, no aquí.
{% endcomment %}
${styles().replace("</style>", `  ${spec.css}\n</style>`)}

${HEAD}
  ${spec.markup}
${FOOT}

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}

/** Los archivos que hay que escribir para las disposiciones que se usen. */
export function filesFor(kinds: string[]): { filename: string; content: string }[] {
  const layouts = new Set(
    kinds.filter(canCreate).map((kind) => LAYOUT_FOR[kind]),
  );

  return [...layouts].map((layout) => ({
    filename: layoutFilename(layout),
    content: buildLayoutFile(layout),
  }));
}

/* --------------------------- La entrada de plantilla ----------------------- */

export interface TemplateEntry {
  id: string;
  entry: Record<string, unknown>;
}

/**
 * La sección tal como va escrita en la plantilla, con su contenido.
 *
 * El identificador lleva el papel y un número: `lp-faq-1`. Se ve en el editor de
 * Shopify y en el JSON, así que decir qué es ahorra abrir la sección para
 * averiguarlo.
 */
export function buildTemplateEntry(
  content: SectionContent,
  palette: Palette,
  index: number,
): TemplateEntry | null {
  const layout = LAYOUT_FOR[content.kind];
  if (!layout) return null;

  const spec = SPECS[layout];

  const settings: Record<string, unknown> = {
    heading: content.heading,
    subheading: content.subheading,
    bg: palette.background,
    fg: palette.text,
    accent: palette.accent,
    padding: 56,
  };

  if (layout === "texto") {
    // `richtext` de Shopify solo admite unas pocas etiquetas, y un texto suelto
    // sin envolver se guarda pero no se puede editar después desde el editor.
    settings.body = wrapRichText(content.body);
  }

  if (layout === "heroe") {
    settings.cta_label = content.ctaLabel ?? "";
    settings.cta_url = content.ctaUrl ?? "";
  }

  if (layout === "tabla") {
    settings.col_mine = content.columns?.mine ?? "Nosotros";
    settings.col_theirs = content.columns?.theirs ?? "Los demás";
  }

  const result: Record<string, unknown> = { type: layoutType(layout), settings };

  if (spec.blocks) {
    const blocks: Record<string, unknown> = {};
    const order: string[] = [];

    content.items.slice(0, 24).forEach((item, position) => {
      const id = `b${position + 1}`;
      order.push(id);

      const blockSettings: Record<string, unknown> = { title: item.title, body: item.body };
      if (layout === "tabla") blockSettings.other = item.other ?? "";
      if (layout === "oferta") {
        blockSettings.price = item.price ?? "";
        blockSettings.compare_at = item.compareAt ?? "";
        blockSettings.highlighted = item.highlighted === true;
      }

      blocks[id] = { type: "item", settings: blockSettings };
    });

    result.blocks = blocks;
    result.block_order = order;
  }

  return { id: `lp-${content.kind}-${index + 1}`, entry: result };
}

/** Envuelve en párrafos lo que no venga ya como HTML. */
export function wrapRichText(body: string): string {
  const text = body.trim();
  if (!text) return "";
  if (/^</.test(text)) return text;

  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.trim().replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/* ------------------------------ El plan de recreado ------------------------ */

/**
 * Las secciones del tema que no se tocan nunca.
 *
 * `main-*` es la sección principal de la plantilla: en la ficha de producto es
 * **el formulario de compra**. Quitarla deja una página preciosa donde no se
 * puede comprar, y eso no se nota mirando: se nota en las ventas del día
 * siguiente. La cabecera, el pie y la barra de anuncio son del tema y de la
 * configuración de la tienda.
 */
export function mustKeep(type: string): boolean {
  if (/^main-/.test(type)) return true;

  return ["cabecera", "pie", "anuncio"].includes(roleOf(type));
}

export interface RecreatePlan {
  /** Las que se crean nuevas, en su sitio. */
  create: { kind: string; purpose: string; angle: string }[];
  /** Las tuyas que se conservan, con el motivo. */
  keep: { id: string; type: string; reason: string }[];
  /** Las tuyas que salen de la página porque las sustituye una nueva. */
  retire: { id: string; type: string; replacedBy: string }[];
}

/**
 * Qué hacer con cada sección para que la página quede como la de referencia.
 *
 * La regla es que **manda el plano**, salvo en lo que hace funcionar la tienda.
 * Si el plano pide una comparativa y tú ya tienes una, se crea la nueva y la
 * tuya se retira: dejar las dos deja la página diciendo lo mismo dos veces, que
 * es peor que cualquiera de las dos versiones por separado.
 *
 * Retirar es sacarla del orden, no borrarla. El archivo del tema sigue ahí y sus
 * ajustes también: volver a ponerla es arrastrarla en el editor.
 */
export function planRecreate(
  current: TemplateSection[],
  blueprint: { kind: string; purpose: string; angle: string }[],
): RecreatePlan {
  const create = blueprint.filter((section) => canCreate(section.kind));
  const createdKinds = new Set(create.map((section) => section.kind));

  const keep: RecreatePlan["keep"] = [];
  const retire: RecreatePlan["retire"] = [];

  for (const section of current) {
    if (mustKeep(section.type)) {
      keep.push({
        id: section.id,
        type: section.type,
        reason: /^main-/.test(section.type)
          ? "Es la sección principal de la plantilla: sin ella no se puede comprar."
          : "La cabecera, el pie y el anuncio son del tema.",
      });
      continue;
    }

    const role = roleOf(section.type);

    if (createdKinds.has(role)) {
      retire.push({ id: section.id, type: section.type, replacedBy: role });
      continue;
    }

    keep.push({
      id: section.id,
      type: section.type,
      reason: "El plano no pide nada en su lugar, así que se queda donde estaba.",
    });
  }

  return { create, keep, retire };
}

/**
 * El orden final: el del plano, con lo que se conserva intercalado.
 *
 * La sección principal va **después del héroe** cuando lo hay. Es donde la pone
 * cualquier ficha que convierta: primero se cuenta por qué, y el botón de compra
 * llega cuando ya hay motivo. Ponerla la primera es lo que hace por defecto un
 * tema, no una decisión de venta.
 */
export function orderAfterRecreate(
  plan: RecreatePlan,
  created: TemplateEntry[],
  current: TemplateSection[],
): string[] {
  const order: string[] = [];
  const kept = new Map(plan.keep.map((section) => [section.id, section]));

  const first = (test: (type: string) => boolean) =>
    current.find((section) => kept.has(section.id) && test(section.type))?.id;

  const header = first((type) => ["cabecera", "anuncio"].includes(roleOf(type)));
  const main = first((type) => /^main-/.test(type));
  const footer = first((type) => roleOf(type) === "pie");

  if (header) order.push(header);

  created.forEach((section, index) => {
    order.push(section.id);
    // Justo detrás del primer bloque creado, que es el héroe cuando lo hay.
    if (index === 0 && main) order.push(main);
  });

  // Sin nada creado, la principal va igualmente antes que el resto.
  if (main && !order.includes(main)) order.push(main);

  for (const section of current) {
    if (kept.has(section.id) && !order.includes(section.id) && section.id !== footer) {
      order.push(section.id);
    }
  }

  if (footer) order.push(footer);

  return order;
}

/* ---------------------------- Escribir la plantilla ------------------------ */

/**
 * Mete las secciones nuevas en la plantilla, en el orden del plano.
 *
 * **Lo que ya había se conserva**, salvo que se pida quitarlo. Una plantilla de
 * producto lleva la sección principal —el formulario de compra— y perderla
 * dejaría una página que no vende.
 *
 * El orden se recorre sin repetir: una sección solo puede aparecer una vez, y
 * Shopify rechaza la escritura entera si aparece dos —sin decir cuál—.
 */
export function writeTemplate(
  json: string,
  additions: TemplateEntry[],
  order: string[],
): string | null {
  let data: unknown;
  try {
    data = JSON.parse(stripLeadingComments(json));
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) return null;

  const root = data as Record<string, unknown>;
  const sections = root.sections;
  if (typeof sections !== "object" || sections === null) return null;

  const next = { ...(sections as Record<string, unknown>) };
  for (const addition of additions) next[addition.id] = addition.entry;

  const seen = new Set<string>();
  const finalOrder: string[] = [];

  for (const id of order) {
    if (!(id in next) || seen.has(id)) continue;
    seen.add(id);
    finalOrder.push(id);
  }

  // Lo que no venga en el orden pedido se conserva al final, no se pierde.
  for (const id of Object.keys(next)) if (!seen.has(id)) finalOrder.push(id);

  root.sections = next;
  root.order = finalOrder;

  return `${JSON.stringify(root, null, 2)}\n`;
}
