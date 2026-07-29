import type { ResearchDocumentId } from "@/types/research";

/**
 * Esquemas JSON de los seis documentos, para salida estructurada.
 *
 * **Por qué existen, y por qué la primera versión no valía.**
 *
 * El primer diseño pedía al modelo el informe en Markdown y, al final, un
 * bloque ```json. En la primera prueba real contra la API el documento 2 hizo
 * 26 búsquedas web, escribió 65.000 caracteres de informe y **se cortó por
 * longitud justo antes del JSON**: se pagaron 2 dólares por un documento que la
 * plataforma no podía leer. Pedir las dos cosas en la misma respuesta pone lo
 * que de verdad hace falta —el JSON— en el sitio más frágil.
 *
 * Ahora son dos llamadas: una investiga y escribe el informe, y otra lee ese
 * informe y devuelve el JSON con `output_config.format`. La segunda no puede
 * cortarse por la longitud de la primera, no lleva búsqueda web y, sobre todo,
 * **la API garantiza que el resultado cumple el esquema**: se acabó comprobar a
 * mano si el modelo escribió bien los niveles de conciencia.
 *
 * Reglas de la salida estructurada que condicionan cómo están escritos:
 * todo objeto necesita `additionalProperties: false` y `required` con todas sus
 * claves, y no se admiten `minLength`, `minimum` ni esquemas recursivos.
 */

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const num = { type: "number" } as const;

const AWARENESS = {
  type: "string",
  enum: ["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware"],
} as const;

