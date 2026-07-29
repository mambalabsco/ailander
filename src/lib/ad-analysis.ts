import type { Product } from "@/types";

/**
 * Motor de análisis simulado.
 *
 * No llama a ninguna IA: deriva un resultado plausible y estable a partir de
 * los datos del producto, de modo que cada producto produzca una lectura
 * distinta y coherente. Cuando se conecte un proveedor real, basta con
 * sustituir `analyzeAd` por la llamada a la API manteniendo el mismo tipo.
 */

export interface AdAnalysis {
  detectedText: string;
  summary: string;
  productName: string;
  targetAudience: string;
  hook: string;
  promise: string;
  problem: string;
  emotion: string;
  offer: string;
  cta: string;
  awarenessLevel: string;
  trustSignals: string[];
  visualDesign: string;
  strengths: string[];
  weaknesses: string[];
  improvementIdeas: string[];
  derivedAngles: string[];
  scores: {
    clarity: number;
    emotion: number;
    differentiation: number;
    conversion: number;
  };
}

/** Hash estable: mismo producto, mismo resultado en servidor y cliente. */
function stableSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick<T>(items: readonly T[], seed: number, offset = 0): T {
  return items[(seed + offset) % items.length];
}

function scoreFrom(seed: number, offset: number): number {
  return 6 + ((seed + offset) % 4);
}

const emotions = [
  "Confianza y bienestar",
  "Alivio y tranquilidad",
  "Aspiración y autoestima",
  "Urgencia y oportunidad",
] as const;

const visualStyles = [
  "Minimalista, con foco en el producto y texto corto",
  "Editorial, con tipografía grande y mucho aire",
  "Antes/después, con contraste alto y prueba visual",
  "Lifestyle, con la persona usando el producto en contexto",
] as const;

const ctas = ["Compra ahora", "Descúbrelo hoy", "Pruébalo sin riesgo", "Quiero saber más"] as const;

const awarenessLevels = [
  "Consciente del problema",
  "Consciente de la solución",
  "Consciente del producto",
] as const;

export function analyzeAd(product: Product, context = ""): AdAnalysis {
  const seed = stableSeed(product.id + product.name);

  const benefit = product.benefits[0] ?? "un resultado claro y visible";
  const secondBenefit = product.benefits[1] ?? "una experiencia más simple";
  const problem = product.problemsSolved[0] ?? "la falta de una solución clara";
  const objection = product.objections[0] ?? "el precio";
  const feature = product.features[0] ?? "su formulación";

  const strengths = [
    `Mensaje alineado con "${benefit.toLowerCase()}"`,
    `Tono ${product.tone.toLowerCase()} coherente con la marca`,
    "Poca fricción visual y lectura rápida",
  ];

  const weaknesses = [
    `No responde a la objeción de ${objection.toLowerCase()}`,
    "La prueba social es débil o llega tarde",
    "El llamado a la acción es genérico",
  ];

  return {
    detectedText: `${benefit} con ${product.name}.`,
    summary: `El anuncio comunica ${benefit.toLowerCase()} apoyándose en ${feature.toLowerCase()}, con un estilo ${product.tone.toLowerCase()} dirigido a ${product.targetAudience || "su público principal"}.${context ? ` Contexto aportado: ${context}` : ""}`,
    productName: product.name,
    targetAudience: product.targetAudience || "Sin definir",
    hook: `${benefit} sin complicaciones`,
    promise: `${secondBenefit} desde el primer uso`,
    problem,
    emotion: pick(emotions, seed),
    offer:
      product.price > 0
        ? `Precio de referencia ${product.price} con incentivo de primera compra`
        : "Oferta de entrada por definir",
    cta: pick(ctas, seed, 1),
    awarenessLevel: pick(awarenessLevels, seed, 2),
    trustSignals: [
      product.ingredients[0] ? `Composición visible: ${product.ingredients[0]}` : "Ingredientes o materiales visibles",
      "Testimonios de usuarios reales",
      "Garantía o devolución sin fricción",
    ],
    visualDesign: pick(visualStyles, seed, 3),
    strengths,
    weaknesses,
    improvementIdeas: [
      `Abrir con el problema: "${problem}"`,
      `Añadir una prueba concreta que neutralice ${objection.toLowerCase()}`,
      "Cerrar con un CTA que nombre el beneficio, no la acción",
    ],
    derivedAngles: [
      `Ángulo de alivio: de ${problem.toLowerCase()} a ${benefit.toLowerCase()}`,
      `Ángulo de autoridad: ${feature.toLowerCase()} como razón para creer`,
      `Ángulo de identidad: para ${product.targetAudience || "tu público"}`,
    ],
    scores: {
      clarity: scoreFrom(seed, 0),
      emotion: scoreFrom(seed, 1),
      differentiation: scoreFrom(seed, 2),
      conversion: scoreFrom(seed, 3),
    },
  };
}

