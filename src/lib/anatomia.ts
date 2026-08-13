import type { VideoAnalysis } from "@/lib/video/analysis";
// Relativo y con extensión: es un import **de valor**, y con el alias `@/` el
// corredor de Node no lo resuelve y el test del módulo no se puede cargar.
import { inheritanceRule } from "./material-herencia.ts";

/**
 * La anatomía de un anuncio que funcionó.
 *
 * Probado en `anatomia.test.ts`: los dos imports son de tipo o de un módulo
 * puro, así que el corredor de Node lo carga.
 *
 * ## Por qué dos pasadas y no una
 *
 * Porque una sola respuesta con la anatomía **más** cinco ángulos es exactamente
 * del tamaño que se corta por longitud, y eso no falla a medias: devuelve JSON
 * incompleto y se pierde la vuelta entera, ya pagada.
 *
 * Y porque la anatomía se puede corregir antes de sacar nada. Arreglar aquí una
 * lectura equivocada del anuncio cuesta un minuto; descubrirla en cinco ángulos
 * ya escritos cuesta cinco, más lo que se pagó por escribirlos.
 */

export interface Anatomia {
  /** El material del archivo del que salió. */
  swipeId: string;
  /** Cómo entra: la primera frase y por qué para el scroll. */
  entrada: string;
  /** Qué promete, dicho como lo diría el anuncio. */
  promesa: string;
  /** A quién le habla, en sus términos y no en los nuestros. */
  publico: string;
  /** El deseo que explota. Es lo que después ancla cada ángulo. */
  deseo: string;
  /** Cómo se cuenta: orden de las partes y qué hace cada una. */
  estructura: { parte: string; papel: string }[];
  /** Ritmo y tono: quién parece que habla y a qué velocidad. */
  ritmo: string;
  /** Qué se enseña y cuándo, incluido el producto. */
  queEnsena: string;
  /** Las objeciones que toca y cómo las resuelve. */
  objeciones: { objecion: string; comoLaResuelve: string }[];
  /** Cómo cierra y qué pide. */
  cierre: string;
  /** Por qué funciona, en una frase que se pueda discutir. */
  porQueFunciona: string;
}

/**
 * Los vídeos, ya analizados, dichos en prosa.
 *
 * Van descritos y no como JSON crudo porque el modelo los lee mejor así, y
 * numerados para que la anatomía pueda decir «como en el vídeo 2».
 *
 * Sin vídeos devuelve cadena vacía, no un encabezado suelto: un título sin nada
 * debajo le dice al modelo que había vídeos y no los vio, y entonces supone qué
 * salía en ellos — que es la peor forma de rellenar un hueco.
 */
export function describeVideoAnalyses(analyses: VideoAnalysis[]): string {
  if (analyses.length === 0) return "";

  return analyses
    .map((item, index) =>
      [
        `### Vídeo ${index + 1}`,
        `- Cómo entra: ${item.hook}`,
        `- Qué promete: ${item.promise}`,
        `- Voz: ${item.voice}`,
        `- Plano cada ${item.averageShotSeconds.toLocaleString("es-ES")} s`,
        `- El producto: ${item.productMoment}`,
        `- Cierre: ${item.callToAction}`,
        `- Por qué funciona: ${item.whyItWorks}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export const ANATOMIA_SCHEMA = {
  type: "object",
  properties: {
    entrada: { type: "string" },
    promesa: { type: "string" },
    publico: { type: "string" },
    deseo: { type: "string" },
    estructura: {
      type: "array",
      items: {
        type: "object",
        properties: { parte: { type: "string" }, papel: { type: "string" } },
        required: ["parte", "papel"],
        additionalProperties: false,
      },
    },
    ritmo: { type: "string" },
    queEnsena: { type: "string" },
    objeciones: {
      type: "array",
      items: {
        type: "object",
        properties: { objecion: { type: "string" }, comoLaResuelve: { type: "string" } },
        required: ["objecion", "comoLaResuelve"],
        additionalProperties: false,
      },
    },
    cierre: { type: "string" },
    porQueFunciona: { type: "string" },
  },
  required: [
    "entrada",
    "promesa",
    "publico",
    "deseo",
    "estructura",
    "ritmo",
    "queEnsena",
    "objeciones",
    "cierre",
    "porQueFunciona",
  ],
  additionalProperties: false,
} as const;

/**
 * El encargo de la anatomía.
 *
 * Pide **describir**, no juzgar ni mejorar: lo que se busca es cómo está
 * construido el anuncio. A un modelo al que se le pide opinión se le va la mano
 * proponiendo cambios, y entonces describe lo que él haría en vez de lo que
 * tiene delante.
 */
export function buildAnatomiaPrompt(input: {
  copy: string;
  ownership: "propio" | "ajeno";
  videos: string;
}): string {
  return `## El material

${inheritanceRule(input.ownership)}

### El copy, entero

${input.copy}

${input.videos ? `## Los vídeos que se lanzaron con él\n\n${input.videos}\n` : ""}
## Qué tienes que hacer

Descríbelo. No lo juzgues, no propongas mejoras y no lo reescribas: hace falta
entender **cómo está construido** para poder construir otra cosa igual de buena
entrando por otro sitio.

Si te doy imágenes, míralas: forman parte del anuncio tanto como el texto.

En \`porQueFunciona\`, di algo que se pueda discutir —un mecanismo concreto—, no
un elogio. «Conecta con el público» no es una respuesta.`;
}
