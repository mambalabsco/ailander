"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { ProductImage } from "@/types/visuals";

/**
 * Ver y descargar las imágenes generadas.
 *
 * **Descargar de una en una es lo único que funcionaba antes**, y ni eso: había
 * que abrir la imagen y guardarla a mano desde el navegador.
 *
 * Las descargas se hacen desde el navegador, no desde el servidor: la URL ya
 * está firmada y bajarla otra vez al servidor para reenviártela duplicaría el
 * tráfico sin ganar nada.
 */
/**
 * Descargar imágenes desde el navegador.
 *
 * Se exporta aparte porque la galería del producto ya tiene su propia rejilla
 * —con principal, borrar y patrón— y duplicarla solo para añadir un botón sería
 * mantener dos veces lo mismo.
 */
export function useImageDownload() {
  const [busy, setBusy] = useState(false);

  /** Baja una imagen con su nombre legible, no con el hash del bucket. */
  const download = async (image: ProductImage) => {
    const response = await fetch(image.url);
    const blob = await response.blob();

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    // La extensión sale del tipo real, no del nombre: el bucket guarda webp y
    // png y el nombre no la lleva.
    link.download = `${image.name}.${(blob.type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Sin esto el blob se queda en memoria hasta recargar la página.
    URL.revokeObjectURL(link.href);
  };

  const downloadMany = async (list: ProductImage[]) => {
    setBusy(true);
    try {
      for (const image of list) {
        await download(image);
        /*
         * Una pausa entre descargas.
         *
         * Los navegadores bloquean las descargas múltiples cuando llegan de
         * golpe: sin la pausa baja la primera y las demás se pierden en
         * silencio, que es peor que fallar.
         */
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    } finally {
      setBusy(false);
    }
  };

  return { download, downloadMany, busy };
}

export function ImageDownloads({
  images,
  title = "Imágenes generadas",
}: {
  images: ProductImage[];
  title?: string;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { download, downloadMany, busy } = useImageDownload();

  if (images.length === 0) return null;

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selected = images.filter((image) => chosen.has(image.id));

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">
          {title} ({images.length})
        </p>
        <Button variant="secondary" disabled={busy} onClick={() => downloadMany(images)}>
          {busy ? "Descargando..." : "Descargar todas"}
        </Button>
        {selected.length > 0 ? (
          <Button variant="secondary" disabled={busy} onClick={() => downloadMany(selected)}>
            Descargar {selected.length} marcada(s)
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((image) => (
          <figure
            key={image.id}
            className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"
          >
            <div className="relative">
              {/* `img` y no `next/image`: la URL viene firmada y caduca en una
                  hora, así que optimizarla y cachearla daría enlaces muertos. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.name}
                className="aspect-square w-full bg-slate-100 object-cover dark:bg-slate-900"
              />
              <label className="absolute left-2 top-2 flex cursor-pointer items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs shadow dark:bg-slate-900/90">
                <input
                  type="checkbox"
                  checked={chosen.has(image.id)}
                  onChange={() => toggle(image.id)}
                  className="size-3.5 accent-violet-600"
                />
                Marcar
              </label>
            </div>

            <figcaption className="p-2">
              <p className="truncate text-xs font-medium" title={image.name}>
                {image.name}
              </p>
              {image.originLabel ? (
                <p
                  className="truncate text-xs text-slate-500 dark:text-slate-400"
                  title={image.originLabel}
                >
                  {image.originLabel}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => download(image)}
                className="mt-1 text-xs text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
              >
                Descargar
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
