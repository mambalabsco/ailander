/**
 * Generación de imágenes con Higgsfield.
 *
 * Lo verificado contra su SDK oficial (`@higgsfield/client`):
 * - Las credenciales son un par `KEY_ID:KEY_SECRET`, no una clave suelta.
 * - La v2 llama a `subscribe(rutaDelModelo, { input, withPolling })`.
 * - Las imágenes de referencia entran por `input_images`, y en la v1 admiten un
 *   peso que controla cuánto conserva la referencia.
 * - Los trabajos pasan por `queued → in_progress → completed | failed | nsfw`.
 *
 * Lo que NO está confirmado y por eso queda marcado en el registro: la ruta
 * exacta de cada modelo. Antes de la primera llamada real hay que contrastarlas
 * con la documentación de Higgsfield.
 */

export type HiggsfieldJobStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw";

/** Para qué sirve mejor cada modelo, que es lo que decide la recomendación. */
export type ModelStrength =
  | "texto-legible"
  | "control-espacial"
  | "fotorrealismo"
  | "consistencia-referencia"
  | "velocidad"
  | "packshot-limpio";

export interface HiggsfieldModel {
  id: string;
  name: string;
  /** Ruta del modelo en la API v2. Verificar contra su documentación. */
  path: string;
  strengths: ModelStrength[];
  supportsReferenceImages: boolean;
  summary: string;
  /** Cuándo es la mejor opción frente a las demás. */
  idealFor: string;
  /** Coste relativo, para decidir en generaciones de volumen. */
  cost: "bajo" | "medio" | "alto";
}

/**
 * Registro de modelos.
 *
 * Nano Banana Pro va primero por decisión de producto y porque su punto fuerte
 * —precisión de composición y texto legible dentro de la imagen— es justo lo
 * que necesita un anuncio con titular, reseña o comparativa incrustada.
 */
export const HIGGSFIELD_MODELS: HiggsfieldModel[] = [
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    path: "nano-banana-pro/text-to-image",
    strengths: ["texto-legible", "control-espacial", "packshot-limpio"],
    supportsReferenceImages: true,
    summary:
      "Precisión de coordenadas y adherencia semántica: coloca los elementos donde se le indica y respeta las restricciones del prompt.",
    idealFor:
      "Anuncios con texto dentro de la imagen (titular, estrellas de reseña, etiquetas de comparativa) y composiciones donde la posición importa.",
    cost: "alto",
  },
  {
    id: "soul-v2",
    name: "Soul V2",
    path: "soul/text-to-image",
    strengths: ["fotorrealismo", "consistencia-referencia"],
    supportsReferenceImages: true,
    summary:
      "Transformación de imagen orientada al realismo y a mantener la identidad del sujeto entre variaciones.",
    idealFor:
      "Escenas de estilo de vida y contenido tipo UGC donde el producto debe reconocerse igual en todas las piezas.",
    cost: "medio",
  },
  {
    id: "seedream-5",
    name: "Seedream 5.0",
    path: "seedream-5/text-to-image",
    strengths: ["velocidad", "fotorrealismo"],
    supportsReferenceImages: true,
    summary: "Generación general rápida con buen acabado fotográfico.",
    idealFor: "Tandas de variantes para test cuando hace falta volumen más que control fino.",
    cost: "bajo",
  },
  {
    id: "flux-2-pro",
    name: "FLUX.2 Pro",
    path: "flux-pro/kontext/max/text-to-image",
    strengths: ["packshot-limpio", "fotorrealismo"],
    supportsReferenceImages: true,
    summary: "Generación de propósito general con acabado limpio y consistente.",
    idealFor: "Fotografía de producto sobre fondo neutro cuando no hace falta texto en la imagen.",
    cost: "medio",
  },
  {
    id: "nano-banana-2",
    name: "Nano Banana 2",
    path: "nano-banana-2/text-to-image",
    strengths: ["velocidad", "control-espacial"],
    supportsReferenceImages: true,
    summary: "Versión rápida de la familia Nano Banana, pensada para generar a escala.",
    idealFor: "Iterar muchas variantes de una idea ya validada, antes de subir la buena a Pro.",
    cost: "bajo",
  },
];

export function findModel(id: string): HiggsfieldModel | undefined {
  return HIGGSFIELD_MODELS.find((model) => model.id === id);
}

/* ------------------------ Prompts visuales para anuncios ----------------------- */

