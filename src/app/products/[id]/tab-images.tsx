"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { useImageDownload } from "@/components/image-downloads";
import { ReimportButton } from "@/components/reimport-images";
import { Button, EmptyState, Field, TextAreaField, TextField } from "@/components/ui";
import {
  PRODUCT_IMAGE_PATTERNS,
  PRODUCT_IMAGE_PATTERN_META,
  findModel,
} from "@/types/visuals";
import type { ProductImage, ProductImagePattern } from "@/types/visuals";
import {
  markPrimaryImage,
  removeProductImage,
  uploadProductImages,
} from "@/app/products/[id]/image-actions";
import { Copyable } from "@/components/copyable";
import { HiggsfieldRunner } from "@/components/higgsfield-runner";
import { PerformanceControl } from "@/components/performance-control";
import type { PerformanceRecord } from "@/types/performance";

interface ImagesTabProps {
  productId: string;
  images: ProductImage[];
  /** Modelo recomendado por patrón, calculado en el servidor. */
  patternModels: Record<string, { modelId: string; reason: string }>;
  performance: Map<string, PerformanceRecord>;
  hasHiggsfieldKey: boolean;
}

/**
 * Imágenes del producto.
 *
 * Dos caminos que conviven: subir las que ya tienes o generarlas. El patrón
 * principal es el packshot sobre fondo transparente, que es la pieza que después
 * viaja como referencia a todas las creatividades de anuncio.
 */
