import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { copyModel, createClaudeClient, researchModel } from "@/lib/claude";

/**
 * Motor común de las generaciones cortas.
 *
 * Todas siguen la misma forma: un prompt, un esquema, una llamada. Lo que
 * cambia es el modelo —investigación con Opus, redacción con Sonnet— y si hace
 * falta búsqueda web.
 *
 * Tres cosas que están aquí porque se aprendieron rompiéndolas:
 *
 * - **Streaming siempre.** Aunque estas salidas son cortas, una tanda de diez
 *   anuncios roza los 10.000 tokens y sin streaming la petición caduca.
 * - **`stop_reason` antes que el contenido.** En un rechazo el array viene
 *   vacío y leer `content[0]` revienta.
 * - **`pause_turn` se reanuda.** Solo lo produce la búsqueda web, pero cuando
 *   pasa la respuesta *parece* terminada: tiene texto y no da error.
 */

export interface GenerationOutcome<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
}

const MAX_CONTINUATIONS = 4;

function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export async function generateStructured<T>(options: {
  prompt: string;
  schema: Record<string, unknown>;
  /** `copy` usa el modelo de redacción; `research` el de investigación. */
  role: "copy" | "research";
  /** Solo la búsqueda de competidores la necesita. */
  webSearch?: boolean;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<GenerationOutcome<T>> {
  const client = await createClaudeClient();
  const model = options.role === "copy" ? await copyModel() : await researchModel();

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: options.prompt }];

  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt += 1) {
    const stream = client.messages.stream({
      model,
      max_tokens: options.maxTokens ?? 32_000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: options.effort ?? "high",
        format: { type: "json_schema", schema: options.schema },
      },
      ...(options.webSearch
        ? { tools: [{ type: "web_search_20260209" as const, name: "web_search", max_uses: 8 }] }
        : {}),
      messages,
    });

    const message = await stream.finalMessage();

    inputTokens += message.usage.input_tokens;
    outputTokens += message.usage.output_tokens;

    if (message.stop_reason === "refusal") {
      throw new Error("El modelo declinó la petición.");
    }

    if (message.stop_reason === "pause_turn") {
      // La búsqueda web agotó su tope de vueltas. Se devuelve el turno tal cual
      // y el servidor continúa; no hay que añadir ningún «continúa».
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    if (message.stop_reason === "max_tokens") {
      throw new Error(
        "La respuesta se cortó por longitud. Prueba a generar menos piezas de una vez.",
      );
    }

    return {
      // Con `output_config.format` la API valida la forma, así que si esto
      // fallara sería un problema de la propia API, no del modelo.
      data: JSON.parse(textFrom(message.content)) as T,
      inputTokens,
      outputTokens,
    };
  }

  throw new Error("La búsqueda web no terminó después de varias reanudaciones.");
}

/* ------------------------- Piezas largas, con longitud ------------------------- */

export interface LongCopyResult {
  primaryText: string;
  headline: string;
  description: string;
  /** Contado aquí, no lo que el modelo dijo de sí mismo. */
  wordCount: number;
  /** Si hubo que pedir una ampliación, y cómo quedó. */
  note: string;
}

/**
 * Genera una pieza larga y **comprueba que tiene la longitud pedida**.
 *
 * ## El fallo que corrige
 *
 * El esquema pedía al modelo un campo `wordCount` y ese número se guardaba tal
 * cual. O sea: el modelo informaba de su propia longitud y se le creía. Una pieza
 * de cuatrocientas palabras podía declarar mil doscientas y nadie se enteraba.
 * El síntoma era «salen copys cortos» sin ninguna pista de por qué.
 *
 * Ahora se cuenta aquí y, si falta texto, se pide **una** ampliación. Una y no
 * más: si a la segunda sigue corto, el problema es el prompt o el material de la
 * investigación, y seguir insistiendo solo gasta dinero. En ese caso se devuelve
 * lo que haya con la nota puesta, que es más útil que un error —una pieza corta
 * se puede alargar a mano; una generación perdida, no—.
 */
export async function generateLongCopy(options: {
  prompt: string;
  schema: Record<string, unknown>;
  range: [number, number];
  maxTokens?: number;
}): Promise<GenerationOutcome<LongCopyResult>> {
  const { checkLength, expansionPrompt } = await import("@/lib/word-count");

  const first = await generateStructured<{
    primaryText: string;
    headline: string;
    description: string;
  }>({
    prompt: options.prompt,
    schema: options.schema,
    role: "copy",
    maxTokens: options.maxTokens ?? 32_000,
  });

  let inputTokens = first.inputTokens;
  let outputTokens = first.outputTokens;
  let result = first.data;

  const check = checkLength(result.primaryText, options.range);

  if (check.verdict === "corto") {
    /*
     * Se pide continuar y desarrollar, no reescribir.
     *
     * Reescribir devuelve otra pieza igual de corta, porque el modelo repite su
     * propio criterio de longitud. Decirle **dónde** añadir —más escena, una
     * objeción más, la prueba que faltó— es lo que produce la ampliación de
     * verdad.
     */
    const expanded = await generateStructured<{
      primaryText: string;
      headline: string;
      description: string;
    }>({
      prompt: expansionPrompt({
        current: result.primaryText,
        words: check.words,
        range: options.range,
      }),
      schema: options.schema,
      role: "copy",
      maxTokens: options.maxTokens ?? 32_000,
    });

    inputTokens += expanded.inputTokens;
    outputTokens += expanded.outputTokens;

    const second = checkLength(expanded.data.primaryText, options.range);

    // Solo se acepta la ampliación si de verdad añadió texto. Un modelo que
    // devuelve algo más corto que el original ha reescrito, no ampliado.
    if (second.words > check.words) {
      result = {
        ...expanded.data,
        // El titular original se conserva si la ampliación no trajo uno: es el
        // que se validó contra el marco de escritura.
        headline: expanded.data.headline || result.headline,
        description: expanded.data.description || result.description,
      };
    }

    const final = checkLength(result.primaryText, options.range);

    return {
      data: {
        ...result,
        wordCount: final.words,
        note:
          final.verdict === "corto"
            ? `Salió corto (${check.words} palabras) y la ampliación lo dejó en ${final.words}. Sigue por debajo de ${options.range[0]}: revísalo a mano.`
            : `Salió corto (${check.words} palabras) y se amplió a ${final.words}.`,
      },
      inputTokens,
      outputTokens,
    };
  }

  return {
    data: { ...result, wordCount: check.words, note: check.message },
    inputTokens,
    outputTokens,
  };
}

/**
 * Recorta a los límites del gestor de anuncios de Meta.
 *
 * El esquema no puede imponer `maxLength`, y un título de 45 caracteres se
 * corta con puntos suspensivos en el anuncio real. Se recorta por palabra, no
 * a mitad de una, porque un título partido queda peor que uno más corto.
 */
export function clampToLimit(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;

  const cut = trimmed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}