/** Familias de creatividad, cada una con su lógica de conversión. */
export const AD_VISUAL_CONCEPTS = [
  "gancho-visual",
  "producto-en-contexto",
  "resena",
  "comparativa",
  "antes-despues",
  "ugc",
  "detalle-producto",
  "oferta",
  /*
   * El formato de titular: franja arriba, foto grande debajo.
   *
   * Es el que más rinde en frío en salud y estética porque se lee como una
   * portada y no como un anuncio. Lo que lo hace legítimo o no es el contenido:
   * aquí la franja dice lo que el producto hace, sin marca de medio, sin cita
   * atribuida a nadie y sin promesa de curar. Esas tres son justo las que
   * tumban la cuenta publicitaria.
   */
  "editorial",
] as const;

export type AdVisualConcept = (typeof AD_VISUAL_CONCEPTS)[number];

export const AD_VISUAL_CONCEPT_LABELS: Record<AdVisualConcept, string> = {
  "gancho-visual": "Gancho visual",
  "producto-en-contexto": "Producto en contexto",
  editorial: "Titular tipo portada",
  resena: "Reseña",
  comparativa: "Comparativa",
  "antes-despues": "Antes y después",
  ugc: "Estilo UGC",
  "detalle-producto": "Detalle de producto",
  oferta: "Oferta",
};

export interface AdVisualPrompt {
  id: string;
  productId: string;
  /** Copy del que nace esta creatividad. */
  copyId: string;
  concept: AdVisualConcept;
  title: string;
  /** El prompt que se envía a Higgsfield. */
  prompt: string;
  negativePrompt?: string;
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9";
  recommendedModelId: string;
  /** Por qué ese modelo y no otro. */
  modelReason: string;
  /**
   * Si la pieza necesita la foto real del producto como referencia.
   *
   * Lo decide el concepto: cuando el producto aparece reconocible, sin la
   * referencia el modelo se inventa el envase. El usuario puede cambiarlo.
   */
  needsProductReference: boolean;
  referenceReason: string;
  /** Nombre del archivo de referencia, para poder localizarlo después. */
  referenceImageName?: string;
  createdAt: string;
}

/* -------------------------- Imágenes de producto ------------------------------- */

/**
 * Los diez patrones de imagen de producto, ordenados por prioridad.
 *
 * El primero es el que después se usa como referencia en los anuncios, y por eso
 * va sobre fondo transparente o blanco: recortado limpio se puede componer en
 * cualquier creatividad.
 */
export const PRODUCT_IMAGE_PATTERNS = [
  "packshot-principal",
  "packshot-angulo",
  "producto-en-uso",
  "escala-en-mano",
  "detalle-textura",
  "composicion-ingredientes",
  "resena-estrellas",
  "comparativa-alternativa",
  "antes-despues",
  "pack-oferta",
  // Del vertical de casino: lo que se enseña no es un envase, es una pantalla.
  "captura-app",
  "app-en-movil",
  "app-en-mano",
] as const;

export type ProductImagePattern = (typeof PRODUCT_IMAGE_PATTERNS)[number];

export interface ProductImagePatternMeta {
  id: ProductImagePattern;
  name: string;
  purpose: string;
  /** Por qué convierte, no solo qué muestra. */
  conversionLogic: string;
  hasText: boolean;
  aspectRatio: "1:1" | "4:5" | "9:16";
  isPrimary: boolean;
}

