"use client";

import { useEffect, useState } from "react";
import { latestJobResultAction, readJobAction } from "@/app/products/[id]/job-actions";
import type { BackgroundJob, JobKind } from "@/types/jobs";

/**
 * Sigue un trabajo hasta que termina y devuelve lo que produjo.
 *
 * La mayoría de las generaciones guardan su resultado en su propia tabla y a la
 * interfaz le basta con refrescar. Dos no: la búsqueda de competidores propone
 * candidatos que tú confirmas, y las ideas son una propuesta para leer. Esas
 * necesitan el resultado **en mano**, y como el trabajo termina después de la
 * respuesta, hay que ir a buscarlo.
 *
 * Deja de preguntar en cuanto el trabajo acaba: un sondeo que sigue vivo después
 * de terminar es tráfico permanente a cambio de nada.
 */
export function useJobResult(
  jobId: string | null,
  intervalMs = 4000,
  /**
   * De dónde recuperar el último resultado cuando no hay trabajo en curso.
   *
   * Sin esto, el resultado solo era alcanzable mientras la pestaña siguiera
   * abierta desde que se pulsó el botón. Una búsqueda de competidores tarda
   * minutos: al recargar, el trabajo estaba pagado y guardado, y la lista de
   * candidatos era inalcanzable.
   */
  recover?: { productId: string; kind: JobKind },
) {
  /*
   * El id se guarda junto al trabajo, no aparte.
   *
   * Al lanzar una segunda búsqueda, el trabajo de la primera sigue en el estado
   * hasta que llega la primera respuesta del nuevo sondeo. Comparando el id se
   * descarta solo; limpiarlo desde el efecto sería asignar estado durante el
   * efecto, que es justo lo que no se debe hacer.
   */
  const [tracked, setTracked] = useState<{ id: string; job: BackgroundJob } | null>(null);

  const recoverKey = recover ? `${recover.productId}:${recover.kind}` : null;

  // Al entrar sin trabajo en curso, se busca el último terminado. Es una sola
  // consulta y solo cuando hace falta.
  useEffect(() => {
    if (jobId || !recoverKey) return;

    let cancelled = false;
    const [productId, kind] = recoverKey.split(":");

    latestJobResultAction(productId, kind).then((found) => {
      if (!cancelled && found) setTracked({ id: found.id, job: found });
    });

    return () => {
      cancelled = true;
    };
  }, [jobId, recoverKey]);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    const check = async () => {
      const next = await readJobAction(jobId);
      if (cancelled || !next) return;

      setTracked({ id: jobId, job: next });
      // Terminado: se corta el intervalo desde dentro para no dar una vuelta de
      // más entre que llega la respuesta y el efecto se vuelve a evaluar.
      if (next.status !== "running") clearInterval(timer);
    };

    // Una primera consulta inmediata: si el trabajo fue rápido, esperar el
    // intervalo completo para descubrirlo hace que parezca lento sin serlo.
    const timer = setInterval(check, intervalMs);
    void check();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, intervalMs]);

  // Con trabajo en curso manda ese; sin él, vale el recuperado.
  const job = jobId ? (tracked?.id === jobId ? tracked.job : null) : (tracked?.job ?? null);

  return { job, isRunning: Boolean(jobId) && (job === null || job.status === "running") };
}
