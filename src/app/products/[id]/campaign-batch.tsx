"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useHiggsfieldModels } from "@/components/model-picker";
import { generateAdVisualsAction } from "@/app/products/[id]/image-generate-actions";
import { tandaDeImagenes } from "@/lib/tanda-de-imagenes";
import type { ShortAd } from "@/types/campaign";
import type { ProductImage } from "@/types/visuals";

/**
 * Genera de una tacada las imágenes que le faltan a una campaña o a un conjunto.
 *
 * El motor ya aceptaba la tanda con `adId` por creatividad; lo que no había era
 * forma de pedirla, así que había que abrir los anuncios de uno en uno. Van en
 * **una sola llamada**: el bucle del servidor las lanza de una en una porque
 * Higgsfield solo admite cuatro simultáneas y devuelve un 400 al pasarse.
 */
export function CampaignBatch({
  productId,
  ads,
  images,
  label,
}: {
  productId: string;
  /** Los anuncios cortos de la campaña o del conjunto. */
  ads: ShortAd[];
  /** Todas las del producto: son las que dicen qué falta. */
  images: ProductImage[];
  /** «esta campaña» o «este conjunto», para el aviso de cuando no falta nada. */
  label: string;
}) {
  const router = useRouter();
  const catalog = useHiggsfieldModels();
  const [isPending, startTransition] = useTransition();
  /*
   * Desmarcada al abrir, y **no se recuerda**.
   *
   * Es la única defensa contra pagar dos veces la misma tanda: si la casilla
   * sobreviviera a la pulsación, el siguiente clic regeneraría todo sin avisar.
   */
  const [incluirHechas, setIncluirHechas] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { faltan, yaEstan } = tandaDeImagenes(
    ads.map((ad) => ({
      id: ad.id,
      name: ad.name,
      imagePrompt: ad.imagePrompt,
      format: ad.format,
    })),
    images,
  );

  const aGenerar = incluirHechas ? [...faltan, ...yaEstan] : faltan;

  const run = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const outcome = await generateAdVisualsAction({
          productId,
          modelSlug: catalog.slug,
          visuals: aGenerar,
        });
        setNotice(
          outcome.started
            ? `${aGenerar.length} en marcha. Puedes cerrar la pestaña: el progreso sale en Trabajos.`
            : outcome.message,
        );
        // Al terminar, la casilla vuelve a su sitio: lo que ya estaba hecho ahora
        // es otro conjunto de imágenes y la cuenta de antes ya no vale.
        setIncluirHechas(false);
        router.refresh();
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "No se pudo generar.");
      }
    });
  };

  // Sin anuncios con prompt no hay nada que ofrecer, y un botón muerto en cada
  // caja es ruido.
  if (faltan.length === 0 && yaEstan.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        onClick={run}
        disabled={isPending || aGenerar.length === 0 || !catalog.slug}
        title={
          aGenerar.length === 0
            ? `Todos los anuncios de ${label} tienen ya su imagen.`
            : undefined
        }
      >
        {isPending
          ? "Lanzando…"
          : aGenerar.length === 0
            ? "No falta ninguna"
            : aGenerar.length === 1
              ? "Generar la que falta"
              : `Generar las ${aGenerar.length} que faltan`}
      </Button>

      {yaEstan.length > 0 ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={incluirHechas}
            onChange={(event) => setIncluirHechas(event.target.checked)}
            className="size-3.5 accent-violet-600"
          />
          rehacer también {yaEstan.length === 1 ? "la que ya está" : `las ${yaEstan.length} que ya están`}
        </label>
      ) : null}

      {notice ? <p className="text-xs text-slate-600 dark:text-slate-300">{notice}</p> : null}
      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
