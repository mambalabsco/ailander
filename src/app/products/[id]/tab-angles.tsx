"use client";

import { useMemo, useState } from "react";
import { AnatomyEditor } from "@/app/products/[id]/anatomy-editor";
import type { Anatomia } from "@/lib/anatomia";
import { MaterialForm } from "@/app/products/[id]/material-form";
import { SectionCard } from "@/components/section-card";
import { useJobResult } from "@/components/use-job-result";
import {EmptyState, SelectField, Tag } from "@/components/ui";
import type { MarketingAngle } from "@/types/copy";
import type { AnglePerformance } from "@/types/performance";
import { PERFORMANCE_META, PERFORMANCE_RATINGS } from "@/types/performance";
import { Copyable } from "@/components/copyable";
import { GenerateButton } from "@/components/generate-button";
import { AWARENESS_LABELS } from "@/types/research";
import { generateAnglesAction, generateIdeasAction, type GeneratedIdea } from "@/app/products/[id]/generate-actions";

interface AnglesTabProps {
  productId: string;
  angles: MarketingAngle[];
  desires: string[];
  /** Agregado de lo marcado en copys y anuncios de cada ángulo. */
  performance: AnglePerformance[];
  hasApiKey: boolean;
  hasResearch: boolean;
  /** Vídeos ya analizados, para poder adjuntarlos a un material. */
  videoReferences: { id: string; name: string }[];
  /** Las anatomías ya escritas de este producto. */
  anatomias: { id: string; title: string; summary: string; anatomia: Anatomia }[];
}

/**
 * Los ángulos son la entidad central de la creación de textos: cada uno lleva su
 * mecanismo único del problema y su mecanismo único de solución, y de ahí comen
 * tanto el long copy como los publirreportajes.
 */
