/**
 * La estructura de una plantilla de tema, y qué cambiar para acercarla a un plano.
 *
 * Sin imports, probado en `theme-structure.test.ts`.
 *
 * ## Qué se compara
 *
 * **El orden y el tipo de las secciones**, que en un tema de Shopify 2.0 viven en
 * un JSON: `templates/product.json` declara qué secciones hay y en qué orden. Eso
 * es la estructura de la página, y es lo que se puede reproducir con el tema
 * propio: una página de producto con la oferta arriba, la comparativa en medio y
 * las preguntas al final es una disposición funcional, no una obra.
 *
 * Lo que no se toca es el contenido. El plan dice «te falta una sección de
 * comparativa antes de la oferta»; el texto y las imágenes de esa sección salen
 * del pipeline propio, del producto propio.
 */

/* ---------------------------- La plantilla real ---------------------------- */

export interface TemplateSection {
  /** La clave dentro del JSON: `main`, `rich-text-2`… */
  id: string;
  /** El tipo de sección del tema: `featured-product`, `rich-text`, `faq`… */
  type: string;
  position: number;
}

/**
 * Quita el bloque de comentario con el que Shopify encabeza sus plantillas.
 *
 * **Sus plantillas JSON no son JSON válido.** Empiezan con un comentario que el
 * propio Shopify genera —«IMPORTANT: The contents of this file are
 * auto-generated»— y `JSON.parse` se atraganta con la primera barra. El síntoma
 * era desconcertante: el archivo existía, pesaba cien kilobytes y la plataforma
 * decía que el tema no era de bloques.
 *
 * Solo se recorta lo que hay **antes de la primera llave**. Barrer comentarios
 * por todo el archivo rompería cualquier `https://` que viviera dentro de una
 * cadena, y las plantillas están llenas de enlaces.
 */
export function stripLeadingComments(json: string): string {
  const start = json.indexOf("{");
  if (start <= 0) return json;

  const head = json.slice(0, start);

  // Solo si lo de delante es de verdad un comentario y espacios. Si hay
  // cualquier otra cosa, se deja como está y que falle el parseo: cortar a
  // ciegas escondería un archivo corrupto.
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*)*$/.test(head) ? json.slice(start) : json;
}

/**
 * Lee `templates/*.json` de un tema de Shopify 2.0.
 *
 * El campo `order` es el que manda: `sections` es un objeto y el orden de las
 * claves de un objeto **no** es el orden en que se pintan. Leerlo de ahí
 * produciría una estructura que parece correcta y está desordenada.
 *
 * Devuelve lista vacía si el JSON no tiene la forma esperada, en vez de lanzar:
 * los temas viejos usan plantillas `.liquid` sin JSON, y ahí no hay nada que
 * comparar pero tampoco un error que enseñar.
 */
export function parseTemplate(json: string): TemplateSection[] {
  let data: unknown;
  try {
    data = JSON.parse(stripLeadingComments(json));
  } catch {
    return [];
  }

  if (typeof data !== "object" || data === null) return [];

  const record = data as { sections?: unknown; order?: unknown };
  const sections = record.sections;
  if (typeof sections !== "object" || sections === null) return [];

  const order = Array.isArray(record.order)
    ? record.order.filter((item): item is string => typeof item === "string")
    : Object.keys(sections);

  return order.flatMap((id, index) => {
    const section = (sections as Record<string, unknown>)[id];
    if (typeof section !== "object" || section === null) return [];

    const type = (section as { type?: unknown }).type;
    if (typeof type !== "string") return [];

    return [{ id, type, position: index }];
  });
}

/* --------------------------- De sección a papel ---------------------------- */

/**
 * A qué papel corresponde cada tipo de sección del tema.
 *
 * Los nombres varían entre temas —`featured-product`, `product-form`,
 * `main-product`— así que se reconoce por trozos del nombre. Lo que no encaja se
 * queda sin papel y aparece como «otra», que ya es información: significa que el
 * tema tiene algo que el plano no contempla.
 */
