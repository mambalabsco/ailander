import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { createClaudeClient, researchModel, extractionModel } from "@/lib/claude";
import { buildResearchPrompt, type ResearchExtras } from "@/lib/research-prompts";
import { saveResearchDocument } from "@/lib/data/research";
import { readProductResearch } from "@/lib/research-store";
import { describeApiError } from "@/lib/api-errors";
import { recordRun } from "@/lib/data/runs";
import { logError } from "@/lib/data/errors";
import { RESEARCH_SCHEMAS } from "@/lib/research-schemas";
import { RESEARCH_DOCUMENT_META } from "@/types/research";
import type { ProductResearch, ResearchDocumentId } from "@/types/research";
import type { Product } from "@/types";
import type { Store } from "@/types/store";

/**
 * Genera un documento de investigación con Claude.
 *
 * Cinco cosas que hay que hacer bien aquí, y que no son obvias:
 *
 * 1. **Hay que transmitir en streaming.** Un documento ocupa entre 8.000 y
 *    16.000 tokens de salida; sin streaming la petición HTTP caduca antes de
 *    terminar y se pierde todo lo generado —y pagado— hasta ese momento.
 *
 * 2. **Hay que reanudar en `pause_turn`.** La búsqueda web corre en el
 *    servidor de Anthropic con un tope de 10 vueltas. Al llegar, la respuesta
 *    vuelve con `stop_reason: "pause_turn"` y **parece terminada**: tiene
 *    texto, no da error. Si no se reanuda, se guarda un informe a medias como
 *    si estuviera completo.
 *
 * 3. **Hay que mirar `stop_reason` antes que el contenido.** Con
 *    `stop_reason: "refusal"` el array de contenido puede venir vacío, y leer
 *    `content[0]` revienta.
 *
 * 4. **Son dos llamadas, no una.** La primera investiga y escribe el informe;
 *    la segunda lee ese informe y devuelve el JSON con `output_config.format`,
 *    que la API valida contra el esquema.
 *
 *    La primera versión pedía informe y JSON juntos y se rompió en la primera
 *    prueba real: 26 búsquedas, 65.000 caracteres de informe, y corte por
 *    longitud justo antes del JSON. Dos dólares por un documento que el panel
 *    no podía leer. La extracción aparte no puede cortarse por lo largo que
 *    salga el informe, no gasta búsquedas, y además garantiza la forma —se
 *    acabó comprobar a mano si los niveles de conciencia venían bien escritos.
 *
 * 5. **El estado se persiste antes y después.** Si el proceso se cae a mitad,
 *    el documento queda en «generando» y se puede reintentar, en lugar de
 *    desaparecer sin rastro.
 */

export interface ResearchRunResult {
  ok: boolean;
  documentId: ResearchDocumentId;
  reason?: string;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
}

/** Cuántas veces se reanuda un `pause_turn` antes de rendirse. */
const MAX_CONTINUATIONS = 6;

/**
 * Cuántas búsquedas web puede hacer un documento.
 *
 * ## Por qué bajó de 12 a 8
 *
 * Porque el coste de buscar **no crece en línea recta, crece con el cuadrado**:
 * cada vuelta reprocesa todo lo acumulado hasta ese momento —el encargo, los
 * resultados anteriores y lo escrito— más lo que traiga la nueva. La búsqueda
 * número doce no cuesta como la primera: cuesta como todo lo que hay delante.
 *
 * Medido el 12 de agosto: 15,4 millones de tokens de entrada en 47 llamadas,
 * dos tercios del gasto de la plataforma entera. Pasar de 12 a 8 quita en torno
 * a la mitad de esa cifra.
 *
 * ## Qué se compra con ello, dicho claro
 *
 * Menos evidencia por informe. Es un cambio de calidad, no un ajuste técnico, y
 * por eso está aquí con nombre en vez de escondido en la llamada: si los
 * informes salen peor, se sube este número y se acabó.
 */
const MAX_BUSQUEDAS = 8;

/**
 * Cuánto esfuerzo pone el modelo.
 *
 * `high` es lo que hace que busque más y razone más, así que es la otra mitad
 * de la misma palanca que `MAX_BUSQUEDAS`. En `medium` sigue investigando en
 * serio y gasta bastante menos.
 *
 * Se baja **junto con** las búsquedas y no antes: son la misma decisión tomada
 * dos veces, y moverlas por separado hace imposible saber cuál de las dos
 * cambió el resultado.
 */
