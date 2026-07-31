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
    data = JSON.parse(json);
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
  { match: /header|nav/i, kind: "cabecera" },
  { match: /main-product|featured-product|product-form|hero|banner|slideshow/i, kind: "heroe" },
  { match: /review|rating|testimonial|social-proof/i, kind: "testimonios" },
  { match: /trust|badge|logo-list|guarantee/i, kind: "garantia" },
  { match: /icon|benefit|feature|multicolumn/i, kind: "beneficios" },
  { match: /compar|table/i, kind: "comparativa" },
  { match: /faq|collapsible|accordion/i, kind: "faq" },
  { match: /price|offer|bundle|quantity-break/i, kind: "oferta" },
  { match: /how|mechanism|science|ingredient/i, kind: "mecanismo" },
  { match: /cta|call-to-action|newsletter/i, kind: "cta" },
  { match: /footer/i, kind: "pie" },
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
  "Ordena secciones y dice cuáles faltan. El contenido de cada una sale de tu producto, no de la referencia.",
  "No copia texto ni imágenes: los textos se escriben con tu investigación y las imágenes se generan con tu foto de producto.",
  "No importa código de tema. Las secciones se añaden con las que trae el tuyo.",
];
