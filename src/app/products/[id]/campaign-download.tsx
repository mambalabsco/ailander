"use client";

import { Button } from "@/components/ui";
import { useImageDownload } from "@/components/image-downloads";
import type { ShortAd } from "@/types/campaign";
import type { ProductImage } from "@/types/visuals";

/**
 * Baja de una vez todas las creatividades de una campaña o de un conjunto.
 *
 * Antes había que abrir cada anuncio y pulsar «Descargar todas» dentro de cada
 * uno. Con doce anuncios eso son doce paneles abiertos y doce clics.
 *
 * Van de una en una con una pausa, que es lo que ya hace `downloadMany`: los
 * navegadores bloquean las descargas múltiples cuando llegan de golpe, y sin la
 * pausa baja la primera y **las demás se pierden en silencio**.
 */
export function CampaignDownload({
  ads,
  images,
  label,
}: {
  /** Los anuncios cortos de la campaña o del conjunto. */
  ads: ShortAd[];
  /** Todas las del producto; aquí se filtran las de estos anuncios. */
  images: ProductImage[];
  /** «la campaña entera» o «el conjunto», para el aviso del tiempo. */
  label: string;
}) {
  const { downloadMany, busy } = useImageDownload();

  const ids = new Set(ads.map((ad) => ad.id));
  const suyas = images.filter((image) => image.adId && ids.has(image.adId));

  if (suyas.length === 0) return null;

  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={() => downloadMany(suyas)}
      title={`Cada archivo se llama como su anuncio en el gestor. Van de una en una: ${label} tarda unos ${Math.ceil(suyas.length * 0.35)} segundos.`}
    >
      {busy ? "Descargando…" : `Descargar las ${suyas.length}`}
    </Button>
  );
}