export const PRODUCT_IMAGE_PATTERN_META: Record<ProductImagePattern, ProductImagePatternMeta> = {
  /*
   * Los tres de casino.
   *
   * `captura-app` **no se genera**: se sube. Es la pantalla real de la app, y es
   * la que viaja como referencia para que el teléfono de las otras dos enseñe
   * *esa* app y no una parecida. Describirla en el prompt —«pantalla de casino
   * con ruleta»— produce otra app, que es exactamente lo que no se quiere.
   */
  "captura-app": {
    id: "captura-app",
    name: "Captura de la app",
    purpose: "La pantalla real de la app, subida tal cual desde el teléfono.",
    conversionLogic:
      "No convierte por sí sola: es la pieza maestra del vertical. Es lo que se manda de referencia para que el móvil de las demás enseñe esta app y no una inventada.",
    hasText: true,
    aspectRatio: "9:16",
    isPrimary: true,
  },
  "app-en-movil": {
    id: "app-en-movil",
    name: "La app en el móvil",
    purpose: "Un teléfono sostenido con la app en pantalla, dentro de una escena real.",
    conversionLogic:
      "Enseña que existe y que se usa desde donde ya está la persona. Un pantallazo suelto parece una web; una mano sosteniendo el teléfono parece algo que alguien está haciendo.",
    hasText: false,
    aspectRatio: "4:5",
    isPrimary: false,
  },
  "app-en-mano": {
    id: "app-en-mano",
    name: "Primer plano de la pantalla",
    purpose: "La mano y la pantalla llenando el encuadre, con luz de casa.",
    conversionLogic:
      "Se lee como una foto que alguien mandó, no como una campaña. Es el formato del testimonio: la prueba de que la pantalla es de verdad.",
    hasText: false,
    aspectRatio: "4:5",
    isPrimary: false,
  },
  "packshot-principal": {
    id: "packshot-principal",
    name: "Packshot principal",
    purpose: "El producto solo, recortado sobre fondo transparente o blanco puro.",
    conversionLogic:
      "No convierte por sí mismo: es la pieza maestra. Al estar recortada se puede componer dentro de cualquier anuncio, y es la que se envía como referencia para que el modelo no se invente el envase.",
    hasText: false,
    aspectRatio: "1:1",
    isPrimary: true,
  },
  "packshot-angulo": {
    id: "packshot-angulo",
    name: "Packshot en ángulo",
    purpose: "El producto en tres cuartos con sombra suave sobre fondo neutro.",
    conversionLogic:
      "Da volumen y tamaño real. Reduce la sensación de render y la sospecha de que el producto no existe.",
    hasText: false,
    aspectRatio: "1:1",
    isPrimary: false,
  },
  "producto-en-uso": {
    id: "producto-en-uso",
    name: "Producto en uso",
    purpose: "Alguien del público objetivo usándolo en su contexto real.",
    conversionLogic:
      "Permite proyectarse. El comprador no compra el producto, compra la escena en la que se ve a sí mismo.",
    hasText: false,
    aspectRatio: "4:5",
    isPrimary: false,
  },
  "escala-en-mano": {
    id: "escala-en-mano",
    name: "Escala en la mano",
    purpose: "El producto sostenido, para que se entienda el tamaño real.",
    conversionLogic:
      "El tamaño es una objeción silenciosa y una de las primeras causas de devolución. Resolverla antes de la compra evita la duda y la devolución.",
    hasText: false,
    aspectRatio: "1:1",
    isPrimary: false,
  },
  "detalle-textura": {
    id: "detalle-textura",
    name: "Detalle macro",
    purpose: "Primer plano de la textura, el material o el acabado.",
    conversionLogic:
      "Sustituye al tacto, que es lo que falta al comprar online. Un macro nítido comunica calidad más rápido que cualquier adjetivo.",
    hasText: false,
    aspectRatio: "1:1",
    isPrimary: false,
  },
  "composicion-ingredientes": {
    id: "composicion-ingredientes",
    name: "Composición e ingredientes",
    purpose: "El producto rodeado de sus componentes principales, cada uno etiquetado.",
    conversionLogic:
      "Convierte la transparencia en argumento visible. Responde a la objeción de «no sé qué lleva» sin pedir que nadie lea la etiqueta.",
    hasText: true,
    aspectRatio: "1:1",
    isPrimary: false,
  },
  "resena-estrellas": {
    id: "resena-estrellas",
    name: "Reseña con valoración",
    purpose: "Una cita real de cliente con estrellas y nombre, junto al producto.",
    conversionLogic:
      "Prueba social en el momento de decidir. La cita concreta convence mucho más que una nota media sin contexto.",
    hasText: true,
    aspectRatio: "4:5",
    isPrimary: false,
  },
  "comparativa-alternativa": {
    id: "comparativa-alternativa",
    name: "Comparativa",
    purpose: "Dos columnas enfrentando el producto con la alternativa que ya usa el comprador.",
    conversionLogic:
      "Hace el trabajo de comparar por él. Funciona sobre todo con público consciente de la solución, que ya está eligiendo entre opciones.",
    hasText: true,
    aspectRatio: "1:1",
    isPrimary: false,
  },
  "antes-despues": {
    id: "antes-despues",
    name: "Antes y después",
    purpose: "El estado inicial y el resultado, en la misma imagen y con las mismas condiciones.",
    conversionLogic:
      "Es la prueba visual más directa. Exige honestidad: misma luz y mismo encuadre, o el lector detecta el truco y pierdes toda la credibilidad.",
    hasText: true,
    aspectRatio: "1:1",
    isPrimary: false,
  },
  "pack-oferta": {
    id: "pack-oferta",
    name: "Pack u oferta",
    purpose: "Varias unidades o el pack completo, con el precio o el ahorro visible.",
    conversionLogic:
      "Cierra al público más consciente, que ya está decidido y solo necesita una razón para comprar ahora en vez de después.",
    hasText: true,
    aspectRatio: "1:1",
    isPrimary: false,
  },
};

