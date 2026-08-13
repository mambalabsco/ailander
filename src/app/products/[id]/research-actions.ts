"use server";

import { revalidatePath } from "next/cache";
import { marketContextFor } from "@/lib/market-context";
import { stampFor } from "@/lib/market-selection";
import { after } from "next/server";
import { createJob, finishJob } from "@/lib/data/jobs";
import { runInBackground } from "@/lib/background";
import { saveResearchDocument } from "@/lib/data/research";
import { findProductAnywhere } from "@/lib/products";
import { findStore } from "@/lib/store-registry";
import { readProductResearch } from "@/lib/research-store";
import { readOffers } from "@/lib/data/products";
import { listNotes } from "@/lib/data/notes";
import { marketMoney } from "@/lib/money";
import { listStores } from "@/lib/store-registry";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { readyToRun, runResearchDocument, retryResearchExtraction } from "@/lib/research-runner";
import { RESEARCH_DOCUMENT_IDS, RESEARCH_DOCUMENT_META } from "@/types/research";
import type { ResearchDocumentId } from "@/types/research";
import { emptyOffers } from "@/types/offer";

/**
 * Lanzar la generación de investigación.
 *
 * **Esta acción gasta dinero de verdad**, así que se comprueba todo antes:
 * que haya clave, que el producto exista, que los documentos pedidos sean
 * válidos y que sus dependencias estén listas. Un documento 4 lanzado sin el 1
 * cuesta lo mismo y sale hueco.
 *
 * Los documentos de una misma tanda se lanzan **en paralelo** porque no
 * dependen entre sí, y cada uno guarda su resultado por separado: si uno falla,
 * los demás siguen.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readDocumentIds(value: unknown): ResearchDocumentId[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<string>(RESEARCH_DOCUMENT_IDS);
  return value
    .map((item) => readText(item))
    .filter((item): item is ResearchDocumentId => valid.has(item));
}

export interface GenerationSummary {
  ok: boolean;
  /** Documentos aceptados y ya en marcha. El resultado llega después. */
  queued: string[];
  skipped: { document: string; reason: string }[];
}

