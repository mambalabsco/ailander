import { SectionCard } from "@/components/section-card";
import { listAds, listProducts } from "@/lib/store";
import { AdsLibrary } from "@/app/ads/ads-library";

export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const [ads, products] = await Promise.all([listAds(), listProducts()]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Biblioteca de anuncios"
        description="Sube, explora y clasifica anuncios propios y de la competencia"
      >
        <AdsLibrary ads={ads} products={products} />
      </SectionCard>
    </div>
  );
}