const ROLE_PATTERNS: { match: RegExp; kind: string }[] = [
  { match: /announcement/i, kind: "anuncio" },
  { match: /header|navigation/i, kind: "cabecera" },
  { match: /footer/i, kind: "pie" },

  /*
   * La comparativa va antes que el producto.
   *
   * `product-comparison` contiene «product», así que con el patrón del héroe
   * primero se llevaría todas las comparativas de producto — que son
   * precisamente las que hay que detectar.
   */
  { match: /compar|versus|vs-/i, kind: "comparativa" },

  {
    match: /main-product|featured-product|product-form|product-details|product-info|hero|banner|slideshow/i,
    kind: "heroe",
  },

  /*
   * La rejilla de productos: el cuerpo de la portada y del catálogo.
   *
   * Va antes que el héroe porque `featured-collection` contiene «featured», que
   * el patrón del héroe se llevaría.
   */
  { match: /collection|product-grid|product-list|catalog/i, kind: "catalogo" },

  { match: /review|rating|testimonial/i, kind: "testimonios" },
  /*
   * «Como se ha visto en» y las cifras son prueba social, no garantía.
   *
   * `logo-list` estaba mapeado a garantía y es un error: una fila de logotipos
   * de medios dice «hablan de nosotros», que es otra cosa que «te devolvemos el
   * dinero». Los nombres salen de temas reales.
   */
  { match: /as-seen|logo-list|logos|press|media|statistic|counter|social-proof/i, kind: "prueba-social" },
  { match: /trust|badge|guarantee|warranty|shipping-info/i, kind: "garantia" },

  { match: /faq|collapsible|accordion|question/i, kind: "faq" },
  { match: /price|offer|bundle|quantity-break|discount/i, kind: "oferta" },
  { match: /how|mechanism|science|ingredient|roadmap|steps|process|timeline/i, kind: "mecanismo" },
  { match: /icon|benefit|feature|multicolumn|store-features/i, kind: "beneficios" },

  /*
   * `sticky-add-to-cart` es una llamada a la acción, no una sección de la
   * página: flota encima. Se reconoce igualmente porque su presencia o ausencia
   * es una decisión de la página que conviene comparar.
   */
  { match: /sticky|cta|call-to-action|newsletter|add-to-cart/i, kind: "cta" },

  /*
   * Los genéricos van al final, a propósito.
   *
   * `image-with-text` y `rich-text` no dicen qué papel cumplen —dependen de lo
   * que lleven dentro— así que solo se les asigna uno si ningún patrón concreto
   * ha encajado antes. Ponerlos arriba se llevaría media página.
   */
  { match: /image-with-text|rich-text|text-columns|content/i, kind: "contenido" },
];

export function roleOf(sectionType: string): string {
  return ROLE_PATTERNS.find((entry) => entry.match.test(sectionType))?.kind ?? "otra";
}

/* --------------------------------- El plan --------------------------------- */

export type ChangeKind = "añadir" | "mover" | "quitar" | "mantener";

export interface ThemeChange {
  kind: ChangeKind;
  /** El papel de la sección: `oferta`, `comparativa`… */
  role: string;
  /** El tipo de sección del tema, cuando ya existe. */
  sectionType?: string;
  /** Dónde debería ir, contando desde uno. */
  targetPosition?: number;
  /** Dónde está ahora. */
  currentPosition?: number;
  reason: string;
}

/**
 * Qué cambiar en la plantilla para que siga el orden del plano.
 *
 * **Compara papeles, no secciones.** Da igual que el tema llame `multicolumn` a
 * lo que el otro llama `benefits`: lo que importa es que los dos cumplen el papel
 * de enumerar beneficios y en qué punto de la página lo hacen.
 *
 * Lo que sobra se marca como «quitar» **con matiz**: puede ser una sección propia
 * que funciona y que el otro no tiene, así que la razón lo dice en vez de dar por
 * hecho que estorba.
 */
export function planChanges(
  current: TemplateSection[],
  blueprint: { kind: string }[],
): ThemeChange[] {
  const changes: ThemeChange[] = [];

  const currentRoles = current.map((section) => ({
    ...section,
    role: roleOf(section.type),
  }));

  const wanted = blueprint.map((section, index) => ({ role: section.kind, position: index }));

  for (const target of wanted) {
    const found = currentRoles.find((section) => section.role === target.role);

    if (!found) {
      changes.push({
        kind: "añadir",
        role: target.role,
        targetPosition: target.position + 1,
        reason: `La referencia tiene una sección de ${target.role} en la posición ${target.position + 1} y tu tema no tiene ninguna.`,
      });
      continue;
    }

    /*
     * El desfase se mide en posiciones relativas, no absolutas.
     *
     * Las dos páginas no tienen el mismo número de secciones, así que comparar
     * «está en la 4 y debería estar en la 2» sin más marcaría casi todo como
     * movido. Solo se propone mover cuando el salto es de más de una posición.
     */
    const drift = Math.abs(found.position - target.position);

    changes.push(
      drift > 1
        ? {
            kind: "mover",
            role: target.role,
            sectionType: found.type,
            currentPosition: found.position + 1,
            targetPosition: target.position + 1,
            reason: `Tu «${found.type}» va en la posición ${found.position + 1}; en la referencia ese papel aparece en la ${target.position + 1}.`,
          }
        : {
            kind: "mantener",
            role: target.role,
            sectionType: found.type,
            currentPosition: found.position + 1,
            reason: `Ya está donde toca.`,
          },
    );
  }

  const wantedRoles = new Set(wanted.map((item) => item.role));

  for (const section of currentRoles) {
    // La cabecera y el pie no se cuestionan: están en toda tienda y no forman
    // parte de la estructura de venta que se compara.
    if (section.role === "cabecera" || section.role === "pie") continue;
    if (wantedRoles.has(section.role)) continue;

    changes.push({
      kind: "quitar",
      role: section.role,
      sectionType: section.type,
      currentPosition: section.position + 1,
      reason:
        section.role === "otra"
          ? `«${section.type}» no encaja en ningún papel conocido. Míralo: puede ser algo tuyo que funciona y que la referencia no tiene.`
          : `La referencia no usa ninguna sección de ${section.role}. No es motivo para quitarla, pero conviene saber que sobra respecto al plano.`,
    });
  }

  return changes;
}

