import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { JobsPanel } from "@/components/jobs-panel";
import { listLandings } from "@/lib/data/landings";
import { listBlueprints } from "@/lib/data/blueprints";
import { listVideoReferences } from "@/lib/data/video-references";
import { modelOptions } from "@/lib/store-blueprint";
import { listSwipeCopies } from "@/lib/data/swipe";
import { renderLandingHtml } from "@/lib/landing-html";
import { LandingsTab } from "@/app/products/[id]/tab-landings";
import { listExperiments } from "@/lib/data/experiments";
import { AVATAR_POOL_SIZE, avatarSlot } from "@/lib/avatar-prompts";
import { listJobs } from "@/lib/data/jobs";
import type { BackgroundJob } from "@/types/jobs";
import { findProductAnywhere, missingResearchInputs, needsCompetitorSearch } from "@/lib/products";
import { listAds } from "@/lib/store";
import { hasActiveProviderKey, hasHiggsfieldCredentials } from "@/lib/provider-config";
import { isDemoResearchProduct, readProductHooks, readProductResearch } from "@/lib/research-store";
import { buildHookPlan } from "@/lib/hook-plan";
import { readAngles, readCopies } from "@/lib/copy-store";
import { readProductImages } from "@/lib/image-store";
import { listStores, findStore } from "@/lib/store-registry";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { readOffers } from "@/lib/data/products";
import { listNotes } from "@/lib/data/notes";
import { emptyOffers } from "@/types/offer";
import { marketMoney } from "@/lib/money";
import { blockedBy, buildResearchPrompt, researchWaves } from "@/lib/research-prompts";
import { estimateResearchCost } from "@/lib/claude";
import { readProviderConfig } from "@/lib/provider-config";
import { nextNumbers, readCampaignTrees, readPrelandings } from "@/lib/campaign-store";
import { performanceIndex, readPerformance, rollUpByAngle } from "@/lib/performance-store";
import { buildCopyCoverage, pendingCombinations } from "@/lib/copy-coverage";
import { buildAdVisualPrompts, recommendModelForPattern } from "@/lib/visual-prompts";
import { RESEARCH_DOCUMENT_IDS } from "@/types/research";
import type { ResearchDocumentId } from "@/types/research";
import { PRODUCT_IMAGE_PATTERNS } from "@/types/visuals";
import type { AdVisualPrompt } from "@/types/visuals";
import { listProductMarkets } from "@/lib/data/product-markets";
import { listAnatomias } from "@/lib/data/anatomias";
import { landingReferenceId } from "@/lib/reference-id";
import { marketContextFor } from "@/lib/market-context";
import { parseSelection, showSelector } from "@/lib/market-selection";
import { marketLabel } from "@/types/store";
import { MarketSwitcher } from "@/app/products/[id]/market-switcher";
import { PanelTab } from "@/app/products/[id]/tab-panel";
import { InfoTab } from "@/app/products/[id]/tab-info";
import { PricesTab } from "@/app/products/[id]/tab-precios";
import { DocumentsTab } from "@/app/products/[id]/tab-documents";
import { HooksTab } from "@/app/products/[id]/tab-hooks";
import { CompetitorsTab } from "@/app/products/[id]/tab-competitors";
import { OfferTab } from "@/app/products/[id]/tab-offer";
import { AnglesTab } from "@/app/products/[id]/tab-angles";
import { CopysTab } from "@/app/products/[id]/tab-copys";
import { VideosTab } from "@/app/products/[id]/tab-videos";
import { listVideos } from "@/lib/data/videos";
import { videoProvidersReady } from "@/lib/video/providers";
import { ImagesTab } from "@/app/products/[id]/tab-images";
import { AdsTab } from "@/app/products/[id]/tab-ads";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "panel", label: "Panel" },
  { id: "info", label: "Información" },
  { id: "precios", label: "Precios" },
  { id: "oferta", label: "Oferta y notas" },
  { id: "documentos", label: "Documentos" },
  { id: "competidores", label: "Competidores" },
  { id: "hooks", label: "Hooks" },
  { id: "angulos", label: "Ángulos" },
  { id: "copys", label: "Copys" },
  { id: "landings", label: "Landings" },
  { id: "videos", label: "Vídeos" },
  { id: "imagenes", label: "Imágenes" },
  { id: "ads", label: "Ads" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function resolveTab(value: string | undefined): TabId {
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : "panel";
}

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; mercado?: string }>;
}

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const [{ id }, { tab, mercado }] = await Promise.all([params, searchParams]);
  const activeTab = resolveTab(tab);

  /*
   * El producto se lee **solo y antes** que lo demás, y no es un descuido.
   *
   * De él salen sus mercados, y de esos el modo en el que se está mirando; y del
   * modo sale qué piezas se ven. Leerlo todo a la vez y filtrar después
   * significaría traer los copys de los cuatro países para enseñar los de uno.
   *
   * Cuesta un viaje más a la base. Es el precio de que la pantalla no pueda
   * enseñar el texto de otro mercado ni por un instante.
   */
  const product = await findProductAnywhere(id);

  if (!product) {
    notFound();
  }

  const productMarkets = await listProductMarkets(product.id);
  const marketIds = productMarkets.map((item) => item.marketId);
  const selection = parseSelection(mercado, marketIds);
  const marketContext = await marketContextFor(product, mercado);

  const [research, hooks, angles, copies, images, ads, hasApiKey, hasHiggsfieldKey] =
    await Promise.all([
      readProductResearch(id, product.researchShared ? undefined : selection),
      readProductHooks(id, selection),
      readAngles(id, selection),
      readCopies(id, selection),
      readProductImages(id),
      listAds(),
      hasActiveProviderKey(),
      hasHiggsfieldCredentials(),
    ]);

  const [trees, prelandings, counters, performanceRecords, stores] = await Promise.all([
    readCampaignTrees(id),
    readPrelandings(id),
    nextNumbers(id),
    readPerformance(id, selection),
    listStores(),
  ]);

  const performance = performanceIndex(performanceRecords);

  // Un anuncio corto no guarda su ángulo: se atribuye por el conjunto al que pertenece.
  const adsetAngles = new Map<string, string>(
    trees
      .flatMap((tree) => tree.adsets.map((node) => node.adset))
      .filter((adset) => Boolean(adset.angleId))
      .map((adset) => [adset.id, adset.angleId as string]),
  );
  const shortAds = trees.flatMap((tree) => tree.adsets.flatMap((node) => node.ads));

  const anglePerformance = rollUpByAngle({
    angles,
    copies,
    shortAds,
    adsetAngles,
    records: performanceRecords,
  });

  const productStore = product.storeId
    ? stores.find((item) => item.id === product.storeId)
    : undefined;
  const marketOptions = (productStore?.markets ?? [])
    .filter((market) => marketIds.includes(market.id))
    .map((market) => ({ id: market.id, label: marketLabel(market) }));

  /*
   * La pestaña de precios aparece en cuanto el producto tiene tienda.
   *
   * **Antes se escondía hasta tener más de un mercado, y era un callejón sin
   * salida:** es justo ahí donde se añaden, así que un producto con uno solo no
   * podía llegar nunca al segundo. La regla parecía razonable —«con un mercado
   * no hay nada que decidir»— y olvidaba que la pantalla no solo enseña precios,
   * también es por donde se entra.
   *
   * Sin tienda sí se esconde: los mercados son de la tienda, y sin ella no hay
   * ninguno que ofrecer.
   */
  const visibleTabs = TABS.filter((item) => item.id !== "precios" || Boolean(productStore));

  // Cómo se llama cada mercado, para que las insignias no enseñen un uuid.
  const marketNames = Object.fromEntries(
    (productStore?.markets ?? []).map((market) => [market.id, marketLabel(market)]),
  );

  const productAds = ads.filter((ad) => ad.relatedProductId === product.id);

  const plan = buildHookPlan(research.awareness, research.desireValidation);
  // Los deseos validados son el punto de partida tanto de los ángulos como del copy.
  const desires = research.desireValidation?.top5 ?? [];

  // Qué combinaciones están escritas y cuáles rinden más de las que faltan.
  const coverage = buildCopyCoverage({
    awareness: research.awareness,
    validation: research.desireValidation,
    angles,
    copies,
  });
  const pending = pendingCombinations(coverage);

  // Creatividades por copy: mínimo cinco, con modelo e imagen de referencia decididos.
  const visualsByCopy: Record<string, AdVisualPrompt[]> = Object.fromEntries(
    copies.map((copy) => [
      copy.id,
      buildAdVisualPrompts({
        product,
        research,
        copy,
        angle: angles.find((angle) => angle.id === copy.angleId),
      }),
    ]),
  );

  // La tienda decide si el copy nombra la marca, así que va dentro de los prompts.
  const store = product.storeId ? await findStore(product.storeId) : null;

  const supabaseReady = isSupabaseConfigured();
  const providerModel = (await readProviderConfig()).claudeModel;
  const money = marketMoney(product, stores);

  // La oferta y las notas viven solo en Supabase: sin credenciales van vacías.
  const [offers, notes] = supabaseReady
    ? await Promise.all([readOffers(product.id), listNotes(product.id)])
    : [emptyOffers(), []];

  // Los prompts se montan aquí, en el servidor: no se envía nada, solo se enseñan.
  const researchPrompts = Object.fromEntries(
    RESEARCH_DOCUMENT_IDS.map((id) => [
      id,
      buildResearchPrompt(id, product, research, store, {
        offers,
        notes,
        currency: money.currency,
        // La vista previa del encargo tiene que enseñar **lo que se va a mandar
        // de verdad**, con el mercado que esté elegido. Un encargo de muestra
        // que no coincide con el real es peor que no enseñarlo.
        marketContext,
      }),
    ]),
  ) as Record<ResearchDocumentId, string>;

  const researchBlocked = Object.fromEntries(
    RESEARCH_DOCUMENT_IDS.map((id) => [id, blockedBy(id, research, product.vertical)]),
  ) as Record<ResearchDocumentId, ResearchDocumentId[]>;

  const primaryImage = images.find((image) => image.isPrimary) ?? null;

  const patternModels = Object.fromEntries(
    PRODUCT_IMAGE_PATTERNS.map((pattern) => {
      const { model, reason } = recommendModelForPattern(pattern);
      return [pattern, { modelId: model.id, reason }];
    }),
  );
  const hasResearch = Boolean(research.awareness);
  const isDemo = isDemoResearchProduct(product.id);

  const counts: Partial<Record<TabId, number>> = {
    documentos: Object.values(research.documents).filter((doc) => doc.status === "ready").length,
    competidores: research.competitors?.competitors.length ?? 0,
    hooks: hooks.length,
    angulos: angles.length,
    copys: copies.length,
    imagenes: images.length,
    ads: trees.reduce(
      (sum, tree) => sum + tree.adsets.reduce((inner, node) => inner + node.ads.length, 0),
      0,
    ),
  };

  /*
   * Los trabajos en marcha se leen aquí, con el resto de la página.
   *
   * Sin tumbarla si falla: el panel es informativo y la ficha del producto —que
   * es a lo que se viene— tiene que aparecer igual.
   */
  /*
   * Páginas y copys de referencia.
   *
   * Se leen aquí con el resto, y sin tumbar la página si fallan: son añadidos y
   * la ficha del producto tiene que aparecer igual.
   */
  let videos: Awaited<ReturnType<typeof listVideos>> = [];
  let landings: Awaited<ReturnType<typeof listLandings>> = [];
  let swipeCopies: Awaited<ReturnType<typeof listSwipeCopies>> = [];

  /*
   * Las páginas de las tiendas analizadas, para poder escribir siguiendo una.
   * Van con el resto de referencias porque para quien escribe son lo mismo:
   * un modelo que seguir.
   */
  let modelPages: { id: string; title: string }[] = [];

  /** Anuncios en vídeo ya analizados, para escribir guiones que los sigan. */
  let videoReferences: Awaited<ReturnType<typeof listVideoReferences>> = [];

  if (isSupabaseConfigured()) {
    const [loadedLandings, loadedSwipe, loadedVideos, blueprints, loadedReferences] =
      await Promise.all([
      listLandings(product.id, selection).catch(() => []),
      listSwipeCopies(id).catch(() => []),
      listVideos(product.id, selection).catch(() => []),
      listBlueprints().catch(() => []),
      listVideoReferences().catch(() => []),
    ]);

    landings = loadedLandings;
    swipeCopies = loadedSwipe;
    videos = loadedVideos;
    modelPages = modelOptions(blueprints);
    videoReferences = loadedReferences;
  }

  /*
   * Las páginas ya hechas, para poder adaptar una a otro ángulo.
   *
   * Entran **todas**: nacidas de un copy, clonadas de fuera o portadas. Viven en
   * la misma tabla y lo que se reutiliza de ellas es la construcción, no el
   * texto — el texto nuevo lo escribe el encargo con el ángulo que se le pida.
   */
  const ownPages = landings.map((page) => ({
    id: landingReferenceId(page.id),
    title: page.title,
  }));

  /*
   * Las anatomías del producto, para poder corregirlas antes de sacar ángulos.
   *
   * Sin tumbar la página si fallan: son un añadido y la ficha tiene que
   * aparecer igual, como el resto de lo que se lee aquí.
   */
  const anatomias = isSupabaseConfigured()
    ? await listAnatomias(product.id).catch(() => [])
    : [];

  let experiments: Awaited<ReturnType<typeof listExperiments>> = [];
  if (isSupabaseConfigured()) {
    experiments = await listExperiments(product.id).catch(() => []);
  }

  /*
   * Cada página con sus imágenes ya emparejadas por hueco.
   *
   * Se filtran por `landingId` porque los huecos se llaman igual en todas
   * —`img-1`, `logo`, `autor`—: sin ese filtro, las imágenes de una página
   * aparecerían dentro de otra.
   */
  const landingViews = landings.map((page) => {
    const own = images.filter((image) => image.landingId === page.id);

    /*
     * Los retratos son **de esta página**.
     *
     * Antes se buscaban por concepto en todo el producto, con la idea de que las
     * mismas caras sirvieran en todas las landings. No sirven —cada página tiene
     * sus propios comentaristas— y además, con dos juegos generados, la búsqueda
     * devolvía uno cualquiera: las caras de una página cambiaban al generar las
     * de otra.
     *
     * El respaldo a los huérfanos es para las páginas anteriores al cambio, cuyos
     * retratos se guardaron sin `landingId`.
     */
    const avatars = Array.from({ length: AVATAR_POOL_SIZE }, (_, index) => {
      const slot = avatarSlot(index);
      return (
        own.find((image) => image.concept === slot)?.url ??
        images.find((image) => !image.landingId && image.concept === slot)?.url
      );
    }).filter((url): url is string => Boolean(url));

    const urls: Record<string, string> = {};
    for (const image of own) {
      if (image.concept) urls[image.concept] = image.url;
    }

    return {
      page,
      // La vista previa lleva las imágenes; lo que se pega en Shopify, los
      // huecos, porque las URL firmadas caducan en una hora.
      preview: renderLandingHtml(page, { urls, avatars, embedUrls: true }),
      html: renderLandingHtml(page),
      images: own,
    };
  });

  let jobs: BackgroundJob[] = [];
  if (isSupabaseConfigured()) {
    try {
      jobs = await listJobs(product.id);
    } catch {
      jobs = [];
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={product.owner === "competitor" ? "/competitors" : "/products"}
          className="text-sm text-slate-500 transition hover:text-violet-600 dark:text-slate-400"
        >
          ← Volver
        </Link>
        <div className="flex items-center gap-3">
          {showSelector(marketIds) ? (
            <MarketSwitcher
              markets={marketOptions}
              current={selection.kind === "general" ? "general" : selection.marketId}
            />
          ) : null}
          <StatusPill status={product.status} />
          <Link
            href={`/products/${product.id}/edit`}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Editar producto
          </Link>
        </div>
      </div>

      {/* Encima de todo: es lo que cambia solo, y enterrado abajo obligaría a
          bajar a mirarlo cada vez. */}
      <JobsPanel productId={product.id} jobs={jobs} />

      <div>
        <h2 className="text-2xl font-semibold">{product.name}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {product.brand} · {product.category} · {product.country}
        </p>
      </div>

      {isDemo ? (
        <p className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          Este producto muestra una investigación de ejemplo para poder validar el panel sin consumir tokens.
          Tiene la forma exacta que devolverá la API.
        </p>
      ) : null}

      {/* Navegación por pestañas en la URL: compartible y sin perder estado. */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {visibleTabs.map((item) => {
          const active = item.id === activeTab;
          const count = counts[item.id];
          return (
            <Link
              key={item.id}
              /*
               * El mercado viaja en el enlace.
               *
               * Sin esto, cambiar de pestaña devolvía a general sin avisar: se
               * estaría escribiendo un copy para México y al pasar a Copys la
               * ficha ya no sabría en qué país está.
               */
              href={`/products/${product.id}?tab=${item.id}${mercado ? `&mercado=${mercado}` : ""}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                active
                  ? "border-violet-600 text-violet-700 dark:text-violet-300"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {item.label}
              {count !== undefined && count > 0 ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {activeTab === "panel" ? (
        <PanelTab
          product={product}
          research={research}
          stores={stores}
          marketContext={marketContext}
        />
      ) : null}
      {activeTab === "precios" ? (
        <PricesTab
          productId={product.id}
          basePrice={product.price}
          baseCurrency={money.currency}
          storeMarkets={productStore?.markets ?? []}
          prices={productMarkets}
          // Hoy sale del servidor: en el cliente sería la fecha del navegador, y
          // con eso una conversión parecería vieja o nueva según quién la mire.
          today={new Date().toISOString().slice(0, 10)}
        />
      ) : null}
      {activeTab === "info" ? (
        <InfoTab
          product={product}
          stores={stores}
          hasApiKey={hasApiKey}
          marketContext={marketContext}
        />
      ) : null}
      {activeTab === "oferta" ? (
        <OfferTab
          productId={product.id}
          offers={offers}
          notes={notes}
          currency={money.currency}
          locale={money.locale}
          hasMarket={marketContext.market !== null}
        />
      ) : null}
      {activeTab === "documentos" ? (
        <DocumentsTab
          masterObjections={research.master?.objections ?? null}
          researchUnavailable={selection.kind === "general" && !product.researchShared && showSelector(marketIds)}
          research={research}
          hasApiKey={hasApiKey}
          missingInputs={missingResearchInputs(product)}
          needsCompetitors={needsCompetitorSearch(product)}
          productId={product.id}
          costRange={estimateResearchCost(providerModel)}
          prompts={researchPrompts}
          vertical={product.vertical}
          waves={researchWaves(product.vertical)}
          blocked={researchBlocked}
        />
      ) : null}
      {activeTab === "competidores" ? (
        <CompetitorsTab
          product={product}
          research={research.competitors}
          hasApiKey={hasApiKey}
        />
      ) : null}
      {activeTab === "hooks" ? (
        <HooksTab
          productId={product.id}
          hooks={hooks}
          plan={plan}
          hasApiKey={hasApiKey}
          hasResearch={hasResearch}
        />
      ) : null}
      {activeTab === "angulos" ? (
        <AnglesTab
          anatomias={anatomias}
          videoReferences={videoReferences.map((item) => ({ id: item.id, name: item.name }))}
          productId={product.id}
          angles={angles}
          desires={desires}
          performance={anglePerformance}
          hasApiKey={hasApiKey}
          hasResearch={hasResearch}
        />
      ) : null}
      {activeTab === "copys" ? (
        <CopysTab
          ownPages={ownPages}
          showMarketBadges={showSelector(marketIds)}
          marketNames={marketNames}
          copies={copies}
          angles={angles}
          hooks={hooks}
          desires={desires}
          hasApiKey={hasApiKey}
          hasResearch={hasResearch}
          coverage={coverage}
          pending={pending}
          visualsByCopy={visualsByCopy}
          primaryImage={primaryImage}
          images={images}
          swipeCopies={swipeCopies}
          modelPages={modelPages}
          productId={product.id}
          performance={performance}
          hasHiggsfieldKey={hasHiggsfieldKey}
          landingCopyIds={
            new Set(landings.map((item) => item.copyId).filter(Boolean) as string[])
          }
        />
      ) : null}
      {activeTab === "videos" ? (
        <VideosTab
          productId={product.id}
          videos={videos}
          /* Solo los largos: de un anuncio corto no sale una historia que contar. */
          copies={copies.filter((copy) => copy.format !== "short-ad")}
          references={videoReferences}
          providers={videoProvidersReady()}
        />
      ) : null}
      {activeTab === "landings" ? (
        <LandingsTab
          productId={product.id}
          mercado={mercado}
          angles={angles.map((angle) => ({ id: angle.id, name: angle.name }))}
          hasApiKey={hasApiKey}
          storeDomain={store?.domain?.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}
          landings={landingViews}
          experiments={experiments}
        />
      ) : null}
      {activeTab === "imagenes" ? (
        <ImagesTab
          productId={product.id}
          images={images}
          patternModels={patternModels}
          performance={performance}
          hasHiggsfieldKey={hasHiggsfieldKey}
        />
      ) : null}
      {activeTab === "ads" ? (
        <AdsTab
          product={product}
          images={images}
          trees={trees}
          prelandings={prelandings}
          angles={angles}
          anatomias={anatomias}
          videoReferences={videoReferences}
          desires={desires}
          libraryAds={productAds}
          nextNumbers={counters}
          performance={performance}
          hasApiKey={hasApiKey}
          hasResearch={hasResearch}
        />
      ) : null}
    </div>
  );
}
