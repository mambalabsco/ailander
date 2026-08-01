"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import {
  adaptImagesAction,
  deleteAdaptedImageAction,
  regenerateImageAction,
} from "@/app/imagenes/actions";

/**
 * Rehacer imágenes ajenas con tu producto.
 *
 * ## Se eligen antes de pagar
 *
 * Las imágenes vienen de las tiendas analizadas y salen marcadas con su tamaño.
 * Cada una cuesta una generación, así que se ven todas y se marca cuáles: una
 * tanda de veinte lanzada sin mirar acaba con la mitad que no se iban a usar.
 *
 * ## Lo que se enseña de cada resultado
 *
 * El original al lado del resultado, y qué se decidió con su texto. Sin el
 * original no se puede juzgar si la escena se conservó; sin la decisión del
 * texto no se entiende por qué pone lo que pone.
 */

export interface SourceImage {
  url: string;
  alt: string;
  width: number;
  storeName: string;
}

export interface AdaptedView {
  id: string;
  sourceUrl: string;
  resultUrl: string;
  aspectRatio: string;
  warnings: string[];
  reading: { text: string; textFits: boolean; textReason: string; brandNames: string[] };
}

export function ImageAdapter({
  products,
  sources,
  adapted,
  hasHiggsfield,
}: {
  products: { id: string; name: string; hasPrimary: boolean }[];
  sources: SourceImage[];
  adapted: AdaptedView[];
  hasHiggsfield: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(products.find((item) => item.hasPrimary)?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [isPending, startTransition] = useTransition();

  const product = products.find((item) => item.id === productId);

  const toggle = (url: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Tu producto
            </span>
            <SelectField
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="min-w-56"
            >
              {products.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.hasPrimary}>
                  {item.name}
                  {item.hasPrimary ? "" : " · sin imagen principal"}
                </option>
              ))}
            </SelectField>
          </label>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            {picked.size > 0 ? `${picked.size} elegidas` : "Marca las que quieras rehacer"}
          </p>

          {picked.size > 0 ? (
            <Button variant="ghost" onClick={() => setPicked(new Set())}>
              Quitar la selección
            </Button>
          ) : null}
        </div>

        {/*
          Sin imagen principal no se empieza. El modelo generaría igual, pero se
          inventaría el envase — y eso no se detecta hasta que la tanda entera
          está hecha y pagada.
        */}
        {product && !product.hasPrimary ? (
          <p className="mt-3 rounded-xl bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            Ese producto no tiene imagen principal. Súbela y márcala como principal: es la que se
            manda de referencia para que tu envase salga igual y no inventado.
          </p>
        ) : null}

        {!hasHiggsfield ? (
          <p className="mt-3 rounded-xl bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            Falta la sesión del CLI de Higgsfield. En el servidor: «higgsfield auth login».
          </p>
        ) : null}

        <div className="mt-4">
          <GenerateButton
            variant="primary"
            action={() => adaptImagesAction({ productId, urls: [...picked] })}
            label={`Adaptar ${picked.size || ""} imagen(es)`}
            disabled={picked.size === 0 || !product?.hasPrimary || !hasHiggsfield}
            disabledReason={picked.size === 0 ? "Marca alguna imagen primero" : undefined}
            hint="Una generación por imagen. Se puede cancelar desde el panel de trabajos y lo hecho se conserva."
          />
        </div>
      </section>

      {/* ----------------------------- Las de origen ------------------------ */}

      {sources.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-medium">Imágenes de las tiendas analizadas</p>
          <p className="mt-1 mb-3 text-sm text-slate-500 dark:text-slate-400">
            Marca las que quieras rehacer con tu producto. Se conserva la escena y el encuadre.
          </p>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {sources.map((image) => {
              const on = picked.has(image.url);

              return (
                <li key={image.url}>
                  <button
                    type="button"
                    onClick={() => toggle(image.url)}
                    className={`block w-full overflow-hidden rounded-xl border-2 text-left transition ${
                      on
                        ? "border-violet-600"
                        : "border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.alt}
                      loading="lazy"
                      className="aspect-square w-full bg-slate-100 object-cover dark:bg-slate-800"
                    />
                    <span className="block px-2 py-1 text-xs text-slate-500 dark:text-slate-400">
                      {image.storeName}
                      {image.width > 0 ? ` · ${image.width}px` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Analiza una tienda en «Tiendas y mercados» y sus imágenes aparecerán aquí.
        </p>
      )}

      {/* ------------------------------ Lo generado ------------------------- */}

      {adapted.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-medium">Adaptadas</p>

          <ul className="mt-3 space-y-4">
            {adapted.map((image) => (
              <li
                key={image.id}
                className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <figure>
                    <figcaption className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                      Original
                    </figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.sourceUrl}
                      alt="Original"
                      loading="lazy"
                      className="w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800"
                    />
                  </figure>

                  <figure>
                    <figcaption className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                      Con tu producto · {image.aspectRatio}
                    </figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.resultUrl}
                      alt="Adaptada"
                      loading="lazy"
                      className="w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800"
                    />
                  </figure>
                </div>

                {/* Qué se decidió con el texto: sin esto no se entiende por qué
                    la imagen pone lo que pone. */}
                {image.reading.text ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium">
                      {image.reading.textFits ? "Texto conservado" : "Texto sustituido"}:
                    </span>{" "}
                    {image.reading.textReason || `«${image.reading.text}»`}
                  </p>
                ) : null}

                {image.reading.brandNames.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Marcas que se pidió quitar: {image.reading.brandNames.join(", ")}
                  </p>
                ) : null}

                {image.warnings.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 rounded-xl bg-amber-50 p-2 pl-6 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {image.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOpen(open === image.id ? null : image.id);
                      setExtra("");
                    }}
                  >
                    {open === image.id ? "Cerrar" : "Pedir otra"}
                  </Button>

                  <Button
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteAdaptedImageAction(image.id);
                        router.refresh();
                      })
                    }
                  >
                    Borrar
                  </Button>
                </div>

                {open === image.id ? (
                  <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                    <label className="block text-sm">
                      <span className="mb-1 block">Qué cambiar (opcional)</span>
                      <input
                        value={extra}
                        onChange={(event) => setExtra(event.target.value)}
                        placeholder="Que el bote se vea más grande y la luz más cálida"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <GenerateButton
                        variant="primary"
                        action={() =>
                          regenerateImageAction({ id: image.id, extra, mode: "mejorar" })
                        }
                        label="Mejorar la actual"
                        hint="Parte de esta imagen: para cuando casi está y falta un detalle."
                      />

                      <GenerateButton
                        variant="secondary"
                        action={() => regenerateImageAction({ id: image.id, extra, mode: "nueva" })}
                        label="Hacer una de cero"
                        hint="Vuelve al original: para cuando el resultado se fue por otro lado."
                      />
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
