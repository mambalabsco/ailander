"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { CostHint } from "@/components/cost-hint";
import { BANDS, HOOK_MAX, hookColors, hookParts, type BandId } from "@/lib/ad-hook";
import {
  adaptImagesAction,
  generateImageHooksAction,
  deleteAdaptedImageAction,
  regenerateImageAction,
  uploadSourcesAction,
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
  const [note, setNote] = useState("");
  /*
   * La franja de gancho.
   *
   * Un solo texto se repite en toda la tanda —el caso de escribirlo a mano—; si
   * se generan, sale uno por imagen. Los colores no se eligen aquí: se calculan
   * a partir de la franja, porque un acento que no contrasta no se ve hasta
   * tener las imágenes hechas y pagadas.
   */
  const [withHook, setWithHook] = useState(false);
  const [band, setBand] = useState<BandId>("azul");
  const [hooks, setHooks] = useState<{ text: string; highlights: string[] }[]>([]);
  const [hookText, setHookText] = useState("");
  const [writing, startWriting] = useTransition();
  const uploadRef = useRef<HTMLInputElement>(null);

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

        {/*
          Subir las propias.
          
          No todo lo que hay que rehacer sale de una tienda analizada: una foto
          del móvil, un montaje de un proveedor, la captura de un anuncio que
          funcionó.
        */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Subir tus imágenes
            </span>
            <input
              ref={uploadRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-slate-800"
            />
          </label>

          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const files = uploadRef.current?.files;
                if (!files || files.length === 0) {
                  setNote("Elige alguna imagen antes de subir.");
                  return;
                }

                const payload = new FormData();
                for (const file of files) payload.append("files", file);

                const result = await uploadSourcesAction(payload);
                setNote(result.message);
                if (uploadRef.current) uploadRef.current.value = "";
                router.refresh();
              })
            }
          >
            {isPending ? "Subiendo…" : "Subir"}
          </Button>

          {note ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{note}</p>
          ) : null}
        </div>

        <div className="mt-4">
          <GenerateButton
            variant="primary"
            action={() =>
              adaptImagesAction({
                productId,
                urls: [...picked],
                hooks: withHook
                  ? hooks.length > 0
                    ? hooks
                    : hookText.trim()
                      ? [{ text: hookText.trim(), highlights: [] }]
                      : []
                  : [],
                hookBand: band,
              })
            }
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
          <p className="text-sm font-medium">Imágenes de origen</p>
          <p className="mt-1 mb-3 text-sm text-slate-500 dark:text-slate-400">
            Las que has subido y las de las tiendas analizadas. Marca las que quieras rehacer con tu
            producto: se conserva la escena y el encuadre.
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
                      <div className="w-full">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withHook}
                  onChange={(event) => setWithHook(event.target.checked)}
                  className="size-4"
                />
                Poner una franja de titular arriba
              </label>

              {withHook ? (
                <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    {BANDS.map((one) => {
                      const colors = hookColors(one.id);

                      return (
                        <button
                          key={one.id}
                          type="button"
                          onClick={() => setBand(one.id)}
                          title={one.note}
                          style={{ background: colors.band, color: colors.ink }}
                          className={`rounded-lg px-3 py-1 text-xs font-bold ${
                            band === one.id ? "ring-2 ring-slate-900 dark:ring-white" : ""
                          }`}
                        >
                          Aa <span style={{ color: colors.accent }}>Aa</span>
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    value={hookText}
                    onChange={(event) => {
                      setHookText(event.target.value);
                      setHooks([]);
                    }}
                    rows={2}
                    maxLength={HOOK_MAX}
                    placeholder="Escríbelo tú y se repite en todas, o genéralos distintos abajo"
                    className="rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={picked.size === 0 || !productId || writing}
                      onClick={() =>
                        startWriting(async () => {
                          const result = await generateImageHooksAction({
                            productId,
                            urls: [...picked],
                          });

                          setHooks(result.hooks ?? []);
                          setNote(result.message);
                          if (result.hooks?.[0]) setHookText("");
                        })
                      }
                    >
                      {writing ? "Escribiendo…" : "Generar uno por imagen"}
                    </Button>

                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {hooks.length > 0
                        ? `${hooks.length} gancho(s) listos`
                        : `Máximo ${HOOK_MAX} caracteres`}
                    </span>
                  </div>

                  {hooks.length > 0 ? (
                    <ul className="grid gap-1">
                      {hooks.map((one, index) => (
                        <li key={index} className="rounded-lg px-2 py-1 text-xs" style={{ background: hookColors(band).band }}>
                          {hookParts(one).map((part, at) => (
                            <span
                              key={at}
                              style={{
                                color: part.strong ? hookColors(band).accent : hookColors(band).ink,
                                fontWeight: part.strong ? 800 : 600,
                              }}
                            >
                              {part.text}
                            </span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Lo que suele costar una tanda, antes de lanzarla. */}
            <CostHint kind="imagen" />

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