export async function generateResearchAction(
  productId: unknown,
  documentIds: unknown,
): Promise<GenerationSummary> {
  const id = readText(productId);
  if (!id) throw new Error("Falta el producto.");

  if (!isSupabaseConfigured()) {
    throw new Error("La investigación se guarda en Supabase y todavía no está configurado.");
  }

  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const wanted = readDocumentIds(documentIds);
  if (wanted.length === 0) throw new Error("No has elegido ningún documento.");

  const product = await findProductAnywhere(id);
  if (!product) throw new Error("No se encontró el producto.");

  const [initialResearch, stores] = await Promise.all([readProductResearch(id), listStores()]);
  // Se relee en cada tanda: el documento 4 necesita el contenido del 1, 2 y 3,
  // no solo saber que terminaron.
  let research = initialResearch;
  const store = product.storeId ? await findStore(product.storeId) : null;

  const [offers, notes] = await Promise.all([
    readOffers(id).catch(() => emptyOffers()),
    listNotes(id).catch(() => []),
  ]);

  const extras = {
    offers,
    notes,
    currency: marketMoney(product, stores).currency,
    /*
     * El mercado, resuelto una vez para toda la investigación.
     *
     * Tiene que ser el mismo en las seis vueltas: viaja dentro del encargo, que
     * es el bloque marcado para la caché, y un encargo que cambie entre vueltas
     * la desactiva sin dar ningún error — se paga el contexto entero otra vez.
     */
    marketContext: await marketContextFor(product),
  };

  /*
   * Lo que se puede lanzar ya. El resto **no se descarta**: espera su turno.
   *
   * Antes había que volver y pulsar una vez por tanda, porque el documento 4
   * resume al 1, 2 y 3, y el 6 valida al 5. Eso obligaba a estar pendiente de
   * una espera de veinte minutos para dar un clic. Ahora el encadenado lo hace
   * el servidor.
   */
  const runnable = readyToRun(research, wanted);
  const skipped: { document: string; reason: string }[] = [];

  if (runnable.length === 0) {
    throw new Error(
      "Ninguno de los documentos elegidos puede empezar: les faltan dependencias que tampoco están pedidas.",
    );
  }

  /*
   * Se marcan como «generando» **antes** de responder.
   *
   * El runner también lo hace, pero eso ya ocurre en segundo plano: si se
   * dejara solo ahí, la interfaz recibiría la respuesta y todavía vería los
   * documentos como pendientes, con lo que parecería que el botón no hizo nada
   * y se volvería a pulsar. Dos tandas iguales, el doble de dinero.
   */
  await Promise.all(
    runnable.map((document) =>
      saveResearchDocument({
        productId: id,
        documentId: document,
        status: "generating",
        markdown: "",
        data: null,
      }),
    ),
  );

  /*
   * El trabajo va después de la respuesta.
   *
   * Un documento con búsqueda web tarda minutos, y hasta ahora eso obligaba a
   * dejar la pestaña abierta: al cerrarla se cancelaba la petición y se perdía
   * lo que ya se estaba pagando. Con `after` la respuesta sale enseguida y la
   * generación sigue en el servidor.
   *
   * El estado de cada documento vive en la base de datos, así que la interfaz
   * lo consulta cuando quiera —también desde otro dispositivo—.
   *
   * **Límite honesto:** `after` dura lo que dure el proceso del servidor. Con
   * `next start` en una máquina propia eso es de sobra; en una plataforma sin
   * servidor hay que subir `maxDuration`, o la tanda se corta a media.
   */
  // Además del estado por documento, un trabajo en el panel común: si no, el
  // único que no aparece ahí sería justo el más largo.
  const jobId = await createJob({
    productId: id,
    kind: "investigacion",
    label: `${wanted.length} documento(s), por tandas`,
  });

  after(async () => {
    const all: Awaited<ReturnType<typeof runResearchDocument>>[] = [];

    // Lo que aún no se ha generado. Se va vaciando tanda a tanda.
    let remaining = [...wanted];
    let batch = runnable;

    /*
     * Tanda a tanda hasta que no quede nada que pueda empezar.
     *
     * Cada vuelta relee la investigación de la base de datos en vez de fiarse
     * de la copia en memoria: el documento 4 necesita el **contenido** del 1, 2
     * y 3, no solo saber que terminaron. Con la copia vieja se generaría sobre
     * huecos y saldría genérico, que es exactamente lo que las dependencias
     * existen para evitar.
     */
    while (batch.length > 0) {
      // En paralelo dentro de la tanda: no dependen entre sí, y encadenarlos
      // triplicaría el tiempo sin ganar nada.
      const results = await Promise.all(
        batch.map((document) =>
          runResearchDocument({ documentId: document, product, research, store, extras }),
        ),
      );

      all.push(...results);
      remaining = remaining.filter((document) => !batch.includes(document));

      if (remaining.length === 0) break;

      research = await readProductResearch(id);
      const next = readyToRun(research, remaining);

      /*
       * Si nada nuevo puede empezar, se para.
       *
       * Pasa cuando una dependencia falló: seguir intentándolo daría una
       * respuesta infinita, y generar el que la necesitaba costaría dinero para
       * producir un documento hueco.
       */
      if (next.length === 0) {
        for (const document of remaining) {
          skipped.push({
            document: RESEARCH_DOCUMENT_META[document].title,
            reason: "No se generó porque falló algún documento del que depende.",
          });
        }
        break;
      }

      await Promise.all(
        next.map((document) =>
          saveResearchDocument({
            productId: id,
            documentId: document,
            status: "generating",
            markdown: "",
            data: null,
          }),
        ),
      );

      // Para que el panel enseñe el avance en cuanto cambia de tanda.
      revalidatePath(`/products/${id}`);
      batch = next;
    }

    const failed = all.filter((result) => !result.ok);
    const blocked = skipped.length > 0 ? ` ${skipped.length} sin generar por dependencias rotas.` : "";

    await finishJob(jobId, {
      status: failed.length === 0 && skipped.length === 0 ? "done" : "error",
      summary: `${all.length - failed.length} de ${wanted.length} documentos listos.${blocked}`,
      error:
        failed.length > 0
          ? failed.map((result) => result.reason).join(" · ")
          : skipped.length > 0
            ? skipped.map((item) => item.document).join(", ")
            : undefined,
      inputTokens: all.reduce((total, result) => total + result.inputTokens, 0),
      outputTokens: all.reduce((total, result) => total + result.outputTokens, 0),
    });

    revalidatePath(`/products/${id}`);
  });

  revalidatePath(`/products/${id}`);

  return {
    ok: skipped.length === 0,
    queued: runnable.map((document) => RESEARCH_DOCUMENT_META[document].title),
    skipped,
  };
}