export function ImagesTab({
  productId,
  images,
  patternModels,
  performance,
  hasHiggsfieldKey,
}: ImagesTabProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { download, downloadMany, busy: downloading } = useImageDownload();

  const [selected, setSelected] = useState<ProductImagePattern[]>([...PRODUCT_IMAGE_PATTERNS]);
  const [instructions, setInstructions] = useState("");
  const [background, setBackground] = useState("Fondo neutro y luz suave de estudio");
  const [palette, setPalette] = useState("");

  const primary = images.find((image) => image.isPrimary) ?? null;

  const togglePattern = (pattern: ProductImagePattern) =>
    setSelected((current) =>
      current.includes(pattern)
        ? current.filter((item) => item !== pattern)
        : [...current, pattern],
    );

  const handleUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("productId", productId);

    startTransition(async () => {
      try {
        const result = await uploadProductImages(formData);
        formRef.current?.reset();
        setPreviews([]);
        // Un archivo rechazado no tumba la tanda: se reporta y el resto entra.
        if (result.errors.length > 0) {
          setError(
            result.errors.map((item) => `${item.fileName}: ${item.reason}`).join(" · "),
          );
        }
        router.refresh();
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : "No se pudieron subir las imágenes.",
        );
      }
    });
  };

  const handlePrimary = (imageId: string) => {
    startTransition(async () => {
      await markPrimaryImage(productId, imageId);
      router.refresh();
    });
  };

  const handleDelete = (imageId: string) => {
    if (!window.confirm("¿Eliminar esta imagen?")) return;
    startTransition(async () => {
      await removeProductImage(productId, imageId);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {!primary ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Este producto no tiene imagen principal. Es la que se envía como referencia a Higgsfield al crear
          anuncios, así que conviene que sea un packshot sobre fondo transparente o blanco: recortado limpio
          se puede componer dentro de cualquier creatividad.
        </p>
      ) : null}

      <SectionCard
        title="Subir imágenes"
        description="Si ya tienes fotos del producto, súbelas aquí. Marca una como principal para usarla como referencia en los anuncios."
      >
        <form ref={formRef} onSubmit={handleUpload} className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div>
            <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 transition hover:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
              <span className="text-2xl" aria-hidden>
                ⬆
              </span>
              <span>
                Haz clic para seleccionar <strong>una o varias imágenes</strong>
              </span>
              <span className="text-xs">PNG, JPG, WEBP o GIF · máximo 10 MB cada una</span>
              <input
                type="file"
                name="images"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setPreviews(
                    files.map((file) => ({ url: URL.createObjectURL(file), name: file.name })),
                  );
                }}
              />
            </label>

            {previews.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                  {previews.length} {previews.length === 1 ? "imagen lista" : "imágenes listas"} para subir
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {previews.map((preview) => (
                    <span
                      key={preview.url}
                      className="relative block aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-950"
                      title={preview.name}
                    >
                      {/* Vista previa local (blob), fuera del optimizador de Next. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview.url} alt="" className="h-full w-full object-contain" />
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <input
                type="checkbox"
                name="isPrimary"
                value="true"
                defaultChecked={!primary}
                className="mt-0.5 h-4 w-4 accent-violet-600"
              />
              <span className="text-sm">
                Marcar como imagen principal
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  Será la referencia que reciba Higgsfield. Idealmente, fondo transparente o blanco.
                </span>
              </span>
            </label>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" disabled={isPending || previews.length === 0}>
              {isPending
                ? "Subiendo..."
                : previews.length > 1
                  ? `Subir ${previews.length} imágenes`
                  : "Subir imagen"}
            </Button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A cada imagen se le asigna un nombre con el producto y el patrón, para poder localizar el
              archivo desde el anuncio que la usa.
            </p>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Generar imágenes de producto"
        description="Diez patrones con lógica de conversión, más el packshot principal. Elige cuáles quieres y añade tus referencias o indicaciones."
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Fondo y luz">
              <TextField
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                placeholder="Ej. fondo neutro y luz suave de estudio"
              />
            </Field>
            <Field label="Paleta o marca (opcional)">
              <TextField
                value={palette}
                onChange={(event) => setPalette(event.target.value)}
                placeholder="Ej. tonos cálidos, acento violeta"
              />
            </Field>
          </div>

          <Field label="Referencias o indicaciones adicionales (opcional)">
            <TextAreaField
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              className="min-h-24"
              placeholder="Describe el envase, di qué evitar, pega enlaces de referencia o indica el estilo que buscas. Todo esto se envía junto al prompt."
            />
          </Field>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Qué generar ({selected.length} de {PRODUCT_IMAGE_PATTERNS.length})</span>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    selected.length === PRODUCT_IMAGE_PATTERNS.length
                      ? []
                      : [...PRODUCT_IMAGE_PATTERNS],
                  )
                }
                className="text-sm text-violet-600 hover:underline"
              >
                {selected.length === PRODUCT_IMAGE_PATTERNS.length
                  ? "Quitar todas"
                  : "Seleccionar todas"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {/*
                `captura-app` no está: **no se genera, se sube**.
                Una pantalla inventada se parece a la app y no es la app, que es
                justo lo que rompe el anuncio. Se trae con la dirección en la
                pestaña de Apps.
              */}
              {PRODUCT_IMAGE_PATTERNS.filter((pattern) => pattern !== "captura-app").map((pattern) => {
                const meta = PRODUCT_IMAGE_PATTERN_META[pattern];
                const active = selected.includes(pattern);
                const recommended = patternModels[pattern];
                const model = recommended ? findModel(recommended.modelId) : undefined;

                return (
                  <label
                    key={pattern}
                    className={`cursor-pointer rounded-3xl border p-4 transition ${
                      active
                        ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30"
                        : "border-slate-200 hover:border-violet-400 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => togglePattern(pattern)}
                        className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{meta.name}</p>
                          {meta.isPrimary ? (
                            <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">
                              Principal
                            </span>
                          ) : null}
                          {meta.hasText ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Con texto
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{meta.purpose}</p>
                        <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">
                          {meta.conversionLogic}
                        </p>
                        {model ? (
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Modelo: <span className="font-medium">{model.name}</span> · {meta.aspectRatio}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <HiggsfieldRunner
            productId={productId}
            patterns={selected}
            label={`Generar ${selected.length} ${selected.length === 1 ? "imagen" : "imágenes"}`}
            disabled={!hasHiggsfieldKey || selected.length === 0}
            disabledReason={
              !hasHiggsfieldKey
                ? "Configura las credenciales de Higgsfield en Configuración"
                : "Elige al menos un tipo de imagen."
            }
            instructions={instructions}
            backgroundStyle={background}
            paletteNote={palette}
          />
        </div>
      </SectionCard>

      <SectionCard title="Imágenes del producto" description={`${images.length} guardadas.`}>
        {images.length === 0 ? (
          <div>
            <EmptyState
              title="Todavía no hay imágenes"
              description="Sube las que tengas, impórtalas de la ficha de la tienda o genera el set completo. La principal es la que usarán los anuncios como referencia."
            />
            <div className="mt-4">
              <ReimportButton productId={productId} />
            </div>
          </div>
        ) : (
          <>
            {/* Descargar toda la galería de golpe, con los nombres legibles. */}
            <div className="mb-4 flex flex-wrap gap-3">
              <Button variant="secondary" disabled={downloading} onClick={() => downloadMany(images)}>
                {downloading ? "Descargando..." : `Descargar las ${images.length}`}
              </Button>
              <ReimportButton productId={productId} />
            </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {images.map((image) => (
              <figure
                key={image.id}
                className={`overflow-hidden rounded-3xl border transition ${
                  image.isPrimary
                    ? "border-violet-600 ring-2 ring-violet-600/20"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="relative aspect-square bg-slate-100 dark:bg-slate-950">
                  <Image
                    unoptimized
                    src={image.url}
                    alt={
                      image.pattern === "subida"
                        ? "Imagen subida del producto"
                        : PRODUCT_IMAGE_PATTERN_META[image.pattern].name
                    }
                    fill
                    sizes="(max-width: 640px) 100vw, 25vw"
                    className="object-contain"
                  />
                </div>
                <figcaption className="p-3">
                  <p className="text-sm font-medium">
                    {image.pattern === "subida"
                      ? "Subida"
                      : PRODUCT_IMAGE_PATTERN_META[image.pattern].name}
                  </p>
                  {image.isPrimary ? (
                    <p className="mt-1 text-xs font-semibold text-violet-600">
                      Principal · referencia de anuncios
                    </p>
                  ) : null}

                  {/* El nombre es lo que aparece citado en el anuncio que la usa. */}
                  <div className="mt-2">
                    <Copyable value={image.name} label="nombre de archivo">
                      <code className="font-mono text-xs">{image.name}</code>
                    </Copyable>
                  </div>

                  <div className="mt-3">
                    <PerformanceControl
                      productId={productId}
                      targetType="imagen"
                      targetId={image.id}
                      record={performance.get(`imagen::${image.id}`)}
                      compact
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {!image.isPrimary ? (
                      <button
                        type="button"
                        onClick={() => handlePrimary(image.id)}
                        disabled={isPending}
                        className="text-violet-600 hover:underline disabled:opacity-50"
                      >
                        Hacer principal
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => download(image)}
                      className="text-violet-600 hover:underline"
                    >
                      Descargar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(image.id)}
                      disabled={isPending}
                      className="text-rose-500 hover:underline disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
