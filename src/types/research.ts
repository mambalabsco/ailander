/**
 * Contrato de los 6 documentos de investigación de `prompts6.md`.
 *
 * Cada documento se guarda como JSON estructurado (los datos que alimentan el
 * panel y los gráficos) más una narrativa en Markdown (el informe legible).
 * Este archivo es el esquema que la API de Claude devolverá con structured
 * output, por lo que la interfaz se construye contra él antes de conectar nada.
 *
 * Dependencias entre documentos, tal y como las definen los prompts:
 *
 *   1 Concienciación ─┐
 *   2 Competencia ────┼──→ 4 Investigación maestra
 *   3 Avatares ───────┘
 *   5 Extracción del deseo ──→ 6 Validación del deseo
 */

/* --------------------------- Vocabulario compartido --------------------------- */

/** Los cinco niveles de conciencia de Eugene Schwartz, en orden. */
export const AWARENESS_LEVELS = [
  "unaware",
  "problem-aware",
  "solution-aware",
  "product-aware",
  "most-aware",
] as const;

export type AwarenessLevel = (typeof AWARENESS_LEVELS)[number];

export const AWARENESS_LABELS: Record<AwarenessLevel, string> = {
  unaware: "Inconsciente",
  "problem-aware": "Consciente del problema",
  "solution-aware": "Consciente de la solución",
  "product-aware": "Consciente del producto",
  "most-aware": "El más consciente",
};

/** Escala cualitativa del documento 5. El documento 6 puntúa de 1 a 5. */
export type SchwartzLevel = "alta" | "media" | "baja";

export const RESEARCH_DOCUMENT_IDS = [
  "awareness",
  "competitors",
  "avatars",
  "master",
  "desire-extraction",
  "desire-validation",
] as const;

export type ResearchDocumentId = (typeof RESEARCH_DOCUMENT_IDS)[number];

export const RESEARCH_DOCUMENT_META: Record<
  ResearchDocumentId,
  { order: number; title: string; description: string; dependsOn: ResearchDocumentId[] }
> = {
  awareness: {
    order: 1,
    title: "Investigación de concienciación",
    description: "Nivel de conciencia dominante, TAM, demografía y los 3 avatares principales.",
    dependsOn: [],
  },
  competitors: {
    order: 2,
    title: "Investigación de la competencia",
    description: "Marcas DTC del nicho: mensajes, embudos, precios y brechas aprovechables.",
    dependsOn: [],
  },
  avatars: {
    order: 3,
    /*
     * Depende del 1 porque el reparto por edad y género es **salida** suya.
     *
     * El apartado 5 del documento 1 lo dice: «obligatoria o generada
     * automáticamente — si no se proporcionan datos demográficos, genere
     * automáticamente estimaciones». El prompt 3 pide esas edades y géneros
     * como entrada, así que el orden natural es 1 → 3, y no hay que
     * pedírselos a quien todavía no los sabe.
     */
    title: "Investigación de avatares",
    description: "Perfil psicográfico con citas textuales de clientes reales.",
    dependsOn: ["awareness"],
  },
  master: {
    order: 4,
    title: "Investigación maestra",
    description: "Documento único que condensa 1, 2 y 3 para alimentar la creación de copy.",
    dependsOn: ["awareness", "competitors", "avatars"],
  },
  "desire-extraction": {
    order: 5,
    title: "Extracción del deseo",
    description: "Actuaciones del producto mapeadas a deseos masivos según Schwartz.",
    dependsOn: [],
  },
  "desire-validation": {
    order: 6,
    title: "Validación del deseo",
    description: "Deseos puntuados con evidencia real y ranking de los 5 más fuertes.",
    dependsOn: ["desire-extraction"],
  },
};

/** Cita textual de un cliente real. Los prompts 3 y 6 las exigen. */
export interface CustomerQuote {
  text: string;
  source: string;
  context?: string;
}

/* ---------------------- 1 · Investigación de concienciación --------------------- */

export interface AwarenessStageBreakdown {
  level: AwarenessLevel;
  percentage: number;
  reasoning: string;
  searchPhrases: string[];
  channels: string[];
}

export interface AgeBracket {
  range: string;
  percentage: number;
  notes: string;
}

export interface DemographicSegment {
  segment: string;
  marketShare: string;
  traits: string;
  strategicImplication: string;
}

export interface Avatar {
  name: string;
  age: string;
  gender: string;
  income: string;
  psychographics: string;
  awarenessStage: AwarenessLevel;
  platforms: string[];
  resonantMessage: string;
  angle: string;
}

