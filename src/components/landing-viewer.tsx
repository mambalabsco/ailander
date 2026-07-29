"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { CopyableBlock } from "@/components/copyable";
import { AdVisualSender } from "@/components/ad-visual-sender";
import { ImageDownloads } from "@/components/image-downloads";
import {
  deleteLandingAction,
  generateCommentAvatarsAction,
  publishLandingAction,
} from "@/app/products/[id]/landing-actions";
import { GenerateButton } from "@/components/generate-button";
import { LandingAb } from "@/components/landing-ab";
import type { LandingPage } from "@/types/landing";
import type { ProductImage } from "@/types/visuals";

/**
 * Una página generada: se ve, se copia y se llenan sus imágenes.
 *
 * Tres vistas porque cada una responde a algo distinto: **Vista previa** para
 * juzgar si funciona, **HTML** para pegarlo en Shopify, e **Imágenes** para
 * generarlas y bajarlas.
 */
export function LandingViewer({
  productId,
  page,
  preview,
  html,
  images,
}: {
  productId: string;
  page: LandingPage;
  /** Con las imágenes puestas. Renderizado en el servidor: la plantilla vive allí. */
  preview: string;
  /** Con los huecos marcados, para pegar en Shopify. */
  html: string;
  images: ProductImage[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"vista" | "html" | "imagenes" | "prueba">("vista");
  /*
   * Qué HTML te llevas.
   *
   * Por defecto, con huecos: las URL de las imágenes están firmadas y caducan en
   * una hora, así que una página pegada con ellas amanecería rota. La otra
   * opción existe para ver la página funcionando ya mismo, y se avisa.
   */
  const [embed, setEmbed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const pending = page.imageSlots.filter(
    (slot) => !images.some((image) => image.concept === slot.slot),
  );

  return (
    <article className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{page.title}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            /pages/{page.slug} · {page.sections.length} secciones · {page.imageSlots.length}{" "}
            imágenes · {page.comments.length} comentarios
          </p>
        </div>
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await deleteLandingAction(page.id, productId);
              router.refresh();
            })
          }
        >
          Eliminar
        </Button>
      </div>

      {/* Publicar va arriba y separado: es la acción que sale de la
          plataforma y toca tu tienda de verdad. */}
      <div className="mb-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <GenerateButton
            action={() => publishLandingAction({ id: page.id, productId })}
            label={page.shopifyUrl ? "Actualizar en Shopify" : "Publicar en Shopify"}
            hint={
              page.shopifyUrl
                ? "Actualiza la misma página: el enlace no cambia."
                : "Sube las imágenes y crea la página. Necesita el token en Configuración."
            }
          />
          {page.shopifyUrl ? (
            <a
              href={page.shopifyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-violet-600 underline-offset-2 hover:underline dark:text-violet-300"
            >
              Ver publicada ↗
            </a>
          ) : null}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["vista", "Vista previa"],
            ["html", "HTML para Shopify"],
            ["imagenes", `Imágenes (${pending.length} sin generar)`],
            ["prueba", "Ajustes y resultados"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              tab === id
                ? "bg-violet-600 text-white"
                : "border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "prueba" ? <LandingAb productId={productId} page={page} /> : null}

      {tab === "vista" ? (
        /*
         * La vista previa se pinta con el mismo HTML que te llevas.
         *
         * Fondo blanco fijo y no el del tema: la página vivirá en Shopify sobre
         * blanco, y verla en oscuro daría una idea equivocada de cómo se lee.
         */
        <div className="max-h-[32rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700">
          <div dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      ) : null}

      {tab === "html" ? (
        <div>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            Pégalo en Shopify → Páginas → Añadir página → «&lt;/&gt;» (editor de código).
          </p>

          <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={embed}
              onChange={(event) => setEmbed(event.target.checked)}
              className="mt-1 size-4 accent-violet-600"
            />
            <span>
              Incrustar las imágenes con enlaces temporales
              <span className="block text-xs text-amber-700 dark:text-amber-400">
                Sirve para verla funcionando ya, pero los enlaces caducan en una hora y la página
                quedaría con las imágenes rotas. Para publicarla de verdad, descárgalas, súbelas a
                Shopify y sustituye cada hueco.
              </span>
            </span>
          </label>

          <CopyableBlock value={embed ? preview : html} label="HTML" maxHeightClass="max-h-96">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-5">
              {embed ? preview : html}
            </pre>
          </CopyableBlock>
        </div>
      ) : null}

      {tab === "imagenes" ? (
        <div className="space-y-4">
          {page.imageSlots.map((slot) => (
            <div
              key={slot.slot}
              className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <p className="text-sm font-medium">
                {slot.slot} · {slot.aspectRatio}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{slot.purpose}</p>
              <CopyableBlock value={slot.prompt} label="Prompt" maxHeightClass="max-h-32">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-5">{slot.prompt}</pre>
              </CopyableBlock>
            </div>
          ))}

          {pending.length > 0 ? (
            <AdVisualSender
              productId={productId}
              visuals={pending.map((slot) => ({
                title: `${page.title} · ${slot.slot}`,
                prompt: slot.prompt,
                aspectRatio: slot.aspectRatio,
                // El hueco va en `concept` para poder emparejar la imagen con
                // su sitio en la página cuando vuelva generada, y `landingId`
                // porque los huecos se llaman igual en todas las páginas.
                concept: slot.slot,
                origin: page.title,
                landingId: page.id,
              }))}
            />
          ) : null}

          {/* Los retratos van aparte: son del producto y sirven en todas las
              páginas, así que no se cuentan entre los huecos de esta. */}
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-sm font-medium">Retratos de los comentarios</p>
            <p className="mt-1 mb-3 text-sm text-slate-600 dark:text-slate-300">
              Ocho caras generadas con Soul, personas sintéticas del país del producto. Se generan
              una sola vez y sirven en todas tus páginas.
            </p>
            <GenerateButton
              variant="secondary"
              action={() => generateCommentAvatarsAction({ productId })}
              label="Generar los retratos"
              hint="Ocho imágenes. Solo genera las que falten."
            />
          </div>

          <ImageDownloads images={images} title="Imágenes de esta página" />
        </div>
      ) : null}
    </article>
  );
}
