/**
 * Esquemas de las generaciones cortas.
 *
 * A diferencia de la investigación —que necesita dos llamadas porque el informe
 * es largo e imprevisible—, aquí la salida **es** el dato: cinco ángulos, diez
 * ganchos, un copy. No hay informe que la preceda y pueda desbordarla, así que
 * basta una llamada con `output_config.format`.
 *
 * Ese formato hace dos cosas que importan: garantiza la forma —los niveles de
 * conciencia y los formatos de anuncio salen siempre del enum— y evita tener
 * que rescatar el JSON de dentro de un texto, que es donde se rompía antes.
 *
 * Reglas de la salida estructurada: todo objeto necesita `required` con todas
 * sus claves y `additionalProperties: false`; no valen `minLength`, `minimum`
 * ni recursividad.
 */


const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const num = { type: "number" } as const;

const AWARENESS = {
  type: "string",
  enum: ["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware"],
} as const;

function object(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/* ---------------------------------- Ángulos ------------------------------------ */

export const ANGLES_SCHEMA = object({
  angles: {
    type: "array",
    items: object({
      name: str,
      targetAudience: str,
      storyArc: object({
        start: str,
        crisis: str,
        discovery: str,
        resolution: str,
      }),
      // UMP y UMS: el tejido que conecta la investigación con el copy.
      problemMechanism: str,
      solutionMechanism: str,
      emotionalMoment: str,
    }),
  },
});

/* ----------------------------------- Ganchos ------------------------------------ */

export const HOOKS_SCHEMA = object({
  hooks: {
    type: "array",
    items: object({
      title: str,
      body: str,
      angle: str,
      format: str,
    }),
  },
});

/* ------------------------------------ Copys ------------------------------------- */

/**
 * Un copy es un anuncio de Facebook: cuerpo, título y descripción.
 *
 * `headline` y `description` tienen límites duros en el gestor de anuncios (40
 * y 30 caracteres). El esquema no los puede imponer —`maxLength` no está
 * admitido—, así que el límite se recuerda en el prompt y se comprueba al
 * guardar.
 */
export const COPY_SCHEMA = object({
  primaryText: str,
  headline: str,
  description: str,
  wordCount: num,
});

/* ------------------------------- Anuncios cortos -------------------------------- */

/*
 * Cadena libre, **sin enum**, y es el cambio que hace que el catálogo crezca.
 *
 * Antes la lista de diez formatos era obligatoria: el modelo no podía proponer
 * ninguno más aunque el producto lo pidiera. Esos diez salieron de los ejemplos
 * que había a mano, no de un análisis de qué formatos existen.
 *
 * Los diez siguen viajando en el prompt como referencia; el modelo puede usar
 * uno de ellos o inventar el que convenga, con su identificador en minúsculas
 * y guiones.
 */
const SHORT_AD_FORMAT = { type: "string" } as const;

/*
 * Una campaña con **varios conjuntos**, cada uno en su etapa del embudo.
 *
 * Antes el esquema tenía `adset` en singular y la campaña llevaba la etapa en el
 * nombre, así que cada generación producía una campaña entera dedicada a TOFU, o
 * a BOFU. No es como se monta una campaña: dentro de la misma conviven
 * conjuntos de frío, templado y caliente, cada uno con su enfoque y su público.
 */
export const SHORT_ADS_SCHEMA = object({
  campaign: object({
    name: str,
    theme: str,
    focus: str,
  }),
  adsets: {
    type: "array",
    items: object({
      name: str,
      // La etapa es de cada conjunto, no de la campaña.
      stage: { type: "string", enum: ["TOFU", "MOFU", "BOFU"] },
      focus: str,
      audience: str,
      objective: str,
      offerStack: strList,
      alwaysInclude: strList,
      ads: {
        type: "array",
        items: object({
          name: str,
          format: SHORT_AD_FORMAT,
          primaryText: str,
          headline: str,
          description: str,
          imagePrompt: str,
        }),
      },
    }),
  },
});

/* --------------------------------- Competidores --------------------------------- */

/**
 * Búsqueda de competidores.
 *
 * Es más ligero que el documento 2: aquí solo se identifican candidatos para
 * que el usuario confirme cuáles entran, no se investigan a fondo.
 */
export const COMPETITOR_SEARCH_SCHEMA = object({
  competitors: {
    type: "array",
    items: object({
      name: str,
      url: str,
      whyItCompetes: str,
      confidence: { type: "string", enum: ["alta", "media", "baja"] },
    }),
  },
});

/* ------------------------------------ Ideas ------------------------------------- */

export const IDEAS_SCHEMA = object({
  ideas: {
    type: "array",
    items: object({
      title: str,
      rationale: str,
      // De qué ganador sale la idea: es lo que la hace auditable en vez de una
      // ocurrencia suelta.
      basedOn: str,
      awarenessLevel: AWARENESS,
      firstLine: str,
    }),
  },
});

/* --------------------------- Análisis de la ficha ------------------------------- */

/**
 * `source` es obligatorio en cada ingrediente, a propósito.
 *
 * Sin ese campo no habría forma de distinguir lo leído de lo deducido, y en un
 * suplemento esa diferencia decide si un anuncio afirma algo cierto.
 */
export const PRODUCT_ANALYSIS_SCHEMA = object({
  ingredients: {
    type: "array",
    items: object({
      name: str,
      role: str,
      form: str,
      dose: str,
      source: { type: "string", enum: ["web", "inferido"] },
    }),
  },
  description: str,
  targetAudience: str,
  benefits: strList,
  features: strList,
  problemsSolved: strList,
  objections: strList,
  notes: strList,
});

/* ------------------------- Publirreportaje como página --------------------------- */

export const LANDING_PAGE_SCHEMA = object({
  title: str,
  slug: str,
  header: object({
    enabled: { type: "boolean" },
    announcement: str,
    logoText: str,
    kicker: str,
  }),
  author: object({
    name: str,
    credentials: str,
    updatedAt: str,
  }),
  sections: {
    type: "array",
    items: object({
      kind: {
        type: "string",
        enum: [
          "titular",
          "entradilla",
          "autor",
          "valoracion",
          "medios",
          "subtitulo",
          "parrafo",
          "lista",
          "cita",
          "destacado",
          "dato",
          "mecanismo",
          "comparativa",
          "garantia",
          "oferta",
          "faq",
          "separador",
          "imagen",
          "cta",
          "comentarios",
          "aviso-legal",
        ],
      },
      text: str,
      items: strList,
      slot: str,
      href: str,
      value: str,
      rating: num,
      reviews: num,
      left: object({ title: str, items: strList }),
      right: object({ title: str, items: strList }),
      pairs: {
        type: "array",
        items: object({ question: str, answer: str }),
      },
    }),
  },
  imageSlots: {
    type: "array",
    items: object({ slot: str, purpose: str, prompt: str, alt: str, aspectRatio: str }),
  },
  comments: {
    type: "array",
    items: object({
      name: str,
      timeAgo: str,
      text: str,
      likes: num,
      replies: {
        type: "array",
        items: object({ name: str, text: str, timeAgo: str }),
      },
    }),
  },
});
