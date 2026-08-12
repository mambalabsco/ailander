import type { AwarenessLevel } from "@/types/research";
import type { Intensity, StoryBeat } from "@/lib/story-beats";

/**
 * Ángulos y textos publicitarios.
 *
 * Hallazgo que ordena todo esto: en `longs.md`, los prompts 8 y 10 tienen el
 * cuerpo **idéntico byte a byte** (36 líneas, cero diferencias). Lo único que
 * cambia es la variable de entrada — el 8 recibe un deseo masivo y el 10 un
 * ángulo — y el 10 ni siquiera actualizó la etiqueta, sigue diciendo "para este
 * deseo masivo" mientras inserta un ángulo.
 *
 * Es decir: no son dos métodos, es un generador con dos orígenes posibles. Por
 * eso aquí hay un solo `long-copy` con un campo `driver`, y no dos formatos.
 *
 * La entidad central no es el copy sino el **ángulo**: lleva el mecanismo único
 * del problema (UMP) y el de la solución (UMS), y de él comen tanto el long copy
 * como los advertorials.
 */

/* ---------------------------------- Ángulos ------------------------------------ */

/** Prompt 9: cinco historias distintas para el mismo deseo masivo. */
export interface MarketingAngle {
  id: string;
  productId: string;
  /** Para qué mercado se escribió. **Indefinido es general**: vale en todos. */
  marketId?: string;
  /** Deseo masivo del documento 6 del que sale este ángulo. */
  desire: string;
  name: string;
  targetAudience: string;
  storyArc: {
    start: string;
    crisis: string;
    discovery: string;
    resolution: string;
  };
  /** UMP — la razón oculta y contraintuitiva por la que el problema persiste. */
  problemMechanism: string;
  /** UMS — por qué esta solución funciona donde las demás fallan. */
  solutionMechanism: string;
  emotionalMoment: string;
  createdAt: string;
}

/* ------------------------------- Textos generados ------------------------------ */

export const COPY_FORMATS = ["long-copy", "advertorial", "short-ad"] as const;
export type CopyFormat = (typeof COPY_FORMATS)[number];

export const COPY_FORMAT_LABELS: Record<CopyFormat, string> = {
  "long-copy": "Long copy",
  advertorial: "Publirreportaje",
  "short-ad": "Anuncio corto",
};

/** De qué se alimenta el texto: del deseo (línea base) o de un ángulo concreto. */
export type CopyDriver = "desire" | "angle";

/**
 * Los tres campos que pide el gestor de anuncios de Facebook.
 *
 * Ningún prompt del documento los genera: todos producen solo el cuerpo. El
 * título y la descripción se derivan del cuerpo en la misma llamada, con los
 * límites reales de la plataforma, para que el texto salga listo para pegar.
 */
export interface FacebookAdCopy {
  primaryText: string;
  headline: string;
  description: string;
}

/** Límites del gestor de anuncios de Meta, para avisar antes de exportar. */
export const FACEBOOK_LIMITS = {
  headline: 40,
  description: 30,
} as const;

export type GeneratedCopyStatus = "draft" | "approved" | "used";

export interface GeneratedCopy {
  id: string;
  productId: string;
  /**
   * Para qué mercado se escribió. **Indefinido es general**: vale en todos.
   *
   * Un copy general no lleva precio ni acento local, así que no puede publicarse
   * tal cual en un país sin pasar por una adaptación.
   */
  marketId?: string;
  format: CopyFormat;
  /** Marco usado, de `COPY_METHODS`. */
  methodId: string;
  driver: CopyDriver;
  /** El deseo masivo o el nombre del ángulo, según el `driver`. */
  driverLabel: string;
  angleId?: string;
  hookId?: string;
  awarenessLevel: AwarenessLevel;
  content: FacebookAdCopy;
  wordCount: number;
  status: GeneratedCopyStatus;
  /**
   * Conjunto de anuncios en el que se publica.
   *
   * Un long copy o un publirreportaje es un anuncio de Meta como cualquier otro:
   * su cuerpo va en el texto principal. Por eso entra en la misma jerarquía que
   * los anuncios cortos, con su nombre y su número correlativo.
   */
  adsetId?: string;
  adNumber?: number;
  adName?: string;
  /**
   * Escenas sacadas del propio texto, para las creatividades.
   *
   * Se guardan las escenas y no los prompts: extraerlas cuesta una llamada al
   * modelo, convertirlas en prompt es una función pura. Así una mejora en las
   * reglas de composición se aplica a todo el histórico sin volver a pagar.
   */
  storyBeats?: StoryBeat[];
  beatsIntensity?: Intensity;
  createdAt: string;
}

/* ------------------------------ Marcos de escritura ---------------------------- */

export interface CopyMethod {
  id: string;
  format: CopyFormat;
  name: string;
  /** Si viene del documento o lo hemos añadido siguiendo la misma metodología. */
  origin: "documento" | "propio";
  /** Referencia al prompt original, cuando la tiene. */
  sourcePrompt?: string;
  narrator: string;
  wordRange: [number, number];
  readingLevel: string;
  summary: string;
  whenToUse: string;
  /** Si acepta ángulo como origen además del deseo. */
  supportsAngleDriver: boolean;
}

