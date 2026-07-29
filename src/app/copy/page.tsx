import { listCompetitorProducts } from "@/lib/store";
import { getCombinedProducts } from "@/lib/products";
import { CopyWorkspace } from "@/app/copy/copy-workspace";

export const dynamic = "force-dynamic";

export default async function CopyPage() {
  const [ownProducts, competitorProducts] = await Promise.all([
    getCombinedProducts(),
    listCompetitorProducts(),
  ]);

  return <CopyWorkspace ownProducts={ownProducts} competitorProducts={competitorProducts} />;
}
