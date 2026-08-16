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
  /**
   * De quién era el material.
   *
   * Se guarda **dentro de la anatomía** y no solo en `swipe_copies` porque es
   * aquí donde hace falta: al sacar una tanda de anuncios meses después, lo
   * único que se elige es la anatomía, y sin este campo no hay forma de saber si
   * sus cifras se pueden repetir. Un material pegado desde Ads además no deja
   * fila en `swipe_copies`, así que ahí no habría dónde mirarlo.
   */
  ownership: "propio" | "ajeno";
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

/**
 * Una anatomía leída de `payload`, con los huecos rellenos.
 *
 * `payload` es JSON: puede traer cualquier cosa, y las anatomías escritas antes
 * de que existiera `ownership` no lo llevan. Se normaliza **al leer** y no al
 * escribir porque lo que ya está guardado no se puede cambiar hacia atrás.
 *
 * `ajeno` por defecto es el lado seguro: como mucho prohíbe heredar algo que sí
 * se podía. Al revés, un `propio` supuesto deja salir la cifra de otra marca
 * dicha como nuestra, y eso no da ningún error.
 */
export function normalizeAnatomia(payload: unknown): Anatomia {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const text = (value: unknown): string => (typeof value === "string" ? value : "");

  return {
    swipeId: text(raw.swipeId),
    ownership: raw.ownership === "propio" ? "propio" : "ajeno",
    entrada: text(raw.entrada),
    promesa: text(raw.promesa),
    publico: text(raw.publico),
    deseo: text(raw.deseo),
    estructura: Array.isArray(raw.estructura) ? (raw.estructura as Anatomia["estructura"]) : [],
    ritmo: text(raw.ritmo),
    queEnsena: text(raw.queEnsena),
    objeciones: Array.isArray(raw.objeciones) ? (raw.objeciones as Anatomia["objeciones"]) : [],
    cierre: text(raw.cierre),
    porQueFunciona: text(raw.porQueFunciona),
  };
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

/* ---------------------------- De la anatomía a ángulos ------------------------- */

export interface AnguloDevuelto {
  nombre: string;
  deseo: string;
  publico: string;
  arco: { inicio: string; crisis: string; descubrimiento: string; resolucion: string };
  mecanismoProblema: string;
  mecanismoSolucion: string;
  momentoEmocional: string;
  /** Vacío cuando el ángulo se sostiene con lo que hay investigado. */
  promesaPorValidar: string;
}

export const ANGULOS_SCHEMA = {
  type: "object",
  properties: {
    angulos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          deseo: { type: "string" },
          publico: { type: "string" },
          arco: {
            type: "object",
            properties: {
              inicio: { type: "string" },
              crisis: { type: "string" },
              descubrimiento: { type: "string" },
              resolucion: { type: "string" },
            },
            required: ["inicio", "crisis", "descubrimiento", "resolucion"],
            additionalProperties: false,
          },
          mecanismoProblema: { type: "string" },
          mecanismoSolucion: { type: "string" },
          momentoEmocional: { type: "string" },
          promesaPorValidar: { type: "string" },
        },
        required: [
          "nombre",
          "deseo",
          "publico",
          "arco",
          "mecanismoProblema",
          "mecanismoSolucion",
          "momentoEmocional",
          "promesaPorValidar",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["angulos"],
  additionalProperties: false,
} as const;

/**
 * El encargo de los ángulos.
 *
 * Pide entradas **distintas entre sí** y no la misma idea reformulada: un
 * anuncio que funciona suele tener dentro más de una puerta —el miedo, el
 * atajo, la identidad— y sacar cinco variantes de la misma no da cinco ángulos,
 * da uno escrito cinco veces.
 *
 * **No se acota por lo que el producto pueda prometer hoy.** Eso es lo pedido:
 * lo que se busca es el enfoque, y un mecanismo que funciona es reutilizable
 * aunque el producto de origen prometiera otra cosa. La acotación sigue viva
 * donde siempre estuvo —el encargo del copy, que no puede afirmar lo que el
 * producto no hace—, y un ángulo que pida más sale **marcado, no censurado**:
 * un ángulo silenciado es uno que no se puede discutir.
 */
export function buildAngulosPrompt(input: { anatomia: Anatomia; cuantos: number }): string {
  const { anatomia, cuantos } = input;

  return `## La anatomía del anuncio que funcionó

- Cómo entra: ${anatomia.entrada}
- Qué promete: ${anatomia.promesa}
- A quién le habla: ${anatomia.publico}
- El deseo que explota: ${anatomia.deseo}
- Ritmo y tono: ${anatomia.ritmo}
- Qué enseña: ${anatomia.queEnsena}
- Cómo cierra: ${anatomia.cierre}
- Por qué funciona: ${anatomia.porQueFunciona}

Cómo está construido:
${anatomia.estructura.map((item) => `- ${item.parte}: ${item.papel}`).join("\n")}

Objeciones que toca:
${anatomia.objeciones.map((item) => `- ${item.objecion} → ${item.comoLaResuelve}`).join("\n")}

## Qué tienes que hacer

Escribe **${cuantos} ángulos distintos** para nuestro producto, tomando de aquí el
mecanismo y extendiéndolo.

Distintos de verdad: cada uno tiene que entrar por una puerta diferente —un
miedo, un atajo, una identidad, una comparación—, no ser el mismo ángulo con
otras palabras. Si dos se parecen, sobra uno.

Devuélvelos en una lista, ${cuantos} en total y en ese orden.

**No te limites por lo que el producto pueda prometer hoy**: lo que se busca es
el enfoque. Si un ángulo necesita una promesa que la investigación no sostiene,
escríbelo igual y dilo en \`promesaPorValidar\`. Si se sostiene con lo que hay,
deja ese campo vacío.`;
}
