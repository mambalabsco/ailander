import { listStores } from "@/lib/store-registry";
import { listOwnProducts } from "@/lib/store";
import { StoresManager } from "@/app/stores/stores-manager";

// Los datos viven en disco: no se puede prerenderizar.
export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const [stores, products] = await Promise.all([listStores(), listOwnProducts()]);

  const productsByMarket: Record<string, number> = {};
  for (const product of products) {
    if (!product.marketId) continue;
    productsByMarket[product.marketId] = (productsByMarket[product.marketId] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tiendas y mercados</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Tres niveles: la tienda aporta marca, dominio y tono; el mercado aporta país, idioma, moneda y la
          ruta de las URLs; el producto vive en un mercado concreto. El mismo producto en dos países son dos
          productos que se crean duplicando, porque su investigación de mercado no es la misma.
        </p>
      </header>

      <StoresManager stores={stores} productsByMarket={productsByMarket} />
    </div>
  );
}