export interface AwarenessResearch {
  tam: {
    marketSizeUsd: number;
    userBase: number;
    cagr: string;
    sources: string[];
    interpretation: string;
  };
  stageBreakdown: AwarenessStageBreakdown[];
  behavioralIndicators: { level: AwarenessLevel; examples: string[] }[];
  trends: string[];
  dominantLevel: AwarenessLevel;
  dominantReasoning: string;
  advertisingImplications: {
    targetLevel: AwarenessLevel;
    tone: string;
    proof: string;
    emotionalLevel: string;
    exampleAngle: string;
  };
  demographics: {
    gender: { female: number; male: number };
    ageBrackets: AgeBracket[];
    geoAndIncome: string[];
    summary: DemographicSegment[];
  };
  avatars: Avatar[];
  forDummies: {
    dominantLevel: string;
    whatItMeans: string;
    actionableConclusion: string;
    avatarConnection: string;
  };
}

/* ----------------------- 2 · Investigación de la competencia -------------------- */

export interface CompetitorPriceTier {
  tier: string;
  /**
   * El importe **tal y como aparece en la web del competidor**.
   *
   * Antes este campo se llamaba `priceUsd` y el esquema obligaba a dólares, así
   * que el precio de una marca británica se guardaba como si fueran dólares.
   * Después la gráfica lo ponía en la misma barra que el tuyo, en otra moneda,
   * y la comparación era simplemente falsa.
   */
  price: number;
  /** Código ISO de la moneda de ese importe: USD, EUR, MXN, GBP… */
  currency: string;
  /**
   * Cuántas unidades incluye el escalón.
   *
   * **Sin esto los precios salían mal.** Las páginas DTC enseñan «$59.50 por
   * botella» dentro de un pack de 2, y el informe guardaba 59,50 como si fuera
   * el precio del pack, o 177 como si fuera el de una unidad. Comparar así
   * contra el propio no compara nada.
   */
  units?: number;
  /** Lo que cuesta **una** unidad en este escalón. */
  unitPrice?: number;
  /** Precio tachado, cuando la página enseña un «antes». */
  compareAtPrice?: number;
  note: string;
}

/**
 * Lee el precio de un escalón, venga en el formato nuevo o en el viejo.
 *
 * **Los informes ya generados guardan `priceUsd`.** Al abrir el campo a otras
 * monedas pasó a llamarse `price` + `currency`, y los documentos que ya estaban
 * en la base de datos —pagados, a dos dólares cada uno— empezaron a enseñar
 * «NaN US$». Regenerarlos para arreglar un cambio de nombre sería tirar dinero.
 *
 * El formato viejo era siempre en dólares por definición del esquema anterior,
 * así que esa es la moneda que se le asume.
 */
export function readTierPrice(tier: CompetitorPriceTier): {
  price: number;
  unitPrice: number;
  units: number;
  currency: string;
} {
  const legacy = (tier as unknown as { priceUsd?: number }).priceUsd;
  const price = typeof tier.price === "number" ? tier.price : (legacy ?? 0);
  const units = typeof tier.units === "number" && tier.units > 0 ? tier.units : 1;

  /*
   * El precio por unidad es lo único comparable entre escalones.
   *
   * Si no viene, se deriva dividiendo. Es exacto cuando el total es correcto, y
   * es lo que hace que «pack de 3 por 177» y «1 botella por 69» se puedan poner
   * en la misma gráfica sin mentir.
   */
  const unitPrice =
    typeof tier.unitPrice === "number" && tier.unitPrice > 0 ? tier.unitPrice : price / units;

  return { price, unitPrice, units, currency: tier.currency || "USD" };
}

export interface CompetitorProfile {
  name: string;
  url: string;
  targetGroup: string;
  acquisitionFunnels: string[];
  mainMessage: string;
  creativeExamples: string[];
  awarenessLevelsTargeted: AwarenessLevel[];
  recurringHooks: string[];
  gaps: string[];
  pricing: CompetitorPriceTier[];
  customerLikes: string[];
  customerDislikes: string[];
  estimatedRevenue: { business: string; heroProduct: string } | null;
}

export interface CompetitorResearch {
  competitors: CompetitorProfile[];
  opportunities: string[];
}

/* ------------------------- 3 · Investigación de avatares ------------------------ */

export interface ExistingSolution {
  name: string;
  experience: string;
  likes: string[];
  dislikes: string[];
  horrorStories: string[];
  doesItWork: string;
}