/** Objeto cerrado: `additionalProperties: false` y todas las claves obligatorias. */
function object(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const QUOTE = object({ text: str, source: str, context: str });

/* -------------------------------- 1 · Conciencia -------------------------------- */

const AWARENESS_SCHEMA = object({
  tam: object({
    marketSizeUsd: num,
    userBase: num,
    cagr: str,
    sources: strList,
    interpretation: str,
  }),
  stageBreakdown: {
    type: "array",
    items: object({
      level: AWARENESS,
      percentage: num,
      reasoning: str,
      searchPhrases: strList,
      channels: strList,
    }),
  },
  behavioralIndicators: {
    type: "array",
    items: object({ level: AWARENESS, examples: strList }),
  },
  trends: strList,
  dominantLevel: AWARENESS,
  dominantReasoning: str,
  advertisingImplications: object({
    targetLevel: AWARENESS,
    tone: str,
    proof: str,
    emotionalLevel: str,
    exampleAngle: str,
  }),
  demographics: object({
    gender: object({ female: num, male: num }),
    ageBrackets: {
      type: "array",
      items: object({ range: str, percentage: num, notes: str }),
    },
    geoAndIncome: strList,
    summary: {
      type: "array",
      items: object({ segment: str, marketShare: str, traits: str, strategicImplication: str }),
    },
  }),
  avatars: {
    type: "array",
    items: object({
      name: str,
      age: str,
      gender: str,
      income: str,
      psychographics: str,
      awarenessStage: AWARENESS,
      platforms: strList,
      resonantMessage: str,
      angle: str,
    }),
  },
  forDummies: object({
    dominantLevel: str,
    whatItMeans: str,
    actionableConclusion: str,
    avatarConnection: str,
  }),
});

/* ------------------------------- 2 · Competencia -------------------------------- */

const COMPETITORS_SCHEMA = object({
  competitors: {
    type: "array",
    items: object({
      name: str,
      url: str,
      targetGroup: str,
      acquisitionFunnels: strList,
      mainMessage: str,
      creativeExamples: strList,
      awarenessLevelsTargeted: { type: "array", items: AWARENESS },
      recurringHooks: strList,
      gaps: strList,
      pricing: {
        type: "array",
        // `currency` es obligatoria: sin ella no se sabe si 49 son dólares,
        // euros o pesos, y la comparación de precios sale falsa.
        // `units` y `unitPrice` son obligatorios: sin ellos no se distingue el
        // precio de un pack del precio por botella, y la comparación sale falsa.
        items: object({
          tier: str,
          price: num,
          unitPrice: num,
          units: num,
          compareAtPrice: num,
          currency: str,
          note: str,
        }),
      },
      customerLikes: strList,
      customerDislikes: strList,
      estimatedRevenue: object({ business: str, heroProduct: str }),
    }),
  },
  opportunities: strList,
});

/* --------------------------------- 3 · Avatares --------------------------------- */

const AVATARS_SCHEMA = object({
  customerProfile: str,
  attitudes: object({ religious: str, political: str, social: str, economic: str }),
  hopesAndDreams: strList,
  wins: strList,
  failures: strList,
  externalForces: strList,
  prejudices: strList,
  coreBeliefs: str,
  existingSolutions: {
    type: "array",
    items: object({
      name: str,
      experience: str,
      likes: strList,
      dislikes: strList,
      horrorStories: strList,
      doesItWork: str,
    }),
  },
  curiosity: object({
    uniqueAttempts: strList,
    conspiracyAngle: str,
    historicalAttempts: strList,
  }),
  corruption: object({
    painDeniedBelief: str,
    recentlyExacerbated: str,
    forces: strList,
  }),
  quotes: { type: "array", items: QUOTE },
});

/* --------------------------------- 4 · Maestra ---------------------------------- */

const MASTER_SCHEMA = object({
  targetAwarenessLevels: { type: "array", items: AWARENESS },
  demographicDescription: str,
  psychographics: object({
    painPoints: strList,
    hopesAndDreams: strList,
    selfImage: str,
    languageToUse: strList,
    languageToAvoid: strList,
    mainPromises: strList,
  }),
  objections: {
    type: "array",
    items: object({ objection: str, howToAddress: str }),
  },
  existingSolutions: {
    type: "array",
    items: object({ solution: str, whyInsufficient: str }),
  },
});

/* ------------------------------- 5 · Extracción --------------------------------- */

const SCHWARTZ = { type: "string", enum: ["alta", "media", "baja"] } as const;

const DESIRE_EXTRACTION_SCHEMA = object({
  directPerformances: strList,
  secondaryPerformances: strList,
  mapping: {
    type: "array",
    items: object({ performance: str, massDesire: str, desireType: str }),
  },
  ratings: {
    type: "array",
    items: object({
      desire: str,
      urgency: SCHWARTZ,
      stayingPower: SCHWARTZ,
      scope: SCHWARTZ,
      note: str,
    }),
  },
  dominant: object({ performance: str, desire: str, reasoning: str }),
  supportingProof: {
    type: "array",
    items: object({ performance: str, howItSupports: str }),
  },
  headlines: object({ problemAware: str, solutionAware: str, productAware: str }),
  wantStatements: strList,
});

/* ------------------------------- 6 · Validación --------------------------------- */

const DESIRE_VALIDATION_SCHEMA = object({
  desires: {
    type: "array",
    items: object({
      statement: str,
      evidence: { type: "array", items: QUOTE },
      emotionalTriggers: strList,
      urgency: num,
      stayingPower: num,
      scope: num,
      reasoning: object({ urgency: str, stayingPower: str, scope: str }),
      totalScore: num,
    }),
  },
  ranking: strList,
  adImplications: {
    type: "array",
    items: object({ desire: str, whyScalable: str, howToDramatize: str }),
  },
  supportingDesires: {
    type: "array",
    items: object({ desire: str, howItReinforces: str }),
  },
  top5: strList,
});

export const RESEARCH_SCHEMAS: Record<ResearchDocumentId, Record<string, unknown>> = {
  awareness: AWARENESS_SCHEMA,
  competitors: COMPETITORS_SCHEMA,
  avatars: AVATARS_SCHEMA,
  master: MASTER_SCHEMA,
  "desire-extraction": DESIRE_EXTRACTION_SCHEMA,
  "desire-validation": DESIRE_VALIDATION_SCHEMA,
};
