/**
 * Análisis de una tienda ajena: el plano, no la copia.
 *
 * Sin imports, probado en `store-blueprint.test.ts`.
 *
 * ## La distinción que ordena este archivo
 *
 * Mirar una tienda de la competencia y entender **cómo está construida** es
 * investigación normal: qué secciones tiene y en qué orden, cómo estructura la
 * oferta, a qué precios, qué garantía da, qué ángulo usa el titular, qué scripts
 * carga. De ahí sale un plano con el que construir lo tuyo.
 *
 * Descargar sus fotos y sus textos para reetiquetarlos con otra marca es otra
 * cosa. Las fotos de producto y los textos son obra de quien los hizo, y
 * traducirlos no los convierte en propios —una traducción es obra derivada—. Por
 * eso este archivo extrae **estructura y medidas**, no activos.
 *
 * Además, en la práctica, la copia rinde peor: el contenido duplicado posiciona
 * mal y, sobre todo, el texto habla del mecanismo de **otro** producto. Un plano
 * más el pipeline propio —investigación, ángulos, copy, imágenes— produce algo
 * que convierte mejor porque habla del tuyo.
 */

/* ------------------------------- Lo que sale ------------------------------- */

export const SECTION_KINDS = [
  "anuncio",
  "cabecera",
  "heroe",
  // La rejilla de productos: es el cuerpo de la portada y del catálogo.
  "catalogo",
  "prueba-social",
  "beneficios",
  "mecanismo",
  "comparativa",
  "testimonios",
  "oferta",
  "garantia",
  "faq",
  "cta",
  // Un bloque de texto o de texto con imagen del que no se deduce el papel.
  "contenido",
  "pie",
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

/** Las páginas que se analizan y para las que se puede planificar un orden. */
export const PAGE_KINDS = ["home", "catalogo", "producto"] as const;

export type PageKind = (typeof PAGE_KINDS)[number];

/** La plantilla del tema que corresponde a cada página. */
export const TEMPLATE_FOR: Record<PageKind, string> = {
  home: "templates/index.json",
  catalogo: "templates/collection.json",
  producto: "templates/product.json",
};

export interface BlueprintSection {
  /**
   * En qué página está.
   *
   * Los análisis anteriores no lo traen y se leen como `producto`, que es lo
   * único que se analizaba entonces: así siguen sirviendo para la ficha en vez
   * de quedar repartidos entre tres páginas al azar.
   */
  page: PageKind;
  kind: SectionKind;
  /** Qué hace esa sección en la página, en una frase. */
  purpose: string;
  /** El ángulo o la promesa que usa, descrito — no su texto literal. */
  angle: string;
  /** Cuántas imágenes lleva y de qué tipo. Para saber cuántas generar. */
  images: number;
}

export interface OfferTier {
  quantity: number;
  price: number;
  compareAt: number | null;
  /** Si es el que la página empuja. */
  highlighted: boolean;
}

export interface VisualIdentitySummary {
  colors: { hex: string; uses: number; role: string }[];
  fonts: { family: string; handle: string | null }[];
  buttonRadius: string | null;
}

export interface Blueprint {
  url: string;
  /** Cómo se llama la tienda. Solo para poder decir de quién es el análisis. */
  storeName: string;
  currency: string;
  sections: BlueprintSection[];
  offers: OfferTier[];
  guarantee: string;
  /** Los scripts que carga, para saber con qué juega. */
  scripts: DetectedScript[];
  /** Los colores y las tipografías, para poder adaptar el tema propio. */
  identity: VisualIdentitySummary;
}

/* ------------------------------ Los scripts -------------------------------- */

export type ScriptKind = "pixel" | "chat" | "reseñas" | "animacion" | "upsell" | "otro";

export interface DetectedScript {
  kind: ScriptKind;
  name: string;
  /** De dónde se carga. */
  host: string;
  /** Si se puede usar en la tienda propia o hay que dejarlo fuera. */
  importable: boolean;
  note: string;
}

/**
 * Servicios que se reconocen por el dominio desde el que cargan.
 *
 * La lista no pretende ser completa: cubre lo que se encuentra de verdad en una
 * tienda de suplementos. Lo que no encaja sale como «otro» con su dominio, que
 * ya es información útil.
 */
const KNOWN: { match: RegExp; kind: ScriptKind; name: string }[] = [
  { match: /connect\.facebook\.net|facebook\.com\/tr/i, kind: "pixel", name: "Meta Pixel" },
  { match: /googletagmanager\.com|google-analytics\.com/i, kind: "pixel", name: "Google Tag Manager" },
  { match: /analytics\.tiktok\.com/i, kind: "pixel", name: "TikTok Pixel" },
  { match: /snap\.licdn\.com|px\.ads\.linkedin/i, kind: "pixel", name: "LinkedIn Insight" },
  { match: /sc-static\.net|snapchat/i, kind: "pixel", name: "Snap Pixel" },
  { match: /clarity\.ms|hotjar|fullstory|mouseflow/i, kind: "pixel", name: "Mapas de calor" },
  { match: /klaviyo/i, kind: "pixel", name: "Klaviyo" },
  { match: /tidio|crisp\.chat|intercom|zendesk|tawk\.to/i, kind: "chat", name: "Chat" },
  { match: /judge\.me|loox|stamped\.io|yotpo|okendo/i, kind: "reseñas", name: "Reseñas" },
  { match: /gsap|greensock|aos\.js|animate\.css|lottie|framer-motion/i, kind: "animacion", name: "Animación" },
  { match: /rebuy|zipify|reconvert|honeycomb|aftersell/i, kind: "upsell", name: "Upsell" },
];

/**
 * Qué scripts carga la página y cuáles se pueden usar.
 *
 * **Los pixeles nunca son importables, y esa es la regla dura.** Un pixel lleva
 * dentro el identificador de la cuenta de otro: copiarlo mandaría los eventos de
 * tus clientes a su panel de anuncios, y de paso les diría exactamente qué estás
 * vendiendo y cuánto. No es solo que esté mal, es que te delata.
 *
 * Las librerías de animación sí: son bibliotecas públicas con su propia licencia
 * y no llevan la cuenta de nadie. Lo que se importa es «esta tienda usa una
 * librería de animación al hacer scroll», no su código.
 */
export function classifyScripts(urls: string[]): DetectedScript[] {
  const found = new Map<string, DetectedScript>();

  for (const url of urls) {
    const host = hostOf(url);
    if (!host) continue;

    const known = KNOWN.find((entry) => entry.match.test(url));

    const kind: ScriptKind = known?.kind ?? "otro";
    const name = known?.name ?? host;

    // Un pixel nunca se importa. Los demás sí, con su matiz.
    const importable = kind !== "pixel";

    const note =
      kind === "pixel"
        ? "Lleva dentro el identificador de su cuenta. Copiarlo mandaría los eventos de tus clientes a su panel de anuncios."
        : kind === "animacion"
          ? "Librería pública: se puede usar la misma en tu tienda, con su propia licencia."
          : kind === "otro"
            ? "Sin identificar. Míralo antes de decidir."
            : "Es una app de Shopify: instálala en tu tienda en vez de copiar su código.";

    // Por nombre y no por URL: una tienda carga el mismo pixel desde tres sitios.
    if (!found.has(name)) found.set(name, { kind, name, host, importable, note });
  }

  return [...found.values()].sort((a, b) => a.kind.localeCompare(b.kind));
}

/**
 * El dominio de un script, **solo si es absoluto**.
 *
 * Resolver contra una base fue el primer intento y estaba mal por partida doble:
 * cualquier cadena rota salía como si viniera de esa base, y los `src`
 * relativos —que son el código del propio tema, no un servicio de terceros—
 * aparecían en la lista como si lo fueran.
 *
 * Un script relativo es de la tienda: no hay nada que clasificar ni que decidir
 * sobre importarlo.
 */
function hostOf(url: string): string {
  if (!/^(https?:)?\/\//.test(url.trim())) return "";

  try {
    // El protocolo puede faltar —`//cdn.example.com/x.js` es válido en HTML—.
    return new URL(url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim()).hostname;
  } catch {
    return "";
  }
}

/* ------------------------------ Lo que no entra ---------------------------- */

/**
 * Lo que el análisis **no** extrae, y por qué.
 *
 * Se escribe en el prompt y se enseña en la interfaz. No es una nota legal
 * defensiva: es lo que evita que alguien espere de esta herramienta algo que no
 * hace y monte su plan encima.
 */
export const NOT_EXTRACTED = [
  "Las imágenes. Son obra de quien las hizo y reetiquetarlas no las convierte en propias — se generan las tuyas con la foto de tu producto.",
  "Los textos literales. Se describe el ángulo que usan, no sus frases, y el copy se escribe para tu producto y tu mecanismo.",
  "El código del tema. Los temas tienen licencia; se describe la estructura para reproducirla con el tuyo.",
  "Los pixeles y cualquier identificador de cuenta.",
];

/**
 * Lo que el plano sí da, para poder construir con él.
 *
 * Está escrito porque es lo que hay que enseñar al lado de lo anterior: sin
 * esta lista, la sección de arriba parece que la herramienta no sirve.
 */
export const EXTRACTED = [
  "La estructura de la portada, el catálogo y la ficha: qué secciones tienen y en qué orden.",
  "Los colores y las tipografías, que son datos y no obra: se pueden aplicar a tu tema.",
  "Qué hace cada sección y con qué ángulo — descrito, no copiado.",
  "La oferta completa: tramos, precios, precio tachado, cuál empujan.",
  "La garantía y cómo la formulan.",
  "Cuántas imágenes lleva cada sección y de qué tipo, para saber cuántas generar.",
  "Los scripts y las apps que usa, con cuáles puedes instalar tú.",
];

/* --------------------------------- Medidas --------------------------------- */

/**
 * El descuento real de cada tramo.
 *
 * Es la medida que más dice de una oferta y la que casi nunca está escrita: una
 * página anuncia «40% de descuento» en el pack de tres y el cálculo sale al 31%.
 * Comparar el precio por unidad contra el del tramo de uno lo deja a la vista.
 */
export function tierDiscounts(offers: OfferTier[]): {
  quantity: number;
  perUnit: number;
  discount: number | null;
}[] {
  const single = offers.find((offer) => offer.quantity === 1);

  return offers
    .filter((offer) => offer.quantity > 0)
    .map((offer) => {
      const perUnit = offer.price / offer.quantity;

      return {
        quantity: offer.quantity,
        perUnit: Number(perUnit.toFixed(2)),
        // Sin tramo de uno no hay contra qué comparar, y un 0% sería mentira.
        discount:
          single && single.price > 0
            ? Number(((1 - perUnit / single.price) * 100).toFixed(1))
            : null,
      };
    });
}

/** Las secciones de una página del plano, en su orden. */
export function sectionsOf(sections: BlueprintSection[], page: PageKind): BlueprintSection[] {
  return sections.filter((section) => section.page === page);
}

/** Cuántas imágenes hay que generar para reproducir la estructura. */
export function imagesNeeded(sections: BlueprintSection[]): number {
  return sections.reduce((sum, section) => sum + Math.max(0, section.images), 0);
}

/* ---------------------- Las páginas como modelo a seguir -------------------- */

/**
 * Cuánto texto se conserva de cada página leída.
 *
 * Una landing larga de las que se replican ronda los quince mil caracteres, así
 * que veinticuatro mil entra entera con margen. El corte existe porque una home
 * con el catálogo entero embebido puede irse a cientos de miles y eso ni cabe
 * cómodo en la fila ni aporta: lo que sobra es repetición de fichas.
 */
export const PAGE_TEXT_LIMIT = 24_000;

export interface StoredPage {
  url: string;
  kind: string;
  title: string;
  /** El texto visible de la página, ya limpio. */
  text: string;
}

/** Recorta por la última frase entera que quepa, para no cortar a media palabra. */
export function trimPageText(text: string, limit = PAGE_TEXT_LIMIT): string {
  if (text.length <= limit) return text;

  const cut = text.slice(0, limit);
  const lastStop = cut.lastIndexOf(". ");

  // Si no hay ni un punto en veinticuatro mil caracteres, no es prosa: se corta
  // donde toque y ya. Buscar frase donde no la hay dejaría el texto vacío.
  return lastStop > limit * 0.5 ? cut.slice(0, lastStop + 1) : cut;
}

/**
 * Qué páginas del análisis sirven de modelo para escribir la tuya.
 *
 * No todas valen, y ofrecerlas todas hace elegir mal:
 *
 * - **El catálogo se descarta.** Es una rejilla de fichas; su texto es una lista
 *   de nombres y precios. Como modelo de una página de venta no dice nada.
 * - **Las muy cortas también.** Menos de ochocientos caracteres es un aviso
 *   legal o una página de contacto, no una estructura que copiar.
 *
 * El orden es el de utilidad: la ficha de producto primero, porque es donde está
 * la venta; después las sueltas, que es donde suelen vivir los publirreportajes;
 * la home al final, que solo a veces es una landing.
 */
export function pagesAsModel(pages: StoredPage[]): StoredPage[] {
  const rank: Record<string, number> = { producto: 0, otra: 1, home: 2 };

  return pages
    .filter((page) => page.kind !== "catalogo" && page.text.trim().length >= 800)
    .slice()
    .sort((a, b) => (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3));
}

interface BlueprintWithPages {
  id: string;
  storeName: string;
  pages: StoredPage[];
  /** Las que se guardaron al analizar la tienda. Opcional: los planos viejos no las tienen. */
  images?: { url: string }[];
}

/**
 * El identificador lleva la posición **en el array guardado**, no en la lista
 * filtrada. Si mañana cambian las reglas de `pagesAsModel`, un identificador
 * emitido hoy sigue apuntando a la misma página.
 */
function modelId(blueprintId: string, index: number): string {
  return `plano:${blueprintId}:${index}`;
}

/** Las páginas analizadas que se pueden ofrecer como modelo, ya etiquetadas. */
export function modelOptions(blueprints: BlueprintWithPages[]): { id: string; title: string }[] {
  return blueprints.flatMap((blueprint) => {
    const usable = new Set(pagesAsModel(blueprint.pages).map((page) => page.url));

    return blueprint.pages.flatMap((page, index) =>
      usable.has(page.url)
        ? [
            {
              id: modelId(blueprint.id, index),
              title: `${blueprint.storeName} · ${page.kind}${page.title ? ` · ${page.title}` : ""}`,
            },
          ]
        : [],
    );
  });
}

/** La página a la que apunta un identificador, o nada si ya no existe. */
export function findModelPage(
  blueprints: BlueprintWithPages[],
  id: string,
): { label: string; body: string; images: string[] } | null {
  const parts = id.split(":");
  if (parts[0] !== "plano" || parts.length < 3) return null;

  const index = Number(parts[parts.length - 1]);
  const blueprintId = parts.slice(1, -1).join(":");
  const blueprint = blueprints.find((item) => item.id === blueprintId);
  const page = blueprint?.pages[index];

  if (!blueprint || !page || !page.text.trim()) return null;

  return {
    label: `${blueprint.storeName} — ${page.title || page.kind} (${page.url})`,
    body: page.text,
    /*
     * Las imágenes que llevaba, para poder calcar también dónde iban.
     *
     * Sin ellas el modelo coloca los huecos donde le parece, y una página
     * calcada acaba con la foto del producto justo donde el original tenía el
     * diagrama que explica el mecanismo.
     */
    images: (blueprint.images ?? []).map((image) => image.url).filter(Boolean),
  };
}
