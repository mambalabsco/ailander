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
 * ## Cada sección lleva su propio código
 *
 * El primer intento tenía siete disposiciones fijas y el modelo solo rellenaba
 * los huecos. Salían todas con el mismo aire y no se parecían a la referencia:
 * un héroe de verdad tiene el texto a un lado, la foto al otro, una fila de
 * estrellas encima del titular y un botón con forma de píldora — eso no es
 * rellenar una plantilla centrada, es otra estructura.
 *
 * Ahora el Liquid de cada sección lo escribe el modelo y lo revisa
 * `theme-liquid.ts` antes de que nada llegue al tema. Este archivo se ocupa de
 * lo que **no** debe decidir el modelo: qué papeles se crean, qué secciones
 * tuyas se protegen y en qué orden queda todo.
 *
 * **El contenido no va dentro del archivo, va en la plantilla.** Es lo que
 * permite reescribir los textos sin volver a tocar el código del tema, y lo que
 * deja que se editen desde el propio editor de Shopify como cualquier otra
 * sección.
 */

/* --------------------------- Qué se crea y qué no -------------------------- */

/**
 * Los papeles que se escriben como sección nueva.
 *
 * Lo que no está aquí no se crea, y es deliberado: la cabecera, el pie, la barra
 * de anuncio y la rejilla de productos son del tema y de la configuración de la
 * tienda. Escribir una cabecera propia dejaría dos menús en la página.
 */
export const CREATABLE = [
  "heroe",
  "cta",
  "beneficios",
  "prueba-social",
  "garantia",
  "mecanismo",
  "contenido",
  "comparativa",
  "testimonios",
  "faq",
  "oferta",
];

export function canCreate(kind: string): boolean {
  return CREATABLE.includes(kind);
}

export interface TemplateEntry {
  id: string;
  entry: Record<string, unknown>;
}

/**
 * La sección tal como va escrita en la plantilla.
 *
 * El contenido vive **aquí y no dentro del archivo Liquid**. Es lo que permite
 * editarla después desde el editor de Shopify como cualquier otra sección, y
 * reescribir los textos sin volver a tocar el código del tema.
 */