/** Cuántos cambios de cada tipo, para el resumen. */
export function summarize(changes: ThemeChange[]): Record<ChangeKind, number> {
  const counts: Record<ChangeKind, number> = {
    añadir: 0,
    mover: 0,
    quitar: 0,
    mantener: 0,
  };

  for (const change of changes) counts[change.kind] += 1;
  return counts;
}

/**
 * Lo que el plan **no** hace, y va escrito en la interfaz.
 *
 * La diferencia entre reproducir una disposición y copiar una página es justo lo
 * que separa esto de un problema, así que se dice donde se lee, no solo aquí.
 */
export const PLAN_LIMITS = [
  "Aplica colores y tipografías, ordena secciones y **escribe las que falten**: cada una con su propio código, hecho para parecerse a la de referencia.",
  "Las imágenes quedan vacías: se ponen desde el editor o se generan con tu foto de producto.",
  "No copia texto ni imágenes: los textos se escriben con tu investigación y las imágenes se generan con tu foto de producto.",
  "No importa código de tema. Las secciones se añaden con las que trae el tuyo.",
];

/* ------------------------------- Aplicarlo --------------------------------- */

/**
 * El orden que hay que escribir, a partir del plano.
 *
 * **Cada sección se usa una sola vez.** Es la parte que falla si se resuelve con
 * un `find` por papel: una página con dos secciones de preguntas devuelve la
 * misma dos veces, y Shopify rechaza la escritura entera con «order: can't
 * contain duplicate values». Aquí se van consumiendo: la primera coincidencia se
 * gasta y la siguiente busca entre las que quedan.
 *
 * Lo que el plano no pide se conserva al final, en su orden original. Reordenar
 * no es quitar, y perder una sección por no estar en la referencia sería un
 * destrozo silencioso.
 */
export function orderFor(current: TemplateSection[], blueprint: { kind: string }[]): string[] {
  const pool = current.map((section) => ({ ...section, role: roleOf(section.type) }));
  const used = new Set<string>();
  const order: string[] = [];

  for (const target of blueprint) {
    const match = pool.find((section) => !used.has(section.id) && section.role === target.kind);
    if (!match) continue;

    used.add(match.id);
    order.push(match.id);
  }

  for (const section of pool) {
    if (!used.has(section.id)) order.push(section.id);
  }

  return order;
}


/**
 * Reordena las secciones de una plantilla **sin tocar nada más**.
 *
 * Solo se reescribe el array `order`. Los ajustes de cada sección, sus bloques y
 * su contenido quedan byte a byte como estaban: el reordenado es mecánico y no
 * tiene por qué arriesgar nada de lo que ya funciona.
 *
 * Se conserva la cabecera de comentario de Shopify. Es suya y la regenera, pero
 * quitarla haría que el diff del tema pareciera un cambio mucho mayor del que
 * es —y quien mire el historial del tema tiene que poder ver qué se tocó.
 *
 * Los identificadores que no estén en la plantilla se ignoran, y los que estén y
 * no se hayan pedido se **conservan al final**: perder una sección por no
 * haberla nombrado sería un destrozo silencioso.
 */
export function reorderTemplate(json: string, orderedIds: string[]): string | null {
  const start = json.indexOf("{");
  if (start < 0) return null;

  const header = json.slice(0, start);
  const body = json.slice(start);

  let data: { sections?: Record<string, unknown>; order?: string[] };
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }

  if (!data.sections || typeof data.sections !== "object") return null;

  const known = new Set(Object.keys(data.sections));

  /*
   * Se quitan los repetidos aquí también, aunque quien llama ya no los mande.
   *
   * Shopify rechaza la escritura entera con «order: can't contain duplicate
   * values», y el mensaje no dice cuál está repetido. La invariante es de este
   * archivo —un orden es una permutación— así que se hace cumplir aquí y no solo
   * en quien construye la lista.
   */
  const seen = new Set<string>();
  const wanted = orderedIds.filter((id) => {
    if (!known.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Lo que existe y no se nombró va detrás, en su orden original.
  const rest = (data.order ?? Object.keys(data.sections)).filter(
    (id) => known.has(id) && !wanted.includes(id),
  );

  const next = { ...data, order: [...wanted, ...rest] };

  // Dos espacios, que es como los escribe Shopify: así el diff del tema enseña
  // solo las líneas que de verdad cambiaron.
  return `${header}${JSON.stringify(next, null, 2)}`;
}
