"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, SelectField } from "@/components/ui";
import { SectionCard } from "@/components/section-card";
import { ReferenceAds, type ReferenceAd } from "@/components/video/reference-ads";
import { GenerateButton } from "@/components/generate-button";
import { VoicePicker } from "@/components/video/voice-picker";
import { ShotBoard } from "@/components/video/shot-board";
import {
  VIDEO_MODELS,
  efficientShotCounts,
  findVideoModel,
  shotCountOption,
} from "@/lib/video/shots";

/**
 * Qué animador se elige y por qué importa.
 *
 * Los dos sirven para cosas distintas: uno da mejor imagen y cuesta cuatro veces
 * más. Con el precio al lado de cada uno, y el de cada reparto de tomas
 * calculado con el elegido, la decisión se toma viendo el número.
 */
import {
  createVideoFromCopyAction,
  runFullVideoAction,
  deleteVideoAction,
} from "@/app/products/[id]/video-actions";
import { estimate, planDurations } from "@/lib/video/shots";
import type { Video } from "@/lib/data/videos";
import type { GeneratedCopy } from "@/types/copy";

/**
 * Vídeos verticales de un producto.
 *
 * La pantalla sigue el orden en que se gasta —guion, voz, imágenes, animación,
 * montaje— y **enseña el presupuesto antes de cada paso caro**. Es la regla de
 * control de gasto del pipeline: un lote se cobra entero de golpe, así que nada
 * se dispara sin que alguien haya visto lo que va a costar.
 */

const money = (value: number) => `$${value.toFixed(2)}`;

