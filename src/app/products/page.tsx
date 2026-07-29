import { SectionCard } from "@/components/section-card";
import { getCombinedProducts } from "@/lib/products";
import { readProductResearch, readProductHooks } from "@/lib/research-store";
import { readCopies } from "@/lib/copy-store";
import { readProductImages } from "@/lib/image-store";
import { readCampaignTrees } from "@/lib/campaign-store";
import { listStores } from "@/lib/store-registry";
import { formatMoney, marketMoney } from "@/lib/money";
import { ProductsTable, type ProductRowMeta } from "@/app/products/products-table";

// El catálogo vive en disco y cambia en tiempo de ejecución,
// así que no puede prerenderizarse en el build.
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, stores] = await Promise.all([getCombinedProducts(), listStores()]);

  /**
   * Resumen por producto para la tabla.
   *
   * La imagen es la marcada como principal; si no hay ninguna, se cae a la
   * primera del array del producto, y si tampoco hay, la tabla dibuja una marca
   * de posición con las iniciales.
   */
  const entries = await Promise.all(
    products.map(async (product) => {
      const [research, hooks, copies, images, trees] = await Promise.all([
        readProductResearch(product.id),
        readProductHooks(product.id),
        readCopies(product.id),
        readProductImages(product.id),
        readCampaignTrees(product.id),
      ]);

      const primary = images.find((image) => image.isPrimary) ?? images[0];

      const meta: ProductRowMeta = {
        imageUrl: primary?.url ?? product.images[0] ?? null,
        price: formatMoney(product.price, marketMoney(product, stores)),
        documentsReady: Object.values(research.documents).filter((doc) => doc.status === "ready").length,
        hooks: hooks.length,
        copies: copies.length,
        ads: trees.reduce(
          (sum, tree) => sum + tree.adsets.reduce((inner, node) => inner + node.ads.length, 0),
          0,
        ),
      };

      return [product.id, meta] as const;
    }),
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Productos propios"
        description="Cada producto reúne su investigación, sus ángulos, sus textos y sus campañas."
      >
        <ProductsTable products={products} meta={Object.fromEntries(entries)} />
      </SectionCard>
    </div>
  );
}
