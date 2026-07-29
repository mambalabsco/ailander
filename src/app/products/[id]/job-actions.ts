"use server";

import { revalidatePath } from "next/cache";
import { clearFinishedJobs, listJobs, readJob, readLatestJob } from "@/lib/data/jobs";
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