export function VideosTab({
  productId,
  videos,
  copies,
  providers,
  references,
}: {
  productId: string;
  videos: Video[];
  copies: GeneratedCopy[];
  providers: { voice: boolean; images: boolean; compose: boolean };
  /** Anuncios ya analizados, para escribir siguiendo su construcción. */
  references: ReferenceAd[];
}) {
  const router = useRouter();
  const [copyId, setCopyId] = useState(copies[0]?.id ?? "");
  const [voiceId, setVoiceId] = useState("");
  const [shots, setShots] = useState(6);
  const [seconds, setSeconds] = useState(60);
  const [referenceId, setReferenceId] = useState("");
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].id);
  const [isPending, startTransition] = useTransition();

  const missing = [
    !providers.voice ? "ELEVENLABS_API_KEY" : "",
    !providers.images ? "KIE_API_KEY" : "",
    !providers.compose ? "FAL_KEY" : "",
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {/*
        Lo que falta se dice arriba y antes de nada. Descubrir a mitad del
        pipeline que no hay clave, con la voz ya pagada, es el peor momento.
      */}
      {missing.length > 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Faltan credenciales en el servidor</p>
          <p className="mt-1">
            {missing.join(", ")}. Sin ellas los pasos que las necesitan no se pueden lanzar.
          </p>
        </div>
      ) : null}

      <SectionCard
        title="Nuevo vídeo desde un copy"
        description="El copy se reescribe para el oído y se reparte en tomas: qué se narra, qué se ve y qué se mueve en cada una."
      >
        {copies.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Todavía no hay ningún copy. Escribe uno primero: el guion sale de él.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Copy</span>
                <SelectField
                  value={copyId}
                  onChange={(event) => setCopyId(event.target.value)}
                  className="min-w-64"
                >
                  {copies.map((copy) => (
                    <option key={copy.id} value={copy.id}>
                      {copy.driverLabel} · {copy.wordCount} palabras
                    </option>
                  ))}
                </SelectField>
              </label>

              <VoicePicker value={voiceId} onChange={setVoiceId} enabled={providers.voice} />

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Duración
                </span>
                <SelectField
                  value={String(seconds)}
                  onChange={(event) => setSeconds(Number(event.target.value))}
                  className="w-28"
                >
                  {[30, 45, 60, 90, 120].map((value) => (
                    <option key={value} value={value}>
                      {value} s
                    </option>
                  ))}
                </SelectField>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Animador
                </span>
                <SelectField
                  value={videoModel}
                  onChange={(event) => setVideoModel(event.target.value)}
                  className="min-w-48"
                >
                  {VIDEO_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} · ${model.usdPerSecond.toFixed(3)}/s
                    </option>
                  ))}
                </SelectField>
                <span className="max-w-56 text-xs text-slate-500 dark:text-slate-400">
                  {findVideoModel(videoModel).note}
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tomas</span>
                <SelectField
                  value={String(shots)}
                  onChange={(event) => setShots(Number(event.target.value))}
                  className="w-20"
                >
                  {/*
                    Cada opción con lo que se paga de verdad.

                    El generador solo vende clips de cinco o de diez segundos, así
                    que una toma con 5,6 s de voz paga uno de diez: diez tomas de
                    seis segundos cuestan 7 USD y once de cinco y medio cuestan
                    3,85. Sin verlo al lado, esa elección se hace a ciegas.
                  */}
                  {[4, 5, 6, 7, 8, 10, 11, 12, 14].map((value) => {
                    const model = findVideoModel(videoModel);
                    const option = shotCountOption(seconds, value, model.billing, model.maxSeconds);
                    const cost = option.billed * model.usdPerSecond;

                    return (
                      <option key={value} value={value}>
                        {value} · ${cost.toFixed(2)}
                        {option.waste > 2 ? ` (${option.waste} s de más)` : ""}
                      </option>
                    );
                  })}
                </SelectField>
              </label>

              {/*
                Seguir un anuncio analizado. Es lo que convierte el análisis en
                algo útil: sin esto, saber cómo entra un anuncio que funciona se
                queda en una ficha que nadie usa al escribir el siguiente.
              */}
              {references.length > 0 ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Seguir la construcción de
                  </span>
                  <SelectField
                    value={referenceId}
                    onChange={(event) => setReferenceId(event.target.value)}
                    className="min-w-52"
                  >
                    <option value="">Sin referencia</option>
                    {references.map((reference) => (
                      <option key={reference.id} value={reference.id}>
                        {reference.name}
                      </option>
                    ))}
                  </SelectField>
                </label>
              ) : null}
            </div>

            {/*
              El presupuesto, antes de empezar. La animación es casi todo el
              gasto, y verlo aquí evita descubrirlo cuando ya se pagó.
            */}
            <Presupuesto shots={shots} seconds={seconds} />

            {/*
              Si el reparto elegido tira dinero, se dice cuál no lo hace.

              No se cambia solo: puede haber un motivo para querer ocho tomas. Lo
              que no puede pasar es pagar el doble sin enterarse.
            */}
            {(() => {
              const model = findVideoModel(videoModel);
              const chosen = shotCountOption(seconds, shots, model.billing);
              if (chosen.waste <= 2) return null;

              const better = efficientShotCounts(seconds, 14, model.billing).find(
                (option) => option.billed < chosen.billed,
              );
              if (!better) return null;

              const saving = (chosen.billed - better.billed) * model.usdPerSecond;

              return (
                <p className="rounded-xl bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                  Con {shots} tomas se pagan {chosen.billed} s para {seconds} s de voz. Con{" "}
                  <strong>{better.shots}</strong> se pagan {better.billed} s y ahorras{" "}
                  <strong>${saving.toFixed(2)}</strong> — el generador solo vende clips de cinco o
                  de diez segundos, y una toma que se pasa de 5,5 s paga uno de diez.
                </p>
              );
            })()}

            {/*
              Todo de una, que es como se usa de verdad.

              Se para antes de animar por defecto: regenerar un keyframe malo
              cuesta unos dos céntimos y dejarlo pasar cuesta la toma animada
              entera. Mirar seis imágenes lleva medio minuto.
            */}
            <div className="flex flex-wrap items-center gap-3">
              <GenerateButton
                variant="primary"
                action={() =>
                  runFullVideoAction({
                    productId,
                    copyId,
                    voiceId,
                    shots,
                    seconds,
                    referenceId,
                    videoModel,
                    stopBeforeClips: true,
                  })
                }
                label="Hacer guion, voz e imágenes"
                disabled={!copyId || !voiceId}
                disabledReason={!voiceId ? "Elige una voz" : undefined}
                hint="Los tres pasos seguidos, en segundo plano. Para antes de animar para que mires las imágenes: es donde está el gasto."
              />

              <GenerateButton
                variant="secondary"
                action={() =>
                  runFullVideoAction({
                    productId,
                    copyId,
                    voiceId,
                    shots,
                    seconds,
                    referenceId,
                    videoModel,
                    stopBeforeClips: false,
                  })
                }
                label="Hacer el vídeo entero"
                disabled={!copyId || !voiceId}
                hint="Sin parar a revisar. Anima y monta también: es lo caro, y una toma mala se paga igual."
              />
            </div>

            <GenerateButton
              variant="secondary"
              action={() =>
                createVideoFromCopyAction({
                  productId,
                  copyId,
                  voiceId,
                  shots,
                  seconds,
                  referenceId,
                })
              }
              label="Solo el guion"
              disabled={!copyId || !voiceId}
              disabledReason={!voiceId ? "Elige una voz" : undefined}
              hint="El guion es lo barato: unos 0,05 USD. Nada de vídeo se genera todavía."
            />
          </div>
        )}
      </SectionCard>

      {/*
        Los anuncios de referencia van **debajo** del panel de escribir y no
        arriba: se analizan una vez y se consultan poco, mientras que escribir un
        guion es lo que se hace cada día.
      */}
      <ReferenceAds productId={productId} references={references} />

      {videos.length === 0 ? (
        <EmptyState
          title="Todavía no hay ningún vídeo"
          description="Se hacen a partir de un copy: se reescribe para el oído, se le pone voz, y de los tiempos de esa voz salen los cortes de cada toma."
        />
      ) : (
        videos.map((video) => (
          <SectionCard
            key={video.id}
            title={video.title}
            description={`${video.shots.length} tomas · ${video.voiceSeconds.toFixed(1)} s de voz · ${money(video.spentUsd)} gastados`}
            action={
              <Button
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    if (!window.confirm(`¿Borrar «${video.title}»? No se puede deshacer.`)) return;
                    await deleteVideoAction(video.id, productId);
                    router.refresh();
                  })
                }
              >
                Borrar
              </Button>
            }
          >
            <ShotBoard productId={productId} video={video} providers={providers} />
          </SectionCard>
        ))
      )}
    </div>
  );
}

