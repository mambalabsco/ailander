"use client";

import { useRef, useState, useTransition } from "react";
import { framePlan } from "@/lib/video/analysis";
import { grabAudio, grabFrames, probeInBrowser } from "@/lib/video/browser-frames";
import { Button } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import {
  analyzeVideoAction,
  deleteVideoReferenceAction,
} from "@/app/products/[id]/video-analysis-actions";

/**
 * Anuncios en vídeo que ya funcionan, analizados para escribir otros.
 *
 * ## Qué se enseña de cada uno
 *
 * El gancho entero y la línea de tiempo. Son las dos cosas que se miran al
 * escribir el siguiente: por dónde entra y cómo se reparte. El resto va plegado
 * porque se lee una vez.
 *
 * ## Los avisos van en rojo y a la vista
 *
 * Un análisis puede describir muy bien un tramo que no existe: entre dos
 * fotogramas hay segundos que nadie vio. Cuando el repaso encuentra momentos
 * fuera del vídeo o un ritmo imposible, se dice — un análisis inventado se lee
 * igual de convincente que uno correcto, y esa es justo la razón para avisar.
 */

export interface ReferenceAd {
  id: string;
  name: string;
  sourceUrl: string;
  durationSeconds: number;
  framesAnalyzed: number;
  hadAudio: boolean;
  warnings: string[];
  analysis: {
    hook: string;
    promise: string;
    voice: string;
    beats: { at: number; shot: string; role: string; onScreenText: string }[];
    averageShotSeconds: number;
    productMoment: string;
    callToAction: string;
    whyItWorks: string;
  };
}

export function ReferenceAds({
  productId,
  references,
}: {
  productId: string;
  references: ReferenceAd[];
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Anuncios de referencia</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Sube un anuncio que funcione y se analiza cómo está construido: el gancho, el ritmo,
            cuándo aparece el producto. Después se puede escribir un guion que lo siga.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen((value) => !value)}>
          {open ? "Cerrar" : "Analizar uno"}
        </Button>
      </div>

      {open ? (
        <form ref={formRef} className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block">El vídeo</span>
              <input
                type="file"
                name="video"
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/x-matroska"
                required
                className="w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-slate-800"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block">Cómo llamarlo</span>
              <input
                name="name"
                placeholder="Anuncio rodilla — 3M vistas"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block">De dónde salió (opcional)</span>
              <input
                name="sourceUrl"
                placeholder="https://…"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block">Idioma de la voz</span>
              <input
                name="language"
                placeholder="spa"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                Código de tres letras. Vacío lo detecta solo.
              </span>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block">Qué vende, si lo sabes (opcional)</span>
            <input
              name="context"
              placeholder="Colágeno para dolor articular, público de 45 a 65"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <GenerateButton
            variant="primary"
            action={async () => {
              const form = formRef.current;
              if (!form) throw new Error("No se pudo leer el formulario.");

              const data = new FormData(form);
              const video = data.get("video");
              if (!(video instanceof File) || video.size === 0) {
                throw new Error("Elige un vídeo antes de analizar.");
              }

              /*
               * El vídeo se descompone **aquí**, en el navegador.
               *
               * Solo se suben los fotogramas y la voz: unos cuatro megas en vez
               * de sesenta. El archivo no sale de este ordenador.
               */
              try {
                setProgress("Leyendo el vídeo…");
                const probe = await probeInBrowser(video);
                const marks = framePlan(probe.duration);

                const frames = await grabFrames(video, marks, (done, total) =>
                  setProgress(`Sacando fotogramas… ${done} de ${total}`),
                );

                setProgress("Sacando la voz…");
                const audio = await grabAudio(video);

                const payload = new FormData();
                payload.set("productId", productId);
                payload.set("name", String(data.get("name") ?? ""));
                payload.set("sourceUrl", String(data.get("sourceUrl") ?? ""));
                payload.set("context", String(data.get("context") ?? ""));
                payload.set("language", String(data.get("language") ?? ""));
                payload.set("duration", String(probe.duration));
                payload.set("width", String(probe.width));
                payload.set("height", String(probe.height));

                // Solo los segundos de los fotogramas que **salieron**: si alguno
                // falló, decir el segundo equivocado descoloca la línea entera.
                payload.set("marks", JSON.stringify(marks.slice(0, frames.length)));

                frames.forEach((frame, index) => {
                  payload.append("frames", frame, `f${index}.jpg`);
                });

                if (audio) payload.set("audio", audio, "audio.wav");

                setProgress("Analizando…");
                return await analyzeVideoAction(payload);
              } finally {
                setProgress("");
              }
            }}
            label="Analizar el anuncio"
            hint="Los fotogramas y la voz se sacan en tu navegador: el vídeo no se sube a ningún sitio."
          />

          {progress ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{progress}</p>
          ) : null}
        </form>
      ) : null}

      {references.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {references.map((reference) => (
            <li
              key={reference.id}
              className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{reference.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {reference.durationSeconds.toFixed(0)} s · {reference.framesAnalyzed} fotogramas
                    · corte cada {reference.analysis.averageShotSeconds.toFixed(1)} s
                    {reference.hadAudio ? "" : " · sin voz"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteVideoReferenceAction(reference.id, productId);
                    })
                  }
                >
                  Borrar
                </Button>
              </div>

              {reference.warnings.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 rounded-xl bg-amber-50 p-2 pl-6 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  {reference.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <p className="mt-2 text-sm">
                <span className="font-medium">Cómo entra: </span>
                {reference.analysis.hook}
              </p>

              <ol className="mt-2 space-y-0.5 text-xs">
                {reference.analysis.beats.map((beat, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="w-12 shrink-0 tabular-nums text-slate-400">
                      {beat.at.toFixed(1)}s
                    </span>
                    <span className="w-20 shrink-0 font-medium">{beat.role}</span>
                    <span className="text-slate-600 dark:text-slate-300">{beat.shot}</span>
                  </li>
                ))}
              </ol>

              <button
                type="button"
                onClick={() => setExpanded((id) => (id === reference.id ? null : reference.id))}
                className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300"
              >
                {expanded === reference.id ? "Menos" : "Por qué funciona"}
              </button>

              {expanded === reference.id ? (
                <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <p>
                    <span className="font-medium">Promete: </span>
                    {reference.analysis.promise}
                  </p>
                  <p>
                    <span className="font-medium">Habla: </span>
                    {reference.analysis.voice}
                  </p>
                  <p>
                    <span className="font-medium">El producto: </span>
                    {reference.analysis.productMoment}
                  </p>
                  <p>
                    <span className="font-medium">Cierra: </span>
                    {reference.analysis.callToAction}
                  </p>
                  <p>
                    <span className="font-medium">Por qué funciona: </span>
                    {reference.analysis.whyItWorks}
                  </p>
                  {reference.sourceUrl ? (
                    <a
                      href={reference.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block text-xs text-violet-700 underline dark:text-violet-300"
                    >
                      Ver el original
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
