"use client";

import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { EmptyState } from "@/components/ui";
import { LandingViewer } from "@/components/landing-viewer";
import { ExperimentManager } from "@/components/experiment-manager";
import type { LandingExperiment } from "@/types/experiment";
import type { LandingPage } from "@/types/landing";
import type { ProductImage } from "@/types/visuals";

/**
 * Las páginas y sus pruebas, separadas de los copys.
 *
 * Estaban dentro de la pestaña de copys y la dejaban ilegible: allí conviven ya
 * el archivo de referencia, el adaptador, el generador y la lista de textos.
 * Una página tiene su propio ciclo —generar, publicar, repartir tráfico,
 * medir— y merece su sitio.
 */
export function LandingsTab({
  productId,
  storeDomain,
  landings,
  experiments,
}: {
  productId: string;
  storeDomain?: string;
  landings: { page: LandingPage; preview: string; html: string; images: ProductImage[] }[];
  experiments: LandingExperiment[];
}) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Pruebas A/B"
        description="Reparte el tráfico de un mismo anuncio entre varias páginas y mira dónde se cae la gente."
      >
        <ExperimentManager
          productId={productId}
          storeDomain={storeDomain}
          landings={landings.map((item) => item.page)}
          experiments={experiments}
        />
      </SectionCard>

      <SectionCard
        title="Páginas para Shopify"
        description="Publirreportajes completos: vista previa, HTML para pegar y sus imágenes."
      >
        {landings.length === 0 ? (
          <EmptyState
            title="Todavía no hay ninguna página"
            description="Se hacen a partir de un copy ya escrito: el texto se reparte en secciones y se le añaden autor, valoraciones, comentarios y oferta."
            action={
              <Link
                href={`/products/${productId}?tab=copys`}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Ir a los copys
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            {landings.map(({ page, preview, html, images }) => (
              <LandingViewer
                key={page.id}
                productId={productId}
                page={page}
                preview={preview}
                html={html}
                images={images}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