const ESFUERZO = "medium" as const;

/**
 * La caché sobre lo que se acumula, que es lo caro de verdad.
 *
 * ## Por qué el encargo no bastaba
 *
 * Medido el 12 de agosto de 2026: un encargo de investigación son unos 1.500
 * tokens, y una llamada gasta **328.000 de entrada de media**. O sea que el
 * encargo es el 0,4% de lo que se manda una vez; el resto son los resultados de
 * búsqueda, que se acumulan y se reprocesan enteros en cada vuelta. Cachear solo
 * el encargo ahorraba un dígito porcentual. Lo que hay que cachear es la
 * conversación entera según crece.
 *
 * ## Por qué la marca se mueve en vez de sumarse
 *
 * Porque la API admite **cuatro puntos de caché por petición** y aquí hay hasta
 * seis reanudaciones: marcar cada turno daría siete y la petición se rechaza.
 * No hace falta: un punto cubre todo lo que va por delante de él, así que basta
 * con el encargo y los dos últimos turnos. Se guardan dos y no uno por la
 * ventana de búsqueda hacia atrás —la API mira como mucho veinte bloques—, y un
 * turno con muchos resultados de búsqueda puede pasarse de veinte él solo.
 */
const MARCA = { type: "ephemeral" } as const;

/** Cuántos turnos del asistente conservan su marca, además del encargo. */
const TURNOS_MARCADOS = 2;

/**
 * Copia el contenido poniendo la marca en su último bloque de **texto**.
 *
 * En el último de texto y no en el último a secas: un turno con búsqueda acaba
 * a menudo en un bloque de resultado de herramienta, y esos no son de los que
 * admiten la marca. Como el punto de caché cubre todo lo anterior, marcar el
 * último texto deja fuera como mucho la cola.
 */
function conMarcaDeCache(content: Anthropic.ContentBlock[]): Anthropic.ContentBlockParam[] {
  const bloques = [...content] as Anthropic.ContentBlockParam[];

  for (let i = bloques.length - 1; i >= 0; i -= 1) {
    const bloque = bloques[i];

    if (bloque.type === "text") {
      bloques[i] = { ...bloque, cache_control: MARCA };
      return bloques;
    }
  }

  return bloques;
}

/** Quita la marca de un turno, para no pasarse del tope de cuatro. */
function sinMarcaDeCache(message: Anthropic.MessageParam): void {
  if (typeof message.content === "string") return;

  message.content = message.content.map((bloque) =>
    "cache_control" in bloque && bloque.cache_control ? { ...bloque, cache_control: null } : bloque,
  );
}

/** El texto de la respuesta, ignorando los bloques de herramienta. */
function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Segunda llamada: convierte el informe en el JSON que lee el panel.
 *
 * Sin herramientas y con `effort: "low"` — no investiga nada, solo relee lo ya
 * escrito. Eso la hace barata comparada con la primera y quita cualquier
 * tentación de que el modelo se invente datos que no estén en el informe.
 */