export function buildTemplateEntry(input: {
  kind: string;
  type: string;
  index: number;
  settings: Record<string, unknown>;
  blocks: { type: string; settings: Record<string, unknown> }[];
}): TemplateEntry {
  const entry: Record<string, unknown> = { type: input.type, settings: input.settings };

  if (input.blocks.length > 0) {
    const blocks: Record<string, unknown> = {};
    const order: string[] = [];

    input.blocks.slice(0, 50).forEach((block, position) => {
      const id = `b${position + 1}`;
      order.push(id);
      blocks[id] = { type: block.type, settings: block.settings };
    });

    entry.blocks = blocks;
    entry.block_order = order;
  }

  /*
   * El identificador de la sección en la plantilla es el mismo que el nombre de
   * su archivo. No hace falta que lo sea, pero mirando el JSON de la plantilla
   * se sabe qué archivo abrir sin buscarlo.
   */
  return { id: input.type, entry };
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

/**
 * Lo máximo que admite una plantilla JSON de Shopify.
 *
 * Es un límite suyo, no una elección de aquí. Al pasarse rechaza **la escritura
 * entera** con «sections: must have a maximum of 25» y no dice cuáles sobran,
 * así que sin cortar antes se pierde el trabajo de todas las secciones —ya
 * pagadas— por culpa de la vigesimosexta.
 */
export const SECTION_LIMIT = 25;

export interface RecreatePlan {
  /** Las que se crean nuevas, en su sitio. */
  create: { kind: string; purpose: string; angle: string }[];
  /** Las tuyas que se conservan, con el motivo. */
  keep: { id: string; type: string; reason: string }[];
  /** Las tuyas que salen de la página porque las sustituye una nueva. */
  retire: { id: string; type: string; replacedBy: string }[];
  /**
   * Las del plano que no caben en el tope de Shopify.
   *
   * Se apartan **antes de generarlas**: escribirlas cuesta dinero y acabarían
   * cortadas al escribir la plantilla igualmente.
   */
  overflow: { kind: string; purpose: string; angle: string }[];
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
  const creatable = blueprint.filter((section) => canCreate(section.kind));
  const createdKinds = new Set(creatable.map((section) => section.kind));

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

  /*
   * Lo que no va a caber se aparta **aquí**, antes de generar nada.
   *
   * Shopify no admite más de veinticinco secciones por plantilla, y cada una que
   * se genera cuesta. Cortarlas al escribir dejaría pagadas seis secciones que
   * se tiran; cortarlas aquí las deja sin pedir y el plan lo dice antes de
   * empezar, que es cuando todavía se puede decidir otra cosa.
   *
   * Se cortan por el final por lo mismo que al escribir: una página se lee de
   * arriba abajo.
   */
  const room = Math.max(0, SECTION_LIMIT - keep.length);
  const create = creatable.slice(0, room);
  const overflow = creatable.slice(room);

  return { create, keep, retire, overflow };
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

/* ------------------------------- El tope de 25 ----------------------------- */

export interface CapResult {
  order: string[];
  /** Las que se quedaron fuera, en el orden en que se descartaron. */
  dropped: { id: string; type: string }[];
}

/**
 * Recorta el orden al tope, **por el final y sin tocar lo imprescindible**.
 *
 * Por el final porque una página se lee de arriba abajo: lo de abajo es lo que
 * menos gente ve, y si algo tiene que caer es eso. Cortar por el principio
 * dejaría fuera el héroe, que es lo único que se ve seguro.
 *
 * Y lo imprescindible se salva aunque esté al final: un pie en la posición
 * treinta se conserva y cae la sección de relleno que tenía delante.
 */
export function capSections(
  order: string[],
  typeOf: (id: string) => string,
  limit = SECTION_LIMIT,
): CapResult {
  if (order.length <= limit) return { order, dropped: [] };

  const keep = new Set<string>();
  const droppable: string[] = [];

  for (const id of order) {
    if (mustKeep(typeOf(id))) keep.add(id);
    else droppable.push(id);
  }

  /*
   * Si lo imprescindible ya no cabe, no se recorta más.
   *
   * Preferimos que Shopify rechace la escritura a entregar una página sin
   * formulario de compra: lo primero se ve y se arregla, lo segundo es una
   * tienda que no vende y nadie lo nota.
   */
  const room = Math.max(0, limit - keep.size);

  // Se conservan las primeras que quepan y cae el resto: por el final.
  const dropped = new Set(droppable.slice(room));

  return {
    order: order.filter((id) => !dropped.has(id)),
    dropped: order
      .filter((id) => dropped.has(id))
      .map((id) => ({ id, type: typeOf(id) })),
  };
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
export interface WriteResult {
  json: string;
  /** Las que no cupieron en el tope de Shopify. Se cuentan, no se callan. */
  dropped: { id: string; type: string }[];
}

export function writeTemplate(
  json: string,
  additions: TemplateEntry[],
  order: string[],
): WriteResult | null {
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

  /*
   * El tope de Shopify se aplica **aquí**, antes de escribir.
   *
   * Pasarse rechaza la escritura entera con «sections: must have a maximum of
   * 25» sin decir cuáles sobran, así que se perdería el trabajo de todas —ya
   * pagado— por culpa de la vigesimosexta.
   */
  const typeOf = (id: string) => {
    const entry = next[id];
    return typeof entry === "object" && entry !== null
      ? String((entry as Record<string, unknown>).type ?? "")
      : "";
  };

  const capped = capSections(finalOrder, typeOf);

  // Las que no entran se quitan también de `sections`: dejarlas ahí sin estar en
  // `order` cuenta igual para el límite y Shopify rechaza lo mismo.
  for (const item of capped.dropped) delete next[item.id];

  root.sections = next;
  root.order = capped.order;

  return { json: `${JSON.stringify(root, null, 2)}\n`, dropped: capped.dropped };
}

/**
 * Deja vacías las direcciones de las imágenes de maqueta.
 *
 * Solo en las secciones creadas desde aquí —las que empiezan por `lp-`— y solo
 * en los ajustes acabados en `_url`. Una imagen elegida en el editor de Shopify
 * vive en el ajuste del selector, que es otro, y no se toca: la idea es quitar
 * lo prestado sin deshacer lo que alguien haya puesto a mano.
 */
export function clearDemoImages(json: string): { cleared: number; json: string | null } {
  let data: unknown;
  try {
    data = JSON.parse(stripLeadingComments(json));
  } catch {
    return { cleared: 0, json: null };
  }

  if (typeof data !== "object" || data === null) return { cleared: 0, json: null };

  const root = data as Record<string, unknown>;
  const sections = root.sections;
  if (typeof sections !== "object" || sections === null) return { cleared: 0, json: null };

  let cleared = 0;

  const blank = (settings: unknown) => {
    if (typeof settings !== "object" || settings === null) return;

    for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
      if (key.endsWith("_url") && typeof value === "string" && value.trim() !== "") {
        (settings as Record<string, unknown>)[key] = "";
        cleared += 1;
      }
    }
  };

  for (const [id, section] of Object.entries(sections as Record<string, unknown>)) {
    if (!id.startsWith("lp-")) continue;
    if (typeof section !== "object" || section === null) continue;

    const entry = section as Record<string, unknown>;
    blank(entry.settings);

    const blocks = entry.blocks;
    if (typeof blocks === "object" && blocks !== null) {
      for (const block of Object.values(blocks as Record<string, unknown>)) {
        if (typeof block === "object" && block !== null) {
          blank((block as Record<string, unknown>).settings);
        }
      }
    }
  }

  return { cleared, json: cleared > 0 ? `${JSON.stringify(root, null, 2)}\n` : json };
}
