import { listStores } from "@/lib/store-registry";
import { listOwnProducts } from "@/lib/store";
import { StoresManager } from "@/app/stores/stores-manager";
import { SectionCard } from "@/components/section-card";
import { StoreBlueprints } from "@/components/store-blueprints";
import { ShopProducts } from "@/components/shop-products";
import { ThemePlanPanel } from "@/components/theme-plan";
import { listBlueprints } from "@/lib/data/blueprints";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Los datos viven en disco: no se puede prerenderizar.
export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const [stores, products] = await Promise.all([listStores(), listOwnProducts()]);

  // Sin tumbar la página si fallan: son un añadido y las tiendas tienen que
  // aparecer igual.
  const blueprints = isSupabaseConfigured() ? await listBlueprints().catch(() => []) : [];

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

      {/*
        El análisis va aquí y no en su propia pestaña: se mira una tienda ajena
        justo cuando se está montando la propia, y tenerlo al lado evita ir y
        volver entre pantallas.
      */}
      <SectionCard
        title="Productos y tema de tu tienda"
        description="Ver, editar y borrar productos de Shopify sin salir de aquí. No se cargan solos: cada consulta gasta cupo de la Admin API."
      >
        <ShopProducts
          stores={stores.map((store) => ({
            id: store.id,
            name: store.name,
            connected: Boolean(store.shopifyAdminToken && store.shopifyShopDomain),
          }))}
        />
      </SectionCard>

      <SectionCard
        title="Analizar una tienda"
        description="Saca su estructura, su oferta con los descuentos reales y los scripts que usa. Con ese plano se construye tu página, con tu copy y tus imágenes."
      >
        <StoreBlueprints blueprints={blueprints} />
      </SectionCard>

      {/*
        El plan va después del análisis y no antes: sin un plano guardado no hay
        nada con lo que comparar, y una pantalla que pide elegir de una lista
        vacía se lee como si estuviera rota.
      */}
      <SectionCard
        title="Adaptar tu tema"
        description="Compara la estructura de tu página de producto con la de una tienda analizada y dice qué secciones faltan, cuáles mover y a dónde."
      >
        <ThemePlanPanel
          stores={stores.map((store) => ({
            id: store.id,
            name: store.name,
            connected: Boolean(store.shopifyAdminToken && store.shopifyShopDomain),
          }))}
          blueprints={blueprints.map((blueprint) => ({
            id: blueprint.id,
            storeName: blueprint.storeName,
          }))}
        />
      </SectionCard>
    </div>
  );
}
