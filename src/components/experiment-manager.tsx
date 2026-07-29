"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, TextField } from "@/components/ui";
import { Copyable } from "@/components/copyable";
import { FunnelChart } from "@/components/funnel-chart";
import {
  deleteExperimentAction,
  readExperimentFunnelsAction,
  saveExperimentAction,
} from "@/app/products/[id]/landing-actions";
import { aov, sharesOf, type FunnelCounts, type LandingExperiment } from "@/types/experiment";
import type { LandingPage } from "@/types/landing";

/**
 * Reparto de tráfico entre varias landings, con su embudo.
 *
 * **Los pesos son relativos, no porcentajes.** Así 30/30/40 y 3/3/4 hacen lo
 * mismo, y añadir una quinta página no obliga a recalcular las otras cuatro para
 * que sigan sumando cien. El porcentaje real se enseña calculado.
 */
export function ExperimentManager({
  productId,
  storeDomain,
  landings,
  experiments,
}: {
  productId: string;
  storeDomain?: string;
  landings: LandingPage[];
  experiments: LandingExperiment[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Prueba de landings");
  const [slug, setSlug] = useState("lp1");
  const [weights, setWeights] = useState<Record<string, number>>({});

  const [funnels, setFunnels] = useState<Record<string, Record<string, FunnelCounts>>>({});

  const chosen = landings.filter((page) => (weights[page.id] ?? 0) > 0);

  const save = () =>
    startTransition(async () => {
      setError(null);
      try {
        await saveExperimentAction({
          productId,
          name,
          slug,
          variants: landings.map((page) => ({
            landingId: page.id,
            weight: weights[page.id] ?? 0,
          })),
        });
        setOpen(false);
        router.refresh();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
      }
    });

  const loadFunnels = (experimentId: string) =>
    startTransition(async () => {
      const result = await readExperimentFunnelsAction({ experimentId, days: 14 });
      setFunnels({ ...funnels, [experimentId]: result as Record<string, FunnelCounts> });
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Reparto de tráfico</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Una sola URL en el anuncio y el servidor decide qué página ve cada visitante, según los
            pesos que pongas. Sin redirección y sin parpadeo.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen((value) => !value)}>
          {open ? "Cancelar" : "Nueva prueba"}
        </Button>
      </div>

      {open ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre">
              <TextField value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Identificador en la URL">
              <TextField value={slug} onChange={(event) => setSlug(event.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Páginas y peso</p>
            {landings.length < 2 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Necesitas al menos dos páginas generadas para poder repartir entre ellas.
              </p>
            ) : (
              <ul className="space-y-2">
                {landings.map((page) => (
                  <li key={page.id} className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weights[page.id] ?? 0}
                      onChange={(event) =>
                        setWeights({ ...weights, [page.id]: Number(event.target.value) })
                      }
                      className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{page.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* El porcentaje real, calculado: es lo que la gente quiere ver aunque
              los pesos sean relativos. */}
          {chosen.length > 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {chosen
                .map((page) => {
                  const total = landings.reduce((sum, item) => sum + (weights[item.id] ?? 0), 0);
                  const pct = total > 0 ? ((weights[page.id] ?? 0) / total) * 100 : 0;
                  return `${page.title.slice(0, 24)}: ${pct.toFixed(0)}%`;
                })
                .join(" · ")}
            </p>
          ) : null}

          <Button variant="primary" onClick={save} disabled={isPending || landings.length < 2}>
            {isPending ? "Guardando..." : "Crear la prueba"}
          </Button>

          {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        </div>
      ) : null}

      {experiments.map((experiment) => {
        const shares = sharesOf(experiment.variants);
        const data = funnels[experiment.id];

        return (
          <div
            key={experiment.id}
            className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{experiment.name}</p>
                {storeDomain ? (
                  <Copyable value={`https://${storeDomain}/apps/lp/${experiment.slug}`}>
                    <code className="text-xs text-violet-600 dark:text-violet-300">
                      https://{storeDomain}/apps/lp/{experiment.slug}
                    </code>
                  </Copyable>
                ) : (
                  <span className="text-xs text-slate-500">/apps/lp/{experiment.slug}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => loadFunnels(experiment.id)} disabled={isPending}>
                  {isPending ? "Leyendo..." : "Ver embudos"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteExperimentAction(experiment.id, productId);
                      router.refresh();
                    })
                  }
                >
                  Borrar
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {experiment.variants.map((variant) => {
                const page = landings.find((item) => item.id === variant.landingId);
                const counts = data?.[variant.id];
                const ticket = counts ? aov(counts) : null;

                return (
                  <div key={variant.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {page?.title ?? "(página borrada)"}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {(shares.get(variant.id) ?? 0).toFixed(0)}% del tráfico
                        {ticket !== null
                          ? ` · ticket medio ${ticket.toLocaleString("es-ES", { style: "currency", currency: counts?.currency ?? "MXN" })}`
                          : ""}
                      </span>
                    </div>

                    {counts ? (
                      <FunnelChart counts={counts} />
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Pulsa «Ver embudos» para leer los datos de los últimos 14 días.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
