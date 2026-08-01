import "server-only";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createJob, finishJob, reportProgress } from "@/lib/data/jobs";
import { describeApiError } from "@/lib/api-errors";
import { logError } from "@/lib/data/errors";
import type { JobKind, LaunchResult } from "@/types/jobs";

/**
 * Ejecuta cualquier generación en segundo plano.
 *
 * **Todo lo que llama a un modelo pasa por aquí.** Antes cada generación vivía
 * dentro de la petición del navegador: cerrar la pestaña la mataba a mitad, con
 * el dinero ya gastado. Una imagen tarda un par de minutos y un documento de
 * investigación más de diez; obligar a mirar la pantalla todo ese rato no es una
 * opción razonable.
 *
 * Lo que hace, en orden:
 *
 * 1. Anota el trabajo como «en marcha» y **devuelve su id enseguida**. La
 *    interfaz responde al instante y enseña el progreso leyendo esa fila.
 * 2. Con `after`, ejecuta el trabajo de verdad **después de haber respondido**.
 * 3. Guarda el resultado —o el error, traducido— en la misma fila.
 *
 * El paso 1 tiene que ocurrir antes de responder, no dentro de `after`: si no,
 * la interfaz recibiría la respuesta sin ver ningún trabajo, parecería que el
 * botón no hizo nada y se volvería a pulsar. Dos generaciones, el doble de
 * dinero.
 *
 * **Límite honesto:** `after` dura lo que dure el proceso del servidor. Con
 * `next start` en una máquina propia va sobrado; en una plataforma sin servidor
 * hay que subir `maxDuration` o los trabajos largos se cortan a media.
 */

export interface JobOutcome {
  /** Lo que se le enseña a la persona al terminar. */
  summary: string;
  /** Solo si la interfaz necesita el resultado en mano (candidatos, propuestas). */
  result?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

/** El caso «se puso en marcha» de `LaunchResult`. */
export type StartedJob = Extract<LaunchResult, { started: true }>;

export async function runInBackground(options: {
  productId?: string | null;
  kind: JobKind;
  label: string;
  /**
   * El trabajo. Recibe con qué ir contando por dónde va.
   *
   * Se le pasa en vez de exponer el identificador porque así quien escribe el
   * trabajo no tiene que saber que existen las filas de trabajos: llama a
   * `report("Comparativa (4 de 11)")` y ya.
   */
  work: (report: (progress: string) => Promise<void>) => Promise<JobOutcome>;
  /** Ruta a refrescar al terminar. Por defecto, la del producto. */
  revalidate?: string;
  /**
   * Con qué volver a lanzarlo si se corta.
   *
   * Solo identificadores. Es lo que permite un botón de continuar en el propio
   * trabajo, en vez de obligar a volver al panel y reconstruir a mano las cinco
   * decisiones que ya se habían tomado.
   */
  resume?: Record<string, unknown>;
}): Promise<StartedJob> {
  const jobId = await createJob({
    productId: options.productId,
    kind: options.kind,
    label: options.label,
    resume: options.resume,
  });

  const path =
    options.revalidate ?? (options.productId ? `/products/${options.productId}` : null);

  after(async () => {
    try {
      const outcome = await options.work((progress) => reportProgress(jobId, progress));

      await finishJob(jobId, {
        status: "done",
        summary: outcome.summary,
        result: outcome.result,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        costUsd: outcome.costUsd,
      });
    } catch (error) {
      /*
       * El error se traduce antes de guardarlo.
       *
       * Aquí nadie está mirando la consola: lo que quede en esta fila es todo
       * lo que la persona verá. «Se acabó el saldo» tiene arreglo; el volcado
       * crudo de un 400 manda a depurar el sitio equivocado.
       */
      /*
       * Dos destinos, y son distintos a propósito.
       *
       * En el trabajo va la frase traducida, que es lo que lee la persona. En el
       * registro va todo —traza, contexto, datos— porque eso es lo que hace
       * falta para diagnosticar, y no cabe en un cartel de la interfaz.
       */
      await logError({
        context: `background:${options.kind}`,
        error,
        productId: options.productId,
        detail: { label: options.label, jobId },
      });

      await finishJob(jobId, {
        status: "error",
        error: describeApiError(error).message,
      });
    }

    if (path) revalidatePath(path);
  });

  return { started: true, jobId, label: options.label };
}