export interface AvatarResearch {
  customerProfile: string;
  attitudes: { religious: string; political: string; social: string; economic: string };
  hopesAndDreams: string[];
  wins: string[];
  failures: string[];
  externalForces: string[];
  prejudices: string[];
  coreBeliefs: string;
  existingSolutions: ExistingSolution[];
  curiosity: {
    uniqueAttempts: string[];
    conspiracyAngle: string;
    historicalAttempts: string[];
  };
  corruption: {
    painDeniedBelief: string;
    recentlyExacerbated: string;
    forces: string[];
  };
  quotes: CustomerQuote[];
}

/* ------------------------- 4 · Investigación maestra ---------------------------- */

export interface MasterResearch {
  targetAwarenessLevels: AwarenessLevel[];
  demographicDescription: string;
  psychographics: {
    painPoints: string[];
    hopesAndDreams: string[];
    selfImage: string;
    languageToUse: string[];
    languageToAvoid: string[];
    mainPromises: string[];
  };
  objections: { objection: string; howToAddress: string }[];
  existingSolutions: { solution: string; whyInsufficient: string }[];
}

/* ------------------------- 5 · Extracción del deseo ----------------------------- */

export interface DesireMapping {
  performance: string;
  massDesire: string;
  desireType: string;
}

export interface DesireRating {
  desire: string;
  urgency: SchwartzLevel;
  stayingPower: SchwartzLevel;
  scope: SchwartzLevel;
  note: string;
}

export interface DesireExtraction {
  directPerformances: string[];
  secondaryPerformances: string[];
  mapping: DesireMapping[];
  ratings: DesireRating[];
  dominant: { performance: string; desire: string; reasoning: string };
  supportingProof: { performance: string; howItSupports: string }[];
  headlines: { problemAware: string; solutionAware: string; productAware: string };
  wantStatements: string[];
}

/* ------------------------- 6 · Validación del deseo ----------------------------- */

/** Puntuación 1-5 en cada dimensión de Schwartz, con la evidencia que la sostiene. */
export interface ValidatedDesire {
  statement: string;
  evidence: CustomerQuote[];
  emotionalTriggers: string[];
  urgency: number;
  stayingPower: number;
  scope: number;
  reasoning: { urgency: string; stayingPower: string; scope: string };
  totalScore: number;
}

export interface DesireValidation {
  desires: ValidatedDesire[];
  ranking: string[];
  adImplications: { desire: string; whyScalable: string; howToDramatize: string }[];
  supportingDesires: { desire: string; howItReinforces: string }[];
  top5: string[];
}

/* --------------------------------- El paquete ---------------------------------- */

export type ResearchDocumentStatus = "empty" | "queued" | "generating" | "ready" | "error";

export interface ResearchDocumentState {
  status: ResearchDocumentStatus;
  generatedAt: string | null;
  /** Narrativa completa en Markdown, tal y como la devuelve el modelo. */
  markdown: string;
  error?: string;
}

export interface ProductResearch {
  awareness: AwarenessResearch | null;
  competitors: CompetitorResearch | null;
  avatars: AvatarResearch | null;
  master: MasterResearch | null;
  desireExtraction: DesireExtraction | null;
  desireValidation: DesireValidation | null;
  documents: Record<ResearchDocumentId, ResearchDocumentState>;
}

export function emptyDocumentState(): ResearchDocumentState {
  return { status: "empty", generatedAt: null, markdown: "" };
}

export function emptyProductResearch(): ProductResearch {
  return {
    awareness: null,
    competitors: null,
    avatars: null,
    master: null,
    desireExtraction: null,
    desireValidation: null,
    documents: {
      awareness: emptyDocumentState(),
      competitors: emptyDocumentState(),
      avatars: emptyDocumentState(),
      master: emptyDocumentState(),
      "desire-extraction": emptyDocumentState(),
      "desire-validation": emptyDocumentState(),
    },
  };
}

/* ----------------------------------- Hooks -------------------------------------- */

/**
 * Un gancho generado para una combinación concreta de nivel de conciencia y
 * deseo masivo. La combinación no es fija: se deriva de lo que devuelven los
 * documentos 1 y 6 (ver `buildHookPlan`).
 */
export interface ProductHook {
  id: string;
  productId: string;
  title: string;
  body: string;
  awarenessLevel: AwarenessLevel;
  desire: string;
  angle: string;
  format: string;
  isUsed: boolean;
  createdAt: string;
  usedAt?: string;
  batchId: string;
}

export interface HookBatch {
  awarenessLevel: AwarenessLevel;
  desire: string;
  hooks: number;
  /** Peso del nivel en el mercado según el documento 1, para ordenar el trabajo. */
  audienceShare: number;
}

export interface HookPlan {
  batches: HookBatch[];
  totalHooks: number;
  rationale: string;
}
