import { listOwnProducts } from "@/lib/store";
import { listBlueprints } from "@/lib/data/blueprints";
import { listAdaptedImages } from "@/lib/data/adapted-images";
import { listJobsByKind } from "@/lib/data/jobs";
import { readProductImages } from "@/lib/image-store";
import { cliStatus } from "@/lib/higgsfield-cli";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ImageAdapter, type SourceImage } from "@/components/image-adapter";
import { JobsPanel } from "@/components/jobs-panel";
import { SectionCard } from "@/components/section-card";

// Lee de Supabase y del CLI: no se puede prerenderizar.
export const dynamic = "force-dynamic";

export default async function ImagenesPage() {
  const products = await listOwnProducts();

  const ready = isSupabaseConfigured();

  const [blueprints, jobs, higgs] = await Promise.all([
    ready ? listBlueprints().catch(() => []) : [],
    ready ? listJobsByKind("imagenes", 6).catch(() => []) : [],
    cliStatus().catch(() => ({ authenticated: false })),
  ]);

  /*
   * Qué productos tienen imagen principal.
   *
   * Se calcula aquí y se enseña en el desplegable porque sin ella el envase
   * saldría inventado, y descubrirlo cuando la tanda ya está pagada es tarde.
   */
  const withPrimary = await Promise.all(
    products.map(async (product) => ({
      id: product.id,
      name: product.name,
      hasPrimary: ready
        ? (await readProductImages(product.id).catch(() => [])).some((image) => image.isPrimary)
        : false,
    })),
  );

  const sources: SourceImage[] = blueprints.flatMap((blueprint) =>
    blueprint.images.map((image) => ({
      url: image.url,
      alt: image.alt,
      width: image.width,
      storeName: blueprint.storeName,
    })),
  );

  // Las ya adaptadas del primero que tenga imagen principal: es el que viene
  // elegido en el desplegable.
  const first = withPrimary.find((product) => product.hasPrimary)?.id ?? "";
  const adapted = ready && first ? await listAdaptedImages(first).catch(() => []) : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Adaptador de imágenes</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Rehace las imágenes de una tienda analizada con tu producto: misma escena, mismo encuadre,
          tu envase. El texto que lleven se lee antes — lo que encaje se conserva y lo que no, se
          sustituye por lo que tu investigación sostenga.
        </p>
      </header>

      {jobs.length > 0 ? <JobsPanel productId="" jobs={jobs} storeLevel /> : null}

      <SectionCard
        title="Qué hace y qué no"
        description="Lo que sale de aquí lleva tu envase, que es lo que hace que la ficha anuncie lo que de verdad llega en el paquete."
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>El envase va siempre por referencia, nunca descrito: uno inventado es una devolución.</li>
          <li>Los nombres de la otra marca se nombran uno a uno para que no quede ninguno.</li>
          <li>
            Una promesa que tu investigación no sostenga no se conserva, aunque estuviera en la
            imagen original.
          </li>
          <li>Míralas antes de publicarlas: un modelo de imagen se equivoca y se nota poco.</li>
        </ul>
      </SectionCard>

      <ImageAdapter
        products={withPrimary}
        sources={sources}
        adapted={adapted.map((image) => ({
          id: image.id,
          sourceUrl: image.sourceUrl,
          resultUrl: image.resultUrl,
          aspectRatio: image.aspectRatio,
          warnings: image.warnings,
          reading: {
            text: image.reading.text,
            textFits: image.reading.textFits,
            textReason: image.reading.textReason,
            brandNames: image.reading.brandNames,
          },
        }))}
        hasHiggsfield={higgs.authenticated === true}
      />
    </div>
  );
}
