import type { ProductIngredient } from "@/types/ingredient";
export type ProductStatus = "active" | "draft";

/**
 * Datos que los 6 prompts de investigación exigen y que no forman parte de la
 * ficha comercial del producto.
 *
 * - `niche` y `targetCountry` los usan los prompts 1, 2, 4 y 6.
 * - `competitorUrls` es obligatorio para el prompt 2 ("aquí está mi competidor
 *   número uno") y alimenta también el 5.
 * - `amazonUrl` lo pide el prompt 5 para extraer las actuaciones del producto.
 * - `targetAgeRange` y `targetGenders` los pide el prompt 3.
 */
export interface ProductResearchInputs {
  niche: string;
  competitorUrls: string[];
  amazonUrl: string;
  targetAgeRange: string;
  targetGenders: string[];
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  benefits: string[];
  features: string[];
  /** Solo los nombres. Lo que el copy usa de verdad es `ingredientDetails`. */
  ingredients: string[];
  /**
   * Los ingredientes con su mecanismo, para que el copy pueda argumentar.
   *
   * Opcional: los productos creados antes de esto no lo tienen y se rellena
   * analizando la web.
   */
  ingredientDetails?: ProductIngredient[];
  targetAudience: string;
  problemsSolved: string[];
  objections: string[];
  country: string;
  language: string;
  price: number;
  /**
   * Moneda del precio, cuando no se puede deducir de la tienda.
   *
   * Los productos de la competencia no tienen tienda ni mercado en la
   * plataforma, así que sin esto caían a euros por defecto y un producto
   * estadounidense de 49 dólares aparecía como «49 €».
   */
  currency?: string;
  landingUrl: string;
  images: string[];
  tone: string;
  status: ProductStatus;
  createdAt: string;
  owner: "own" | "competitor";
  /** Opcional para no romper productos creados antes de añadir los prompts. */
  researchInputs?: ProductResearchInputs;
  /** Tienda y mercado en los que vive. Opcional por compatibilidad. */
  storeId?: string;
  marketId?: string;
  /** Handle de la ficha en la tienda, para construir la URL del mercado. */
  handle?: string;
  /** Si viene de duplicar otro producto, de cuál. */
  duplicatedFromId?: string;
}

export interface AdCampaign {
  id: string;
  name: string;
  brand: string;
  relatedProductId: string;
  type: "own" | "competitor";
  platform: string;
  country: string;
  date: string;
  tags: string[];
  status: "analyzed" | "pending" | "draft";
  image: string;
}

export interface AnalysisResult {
  id: string;
  title: string;
  type: "analysis" | "copy";
  productId: string;
  productName: string;
  status: "completed" | "draft";
  createdAt: string;
  summary: string;
}

export interface BrandSettings {
  brandName: string;
  description: string;
  logo: string;
  colors: {
    primary: string;
    secondary: string;
  };
  voice: string;
  recommendedWords: string[];
  prohibitedWords: string[];
  audience: string;
  country: string;
  language: string;
  copyRules: string[];
  legalNotes: string[];
}

export interface ProductDocument {
  id: string;
  title: string;
  path: string;
  content: string;
  createdAt: string;
}

export interface ProductHook {
  id: string;
  title: string;
  body: string;
  awarenessLevel: "problem-aware" | "solution-aware" | "product-aware" | "brand-aware";
  desire: string;
  isUsed: boolean;
  createdAt: string;
  usedAt?: string;
}

export interface ProductInsightSummary {
  productPositioning: string;
  dominantDesire: string;
  dominantAwareness: string;
  topReasonsToBelieve: string[];
  topObjections: string[];
  topHooks: string[];
  marketingPriorities: string[];
  narrativeAngle: string;
  urgencyScore: number;
  trustScore: number;
  conversionScore: number;
}

export interface ProductInsightBundle {
  insights: ProductInsightSummary | null;
  hooks: ProductHook[];
}

export type AiProvider = "claude" | "chatgpt";

/** Configuración completa. Solo existe en el servidor: incluye las claves. */
export interface ProviderConfig {
  activeProvider: AiProvider;
  claudeApiKey: string;
  chatgptApiKey: string;
  /** Modelo de investigación: documentos largos con búsqueda web. */
  claudeModel: string;
  /** Modelo de redacción: copys y publirreportajes. */
  claudeCopyModel: string;
  /**
   * Modelo de extracción: convierte un informe ya escrito en JSON.
   *
   * Va aparte del de investigación **porque la tarea es otra**. Investigar exige
   * criterio, buscar y sintetizar; extraer es leer un texto que ya está y
   * rellenar un esquema que la API valida. Usar el modelo caro en el segundo
   * paso pagaba precio de razonamiento por un trabajo mecánico.
   */
  claudeExtractionModel: string;
  chatgptModel: string;
  /** Higgsfield usa un par id:secreto, no una clave suelta. */
  higgsfieldKeyId: string;
  higgsfieldKeySecret: string;
}

/**
 * Proyección segura que sí puede viajar al cliente.
 * Nunca incluye las claves, solo si están configuradas.
 */
export interface ProviderConfigView {
  activeProvider: AiProvider;
  claudeModel: string;
  claudeCopyModel: string;
  claudeExtractionModel: string;
  chatgptModel: string;
  hasClaudeApiKey: boolean;
  hasChatgptApiKey: boolean;
  hasHiggsfieldCredentials: boolean;
}