/**
 * Lo que va a costar, antes de escribir nada.
 *
 * Se calcula con las tarifas medidas y suponiendo que las tomas reparten la
 * duración por igual. Es una estimación y se dice: los cortes reales salen de la
 * voz, y hasta que exista no se sabe cuántas tomas caben en el clip de cinco.
 */
function Presupuesto({ shots, seconds }: { shots: number; seconds: number }) {
  const perShot = seconds / Math.max(1, shots);

  const plans = planDurations(
    Array.from({ length: shots }, (_, index) => ({
      n: String(index + 1),
      start: 0,
      end: perShot,
      guion: "",
    })),
  );

  const budget = estimate({
    shots: Array.from({ length: shots }, () => ({
      n: "",
      guion: "x".repeat(Math.round(perShot * 15)),
      role: "story" as const,
      scene: "",
      motion: "",
      speaking: false,
    })),
    plans,
    lipsyncCount: 0,
  });

  return (
    <div className="rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-800">
      <p className="font-medium">
        Estimado: {money(budget.total)}
        <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
          {budget.videoSeconds} s de vídeo generado
        </span>
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        voz {money(budget.voice)} · imágenes {money(budget.keyframes)} · animación{" "}
        {money(budget.video)}. La animación es casi todo: es donde hay que mirar antes de lanzar.
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Es una estimación. Los cortes reales salen de la voz, y hasta que exista no se sabe cuántas
        tomas caben en el clip de cinco segundos.
      </p>
    </div>
  );
}