export function AnglesTab({
  productId,
  videoReferences,
  anatomias,
  angles,
  desires,
  performance,
  hasApiKey,
  hasResearch,
}: AnglesTabProps) {
  const [ideaTarget, setIdeaTarget] = useState<"angulos" | "anuncios" | "publirreportajes">(
    "angulos",
  );
  const [desire, setDesire] = useState<string>(desires[0] ?? "");
  // Las ideas no se guardan: son una propuesta para leer y decidir.
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([]);

  // La propuesta se calcula en el servidor y llega cuando termina, no al pulsar.
  const [ideasJobId, setIdeasJobId] = useState<string | null>(null);
  const { job: ideasJob, isRunning: ideasRunning } = useJobResult(ideasJobId, 4000, {
    productId,
    kind: "ideas",
  });

  // Ajuste en el render, no en un efecto: ver la nota en competitor-search.
  const [loadedIdeasJobId, setLoadedIdeasJobId] = useState<string | null>(null);

  if (ideasJob?.status === "done" && ideasJob.id !== loadedIdeasJobId) {
    setLoadedIdeasJobId(ideasJob.id);
    setIdeas((ideasJob.result as { ideas?: GeneratedIdea[] } | null)?.ideas ?? []);
  }
  const [filter, setFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (filter === "all" ? angles : angles.filter((angle) => angle.desire === filter)),
    [angles, filter],
  );

  const angleDesires = useMemo(
    () => Array.from(new Set(angles.map((angle) => angle.desire))),
    [angles],
  );

  const performanceById = useMemo(
    () => new Map(performance.map((item) => [item.angleId, item])),
    [performance],
  );

  const tested = performance.filter((item) => item.tested > 0);

  return (
    <div className="space-y-6">
      {/*
        Va delante de generar desde la investigación porque es otra puerta a lo
        mismo: un anuncio que ya rindió suele dar ángulos mejores que un deseo
        deducido, porque el mercado ya votó.
      */}
      <SectionCard
        title="Sacar ángulos de un anuncio que funcionó"
        description="Pega el copy, marca si es tuyo, y adjunta las imágenes y los vídeos con los que se lanzó. Primero se describe cómo está construido; los ángulos salen de ahí."
      >
        <MaterialForm
          productId={productId}
          videoReferences={videoReferences}
          hasApiKey={hasApiKey}
        />
      </SectionCard>

      {anatomias.map((item) => (
        <SectionCard
          key={item.id}
          title={item.title}
          description={`Lo que promete: ${item.summary}`}
        >
          <AnatomyEditor productId={productId} anatomiaId={item.id} inicial={item.anatomia} />
        </SectionCard>
      ))}

      <SectionCard
        title="Generar ángulos"
        description="Un ángulo es la historia que despierta el deseo. Cinco ángulos del mismo deseo son cinco historias distintas para cinco segmentos distintos."
      >
        {!hasResearch ? (
          <EmptyState
            title="Necesitas la investigación antes de crear ángulos"
            description="Los ángulos se construyen sobre los deseos masivos que valida el documento 6."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Deseo masivo de partida</span>
                <SelectField value={desire} onChange={(event) => setDesire(event.target.value)}>
                  {desires.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </SelectField>
              </label>
              <GenerateButton
                action={() => generateAnglesAction(productId, desire)}
                label="Generar 5 ángulos"
                disabled={!hasApiKey || !desire}
                disabledReason={
                  !hasApiKey
                    ? "Configura tu clave de API en Configuración"
                    : "Elige primero un deseo masivo."
                }
                hint="Cinco historias distintas para el mismo deseo. Alrededor de 0,20 USD."
              />
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Cada ángulo debe superar la prueba de distinción: cinco personas distintas contando historias
              completamente diferentes sobre cómo descubrieron el mismo problema. Si dos se parecen, no sirven.
            </p>

            {!hasApiKey ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Sin clave de API configurada no se genera nada.
              </p>
            ) : null}
          </div>
        )}
      </SectionCard>

      {tested.length > 0 ? (
        <SectionCard
          title="Qué ángulos funcionan"
          description="Agregado de lo que has marcado en sus copys y anuncios. Los perdedores cuentan tanto como los ganadores: acotan por dónde no ir."
        >
          <div className="space-y-3">
            {tested.map((item) => (
              <div
                key={item.angleId}
                className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.angleName}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.desire}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
                        item.score > 0
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : item.score < 0
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {item.score > 0 ? "+" : ""}
                      {item.score}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm">{item.verdict}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {PERFORMANCE_RATINGS.filter((rating) => item.counts[rating] > 0).map((rating) => {
                    const meta = PERFORMANCE_META[rating];
                    return (
                      <span
                        key={rating}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
                      >
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {item.counts[rating]} {meta.label.toLowerCase()}
                      </span>
                    );
                  })}
                </div>

                {item.winningFormats.length > 0 ? (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium">Gana con:</span> {item.winningFormats.join(", ")}
                  </p>
                ) : null}

                {item.winningNotes.length > 0 ? (
                  <div className="mt-3 rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                    <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                      Por qué funcionó
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {item.winningNotes.map((note) => (
                        <li key={note}>• {note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {item.losingNotes.length > 0 ? (
                  <div className="mt-3 rounded-2xl bg-rose-50 p-3 dark:bg-rose-950/30">
                    <p className="text-xs font-medium text-rose-800 dark:text-rose-300">
                      Por qué no funcionó
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {item.losingNotes.map((note) => (
                        <li key={note}>• {note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Ideas nuevas a partir de lo que ya sabes"
        description="El modelo recibe qué ganó, qué perdió y por qué, y propone desde ahí en vez de empezar de cero."
      >
        {tested.length === 0 ? (
          <EmptyState
            title="Todavía no hay piezas marcadas"
            description="Marca copys y anuncios como ganadores o perdedores en sus pestañas. Con eso, el modelo puede proponer sobre evidencia y no a ciegas."
          />
        ) : (
          <div className="space-y-4">
            <div>
              <span className="mb-2 block text-sm font-medium">Qué quieres que proponga</span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["angulos", "Ángulos nuevos"],
                    ["anuncios", "Ideas de anuncio"],
                    ["publirreportajes", "Ideas de publirreportaje"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setIdeaTarget(value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      ideaTarget === value
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Se le envían {tested.length} {tested.length === 1 ? "ángulo probado" : "ángulos probados"} con
              sus notas. Cada propuesta tendrá que justificar por qué esa y no otra, conectando con la
              evidencia.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <GenerateButton
                action={async () => {
                  setIdeas([]);
                  return generateIdeasAction(productId, ideaTarget);
                }}
                onStarted={setIdeasJobId}
                label="Proponer 5 ideas"
                disabled={!hasApiKey || tested.length === 0}
                disabledReason={
                  !hasApiKey
                    ? "Configura tu clave de API en Configuración"
                    : "Marca antes algún copy o anuncio como ganador o perdedor."
                }
                hint="Parte de lo que ya has valorado. Alrededor de 0,15 USD."
              />
            </div>

            {ideasRunning ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Pensando las propuestas... Puedes cerrar la pestaña y volver.
              </p>
            ) : null}

            {ideas.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Propuestas</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No se guardan: son para leer y decidir. Lo que se guarda es el ángulo o el copy que
                  crees a partir de una.
                </p>
                {ideas.map((idea) => (
                  <article
                    key={idea.title}
                    className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{idea.title}</p>
                      <Tag>{AWARENESS_LABELS[idea.awarenessLevel]}</Tag>
                    </div>
                    <p className="mt-2 text-sm leading-6">{idea.rationale}</p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Sale de: {idea.basedOn}
                    </p>
                    <div className="mt-3">
                      <Copyable value={idea.firstLine} label="Primera línea">
                        <span className="text-sm italic">«{idea.firstLine}»</span>
                      </Copyable>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Ángulos"
        description="Cada uno con su mecanismo único del problema y de la solución, que es lo que después alimenta los textos."
        action={
          angleDesires.length > 1 ? (
            <SelectField
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="w-64"
              aria-label="Filtrar por deseo"
            >
              <option value="all">Todos los deseos</option>
              {angleDesires.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
          ) : undefined
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="Todavía no hay ángulos para este producto"
            description="Genera cinco a partir de un deseo masivo y podrás escribir un long copy o un publirreportaje desde cada uno."
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((angle) => (
              <article
                key={angle.id}
                className="rounded-3xl border border-slate-200 p-5 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Copyable value={angle.name} label="nombre del ángulo">
                      <h4 className="font-semibold">{angle.name}</h4>
                    </Copyable>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {angle.targetAudience}
                    </p>

                    {/*
                      Se avisa, no se esconde. Un ángulo silenciado es un ángulo
                      que no se puede discutir, y estos existen precisamente para
                      poder discutirlos: la idea puede ir lejos, la frase que se
                      publica no.
                    */}
                    {angle.promiseToValidate ? (
                      <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        Pide una promesa que la investigación no sostiene:{" "}
                        <strong>{angle.promiseToValidate}</strong>. Compruébala antes de escribir el
                        copy — el encargo no la va a afirmar por su cuenta.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {performanceById.get(angle.id)?.tested ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                          (performanceById.get(angle.id)?.score ?? 0) > 0
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : (performanceById.get(angle.id)?.score ?? 0) < 0
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {(performanceById.get(angle.id)?.score ?? 0) > 0 ? "+" : ""}
                        {performanceById.get(angle.id)?.score}
                      </span>
                    ) : null}
                    <Tag>{angle.desire}</Tag>
                  </div>
                </div>

                {/* El arco es lo que hace distinto a un ángulo de otro. */}
                <ol className="mt-4 grid gap-2 md:grid-cols-4">
                  {(
                    [
                      ["Inicio", angle.storyArc.start],
                      ["Crisis", angle.storyArc.crisis],
                      ["Descubrimiento", angle.storyArc.discovery],
                      ["Resolución", angle.storyArc.resolution],
                    ] as const
                  ).map(([label, value]) => (
                    <li
                      key={label}
                      className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-950"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 leading-6">{value}</p>
                    </li>
                  ))}
                </ol>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                      Mecanismo único del problema
                    </p>
                    <p className="mt-2 text-sm leading-6">{angle.problemMechanism}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-300">
                      Mecanismo único de solución
                    </p>
                    <p className="mt-2 text-sm leading-6">{angle.solutionMechanism}</p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium">Momento emotivo:</span> {angle.emotionalMoment}
                </p>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
