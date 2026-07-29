"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { clearJobsAction } from "@/app/products/[id]/job-actions";
import { JOB_KIND_LABELS, isStale, type BackgroundJob } from "@/types/jobs";

/**
 * Todo lo que se está generando ahora mismo para este producto.
 *
 * Es la contrapartida de haber sacado las generaciones de la petición del
 * navegador: ganas poder cerrar la pestaña, y a cambio los botones ya no pueden
 * contarte cómo fue. Este panel es quien lo cuenta, y sobrevive a la recarga
 * porque lee de la base de datos.
 *
 * Sondea solo mientras haya algo en marcha. Un sondeo permanente golpearía la
 * base de datos cada pocos segundos en todas las pestañas abiertas para no
 * enterarse de nada el 99% del tiempo.
 */

const STATUS_STYLES: Record<BackgroundJob["status"], string> = {
  running: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  error: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const money = (value: number) =>
  value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;

export function JobsPanel({
  productId,
  jobs,
  intervalMs = 6000,
}: {
  productId: string;
  jobs: BackgroundJob[];
  intervalMs?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const running = jobs.filter((job) => job.status === "running" && !isStale(job));
  const stale = jobs.filter((job) => job.status === "running" && isStale(job));
  const finished = jobs.filter((job) => job.status !== "running");

  useEffect(() => {
    if (running.length === 0) return;

    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
    // `running.length` en las dependencias: al terminar el último, el efecto se
    // vuelve a evaluar, entra por la rama de arriba y el sondeo se para solo.
  }, [running.length, intervalMs, router]);

  if (jobs.length === 0) return null;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          Trabajos
          {running.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-violet-700 dark:text-violet-300">
              {running.length} en marcha · puedes cerrar la pestaña
            </span>
          ) : null}
        </p>

        {finished.length > 0 || stale.length > 0 ? (
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await clearJobsAction(productId);
                router.refresh();
              })
            }
          >
            Limpiar terminados
          </Button>
        ) : null}
      </div>

      {/* Se dice qué no se borra: si no, parece que el botón no funcionó. */}
      {jobs.some((job) => job.result !== null && job.status !== "running") ? (
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Los trabajos con un resultado pendiente de aprobar —candidatos, propuestas— no se
          limpian: su resultado solo vive aquí hasta que lo guardas.
        </p>
      ) : null}

      <ul className="space-y-2">
        {[...running, ...stale, ...finished].map((job) => {
          const abandoned = isStale(job);

          return (
            <li
              key={job.id}
              className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-slate-900"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {JOB_KIND_LABELS[job.kind] ?? job.kind} · {job.label}
                </p>

                {job.status === "done" && job.summary ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">{job.summary}</p>
                ) : null}

                {job.status === "error" && job.error ? (
                  <p className="text-sm text-rose-600 dark:text-rose-400">{job.error}</p>
                ) : null}

                {/* Un trabajo que lleva media hora «en marcha» es casi seguro
                    uno que murió con el servidor. Decirlo evita esperar en vano
                    a algo que ya no va a llegar. */}
                {abandoned ? (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Lleva demasiado tiempo sin terminar. Probablemente se cortó al reiniciarse el
                    servidor: vuelve a lanzarlo.
                  </p>
                ) : null}

                {job.status === "done" && job.costUsd > 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {money(job.costUsd)} · {job.inputTokens.toLocaleString("es-ES")} tokens de
                    entrada, {job.outputTokens.toLocaleString("es-ES")} de salida
                  </p>
                ) : null}
              </div>

              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  STATUS_STYLES[abandoned ? "error" : job.status]
                }`}
              >
                {abandoned
                  ? "Perdido"
                  : job.status === "running"
                    ? "En marcha"
                    : job.status === "done"
                      ? "Listo"
                      : "Error"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