/**
 * Reintenta la extracción de un informe ya escrito.
 *
 * Separado de la acción de generar **a propósito**: aquella cuesta dólares y
 * repite las búsquedas web; esta cuesta céntimos y no repite nada. Meterlas en
 * la misma acción llevaría, tarde o temprano, a pagar la cara por error.
 */
export async function retryResearchExtractionAction(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  const documentId = readText(raw.documentId);
  if (!RESEARCH_DOCUMENT_IDS.includes(documentId as ResearchDocumentId)) {
    throw new Error("Documento desconocido.");
  }

  if (!isSupabaseConfigured()) {
    throw new Error("La investigación se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("Falta la clave de la IA. Añádela en Configuración.");
  }

  const title = RESEARCH_DOCUMENT_META[documentId as ResearchDocumentId].title;

  /*
   * También en segundo plano, aunque sea la llamada barata.
   *
   * No por lo que tarda —es corta—, sino para que todo lo que gasta dinero se
   * vea en el mismo sitio. Una excepción «porque esta es rápida» es la que
   * después nadie recuerda y deja un gasto sin registrar.
   */
  return runInBackground({
    productId,
    kind: "extraccion",
    label: title,
    work: async () => {
      const result = await retryResearchExtraction({
        documentId: documentId as ResearchDocumentId,
        productId,
      });

      if (!result.ok) throw new Error(result.reason ?? "No se pudo extraer.");

      return {
        summary: `${title}: datos extraídos.`,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    },
  });
}

/**
 * Corrige a mano las objeciones del documento 4.
 *
 * La investigación las saca del mercado y a veces las saca mal: una objeción que
 * nadie pone, o una respuesta que promete algo que el producto no hace. Hasta
 * ahora no había forma de tocarlas —el documento se regeneraba entero, pagando
 * otra vez— y son de lo que más pesa en el copy: van al prompt con su «cómo se
 * resuelve» y el modelo las trata como comprobadas.
 *
 * Se corrige **el dato, no el informe**: el Markdown se deja intacto. Reescribirlo
 * para que cuadre con el JSON sería inventarse un párrafo que nadie ha revisado.
 */
export async function saveMasterObjectionsAction(
  productId: unknown,
  objections: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(productId);
  if (!id) return { ok: false, message: "Falta el producto." };

  if (!Array.isArray(objections)) {
    return { ok: false, message: "No reconozco esa lista de objeciones." };
  }

  const clean = objections
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return { objection: readText(row.objection), howToAddress: readText(row.howToAddress) };
    })
    // Una objeción sin texto no es una objeción. La respuesta sí puede faltar:
    // es justo lo que se está escribiendo cuando se corrige.
    .filter((item) => item.objection.length > 0);

  const product = await findProductAnywhere(id);
  if (!product) return { ok: false, message: "No se encontró el producto." };

  /*
   * El mismo mercado con el que se guardó, o el `upsert` crearía un documento
   * nuevo en vez de corregir el que estás mirando: la clave es
   * (producto, documento, mercado).
   */
  const marketContext = await marketContextFor(product);
  const marketId = product.researchShared ? null : stampFor(marketContext.selection);

  const research = await readProductResearch(id, marketContext.selection);
  const master = research.master;
  if (!master) {
    return { ok: false, message: "Este producto todavía no tiene el documento 4 generado." };
  }

  await saveResearchDocument({
    productId: id,
    documentId: "master",
    status: research.documents.master.status,
    markdown: research.documents.master.markdown,
    data: { ...master, objections: clean },
    marketId,
  });

  revalidatePath(`/products/${id}`);

  return { ok: true, message: `Guardadas ${clean.length} objeción(es).` };
}
