"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { mediaKindOf } from "@/lib/landing-copy-html";
import { CopyableBlock } from "@/components/copyable";
import { AdVisualSender } from "@/components/ad-visual-sender";
import { ImageDownloads } from "@/components/image-downloads";
import {
  deleteLandingAction,
  generateCommentAvatarsAction,
  cloneLandingAction,
  cloneTargetsAction,
  publishLandingAction,
  unlinkLandingAction,
  copyCommentsAction,
  fixLinksAction,
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
  const [tab, setTab] = useState<"vista" | "html" | "imagenes" | "retratos" | "prueba">("vista");
  const [isUnlinking, startUnlink] = useTransition();
  /** Arreglar los enlaces va en su propia transición: no bloquea lo demás. */
  const [fixing, startFixing] = useTransition();
  const [fixNote, setFixNote] = useState("");
  /*
   * Publicar como página de producto en vez de como página suelta.
   *
   * Es la misma copia con los mismos textos ya adaptados; cambia dónde vive.
   * Una plantilla de producto hereda el precio, las variantes y el botón de
   * comprar del producto al que se asigne; una página suelta vende con un
   * enlace y no tiene carrito.
   */
  const [asProduct, setAsProduct] = useState(false);
  /*
   * Borrador solo tiene sentido la primera vez.
   *
   * Al actualizar no se toca la visibilidad —ver la acción—, así que enseñar la
   * casilla en una página ya publicada prometería algo que no va a pasar.
   */
  const [asDraft, setAsDraft] = useState(false);
  /*
   * A qué producto se rehace esta portada.
   *
   * El destino por defecto es **vacío** y no el primero de la lista: clonar
   * escribe una portada nueva en el producto elegido, y elegirlo sin querer
   * deja una página con textos de otro producto en un sitio donde nadie la
   * busca.
   */
  const [cloneTo, setCloneTo] = useState("");
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([]);
  const [loadingTargets, startTargets] = useTransition();
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
            action={() => publishLandingAction({ id: page.id, productId, asProduct, asDraft })}
            label={page.shopifyUrl ? "Actualizar en Shopify" : "Publicar en Shopify"}
            hint={
              page.shopifyUrl
                ? "Actualiza la misma página: el enlace no cambia."
                : "Sube las imágenes y crea la página. Necesita el token en Configuración."
            }
          />
          {page.shopifyUrl ? null : (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={asDraft}
                onChange={(event) => setAsDraft(event.target.checked)}
                className="size-4"
              />
              Como borrador
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={asProduct}
              onChange={(event) => setAsProduct(event.target.checked)}
              className="size-4"
            />
            Como página de producto
          </label>

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

          {/*
            La salida para cuando la página se borró desde el panel de Shopify.
            Sin esto solo quedaba «Actualizar», que apunta a algo que ya no
            existe, y la única forma de salir era borrar la página aquí y
            rehacerla entera.
          */}
          {page.shopifyUrl ? (
            <Button
              disabled={isUnlinking}
              onClick={() =>
                startUnlink(async () => {
                  if (
                    !window.confirm(
                      "¿Olvidar la página de Shopify?\n\nNo se borra nada en tu tienda: solo se suelta el vínculo, y el siguiente «Publicar» creará una página nueva. Úsalo si la borraste desde Shopify.",
                    )
                  ) {
                    return;
                  }
                  await unlinkLandingAction({ id: page.id, productId });
                  router.refresh();
                })
              }
            >
              {isUnlinking ? "…" : "Ya no está en Shopify"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["vista", "Vista previa"],
            ["html", "HTML para Shopify"],
            ["imagenes", `Imágenes (${pending.length} sin generar)`],
            /*
              Los retratos, en su pestaña.
              Estaban dentro de Imágenes, que es la de los huecos de **esta**
              página: ahí parecían uno más y se generaban por página cuando en
              realidad son del producto y valen para todas.
            */
            ["retratos", "Retratos"],
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

      {/*
          Comentarios para una copia, opcional y repetible.

          No se hacen al copiar porque copiar ya son varios minutos y hay
          copias que se hacen solo para estudiar la estructura. Y el botón
          deja **repetirlos**, que con la prueba social es lo normal: el
          primer hilo casi nunca convence.

          Lee lo que promete la página antes de escribirlos. Un hilo genérico
          sobre sentirse mejor, en una página que argumenta el hígado graso y
          el cardo mariano, se lee como pegado — y es lo que hace sospechar.
          */}
      {page.shapeId === "copia" ? (
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            {/*
              Arreglar los enlaces sin rehacer la página.

              Publicar reapunta lo que se **envía** a Shopify, no lo guardado:
              la vista previa seguía enseñando `#`, y al trocear en secciones un
              `href="#"` no genera ajuste — así que en el editor de temas
              tampoco aparecía el campo. Los dos síntomas eran lo mismo.

              Y va aparte de volver a copiar, que rehace la página entera: quien
              ya ajustó su diseño no puede perderlo por un enlace.
            */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={fixing}
                onClick={() =>
                  startFixing(async () => {
                    const result = await fixLinksAction({ landingId: page.id, productId });
                    setFixNote(result.message);
                    if (result.ok) router.refresh();
                  })
                }
              >
                {fixing ? "Arreglando…" : "Apuntar los enlaces al producto"}
              </Button>

              {fixNote ? (
                <span className="text-xs text-slate-600 dark:text-slate-300">{fixNote}</span>
              ) : null}
            </div>

            <p className="text-sm font-medium">Comentarios del bloque social</p>
            <p className="mt-1 mb-3 text-sm text-slate-600 dark:text-slate-300">
          {page.comments.length > 0
              ? `Hay ${page.comments.length}. Volver a escribirlos los sustituye.`
              : "Una copia llega sin ellos. Se escriben leyendo lo que promete esta página y la investigación del producto, para que hablen de lo mismo."}
            </p>

          {/*
            Los dos formatos, como en el otro creador.

            No son el mismo texto con otro adorno: un hilo convence porque
            parece capturado, con sus faltas y sus escépticos; un testimonio
            convence porque es concreto. Ofrecer solo uno obliga a quedarse
            con el que no encaja en esa página.
            */}
            <div className="flex flex-wrap gap-2">
            <GenerateButton
              variant="secondary"
              action={() => copyCommentsAction({ landingId: page.id, productId })}
              label={page.comments.length > 0 ? "Rehacer el hilo" : "Hilo de Facebook"}
              hint="Doce comentarios con respuestas y algún escéptico. Después hay que volver a publicar."
            />

            <GenerateButton
              variant="secondary"
              action={() =>
              copyCommentsAction({ landingId: page.id, productId, style: "testimonios" })
              }
              label="Testimonios"
              hint="Seis, con nombre, edad y qué cambió. Sustituyen a los que haya."
            />
            </div>
          </div>
          ) : null}



      {/*
        Rehacer esta portada para otro producto.
        Va junto a publicar porque es la otra cosa que se hace con una portada
        que ya funciona: llevarla a la siguiente. La lista de destinos se pide
        al pulsar, no viaja con la página.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <span className="text-sm font-medium">Rehacer para otro producto</span>

        {targets.length === 0 ? (
          <Button
            variant="secondary"
            disabled={loadingTargets}
            onClick={() =>
              startTargets(async () => {
                const result = await cloneTargetsAction(productId);
                setTargets(result.products ?? []);
              })
            }
          >
            {loadingTargets ? "Leyendo…" : "Elegir producto"}
          </Button>
        ) : (
          <>
            <select
              value={cloneTo}
              onChange={(event) => setCloneTo(event.target.value)}
              className="rounded-xl border border-slate-200 px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-950"
            >
              <option value="">Elige el producto…</option>
              {targets.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </select>

            {cloneTo ? (
              <GenerateButton
                variant="secondary"
                action={() => cloneLandingAction({ landingId: page.id, productId: cloneTo })}
                label="Rehacerla"
                hint="Copia la estructura y reescribe todos los textos y los encargos de imagen para ese producto. Esta portada no se toca."
              />
            ) : null}
          </>
        )}

        <span className="text-xs text-slate-500 dark:text-slate-400">
          Se guarda como portada nueva del producto elegido. Las imágenes quedan como huecos con su
          encargo, listos para generar.
        </span>
      </div>

      {tab === "retratos" ? (
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-medium">Retratos de los comentarios</p>
          <p className="mt-1 mb-3 text-sm text-slate-600 dark:text-slate-300">
            Ocho caras generadas con Soul, personas sintéticas del país del producto. Son del
            producto y no de esta página: se generan una sola vez y sirven en todas.
          </p>
          <GenerateButton
            variant="secondary"
            action={() => generateCommentAvatarsAction({ productId, landingId: page.id })}
            label="Generar los retratos"
            hint="Ocho imágenes. Solo genera las que falten."
          />
        </div>
      ) : null}

      {tab === "prueba" ? <LandingAb productId={productId} page={page} /> : null}

      {tab === "vista" ? (
        /*
         * La vista previa se pinta con el mismo HTML que te llevas.
         *
         * Fondo blanco fijo y no el del tema: la página vivirá en Shopify sobre
         * blanco, y verla en oscuro daría una idea equivocada de cómo se lee.
         */
        <iframe
          title="Vista previa de la página"
          /*
            En un marco y no dentro de la página.

            Una página copiada trae el CSS de otro tema entero: metido aquí
            repinta **la plataforma** —los botones del panel, las tablas de otra
            pantalla— sin que nada falle y sin ninguna pista de por qué. Dentro
            del marco, sus reglas no salen y las nuestras no entran, que es la
            única forma de verla como se va a ver de verdad.

            `sandbox` sin `allow-scripts`: es marcado ajeno y no tiene por qué
            ejecutar nada para enseñarse.
          */
          sandbox=""
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>${preview}</body></html>`}
          className="h-[32rem] w-full rounded-2xl border border-slate-200 bg-white dark:border-slate-700"
        />
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

              {/*
                La original, a la vista.

                En una página copiada el «prompt» de cada hueco **es la
                dirección de la imagen original**: es el único campo donde
                cabía. Pintada como texto, lo que se ve es una URL de
                doscientos caracteres en vez de la foto que hay que revisar — y
                con setenta y cinco huecos, decidir cuál adaptar primero
                obligaba a abrir cada una en otra pestaña.

                La dirección sigue debajo, en el bloque copiable: hace falta
                para pegarla en el generador.
              */}
              {mediaKindOf(slot.prompt) === "imagen" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={slot.prompt}
                  alt={slot.alt || slot.slot}
                  loading="lazy"
                  className="mt-2 max-h-48 rounded-xl border border-slate-200 dark:border-slate-800"
                />
              ) : mediaKindOf(slot.prompt) === "video" ? (
                /*
                  Silenciado y en bucle, como en la página copiada: setenta y
                  cinco reproductores sonando a la vez al abrir la pestaña sería
                  insoportable.
                */
                <video
                  src={slot.prompt}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="mt-2 max-h-48 rounded-xl border border-slate-200 dark:border-slate-800"
                />
              ) : null}

              <CopyableBlock value={slot.prompt} label="Prompt" maxHeightClass="max-h-32">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-5">{slot.prompt}</pre>
              </CopyableBlock>

              {/*
                Rehacer este hueco, y solo este.

                El generador de abajo solo recibe los huecos **sin imagen**: en
                cuanto uno se llena desaparece de la lista, y una imagen que
                salió mal se quedaba así para siempre. Volver a generar la
                página entera para arreglar una cuesta las setenta y cinco.

                Va por hueco y no por lote porque rehacer es una decisión que se
                toma mirando **una** imagen.
              */}
              <div className="mt-2">
                <AdVisualSender
                  productId={productId}
                  landingId={page.id}
                  visuals={[
                    {
                      title: `${page.title} · ${slot.slot}`,
                      prompt: slot.prompt,
                      aspectRatio: slot.aspectRatio,
                      concept: slot.slot,
                      origin: page.title,
                    },
                  ]}
                  label={images.some((image) => image.concept === slot.slot)
                    ? "Rehacer esta"
                    : "Generar esta"}
                  compact
                />
              </div>
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

          <ImageDownloads images={images} title="Imágenes de esta página" />
        </div>
      ) : null}
    </article>
  );
}
