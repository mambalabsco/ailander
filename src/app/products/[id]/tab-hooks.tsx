"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, EmptyState, SelectField, Tag, TextField } from "@/components/ui";
import { AWARENESS_LABELS, AWARENESS_LEVELS } from "@/types/research";
import type { AwarenessLevel, HookPlan, ProductHook } from "@/types/research";
import { markHookUsage } from "@/app/products/[id]/actions";
import { CopyableBlock } from "@/components/copyable";
import { GenerateButton } from "@/components/generate-button";
import { generateHooksAction } from "@/app/products/[id]/generate-actions";

interface HooksTabProps {
  productId: string;
  hooks: ProductHook[];
  plan: HookPlan | null;
  hasApiKey: boolean;
  hasResearch: boolean;
}

/** La clave con la que se identifica una combinación de nivel y deseo. */
const keyOf = (batch: { awarenessLevel: string; desire: string }) =>
  `${batch.awarenessLevel}::${batch.desire}`;

export function HooksTab({ productId, hooks, plan, hasApiKey, hasResearch }: HooksTabProps) {
  /*
   * Qué combinaciones se van a generar.
   *
   * Antes el botón hacía «la siguiente tanda» y no se podía elegir ni repetir:
   * para tener la matriz completa había que volver doce veces, y dos clics
   * seguidos generaban la misma tanda dos veces porque ambos leían el mismo
   * estado antes de que ninguno guardara.
   */
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const toggleBatch = (key: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const router = useRouter();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [desire, setDesire] = useState<string>("all");
  const [usage, setUsage] = useState<string>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const desires = useMemo(
    () => Array.from(new Set(hooks.map((hook) => hook.desire))).sort(),
    [hooks],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return hooks.filter((hook) => {
      const matchesQuery =
        !needle ||
        hook.title.toLowerCase().includes(needle) ||
        hook.body.toLowerCase().includes(needle) ||
        hook.angle.toLowerCase().includes(needle);
      const matchesLevel = level === "all" || hook.awarenessLevel === level;
      const matchesDesire = desire === "all" || hook.desire === desire;
      const matchesUsage =
        usage === "all" || (usage === "used" ? hook.isUsed : !hook.isUsed);
      return matchesQuery && matchesLevel && matchesDesire && matchesUsage;
    });
  }, [hooks, query, level, desire, usage]);

  const usedCount = hooks.filter((hook) => hook.isUsed).length;

  const handleToggle = (hook: ProductHook) => {
    setPendingId(hook.id);
    startTransition(async () => {
      try {
        await markHookUsage(productId, hook.id);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  };

  /** Cobertura de la matriz: qué combinaciones del plan ya tienen ganchos. */
  const coverage = useMemo(() => {
    if (!plan) return [];
    const counts = new Map<string, number>();
    for (const hook of hooks) {
      const key = `${hook.awarenessLevel}::${hook.desire}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return plan.batches.map((batch) => ({
      ...batch,
      generated: counts.get(`${batch.awarenessLevel}::${batch.desire}`) ?? 0,
    }));
  }, [plan, hooks]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Plan de generación"
        description="La matriz no es fija: sale de los niveles de conciencia que el documento 1 marca como relevantes, cruzados con los deseos mejor puntuados del documento 6."
      >
        {!hasResearch ? (
          <EmptyState
            title="Aún no hay investigación de la que derivar el plan"
            description="Los ganchos se generan a partir de los niveles de conciencia y los deseos masivos. Genera primero los documentos."
          />
        ) : !plan ? (
          <EmptyState
            title="La investigación no contiene todavía niveles ni deseos"
            description="Faltan los documentos 1 y 6 para poder calcular las combinaciones."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">Combinaciones</p>
                <p className="mt-2 text-2xl font-semibold">{plan.batches.length}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">Ganchos previstos</p>
                <p className="mt-2 text-2xl font-semibold">{plan.totalHooks}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">Generados</p>
                <p className="mt-2 text-2xl font-semibold">{hooks.length}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">{plan.rationale}</p>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Nivel de conciencia</th>
                    <th className="px-4 py-3 text-left font-medium">Deseo masivo</th>
                    <th className="px-4 py-3 text-left font-medium">Cuota</th>
                    <th className="px-4 py-3 text-right font-medium">Ganchos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {coverage.map((batch) => {
                    const key = `${batch.awarenessLevel}::${batch.desire}`;
                    return (
                    <tr key={key}>
                      <td className="px-4 py-3">
                        {/* Marcar una ya generada la repite: son diez ganchos
                            distintos sobre el mismo nivel y deseo, que es como
                            se llega a tener cien. */}
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={chosen.has(key)}
                            onChange={() => toggleBatch(key)}
                            className="size-4 accent-violet-600"
                          />
                          {AWARENESS_LABELS[batch.awarenessLevel]}
                        </label>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{batch.desire}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                        {batch.audienceShare}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        {batch.generated > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            {batch.generated} generados
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {batch.hooks} pendientes
                          </span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setChosen(new Set(coverage.map(keyOf)))}
                className="rounded-full border border-slate-200 px-3 py-1 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Marcar todas ({coverage.length})
              </button>
              <button
                type="button"
                onClick={() =>
                  setChosen(new Set(coverage.filter((batch) => batch.generated === 0).map(keyOf)))
                }
                className="rounded-full border border-slate-200 px-3 py-1 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Solo las pendientes
              </button>
              <button
                type="button"
                onClick={() => setChosen(new Set())}
                className="rounded-full border border-slate-200 px-3 py-1 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Ninguna
              </button>
              <span className="text-slate-500 dark:text-slate-400">
                {chosen.size} marcada(s) · {chosen.size * 10} ganchos
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <GenerateButton
                action={() => generateHooksAction(productId, [...chosen])}
                label={chosen.size > 0 ? `Generar ${chosen.size * 10} ganchos` : "Generar las pendientes"}
                disabled={!hasApiKey}
                disabledReason="Configura tu clave de API en Configuración"
                hint="Una llamada por combinación, en serie. Unos 0,10 USD cada una."
              />
              {!hasApiKey ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Sin clave de API configurada no se genera nada. Actívala en Configuración cuando quieras empezar.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Ganchos"
        description="Filtra por nivel, deseo o estado. Cada gancho se copia de un clic y guarda si ya se ha usado."
      >
        {hooks.length === 0 ? (
          <EmptyState
            title="Todavía no hay ganchos para este producto"
            description="Se generan a partir de la investigación, en lotes por nivel de conciencia y deseo masivo."
          />
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap">
              <TextField
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar en el texto del gancho"
                className="lg:w-64"
                aria-label="Buscar gancho"
              />
              <SelectField
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="lg:w-56"
                aria-label="Filtrar por nivel de conciencia"
              >
                <option value="all">Todos los niveles</option>
                {AWARENESS_LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {AWARENESS_LABELS[item as AwarenessLevel]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                value={desire}
                onChange={(event) => setDesire(event.target.value)}
                className="lg:w-72"
                aria-label="Filtrar por deseo masivo"
              >
                <option value="all">Todos los deseos</option>
                {desires.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
              <SelectField
                value={usage}
                onChange={(event) => setUsage(event.target.value)}
                className="lg:w-40"
                aria-label="Filtrar por estado de uso"
              >
                <option value="all">Todos</option>
                <option value="new">Sin usar</option>
                <option value="used">Ya usados</option>
              </SelectField>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <Tag>{filtered.length} de {hooks.length} ganchos</Tag>
              <Tag>{usedCount} usados</Tag>
              <Tag>{hooks.length - usedCount} sin usar</Tag>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="Ningún gancho coincide con el filtro"
                description="Prueba con otro término o limpia los filtros."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filtered.map((hook) => (
                  <article
                    key={hook.id}
                    /*
                     * Verde = ya usado. Estaba al revés: el verde marcaba los
                     * nuevos, y con ciento veinte ganchos en pantalla eso se lee
                     * como «estos están bien» en vez de «estos ya están hechos».
                     * En una lista para ir tachando, el color de avance va en lo
                     * hecho.
                     */
                    className={`rounded-3xl border p-4 transition ${
                      hook.isUsed
                        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{hook.title}</p>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                          hook.isUsed
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {hook.isUsed ? "Usado" : "Nuevo"}
                      </span>
                    </div>

                    <div className="mt-3">
                      <CopyableBlock value={hook.body} maxHeightClass="max-h-40">
                        <p className="text-sm leading-6">{hook.body}</p>
                      </CopyableBlock>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Tag>{AWARENESS_LABELS[hook.awarenessLevel]}</Tag>
                      <Tag>{hook.format}</Tag>
                      <Tag>{hook.angle}</Tag>
                    </div>

                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{hook.desire}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => handleToggle(hook)}
                        disabled={isPending && pendingId === hook.id}
                      >
                        {isPending && pendingId === hook.id
                          ? "Guardando..."
                          : hook.isUsed
                            ? "Marcar como nuevo"
                            : "Marcar como usado"}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
