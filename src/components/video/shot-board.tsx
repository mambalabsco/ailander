"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import {
  assembleVideoAction,
  uploadMusicAction,
  generateClipsAction,
  generateKeyframesAction,
  generateVoiceAction,
} from "@/app/products/[id]/video-actions";
import { ROLE_META, planDurations, reviewShots } from "@/lib/video/shots";
import type { Video } from "@/lib/data/videos";

/**
 * El tablero de un vídeo: sus tomas y en qué paso va cada una.
 *
 * ## El QC de keyframes es el corazón de esta pantalla
 *
 * El manual del pipeline lo dice sin rodeos: **mirar las imágenes antes de
 * animar es la mejor relación coste/beneficio de todo el proceso.** Regenerar un
 * keyframe malo cuesta dos céntimos; animarlo cuesta la toma entera más el
 * retrabajo.
 *
 * Por eso las imágenes se enseñan grandes y con su botón de rehacer al lado, y
 * por eso animar es un paso aparte que hay que pulsar a conciencia.
 */

const STEPS = ["Guion", "Voz", "Imágenes", "Clips", "Montaje"] as const;

export function ShotBoard({
  productId,
  video,
  providers,
}: {
  productId: string;
  video: Video;
  providers: { voice: boolean; images: boolean; compose: boolean };
}) {
  const [redo, setRedo] = useState<Set<string>>(new Set());
  const [musicNote, setMusicNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const musicRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const withCuts = video.shots.filter((shot) => shot.cutStart !== null);
  const withKeyframe = video.shots.filter((shot) => shot.keyframeUrl);
  const withClip = video.shots.filter((shot) => shot.clipUrl);

  const problems = reviewShots(video.shots);

  const plans = planDurations(
    withCuts.map((shot) => ({
      n: shot.n,
      start: shot.cutStart ?? 0,
      end: shot.cutEnd ?? 0,
      guion: shot.guion,
    })),
  );

  const step =
    video.finalUrl ? 4 : withClip.length > 0 ? 3 : withKeyframe.length > 0 ? 2 : withCuts.length > 0 ? 1 : 0;

  const toggle = (n: string) =>
    setRedo((current) => {
      const next = new Set(current);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* En qué paso va, para no perderse entre cinco botones. */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 font-medium ${
              index < step
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : index === step
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      {/*
        Los avisos del guion, antes de cualquier gasto. Ahora corregirlos es
        gratis; después de animar, no.
      */}
      {problems.length > 0 && step < 2 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Revisa esto antes de gastar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problems.map((problem, index) => (
              <li key={index}>
                <span className="font-medium">Toma {problem.n}:</span> {problem.problem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Los pasos, en orden y con lo que cuesta cada uno. */}
      <div className="flex flex-wrap gap-3">
        {withCuts.length === 0 ? (
          <GenerateButton
            variant="primary"
            action={() => generateVoiceAction({ videoId: video.id, productId })}
            label="Generar la voz"
            disabled={!providers.voice}
            disabledReason={!providers.voice ? "Falta ELEVENLABS_API_KEY" : undefined}
            hint="Céntimos. De sus tiempos salen los cortes de cada toma."
          />
        ) : null}

        {withCuts.length > 0 && withKeyframe.length < video.shots.length ? (
          <GenerateButton
            action={() => generateKeyframesAction({ videoId: video.id, productId })}
            label={withKeyframe.length > 0 ? "Generar las que faltan" : "Generar las imágenes"}
            disabled={!providers.images}
            disabledReason={!providers.images ? "Falta KIE_API_KEY" : undefined}
            hint="Unos 0,02 USD cada una. Míralas antes de animar."
          />
        ) : null}

        {redo.size > 0 ? (
          <GenerateButton
            action={() =>
              generateKeyframesAction({ videoId: video.id, productId, only: [...redo] })
            }
            label={`Rehacer ${redo.size} imagen(es)`}
            hint="Solo las marcadas."
          />
        ) : null}

        {withKeyframe.length > 0 ? (
          <GenerateButton
            variant={withClip.length === 0 ? "primary" : "secondary"}
            action={() => generateClipsAction({ videoId: video.id, productId })}
            label={withClip.length > 0 ? "Animar las que faltan" : "Animar"}
            disabled={!providers.images}
            hint={`Aquí se va casi todo: ${plans.reduce((sum, plan) => sum + plan.request, 0)} s a unos 0,07 USD el segundo.`}
          />
        ) : null}

        {withClip.length > 0 ? (
          <GenerateButton
            variant="primary"
            action={() => assembleVideoAction({ videoId: video.id, productId })}
            label={video.finalUrl ? "Volver a montar" : "Montar el vídeo"}
            disabled={!providers.compose}
            disabledReason={!providers.compose ? "Falta FAL_KEY" : undefined}
            hint="Céntimos. Lleva los subtítulos quemados con tu texto y la música si la has puesto."
          />
        ) : null}
      </div>

      {/*
        La música se pone antes de montar, junto al botón que la usa.

        Va con su aviso porque el montaje **no tiene control de volumen**: una
        pista a nivel normal tapa la voz y el anuncio deja de entenderse, y eso
        no se arregla después.
      */}
      {withClip.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Música de fondo {video.musicUrl ? "· puesta" : "· sin música"}
            </span>
            <input
              ref={musicRef}
              type="file"
              accept="audio/*"
              className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-slate-800"
            />
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Súbela ya baja de volumen: no hay control de volumen y a nivel normal tapa la voz.
            </span>
          </label>

          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const payload = new FormData();
                payload.set("videoId", video.id);
                payload.set("productId", productId);

                const file = musicRef.current?.files?.[0];
                if (file) payload.set("music", file);

                const result = await uploadMusicAction(payload);
                setMusicNote(result.message);
                if (musicRef.current) musicRef.current.value = "";
                router.refresh();
              })
            }
          >
            {video.musicUrl ? "Cambiar" : "Poner música"}
          </Button>

          {video.musicUrl ? (
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const payload = new FormData();
                  payload.set("videoId", video.id);
                  payload.set("productId", productId);

                  const result = await uploadMusicAction(payload);
                  setMusicNote(result.message);
                  router.refresh();
                })
              }
            >
              Quitarla
            </Button>
          ) : null}

          {musicNote ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{musicNote}</p>
          ) : null}
        </div>
      ) : null}

      {video.finalUrl ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <video src={video.finalUrl} controls className="mx-auto max-h-[70vh] rounded-xl" />
          <a
            href={video.finalUrl}
            download
            className="mt-2 inline-block text-sm font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
          >
            Descargar el vídeo
          </a>
        </div>
      ) : null}

      {/* Las tomas. La imagen grande, porque es lo que hay que revisar. */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {video.shots.map((shot) => {
          const plan = plans.find((item) => item.n === shot.n);
          const marked = redo.has(shot.n);

          return (
            <li
              key={shot.id}
              className={`rounded-2xl border p-3 ${
                marked
                  ? "border-amber-400 dark:border-amber-600"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">
                  {shot.n} · {ROLE_META[shot.role].label}
                  {shot.speaking ? (
                    <span className="ml-1 text-xs font-normal text-slate-500">habla</span>
                  ) : null}
                </p>
                {plan ? (
                  <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {plan.voice.toFixed(1)} s
                  </span>
                ) : null}
              </div>

              {shot.keyframeUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element --
                   Viene de un CDN externo y con proporción variable: `next/image`
                   exigiría declarar el dominio y no optimiza lo que no sirve él. */
                <img
                  src={shot.keyframeUrl}
                  alt={shot.scene}
                  className="mt-2 w-full rounded-xl"
                  loading="lazy"
                />
              ) : (
                <div className="mt-2 flex aspect-[9/16] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-700">
                  sin imagen
                </div>
              )}

              <p className="mt-2 text-sm">{shot.guion}</p>
              {shot.sub ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  en pantalla: {shot.sub}
                </p>
              ) : null}

              {plan?.freeze ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  clip de {plan.request} s, congelar {plan.freeze.toFixed(2)} s al final
                </p>
              ) : null}

              {shot.error ? (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{shot.error}</p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {shot.clipUrl ? (
                  <a
                    href={shot.clipUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-300"
                  >
                    Ver el clip ↗
                  </a>
                ) : null}

                {shot.keyframeUrl ? (
                  <Button onClick={() => toggle(shot.n)}>
                    {marked ? "No rehacer" : "Rehacer imagen"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