export interface ProductImage {
  /**
   * De qué app es, en casino.
   *
   * La captura de una app es lo que se manda de referencia para que el teléfono
   * de la creatividad enseñe **esa** app y no una parecida.
   */
  appId?: string;
  id: string;
  productId: string;
  pattern: ProductImagePattern | "subida";
  /**
   * Nombre legible del archivo, sin extensión.
   *
   * Es el que se cita en el anuncio que la usa, para poder localizar el archivo
   * después sin tener que abrir cada imagen. Ejemplo:
   * `revital-serum_packshot-principal_01`.
   */
  name: string;
  /** Ruta pública de la imagen, ya sea subida o generada. */
  url: string;
  prompt?: string;
  modelId?: string;
  /** La imagen maestra que se envía como referencia a los anuncios. */
  isPrimary: boolean;
  source: "subida" | "generada";
  /** El copy del que salió esta creatividad, si salió de uno. */
  copyId?: string;
  /** El anuncio corto del que salió, si salió de uno. */
  adId?: string;
  /** La página del que salió. Los huecos se llaman igual en todas. */
  landingId?: string;
  /**
   * Su URL en el CDN de Shopify, si ya se subió.
   *
   * A diferencia de `url`, esta **no caduca**: es la que va en la página
   * publicada. Guardarla evita volver a subir la misma imagen en cada
   * republicación.
   */
  shopifyUrl?: string;
  /** Concepto visual: `antes-despues`, `resena`, `ugc`… */
  concept?: string;
  /** El gancho o el ángulo que la originó, para reconocerla. */
  originLabel?: string;
  /**
   * Cuándo se descartó al rehacerla. Sin valor, está vigente.
   *
   * Rehacer no borra: esconde. El archivo sigue en el bucket por si la nueva
   * sale peor, y se recupera desde el pie de su rejilla.
   */
  discardedAt?: string;
  /**
   * Qué lugar ocupa dentro de su anuncio, empezando en 1.
   *
   * Es lo que va al final del nombre del archivo, y por tanto lo que distingue
   * un anuncio de Facebook de otro cuando salen del mismo anuncio de aquí.
   */
  adSequence?: number;
  createdAt: string;
}

/**
 * Construye el nombre de archivo de una imagen.
 *
 * Lleva producto, patrón y un correlativo para que dos generaciones del mismo
 * patrón no se pisen, y para que el nombre por sí solo diga qué es.
 */
/** Texto a fragmento de nombre de archivo: sin tildes, sin espacios, corto. */
function slugify(value: string, maxLength = 40): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, maxLength)
    .replace(/-$/, "");
}

/**
 * El nombre del archivo de una imagen.
 *
 * **Antes decía `naturox_subida_07`**, que no identifica nada: con veinte
 * creatividades descargadas en una carpeta no hay forma de saber cuál es cuál
 * sin abrirlas una por una.
 *
 * Ahora lleva de qué salió —el concepto visual y el gancho o el ángulo—, que es
 * como se piensa en ellas: «la del antes y después del gancho de la tiroides».
 */
export function buildImageName(options: {
  productName: string;
  pattern: ProductImagePattern | "subida";
  index: number;
  /** Concepto visual de la creatividad: `antes-despues`, `resena`… */
  concept?: string;
  /** El gancho o el ángulo del que sale, para reconocerla de un vistazo. */
  origin?: string;
}): string {
  const parts = [slugify(options.productName, 28)];

  // El concepto sustituye al patrón cuando existe: dice más que «subida».
  parts.push(options.concept ? slugify(options.concept, 24) : options.pattern);

  if (options.origin) {
    const origin = slugify(options.origin, 45);
    if (origin) parts.push(origin);
  }

  parts.push(String(options.index).padStart(2, "0"));
  return parts.join("_");
}

/** Preferencias opcionales del preformulario de generación. */
export interface ProductImageBrief {
  /** Rutas de imágenes que el usuario aporta como referencia visual. */
  referenceUrls: string[];
  additionalInstructions: string;
  backgroundStyle: string;
  paletteNote: string;
  /** Qué patrones generar. Por defecto, los diez. */
  patterns: ProductImagePattern[];
}

export function defaultProductImageBrief(): ProductImageBrief {
  return {
    referenceUrls: [],
    additionalInstructions: "",
    backgroundStyle: "Fondo neutro y luz suave de estudio",
    paletteNote: "",
    patterns: [...PRODUCT_IMAGE_PATTERNS],
  };
}
