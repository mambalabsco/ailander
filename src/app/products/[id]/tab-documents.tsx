"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, Tag } from "@/components/ui";
import { CopyableBlock } from "@/components/copyable";
import { CompetitorSearch } from "@/components/competitor-search";
import { RetryExtraction } from "@/components/retry-extraction";
import { GenerationWatcher } from "@/components/generation-watcher";
import { generateResearchAction, type GenerationSummary } from "@/app/products/[id]/research-actions";
import { RESEARCH_DOCUMENT_IDS, RESEARCH_DOCUMENT_META } from "@/types/research";
import type {
  ProductResearch,
  ResearchDocumentId,
  ResearchDocumentStatus,
} from "@/types/research";

const STATUS_STYLES: Record<ResearchDocumentStatus, string> = {
  empty: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  queued: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  generating: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  error: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

/** "1, 2 y 3" en vez de "1 y 2 y 3". */
function joinSpanish(items: (string | number)[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const STATUS_LABELS: Record<ResearchDocumentStatus, string> = {
  empty: "Sin generar",
  queued: "En cola",
  generating: "Generando",
  ready: "Listo",
  error: "Error",
};

export function DocumentsTab({
  research,
  hasApiKey,
  missingInputs,
  needsCompetitors,
  productId,
  prompts,
  waves,
  blocked,
  costRange,
}: {
  productId: string;
  research: ProductResearch;
  hasApiKey: boolean;
  missingInputs: string[];
  needsCompetitors: boolean;
  /** El prompt exacto de cada documento, ya montado con sus dependencias. */
  prompts: Record<ResearchDocumentId, string>;
  /** Tandas de ejecución, derivadas de las dependencias. */
  waves: ResearchDocumentId[][];
  /** Documentos que le faltan a cada uno para poder generarse. */
  blocked: Record<ResearchDocumentId, ResearchDocumentId[]>;
  /** Coste aproximado por documento, para avisar antes de gastar. */
  costRange: { min: number; max: number };
}) {
  const router = useRouter();
  const [showPlan, setShowPlan] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<GenerationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Todo lo que falta, de una vez.
   *
   * Ya no se elige tanda: el servidor las encadena solas, esperando a que cada
   * dependencia esté lista antes de lanzar lo que la necesita. Antes había que
   * volver a pulsar cada veinte minutos para dar el siguiente paso.
   *
   * Se excluye lo que ya está listo y lo que está generándose: repetirlo sería
   * pagar dos veces por lo mismo.
   */
  const pendingInWave = [...RESEARCH_DOCUMENT_IDS].filter((id) => {
    const status = research.documents[id].status;
    return status !== "ready" && status !== "generating";
  });

  const money = (value: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD" }).format(value);

  const launch = () => {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const result = await generateResearchAction(productId, pendingInWave);
        setSummary(result);
        router.refresh();
      } catch (launchError) {
        setError(launchError instanceof Error ? launchError.message : "No se pudo generar.");
      }
    });
  };

  const ordered = [...RESEARCH_DOCUMENT_IDS].sort(
    (a, b) => RESEARCH_DOCUMENT_META[a].order - RESEARCH_DOCUMENT_META[b].order,
  );

  const readyCount = ordered.filter((id) => research.documents[id].status === "ready").length;

  // Los que siguen en el servidor. Mientras haya alguno, la página se refresca
  // sola: la generación ya no vive en esta pestaña y nadie va a avisarla.
  const generatingCount = ordered.filter(
    (id) => research.documents[id].status === "generating",
  ).length;

  return (
    <div className="space-y-6">
      <GenerationWatcher active={generatingCount} />
      {/* Comprobación de entradas antes de gastar tokens en un documento pobre. */}
      {missingInputs.length > 0 || needsCompetitors ? (
        <SectionCard
          title="Antes de generar"
          description="Los prompts necesitan estos datos. Sin ellos el documento sale genérico."
        >
          {missingInputs.length > 0 ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-300">Faltan datos</p>
              <ul className="mt-2 space-y-1 text-sm">
                {missingInputs.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Complétalos desde Editar producto.
              </p>
            </div>
          ) : null}

          {needsCompetitors ? (
            <div
              className={`rounded-3xl border border-slate-200 p-4 dark:border-slate-800 ${missingInputs.length > 0 ? "mt-4" : ""}`}
            >
              <p className="font-medium">No has indicado competidores</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                El documento 2 arranca de una URL de competidor. Puedo buscar marcas DTC del nicho y el país
                y presentártelas para que confirmes cuáles entran antes de investigarlas.
              </p>
              <div className="mt-4">
                <CompetitorSearch productId={productId} hasApiKey={hasApiKey} />
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Base de datos del producto"
        description="Los 6 documentos de investigación. Son la fuente que alimenta el panel, los ganchos y la creación de copy."
        action={
          <Button variant="primary" onClick={() => setShowPlan((value) => !value)}>
            {showPlan
              ? "Ocultar el plan"
              : readyCount === 0
                ? "Generar investigación"
                : "Regenerar"}
          </Button>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Tag>
            {readyCount} de {ordered.length} documentos listos
          </Tag>
          {!hasApiKey ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Sin clave de API configurada — no se genera nada
            </span>
          ) : null}
        </div>

        <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
          La generación va por tandas, porque unos documentos se alimentan de otros:{" "}
          {waves
            .map(
              (wave, index) =>
                `tanda ${index + 1} — ${joinSpanish(wave.map((id) => RESEARCH_DOCUMENT_META[id].order))}`,
            )
            .join("; ")}
          .
        </p>

        {showPlan ? (
          <div className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
            <p className="font-medium">Esto es lo que se enviará</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {hasApiKey
                ? "Aún no se ha enviado nada. Revisa cada prompt aquí abajo antes de lanzarlo: es el texto exacto, con la ficha del producto y los documentos previos ya incorporados."
                : "No hay clave de API configurada, así que no se enviará nada. Aun así puedes revisar y copiar los prompts: son el texto exacto que se mandaría."}
            </p>

            <div className="mt-5 space-y-5">
              {waves.map((wave, index) => (
                <div key={index}>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tanda {index + 1}
                    {index > 0 ? " · espera a la anterior" : " · se pueden lanzar a la vez"}
                  </p>
                  <div className="mt-2 space-y-3">
                    {wave.map((id) => {
                      const meta = RESEARCH_DOCUMENT_META[id];
                      const missing = blocked[id];
                      return (
                        <details
                          key={id}
                          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <summary className="cursor-pointer list-none text-sm font-medium marker:content-none">
                            {meta.order}. {meta.title}
                            {missing.length > 0 ? (
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                le falta el {joinSpanish(missing.map((need) => RESEARCH_DOCUMENT_META[need].order))}
                              </span>
                            ) : null}
                          </summary>
                          <div className="mt-3">
                            <CopyableBlock value={prompts[id]} label="Prompt">
                              <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5">
                                {prompts[id]}
                              </pre>
                            </CopyableBlock>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-violet-200 pt-5 dark:border-violet-900">
              {pendingInWave.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No queda ningún documento pendiente.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    Se generarán los documentos{" "}
                    {joinSpanish(pendingInWave.map((id) => RESEARCH_DOCUMENT_META[id].order))} de una
                    sola vez, en el orden que exigen sus dependencias.
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {pendingInWave.length} documento(s) con búsqueda web, encadenados por tandas.
                    Coste aproximado{" "}
                    <span className="font-medium">
                      {money(costRange.min * pendingInWave.length)} –{" "}
                      {money(costRange.max * pendingInWave.length)}
                    </span>
                    . Tarda varios minutos, pero corre en el servidor: puedes cerrar la pestaña. La
                    cifra es un orden de magnitud, no una factura.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      variant="primary"
                      disabled={!hasApiKey || isPending}
                      onClick={launch}
                      title={hasApiKey ? undefined : "Configura tu clave de API en Configuración"}
                    >
                      {/* «Lanzando», no «Generando»: esta espera es solo la de
                          encolar. La generación ocurre después, en el servidor,
                          y la anuncia el aviso de arriba. */}
                      {isPending ? "Lanzando..." : "Lanzar la generación"}
                    </Button>
                    {isPending ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Poniendo los documentos en marcha...
                      </p>
                    ) : !hasApiKey ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Se habilita cuando configures la clave en Configuración.
                      </p>
                    ) : null}
                  </div>
                </>
              )}

              {error ? (
                <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
                  {error}
                </p>
              ) : null}

              {summary ? (
                <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                  {summary.queued.length > 0 ? (
                    <p className="text-emerald-700 dark:text-emerald-400">
                      ✓ En marcha: {summary.queued.join(", ")}
                    </p>
                  ) : null}
                  {summary.skipped.map((item) => (
                    <p key={item.document} className="text-amber-700 dark:text-amber-400">
                      – {item.document}: {item.reason}
                    </p>
                  ))}
                  {/* El resultado ya no llega en la respuesta: la generación
                      sigue en el servidor y el estado se lee de la base de
                      datos. Decirlo evita que se pulse otra vez. */}
                  <p className="border-t border-slate-200 pt-2 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Se generan en el servidor: puedes cerrar esta pestaña. El estado y el coste de
                    cada documento aparecen abajo y en Historial.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {ordered.map((id) => {
            const meta = RESEARCH_DOCUMENT_META[id];
            const state = research.documents[id];
            const dependencyNames = meta.dependsOn.map(
              (dependency) => RESEARCH_DOCUMENT_META[dependency].order,
            );

            return (
              <details
                key={id}
                className="group rounded-3xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 marker:content-none">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="text-violet-600 group-open:hidden">▸ </span>
                      <span className="hidden text-violet-600 group-open:inline">▾ </span>
                      {meta.order}. {meta.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{meta.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {dependencyNames.length > 0 ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Depende de {joinSpanish(dependencyNames)}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[state.status]}`}
                    >
                      {STATUS_LABELS[state.status]}
                    </span>
                  </div>
                </summary>

                <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                  {state.status === "ready" && state.markdown ? (
                    <>
                      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                        Generado el {new Date(state.generatedAt ?? "").toLocaleDateString("es-ES")}
                      </p>
                      <div className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {state.markdown}
                      </div>
                    </>
                  ) : state.status === "error" ? (
                    <>
                      <p className="text-sm text-rose-600 dark:text-rose-400">
                        {state.error ?? "La generación falló. Vuelve a intentarlo."}
                      </p>

                      {/* Con informe guardado el fallo es solo de la extracción,
                          y rehacerlo entero sería tirar lo ya pagado. */}
                      {state.markdown ? (
                        <>
                          <RetryExtraction productId={productId} documentId={id} />
                          <p className="mt-4 mb-2 text-xs text-slate-500 dark:text-slate-400">
                            Informe guardado ({state.markdown.length.toLocaleString("es-ES")}{" "}
                            caracteres):
                          </p>
                          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {state.markdown}
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Este documento aún no se ha generado.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
