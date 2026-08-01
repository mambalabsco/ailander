"use server";

import { revalidatePath } from "next/cache";
import {
  clearFinishedJobs,
  listJobs,
  readJob,
  readJobResume,
  readLatestJob,
} from "@/lib/data/jobs";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { BackgroundJob, JobKind } from "@/types/jobs";

/**
 * Consultar el estado de los trabajos en marcha.
 *
 * Como las generaciones ocurren después de responder, el navegador no recibe
 * ningún aviso cuando terminan: tiene que preguntar. Estas acciones son esa
 * pregunta.
 */

export async function readJobAction(jobId: unknown): Promise<BackgroundJob | null> {
  if (typeof jobId !== "string" || !jobId) return null;
  if (!isSupabaseConfigured()) return null;

  try {
    return await readJob(jobId);
  } catch {
    // El sondeo no debe romper la pantalla: si falla una vuelta, se reintenta
    // en la siguiente.
    return null;
  }
}

export async function listJobsAction(productId: unknown): Promise<BackgroundJob[]> {
  if (typeof productId !== "string" || !productId) return [];
  if (!isSupabaseConfigured()) return [];

  try {
    return await listJobs(productId);
  } catch {
    return [];
  }
}

/**
 * Vuelve a lanzar un trabajo que se cortó, con lo mismo que llevaba.
 *
 * Vive aquí y no en el panel de origen porque el sitio donde uno se entera de
 * que algo murió es la lista de trabajos, no el formulario. Obligar a volver
 * allí y reconstruir las cinco decisiones —tienda, análisis, tema, producto,
 * página— es trabajo repetido, y con una equivocada el resultado sale distinto
 * sin avisar.
 *
 * Lo que ya estuviera escrito se reutiliza: continuar no vuelve a pagarlo.
 */
export async function resumeJobAction(
  jobId: unknown,
): Promise<{ ok: boolean; message: string }> {
  if (typeof jobId !== "string" || !jobId) return { ok: false, message: "Falta el trabajo." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Supabase no está configurado." };

  const saved = await readJobResume(jobId);
  if (!saved) {
    return { ok: false, message: "Ese trabajo no guardó con qué relanzarse. Hazlo desde su panel." };
  }

  const text = (value: unknown) => (typeof value === "string" ? value : "");

  if (saved.kind === "tema") {
    const { recreatePageAction } = await import("@/app/stores/theme-plan-actions");

    const form = new FormData();
    for (const key of ["storeId", "themeId", "blueprintId", "page", "productId"]) {
      form.set(key, text(saved.resume[key]));
    }

    await recreatePageAction(form);
    revalidatePath("/stores");

    return { ok: true, message: "Continuando. Lo que ya estaba escrito no se vuelve a pagar." };
  }

  return { ok: false, message: "Ese tipo de trabajo todavía no se puede continuar desde aquí." };
}

/** Limpia los terminados. Los que siguen en marcha no se tocan. */
export async function clearJobsAction(productId: unknown): Promise<void> {
  if (typeof productId !== "string" || !productId) return;
  if (!isSupabaseConfigured()) return;

  await clearFinishedJobs(productId);
  revalidatePath(`/products/${productId}`);
}

/**
 * El último resultado guardado de un tipo de trabajo.
 *
 * Lo usan las pantallas cuyo resultado hay que revisar antes de guardarlo
 * —candidatos a competidor, propuestas de ideas—. Sin esto, ese resultado se
 * perdía al recargar la página aunque estuviera pagado y guardado.
 */
export async function latestJobResultAction(
  productId: unknown,
  kind: unknown,
): Promise<BackgroundJob | null> {
  if (typeof productId !== "string" || !productId) return null;
  if (typeof kind !== "string" || !kind) return null;
  if (!isSupabaseConfigured()) return null;

  try {
    return await readLatestJob(productId, kind as JobKind);
  } catch {
    return null;
  }
}