async function extractStructured(options: {
  client: Anthropic;
  model: string;
  documentId: ResearchDocumentId;
  report: string;
}): Promise<{ data: unknown; inputTokens: number; outputTokens: number }> {
  const meta = RESEARCH_DOCUMENT_META[options.documentId];

  const stream = options.client.messages.stream({
    model: options.model,
    max_tokens: 32_000,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: RESEARCH_SCHEMAS[options.documentId],
      },
    },
    messages: [
      {
        role: "user",
        content: `Este es el informe «${meta.title}» que acabas de escribir:

---

${options.report}

---

Extrae sus datos al esquema. Reglas:

- **Usa solo lo que dice el informe.** Si un dato no aparece, pon cadena vacía, lista vacía o 0 según el campo. No completes con lo que sepas por tu cuenta ni con estimaciones nuevas: este paso transcribe, no investiga.
- Los porcentajes van como números, no como texto: 23.5 y no "23,5%".
- Conserva las citas textuales tal cual están en el informe, con su fuente.`,
      },
    ],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("El modelo declinó extraer los datos del informe.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("La extracción de datos se cortó por longitud.");
  }

  const text = textFrom(message.content);

  return {
    // Con `output_config.format` la API garantiza que esto cumple el esquema,
    // así que un fallo de `JSON.parse` aquí sería un error de la propia API.
    data: JSON.parse(text),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

export async function runResearchDocument(options: {
  documentId: ResearchDocumentId;
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  extras?: ResearchExtras;
}): Promise<ResearchRunResult> {
  const { documentId, product, research, store, extras } = options;

  const client = await createClaudeClient();
  const model = await researchModel();
  const prompt = buildResearchPrompt(documentId, product, research, store, extras);

  const empty: Omit<ResearchRunResult, "ok" | "reason"> = {
    documentId,
    inputTokens: 0,
    outputTokens: 0,
    webSearches: 0,
  };

  // Se marca antes de llamar: si el proceso muere, queda constancia de que
  // este documento estaba en marcha y de que hay que reintentarlo.
  await saveResearchDocument({
    productId: product.id,
    documentId,
    status: "generating",
    markdown: "",
    data: null,
    model,
  });

  /*
   * El encargo va en un bloque con marca de caché, y no como texto suelto.
   *
   * ## Por qué aquí está el dinero
   *
   * Medido el 12 de agosto de 2026 sobre las 47 llamadas registradas: la
   * investigación se llevó 15,4 millones de tokens de **entrada** —dos tercios
   * de todo el gasto de la plataforma— contra apenas 1,07 de salida. Esa
   * desproporción no es un prompt gigante: es el bucle de búsqueda, que
   * reprocesa el encargo entero en cada vuelta, hasta doce por documento, más
   * hasta siete peticiones por las reanudaciones. El mismo texto, pagado a
   * precio entero veintitantas veces.
   *
   * Con la marca, la primera vuelta escribe la caché —cuesta un 25% más— y
   * todas las demás la leen a una décima parte. A la segunda lectura ya sale a
   * cuenta, y aquí se lee muchas más veces que dos.
   *
   * ## Cómo se comprueba que funciona, en vez de creerlo
   *
   * Mirando `cache_read_tokens` en el panel de Gasto. Si sale cero después de
   * esto, algo variable se está colando delante del bloque marcado y la caché
   * no está sirviendo de nada: el prefijo tiene que ser idéntico byte a byte.
   */
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }],
    },
  ];

  let totalInput = 0;
  let totalOutput = 0;
  // Aparte de la entrada, porque se pagan a otro precio: leer es una décima
  // parte y escribir, una vez y cuarto. Sumarlos a `totalInput` haría que el
  // panel no viera nunca el ahorro.
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let webSearches = 0;
  let accumulated = "";

  try {
    for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt += 1) {
      const stream = client.messages.stream({
        model,
        /*
         * Techo alto a propósito. En la prueba real el documento 2 gastó 35.596
         * tokens de salida y se cortó contra un tope de 32.000. El informe más
         * el razonamiento de un documento con veintitantas búsquedas no cabe en
         * menos; por eso se transmite en streaming, que es lo que permite pedir
         * tanto sin que caduque la petición HTTP.
         */
        max_tokens: 96_000,
        thinking: { type: "adaptive" },
        output_config: { effort: ESFUERZO },
        // La investigación **es** búsqueda: los prompts piden evidencia de
        // Reddit, Statista, Amazon y foros. Sin esto el modelo respondería de
        // memoria, que es justo lo que no queremos.
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: MAX_BUSQUEDAS }],
        messages,
      });

      const message = await stream.finalMessage();

      totalInput += message.usage.input_tokens;
      totalOutput += message.usage.output_tokens;
      totalCacheRead += message.usage.cache_read_input_tokens ?? 0;
      totalCacheWrite += message.usage.cache_creation_input_tokens ?? 0;
      webSearches += message.content.filter(
        (block) => block.type === "server_tool_use",
      ).length;

      // Antes que el contenido: en un rechazo el array puede venir vacío.
      if (message.stop_reason === "refusal") {
        const reason =
          message.stop_details && "explanation" in message.stop_details
            ? String(message.stop_details.explanation ?? "")
            : "";

        await saveResearchDocument({
          productId: product.id,
          documentId,
          status: "error",
          markdown: accumulated,
          data: null,
          error: `El modelo declinó la petición.${reason ? ` ${reason}` : ""}`,
          model,
          inputTokens: totalInput,
          outputTokens: totalOutput,
        });

        return {
          ...empty,
          ok: false,
          reason: "El modelo declinó la petición.",
          inputTokens: totalInput,
          outputTokens: totalOutput,
          webSearches,
        };
      }

      accumulated += textFrom(message.content);

      /*
       * `pause_turn`: la búsqueda web agotó su tope de vueltas del lado del
       * servidor. Se devuelve el turno del asistente tal cual y se vuelve a
       * pedir; el servidor continúa por donde iba. **No** hay que añadir un
       * mensaje de usuario del tipo «continúa»: el servidor lo detecta solo.
       */
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: conMarcaDeCache(message.content) });

        /*
         * Al añadir el turno nuevo se le quita la marca al de hace dos, para
         * quedarse siempre en tres puntos —el encargo y los dos últimos— y no
         * llegar nunca al tope de cuatro. Quitar una marca no borra lo que ya
         * está cacheado: lo cacheado vive por su tiempo de vida, y el punto
         * nuevo, que va más adelante, lee igual todo lo anterior.
         */
        const viejo = messages.length - 1 - TURNOS_MARCADOS;
        if (viejo >= 1) sinMarcaDeCache(messages[viejo]);

        continue;
      }

      if (message.stop_reason === "max_tokens") {
        await saveResearchDocument({
          productId: product.id,
          documentId,
          status: "error",
          markdown: accumulated,
          data: null,
          error:
            "La respuesta se cortó por longitud. El texto generado se ha guardado, pero el informe está incompleto.",
          model,
          inputTokens: totalInput,
          outputTokens: totalOutput,
        });

        return {
          ...empty,
          ok: false,
          reason: "La respuesta se cortó por longitud.",
          inputTokens: totalInput,
          outputTokens: totalOutput,
          webSearches,
        };
      }

      // El informe está escrito. Ahora la segunda llamada saca el JSON.
      let structured: Awaited<ReturnType<typeof extractStructured>>;
      try {
        structured = await extractStructured({
          client,
          // El barato: esta llamada no investiga, solo rellena el esquema.
          model: await extractionModel(),
          documentId,
          report: accumulated,
        });
      } catch (extractError) {
        /*
         * El informe está pagado y es útil, así que se guarda igualmente —pero
         * marcado como error: sin el JSON el panel no puede leerlo, y decir
         * que está listo sería mentir.
         *
         * La causa se traduce en vez de resumirse. Decir solo «no se pudieron
         * extraer los datos» manda a revisar el esquema cuando lo que pasa es
         * que se acabó el saldo — ocurrió, y costó una tanda entera.
         */
        const failure = describeApiError(extractError);

        await logError({
          context: "research-runner:extraccion",
          error: extractError,
          productId: product.id,
          detail: { documentId, model, reportChars: accumulated.length },
        });

        await saveResearchDocument({
          productId: product.id,
          documentId,
          status: "error",
          markdown: accumulated,
          data: null,
          error: `El informe se generó y está guardado, pero no se pudieron extraer sus datos. ${failure.message}`,
          model,
          inputTokens: totalInput,
          outputTokens: totalOutput,
        });

        // El informe se pagó aunque no se pudiera leer: se anota igual. Un
        // historial que solo registra los éxitos miente sobre el gasto.
        await recordRun({
          productId: product.id,
          productName: product.name,
          kind: "investigacion",
          detail: RESEARCH_DOCUMENT_META[documentId].title,
          model,
          status: "error",
          error: failure.message,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          cacheReadTokens: totalCacheRead,
          cacheWriteTokens: totalCacheWrite,
          webSearches,
        });

        return {
          ...empty,
          ok: false,
          // Con el informe guardado, reintentar cuesta céntimos: no repite ni
          // la investigación ni las búsquedas web.
          reason: `${failure.message} El informe está guardado: usa «Reintentar extracción», que no repite las búsquedas.`,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          webSearches,
        };
      }

      totalInput += structured.inputTokens;
      totalOutput += structured.outputTokens;

      await saveResearchDocument({
        productId: product.id,
        documentId,
        status: "ready",
        markdown: accumulated,
        data: structured.data,
        model,
        inputTokens: totalInput,
        outputTokens: totalOutput,
      });

      await recordRun({
        productId: product.id,
        productName: product.name,
        kind: "investigacion",
        detail: RESEARCH_DOCUMENT_META[documentId].title,
        model,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheWriteTokens: totalCacheWrite,
        webSearches,
      });

      return {
        ok: true,
        documentId,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        webSearches,
      };
    }

    // Se agotaron las reanudaciones sin que el modelo cerrara el turno.
    await saveResearchDocument({
      productId: product.id,
      documentId,
      status: "error",
      markdown: accumulated,
      data: null,
      error: `La búsqueda web no terminó después de ${MAX_CONTINUATIONS} reanudaciones.`,
      model,
      inputTokens: totalInput,
      outputTokens: totalOutput,
    });

    return {
      ...empty,
      ok: false,
      reason: "La búsqueda web no terminó.",
      inputTokens: totalInput,
      outputTokens: totalOutput,
      webSearches,
    };
  } catch (error) {
    const message = describeApiError(error).message;

    await logError({
      context: "research-runner:informe",
      error,
      productId: product.id,
      detail: { documentId, model, webSearches, outputTokens: totalOutput },
    });

    await saveResearchDocument({
      productId: product.id,
      documentId,
      status: "error",
      markdown: accumulated,
      data: null,
      error: message,
      model,
      inputTokens: totalInput,
      outputTokens: totalOutput,
    });

    return {
      ...empty,
      ok: false,
      reason: message,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      webSearches,
    };
  }
}

