"use client";

import Image from "next/image";
import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import { EmptyState, Tag } from "@/components/ui";
import { CampaignStructure } from "@/app/products/[id]/campaign-structure";
import { AdsGenerator } from "@/app/products/[id]/ads-generator";
import { SHORT_AD_FORMAT_META } from "@/types/campaign";
import type { CampaignTree, Prelanding } from "@/types/campaign";
import type { AdCampaign, Product } from "@/types";
import type { Anatomia } from "@/lib/anatomia";
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
  /** Deseos validados del documento 6, para cuando no se elige ángulo. */
  desires: string[];
  /** Creatividades subidas a la biblioteca y asociadas al producto. */
  libraryAds: AdCampaign[];
  nextNumbers: { adset: number; ad: number };
  performance: Map<string, PerformanceRecord>;
  /** Para enseñar dentro de cada anuncio sus creatividades ya generadas. */
  images: ProductImage[];
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
  trees,
  prelandings,
  angles,
  anatomias,
  desires,
  libraryAds,
  nextNumbers,
  performance,
  hasApiKey,
  hasResearch,
}: AdsTabProps) {
  return (
    <div className="space-y-6">
      <AdsGenerator
        product={product}
        prelandings={prelandings}
        angles={angles}
        anatomias={anatomias}
        desires={desires}
        nextNumbers={nextNumbers}
        hasApiKey={hasApiKey}
        hasResearch={hasResearch}
      />

      <SectionCard
        title="Estructura de campaña"
        description="Cómo cuelga cada anuncio de su conjunto y a dónde apunta cada uno."
      >
        <CampaignStructure
          productId={product.id}
          images={images}
          trees={trees}
          prelandings={prelandings}
          performance={performance}
        />
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
