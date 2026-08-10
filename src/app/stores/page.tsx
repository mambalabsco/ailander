import { listStores } from "@/lib/store-registry";
import { listOwnProducts } from "@/lib/store";
import { StoresManager } from "@/app/stores/stores-manager";
import { SectionCard } from "@/components/section-card";
import { ShopifySetupGuide } from "@/components/shopify-setup-guide";
import { StoreBlueprints } from "@/components/store-blueprints";
import { ShopProducts } from "@/components/shop-products";
import { ThemePlanPanel } from "@/components/theme-plan";
import { ProductPageMaker } from "@/components/product-page-maker";
import { listBlueprints } from "@/lib/data/blueprints";
import { listJobsByKind } from "@/lib/data/jobs";
import { JobsPanel } from "@/components/jobs-panel";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Los datos viven en disco: no se puede prerenderizar.
export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const [stores, products] = await Promise.all([listStores(), listOwnProducts()]);

  // Sin tumbar la página si fallan: son un añadido y las tiendas tienen que
  // aparecer igual.
  const blueprints = isSupabaseConfigured() ? await listBlueprints().catch(() => []) : [];

  /*
   * Los trabajos de esta pantalla, que no tenían dónde verse.
   *
   * Analizar una tienda y escribir sus secciones corren en segundo plano y
   * pueden tardar minutos, pero aquí no había panel: el botón se quedaba
   * girando y no había forma de saber por dónde iba ni cuándo acababa. Los de
   * producto tienen el suyo desde el principio; este faltaba.
   */
  const jobs = isSupabaseConfigured()
    ? (
        await Promise.all([
          listJobsByKind("competidores", 6).catch(() => []),
          listJobsByKind("tema", 6).catch(() => []),
        ])
      )
        .flat()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

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

      {jobs.length > 0 ? <JobsPanel productId="" jobs={jobs} storeLevel /> : null}

      {/*
        La guía va **antes** del gestor de tiendas.
        Se lee mientras se conecta la primera, con las dos pestañas abiertas.
        Debajo, quien conecta por primera vez ya ha pasado de largo el formulario
        y ha llegado al campo del token sin saber de dónde sale.
      */}
      <ShopifySetupGuide />

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
        description="Copia el aspecto de una tienda analizada a tu tema: sus colores y su letra, y las secciones que le faltan, escritas con tu producto."
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
          products={products.map((product) => ({ id: product.id, name: product.name }))}
        />
      </SectionCard>

      {/*
        Va al final porque es lo más específico: parte de una plantilla que ya
        existe en el tema. Sin ese modelo hecho no hay nada que hacer aquí, y
        arriba se leería como el primer paso.
      */}
      <SectionCard
        title="Página de producto desde una plantilla"
        description="Coge una página de producto que ya te funciona, copia su diseño entero tal cual y reescribe solo los textos para otro producto. La plantilla modelo no se toca: se crea una nueva."
      >
        <ProductPageMaker
          stores={stores.map((store) => ({
            id: store.id,
            name: store.name,
            connected: Boolean(store.shopifyAdminToken && store.shopifyShopDomain),
          }))}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
        />
      </SectionCard>
    </div>
  );
}
