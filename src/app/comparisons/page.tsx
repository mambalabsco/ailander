import { listCompetitorProducts } from "@/lib/store";
import { getCombinedProducts } from "@/lib/products";
import { listStores } from "@/lib/store-registry";
import { ComparisonWorkspace } from "@/app/comparisons/comparison-workspace";

export const dynamic = "force-dynamic";

export default async function ComparisonsPage() {
  const [ownProducts, competitorProducts, stores] = await Promise.all([
    getCombinedProducts(),
    listCompetitorProducts(),
    listStores(),
  ]);

  return (
    <ComparisonWorkspace
      ownProducts={ownProducts}
      competitorProducts={competitorProducts}
      stores={stores}
    />
  );
}