export const COPY_METHODS: CopyMethod[] = [
  {
    id: "long-copy-discovery",
    format: "long-copy",
    name: "Historia de descubrimiento personal",
    origin: "documento",
    sourcePrompt: "Prompts 8 y 10 (cuerpo idéntico)",
    narrator: "Alguien que vivió el problema, en primera persona",
    wordRange: [1200, 1400],
    readingLevel: "Conversacional, párrafos de 1-3 frases",
    summary:
      "Historia cruda de un descubrimiento desesperado a las 2 de la madrugada. El mecanismo único aparece tejido en la narración, nunca explicado.",
    whenToUse:
      "Es el formato base de long copy para Facebook. Con el deseo como origen sirve de control; con un ángulo, produce cada una de las variantes.",
    supportsAngleDriver: true,
  },
  {
    id: "advertorial-nightmare",
    format: "advertorial",
    name: "Pesadilla personal",
    origin: "documento",
    sourcePrompt: "Prompt 11(a)",
    narrator: "Un cliente que descubrió el producto, nunca la empresa",
    wordRange: [900, 1200],
    readingLevel: "Máximo 5.º grado",
    summary:
      "Testimonio con estructura RMBC y flujo dolor → agitar → solución. Abre con una frase de 6 a 12 palabras que va directa al miedo.",
    whenToUse:
      "Cuando hay una crisis concreta que contar y el lector puede reconocerse en ella. El motor es la identificación.",
    supportsAngleDriver: true,
  },
  {
    id: "advertorial-authority",
    format: "advertorial",
    name: "Revelación de autoridad",
    origin: "documento",
    sourcePrompt: "Prompt 11(b)",
    narrator: "Un experto con credenciales que rompe filas",
    wordRange: [1200, 1500],
    readingLevel: "5.º a 8.º grado",
    summary:
      "Un profesional descubre que la sabiduría convencional está equivocada y lo hace público. Desmonta una a una las soluciones comunes por no atacar el UMP.",
    whenToUse:
      "Cuando hay una creencia establecida que contradecir y el testimonio emocional no bastaría. El motor es la validación: «tus instintos tenían razón».",
    supportsAngleDriver: true,
  },
  {
    id: "advertorial-listicle",
    format: "advertorial",
    name: "Listicle de señales",
    origin: "propio",
    narrator: "Alguien que reconoce las señales, con firma de persona real",
    wordRange: [900, 1300],
    readingLevel: "Máximo 5.º grado, frases cortas",
    summary:
      "Una lista numerada de señales o creencias del lector, cada una titulada con sus propias palabras. El producto no aparece hasta después de la lista.",
    whenToUse:
      "Cuando el lector no se identificaría con una sola historia pero sí con una lista de síntomas sueltos. Se lee salteado y engancha por reconocimiento acumulado.",
    supportsAngleDriver: true,
  },
  {
    id: "advertorial-trial",
    format: "advertorial",
    name: "Prueba de 30 días en primera persona",
    origin: "propio",
    narrator: "Alguien escéptico que documenta su propia prueba",
    wordRange: [1000, 1300],
    readingLevel: "Máximo 5.º grado",
    summary:
      "Diario de una prueba: escepticismo declarado el día 1, primeras señales, punto en el que cambia de opinión y resultado final. Fechas y detalles concretos.",
    whenToUse:
      "Cuando el resultado tarda en verse y la objeción real es «esto no me va a funcionar a mí». El escepticismo inicial del narrador es la prueba social.",
    supportsAngleDriver: true,
  },
  {
    id: "advertorial-investigation",
    format: "advertorial",
    name: "Investigación tipo reportaje",
    origin: "propio",
    narrator: "Un periodista que investiga por qué falla la categoría entera",
    wordRange: [1200, 1500],
    readingLevel: "6.º a 8.º grado",
    summary:
      "Reportaje que arranca de un dato incómodo, entrevista fuentes, descarta explicaciones fáciles y llega al UMP. Tono frío, sin apelación emocional directa.",
    whenToUse:
      "En nichos donde el testimonio emocional genera desconfianza y el lector castiga el tono publicitario.",
    supportsAngleDriver: true,
  },
  {
    id: "advertorial-comparison",
    format: "advertorial",
    name: "Comparativa contra la alternativa obvia",
    origin: "propio",
    narrator: "Alguien que usó durante años lo que el lector usa ahora",
    wordRange: [1000, 1300],
    readingLevel: "Máximo 5.º grado",
    summary:
      "Enfrenta el producto a lo que el lector ya usa y explica por el UMP por qué esa alternativa nunca pudo funcionar, sin descalificarla.",
    whenToUse:
      "Público consciente de la solución que ya tiene una alternativa y necesita una razón mecánica, no una promesa, para cambiar.",
    supportsAngleDriver: true,
  },
];

export function findCopyMethod(id: string): CopyMethod | undefined {
  return COPY_METHODS.find((method) => method.id === id);
}

export function methodsForFormat(format: CopyFormat): CopyMethod[] {
  return COPY_METHODS.filter((method) => method.format === format);
}