/**
 * Qué documentos se pueden lanzar ahora mismo.
 *
 * Un documento solo entra si están listos aquellos de los que depende: el 4
 * resume el 1, el 2 y el 3, y el 6 valida el 5. Lanzarlo antes gastaría
 * dinero en un informe construido sobre huecos.
 */
export function readyToRun(
  research: ProductResearch,
  wanted: ResearchDocumentId[],
): ResearchDocumentId[] {
  return wanted.filter((id) =>
    RESEARCH_DOCUMENT_META[id].dependsOn.every(
      (dependency) => research.documents[dependency].status === "ready",
    ),
  );
}

/**
 * Reintenta solo la extracción de un informe ya escrito.
 *
 * **Es la diferencia entre céntimos y dos dólares.** Cuando el informe se
 * generó pero la segunda llamada falló —se acabó el saldo, saltó un límite—, el
 * texto está pagado y guardado. Volver a lanzar el documento entero repetiría la
 * investigación y las cuarenta búsquedas web para llegar al mismo informe.
 *
 * Esto lee el markdown de la base de datos y hace únicamente la llamada barata:
 * sin herramientas, sin búsquedas, esfuerzo bajo.
 *
 * Se niega a funcionar si no hay informe guardado, en vez de llamar a la API con
 * una cadena vacía y cobrar por un resultado inservible.
 */
