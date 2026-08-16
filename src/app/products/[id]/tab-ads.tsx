"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import { Button, EmptyState, Tag } from "@/components/ui";
import { CampaignStructure } from "@/app/products/[id]/campaign-structure";
import { AdsGenerator } from "@/app/products/[id]/ads-generator";
import { FolderBar } from "@/app/products/[id]/folder-bar";
import { archiveCampaignAction } from "@/app/products/[id]/folder-actions";
import { SHORT_AD_FORMAT_META } from "@/types/campaign";
import type {
  ArchivedCampaign,
  CampaignFolder,
  CampaignTree,
  Prelanding,
} from "@/types/campaign";
import type { AdCampaign, Product } from "@/types";
import type { Anatomia } from "@/lib/anatomia";
import type { ReferenceAd } from "@/components/video/reference-ads";
import type { MarketingAngle } from "@/types/copy";
import type { PerformanceRecord } from "@/types/performance";
import type { ProductImage } from "@/types/visuals";

interface AdsTabProps {
  product: Product;
  trees: CampaignTree[];
  prelandings: Prelanding[];
  angles: MarketingAngle[];
  /** Anuncios que ya funcionaron, analizados en la pestaña de Ángulos. */
  anatomias: { id: string; title: string; summary: string; anatomia: Anatomia }[];
  /** Vídeos ya analizados, para adjuntarlos a un material pegado aquí. */
  videoReferences: ReferenceAd[];
  /** Deseos validados del documento 6, para cuando no se elige ángulo. */
  desires: string[];
  /** Creatividades subidas a la biblioteca y asociadas al producto. */
  libraryAds: AdCampaign[];
  nextNumbers: { adset: number; ad: number };
  performance: Map<string, PerformanceRecord>;
  /** Para enseñar dentro de cada anuncio sus creatividades ya generadas. */
  images: ProductImage[];
  /** Las descartadas al rehacer: van al pie de la rejilla de su anuncio. */
  discardedImages: ProductImage[];
  /** Las carpetas del producto, para la barra y para mover. */
  folders: CampaignFolder[];
  /** Lo archivado, plano: aquí no se abre ni se genera nada. */
  archived: ArchivedCampaign[];
  hasApiKey: boolean;
  hasResearch: boolean;
}

/**
 * Campañas y anuncios cortos.
 *
 * Generar una tanda no produce una lista suelta de textos: arma la campaña, su
 * conjunto y los anuncios numerados de forma correlativa, con el destino fijado
 * a nivel de conjunto. Es la estructura que después se replica en el gestor de
 * anuncios.
 */
export function AdsTab({
  product,
  images,
  discardedImages,
  folders,
  archived,
  trees,
  prelandings,
  angles,
  anatomias,
  videoReferences,
  desires,
  libraryAds,
  nextNumbers,
  performance,
  hasApiKey,
  hasResearch,
}: AdsTabProps) {
  // `null` es Todas; `"archivadas"`, el archivo; si no, el id de una carpeta.
  const [folder, setFolder] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tree of trees) {
      const key = tree.campaign.folderId ?? "";
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [trees]);

  return (
    <div className="space-y-6">
      <AdsGenerator
        product={product}
        prelandings={prelandings}
        angles={angles}
        anatomias={anatomias}
        videoReferences={videoReferences}
        desires={desires}
        nextNumbers={nextNumbers}
        hasApiKey={hasApiKey}
        hasResearch={hasResearch}
      />

      <SectionCard
        title="Estructura de campaña"
        description="Cada campaña entra plegada. Ábrela para ver sus conjuntos y sus anuncios."
      >
        <FolderBar
          productId={product.id}
          folders={folders}
          counts={counts}
          archivedCount={archived.length}
          active={folder}
          onChange={setFolder}
        />

        {folder === "archivadas" ? (
          <ArchivedList productId={product.id} campaigns={archived} />
        ) : (
          <CampaignStructure
            productId={product.id}
            images={images}
            discardedImages={discardedImages}
            trees={trees}
            folders={folders}
            onlyFolder={folder}
            prelandings={prelandings}
            performance={performance}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Prelandings"
        description="Páginas intermedias a las que pueden apuntar los conjuntos de anuncios."
      >
        {prelandings.length === 0 ? (
          <EmptyState
            title="No hay prelandings creadas"
            description="Un conjunto puede apuntar igualmente a «prelanding por crear»: la estructura queda anotada y se asigna después."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {prelandings.map((prelanding) => (
              <div
                key={prelanding.id}
                className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <p className="font-medium">{prelanding.name}</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {prelanding.description}
                </p>
                <a
                  href={prelanding.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block truncate text-sm text-violet-600 hover:underline"
                >
                  {prelanding.url}
                </a>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Creatividades subidas"
        description="Imágenes de anuncio guardadas en la biblioteca para este producto."
        action={
          <Link
            href="/ads"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Ir a la biblioteca
          </Link>
        }
      >
        {libraryAds.length === 0 ? (
          <EmptyState
            title="Este producto no tiene creatividades subidas"
            description="Sube un anuncio desde la biblioteca y asígnalo a este producto para verlo aquí."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {libraryAds.map((ad) => (
              <article
                key={ad.id}
                className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800"
              >
                <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-950">
                  <Image
                    src={ad.image}
                    alt={ad.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{ad.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {ad.platform} · {ad.country}
                      </p>
                    </div>
                    <StatusPill status={ad.status} />
                  </div>
                  {ad.tags.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {ad.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Formatos disponibles"
        description="Cinco salen de tus anuncios reales; el resto sigue la misma lógica."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {Object.values(SHORT_AD_FORMAT_META).map((meta) => (
            <div
              key={meta.id}
              className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{meta.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    meta.origin === "short.md"
                      ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                  }`}
                >
                  {meta.origin === "short.md" ? "De tus anuncios" : "Añadido"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{meta.role}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {meta.stages.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/**
 * Lo archivado: qué hay y el botón de devolverlo.
 *
 * Aquí no se abre nada ni se genera nada, y por eso llega plano —sin conjuntos
 * ni anuncios—: traer su árbol sería cargar en cada visita todo lo que se
 * archivó para no enseñarlo.
 */
function ArchivedList({
  productId,
  campaigns,
}: {
  productId: string;
  campaigns: ArchivedCampaign[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (campaigns.length === 0) {
    return (
      <EmptyState
        title="No hay campañas archivadas"
        description="Archivar saca una campaña de la lista sin borrarla, y al devolverla vuelve a la carpeta donde estaba."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {campaigns.map((campaign) => (
        <li
          key={campaign.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800"
        >
          <span className="flex flex-wrap items-center gap-3">
            <code className="font-mono text-sm">{campaign.name}</code>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {campaign.adsets} conjuntos · {campaign.ads} anuncios
            </span>
          </span>
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await archiveCampaignAction(campaign.id, false, productId);
                router.refresh();
              })
            }
          >
            Devolver
          </Button>
        </li>
      ))}
    </ul>
  );
}
