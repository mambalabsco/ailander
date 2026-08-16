"use client";

import { useState } from "react";
import { Button, SelectField, Tag } from "@/components/ui";
import { CopyableBlock } from "@/components/copyable";
import { AD_VISUAL_CONCEPT_LABELS, HIGGSFIELD_MODELS, findModel } from "@/types/visuals";
import { AdVisualSender } from "@/components/ad-visual-sender";
import { ImageDownloads } from "@/components/image-downloads";
import type { AdVisualPrompt, ProductImage } from "@/types/visuals";

interface AdVisualsProps {
  productId: string;
  visuals: AdVisualPrompt[];
  primaryImage: ProductImage | null;
  hasHiggsfieldKey: boolean;
  /** El copy del que salen, para atarles las imágenes que se generen. */
  copyId: string;
  /** Las ya generadas para este copy. Se ven aquí, no solo en la galería. */
  generated: ProductImage[];
}

/**
 * Creatividades de un copy.
 *
 * Cada una llega con modelo recomendado y con la casilla de imagen de referencia
 * ya marcada o no según el concepto — pero siempre editable, porque la decisión
 * automática acierta en el caso general y el caso general no es todos.
 */
export function AdVisuals({
  productId,
  visuals,
  primaryImage,
  hasHiggsfieldKey,
  copyId,
  generated,
}: AdVisualsProps) {
  /*
   * Abierto de entrada cuando las creatividades salen de la historia.
   *
   * Extraer las escenas es una acción deliberada que ya costó una llamada al
   * modelo: quien acaba de hacerlo quiere ver el resultado y mandarlo, no
   * encontrarse otro botón que abre otro panel. Con las de plantilla se queda
   * cerrado, que es como estaba.
   */
  const fromStory = visuals.some((visual) => visual.id.includes("-beat-"));
  const [open, setOpen] = useState(fromStory);
  // Overrides del usuario sobre las decisiones automáticas.
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});
  const [referenceOverrides, setReferenceOverrides] = useState<Record<string, boolean>>({});

  const referenceFor = (visual: AdVisualPrompt) =>
    referenceOverrides[visual.id] ?? visual.needsProductReference;

  const modelFor = (visual: AdVisualPrompt) =>
    modelOverrides[visual.id] ?? visual.recommendedModelId;

  const referencesNeeded = visuals.filter((visual) => referenceFor(visual)).length;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      {open ? (
        <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          {/* La foto del producto ya se envía, por la vía del CLI. Solo llega a
              los modelos que declaran admitirla, y el selector lo dice. */}
          {referencesNeeded > 0 ? (
            <p className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <span className="font-medium">
                {referencesNeeded} de estas creatividades usarán la foto real del producto.
              </span>{" "}
              Se envía como referencia a los modelos que la admiten —Nano Banana Pro entre ellos—,
              para que el envase sea el tuyo y no uno inventado. Si eliges un modelo que no la
              acepta, el selector te avisa antes de gastar créditos.
            </p>
          ) : null}

          <AdVisualSender
            productId={productId}
            copyId={copyId}
            visuals={visuals.map((visual) => ({
              title: visual.title,
              prompt: visual.prompt,
              aspectRatio: visual.aspectRatio,
              concept: visual.concept,
              // El gancho da nombre al archivo: es lo que lo hace reconocible.
              origin: visual.title,
              /*
               * Solo las que enseñan el producto reciben su foto.
               *
               * Antes se decidía para toda la tanda y siempre que sí, así que a
               * las escenas que no lo llevan —el desagüe, el análisis— se les
               * pegaba un frasco de suplemento dentro.
               */
              withReference: referenceFor(visual),
            }))}
          />
        </div>
      ) : null}

      {/*
        Rehacer una creatividad suelta.

        El bloque de arriba genera **la tanda**, y para arreglar una que salió
        mal había que lanzarlas todas otra vez y pagarlas todas otra vez.
        Rehacer es una decisión que se toma mirando una imagen, así que el botón
        va con cada una.
      */}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {visuals.map((visual) => (
          <li
            key={visual.title}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
          >
            <span className="min-w-40 flex-1 truncate text-sm">{visual.title}</span>

            <AdVisualSender
              productId={productId}
              copyId={copyId}
              visuals={[
                {
                  title: visual.title,
                  prompt: visual.prompt,
                  aspectRatio: visual.aspectRatio,
                  concept: visual.concept,
                  origin: visual.title,
                  withReference: referenceFor(visual),
                },
              ]}
              label={
                generated.some((image) => image.concept === visual.concept)
                  ? "Rehacer"
                  : "Generar esta"
              }
              compact
            />
          </li>
        ))}
      </ul>

      {/* Las ya generadas, aquí mismo. Antes había que ir a la galería del
          producto y adivinar cuál salió de este anuncio.
          `productId` es lo que hace aparecer «Rehacer» en cada una. */}
      <ImageDownloads
        images={generated}
        productId={productId}
        title="Creatividades de este anuncio"
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{visuals.length} creatividades para Higgsfield</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Cada una con el modelo que mejor le encaja y si necesita la foto real del producto.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setOpen((value) => !value)}
          disabled={!hasHiggsfieldKey}
          title={hasHiggsfieldKey ? undefined : "Configura las credenciales de Higgsfield en Configuración"}
        >
          {/*
            El texto decía «Enviar a Higgsfield» y solo desplegaba el panel: el
            envío de verdad está en el botón de dentro. Quien lo pulsaba daba por
            hecho que ya se había mandado y se iba.
          */}
          {open ? "Ocultar" : "Preparar el envío"}
        </Button>
      </div>

      {referencesNeeded > 0 && !primaryImage ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {referencesNeeded} de estas creatividades necesitan la imagen principal del producto como
          referencia, y este producto todavía no tiene ninguna marcada. Súbela o genérala en la pestaña
          Imágenes: sin ella el modelo se inventará el envase.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {visuals.map((visual) => {
          const usesReference = referenceFor(visual);
          const modelId = modelFor(visual);
          const model = findModel(modelId);
          const overridden = modelId !== visual.recommendedModelId;

          return (
            <details
              key={visual.id}
              className="group rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 marker:content-none">
                <span className="min-w-0">
                  <span className="text-violet-600 group-open:hidden">▸ </span>
                  <span className="hidden text-violet-600 group-open:inline">▾ </span>
                  <span className="font-medium">{AD_VISUAL_CONCEPT_LABELS[visual.concept]}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  <Tag>{visual.aspectRatio}</Tag>
                  <Tag>{model?.name ?? modelId}</Tag>
                  {usesReference ? (
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      Con referencia
                    </span>
                  ) : null}
                </span>
              </summary>

              <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <CopyableBlock value={visual.prompt} label="Prompt" maxHeightClass="max-h-72">
                  <p className="whitespace-pre-wrap text-sm leading-6">{visual.prompt}</p>
                </CopyableBlock>

                {visual.negativePrompt ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Prompt negativo
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {visual.negativePrompt}
                    </p>
                  </div>
                )
                : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Modelo</span>
                    <SelectField
                      value={modelId}
                      onChange={(event) =>
                        setModelOverrides((current) => ({ ...current, [visual.id]: event.target.value }))
                      }
                    >
                      {HIGGSFIELD_MODELS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.id === visual.recommendedModelId ? " · recomendado" : ""}
                        </option>
                      ))}
                    </SelectField>
                    <span className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
                      {overridden
                        ? `Has cambiado la recomendación. La automática era ${findModel(visual.recommendedModelId)?.name}: ${visual.modelReason}`
                        : visual.modelReason}
                    </span>
                  </label>

                  <div>
                    <span className="mb-2 block text-sm font-medium">Imagen de referencia</span>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                      <input
                        type="checkbox"
                        checked={usesReference}
                        onChange={(event) =>
                          setReferenceOverrides((current) => ({
                            ...current,
                            [visual.id]: event.target.checked,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 accent-violet-600"
                      />
                      <span className="text-sm">
                        Enviar la imagen principal del producto
                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                          {visual.referenceReason}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