/* ------------------------------- Generador de copy ------------------------------ */

export type CopyFormat =
  | "Facebook Ads"
  | "Instagram Ads"
  | "Landing page"
  | "Advertorial"
  | "Email"
  | "Guion de video"
  | "Descripción de producto"
  | "Titulares";

export const copyFormats: CopyFormat[] = [
  "Facebook Ads",
  "Instagram Ads",
  "Landing page",
  "Advertorial",
  "Email",
  "Guion de video",
  "Descripción de producto",
  "Titulares",
];

export interface GeneratedCopy {
  headline: string;
  body: string;
  cta: string;
  variants: string[];
}

/**
 * Adapta un texto largo al producto elegido, opcionalmente diferenciándose
 * de un competidor. Igual que `analyzeAd`, es una simulación determinista.
 */
export function generateCopy(options: {
  sourceText: string;
  product: Product;
  competitor?: Product | null;
  format: CopyFormat;
  tone: string;
}): GeneratedCopy {
  const { sourceText, product, competitor, format, tone } = options;
  const seed = stableSeed(product.id + format + tone);

  const benefit = product.benefits[0] ?? "un resultado claro";
  const secondBenefit = product.benefits[1] ?? "una rutina más simple";
  const problem = product.problemsSolved[0] ?? "la falta de resultados";
  const audience = product.targetAudience || "quienes buscan una solución fiable";

  const summarySource = sourceText.trim().slice(0, 220);
  const differentiator = competitor
    ? `A diferencia de ${competitor.name}, ${product.name} apuesta por ${product.tone.toLowerCase()} en lugar de ${competitor.tone.toLowerCase()}.`
    : "";

  const headline = `${product.name}: ${benefit.toLowerCase()} sin renunciar a nada`;

  const intros: Record<string, string> = {
    "Facebook Ads": `¿Sigues lidiando con ${problem.toLowerCase()}?`,
    "Instagram Ads": `Esto es lo que cambia cuando resuelves ${problem.toLowerCase()}.`,
    "Landing page": `${product.name}, pensado para ${audience}.`,
    Advertorial: `Lo que nadie te cuenta sobre ${problem.toLowerCase()}.`,
    Email: `Un minuto: esto puede cambiar tu rutina.`,
    "Guion de video": `[Plano 1] Primer plano del problema: ${problem.toLowerCase()}.`,
    "Descripción de producto": `${product.name} — ${product.category}`,
    Titulares: `10 formas de decir "${benefit.toLowerCase()}"`,
  };

  const body = [
    intros[format] ?? intros["Facebook Ads"],
    "",
    `${product.name} está hecho para ${audience}. ${summarySource || product.description}`,
    "",
    `Qué cambia: ${benefit.toLowerCase()} y ${secondBenefit.toLowerCase()}.`,
    differentiator,
    "",
    `Tono aplicado: ${tone}.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    headline,
    body,
    cta: pick(ctas, seed),
    variants: [
      `${benefit} desde el primer uso.`,
      `Para ${audience}: se acabó ${problem.toLowerCase()}.`,
      `${product.name}, la versión simple de ${benefit.toLowerCase()}.`,
    ],
  };
}