export async function retryResearchExtraction(options: {
  documentId: ResearchDocumentId;
  productId: string;
}): Promise<ResearchRunResult> {
  const { documentId, productId } = options;

  const empty: Omit<ResearchRunResult, "ok" | "reason"> = {
    documentId,
    inputTokens: 0,
    outputTokens: 0,
    webSearches: 0,
  };

  const research = await readProductResearch(productId);
  const report = research.documents[documentId]?.markdown ?? "";

  if (report.trim().length === 0) {
    return {
      ...empty,
      ok: false,
      reason:
        "No hay informe guardado de este documento, así que no hay nada que extraer. Genéralo de nuevo.",
    };
  }

  const client = await createClaudeClient();
  const model = await researchModel();
  const extraction = await extractionModel();

  try {
    const structured = await extractStructured({ client, model: extraction, documentId, report });

    await saveResearchDocument({
      productId,
      documentId,
      status: "ready",
      // El informe se vuelve a escribir tal cual: es la misma fila y no se toca
      // el texto, solo el estado y los datos.
      markdown: report,
      data: structured.data,
      model,
      inputTokens: structured.inputTokens,
      outputTokens: structured.outputTokens,
    });

    await recordRun({
      productId,
      kind: "extraccion",
      detail: RESEARCH_DOCUMENT_META[documentId].title,
      model: extraction,
      inputTokens: structured.inputTokens,
      outputTokens: structured.outputTokens,
    });

    return {
      ok: true,
      documentId,
      inputTokens: structured.inputTokens,
      outputTokens: structured.outputTokens,
      webSearches: 0,
    };
  } catch (error) {
    const failure = describeApiError(error);

    // El informe se conserva: el fallo es de la extracción, no del texto.
    await saveResearchDocument({
      productId,
      documentId,
      status: "error",
      markdown: report,
      data: null,
      error: `El informe está guardado, pero la extracción volvió a fallar. ${failure.message}`,
      model,
    });

    return { ...empty, ok: false, reason: failure.message };
  }
}
