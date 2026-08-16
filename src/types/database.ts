/**
 * Tipos de la base de datos.
 *
 * Escritos a mano a partir de las migraciones de `supabase/migrations/`, con la
 * misma forma que genera `supabase gen types typescript`. En cuanto tengas el
 * proyecto en marcha conviene regenerarlos con el comando —está en el README—
 * para que la fuente de verdad sea la base de datos y no este archivo.
 *
 * La estructura `Row` / `Insert` / `Update` es la que espera `supabase-js`:
 * `Row` es lo que devuelve un SELECT, `Insert` lo que acepta un INSERT (con las
 * columnas que tienen valor por defecto marcadas como opcionales) y `Update` un
 * parcial de lo anterior.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/* --------------------------------- Enumerados ---------------------------------- */

export type DbProductStatus = "active" | "draft";
export type DbProductOwner = "own" | "competitor";
export type DbStorePlatform = "shopify" | "woocommerce" | "otra";

export type DbAwarenessLevel =
  | "unaware"
  | "problem-aware"
  | "solution-aware"
  | "product-aware"
  | "most-aware";

export type DbResearchDocumentId =
  | "awareness"
  | "competitors"
  | "avatars"
  | "master"
  | "desire-extraction"
  | "desire-validation"
  // Solo del vertical de casino. Quién los ve lo decide `documentsFor`.
  | "regulation"
  | "payments"
  | "casino-landscape";

export type DbResearchDocumentStatus = "empty" | "queued" | "generating" | "ready" | "error";

export type DbCopyFormat = "long-copy" | "advertorial" | "short-ad";
export type DbCopyDriver = "desire" | "angle";
export type DbCopyStatus = "draft" | "approved" | "used";
export type DbFunnelStage = "TOFU" | "MOFU" | "BOFU";
export type DbPerformanceRating = "ganador" | "prometedor" | "perdedor" | "sin-probar";
export type DbPerformanceTarget = "copy" | "short-ad" | "imagen";
export type DbImageSource = "subida" | "generada";

/* ---------------------------------- Las filas ---------------------------------- */

/*
 * Alias de tipo y no interfaces, y no es cosmético: TypeScript solo da índice
 * implícito a los alias. Una `interface` no satisface `Record<string, unknown>`,
 * que es lo que exige `GenericTable` de supabase-js, y el resultado es que
 * todas las tablas se resuelven a `never` sin ningún error que lo explique.
 */

type ProfileRow = {
  id: string;
  display_name: string;
  email: string;
  /** dueño, admin, editor, redactor, analista, invitado. Ver `src/lib/roles.ts`. */
  role: string;
  /** `numeric`: llega como texto. `null` es sin tope de gasto. */
  monthly_limit_usd: number | null;
  disabled: boolean;
  created_at: string;
  updated_at: string;
};

type StoreRow = {
  /** Token de la app personalizada de esta tienda. Nunca sale al navegador. */
  shopify_admin_token: string | null;
  shopify_shop_domain: string | null;
  shopify_api_key: string | null;
  shopify_api_secret: string | null;
  /** Moneda y zona horaria que declara Shopify. Base de todos los informes. */
  shop_currency: string | null;
  shop_time_zone: string | null;
  /** El logo de la marca. Vive en la tienda, no en cada landing. */
  logo_url: string | null;
  logo_prompt: string | null;
  id: string;
  user_id: string;
  name: string;
  brand: string;
  domain: string;
  platform: DbStorePlatform;
  mention_brand_in_copy: boolean;
  created_at: string;
  updated_at: string;
};

type StoreMarketRow = {
  id: string;
  user_id: string;
  store_id: string;
  country_code: string;
  country_name: string;
  language_code: string;
  language_name: string;
  currency: string;
  domain: string;
  path_prefix: string;
  is_primary: boolean;
  created_at: string;
};

type ProductRow = {
  /** Ingredientes con su mecanismo. Nulo en los creados antes. */
  ingredient_details: unknown;
  /** Nula cuando la moneda sale del mercado de la tienda. */
  currency: string | null;
  id: string;
  user_id: string;
  store_id: string | null;
  market_id: string | null;
  duplicated_from_id: string | null;
  name: string;
  slug: string;
  brand: string;
  category: string;
  description: string;
  target_audience: string;
  country: string;
  language: string;
  price: number;
  landing_url: string;
  handle: string;
  tone: string;
  status: DbProductStatus;
  owner: DbProductOwner;
  benefits: string[];
  features: string[];
  ingredients: string[];
  problems_solved: string[];
  objections: string[];
  niche: string;
  competitor_urls: string[];
  amazon_url: string;
  target_age_range: string;
  target_genders: string[];
  /** Si los seis documentos valen para todos los mercados del producto. */
  research_shared: boolean;
  /** 'ecommerce' | 'casino'. Ver `Vertical` en `types/research.ts`. */
  vertical: string;
  created_at: string;
  updated_at: string;
};

/**
 * En qué mercados vive un producto y a qué precio en cada uno.
 *
 * Es la verdad sobre los dos: `products.market_id` pasa a ser solo el **mercado
 * base**, el del precio de `products.price`. Tener la moneda en dos sitios es la
 * puerta a que discrepen, y cuando discrepan el que se publica es el equivocado.
 */
type ProductMarketRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  product_id: string;
  market_id: string;
  /** Nulo mientras ese mercado no tiene precio. */
  price: number | null;
  /** 'manual' gana siempre: el conversor filtra por esta columna. */
  price_source: "manual" | "convertido" | "ninguno";
  /** El día del cambio con el que se convirtió, congelado. Nulo si es manual. */
  price_fx_day: string | null;
  price_fx_rate: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Una app de casino: el subproducto del que se descarga.
 *
 * Vive en su tabla y no como etiqueta porque tiene enfoque propio, y ese enfoque
 * entra en el encargo del copy.
 */
type AppRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  product_id: string;
  name: string;
  focus: string;
  download_url: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type CampaignFolderRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  product_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type ProductOfferRow = {
  product_id: string;
  user_id: string;
  subscription_enabled: boolean;
  subscription_discount_percent: number;
  subscription_frequency: string;
  subscription_perks: string[];
  subscription_cancellation_policy: string;
  guarantee: string;
  free_shipping_threshold: number | null;
  source: string;
  created_at: string;
  updated_at: string;
};

type OfferTierRow = {
  id: string;
  user_id: string;
  product_id: string;
  label: string;
  quantity: number;
  total_price: number;
  compare_at_price: number | null;
  free_shipping: boolean;
  gifts: string[];
  is_highlighted: boolean;
  note: string;
  position: number;
  created_at: string;
};

type ProductNoteRow = {
  id: string;
  user_id: string;
  product_id: string;
  title: string;
  body: string;
  include_in_prompts: boolean;
  created_at: string;
  updated_at: string;
};

type ResearchDocumentRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  document_id: DbResearchDocumentId;
  status: DbResearchDocumentStatus;
  markdown: string;
  data: Json | null;
  error: string;
  generated_at: string | null;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  updated_at: string;
};

type HookRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  awareness_level: DbAwarenessLevel;
  desire: string;
  title: string;
  body: string;
  angle: string;
  format: string;
  batch_id: string;
  used: boolean;
  used_at: string | null;
  created_at: string;
};

type AngleRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** La anatomía de la que salió, si salió de una. */
  source_analysis_id: string | null;
  /** Lo que pide y la investigación no sostiene. Vacío = se sostiene. */
  promise_to_validate: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  /** De qué app es. **Nulo es general**: vale para todas las del producto. */
  app_id: string | null;
  desire: string;
  name: string;
  target_audience: string;
  story_start: string;
  story_crisis: string;
  story_discovery: string;
  story_resolution: string;
  problem_mechanism: string;
  solution_mechanism: string;
  emotional_moment: string;
  created_at: string;
};

type CampaignRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  name: string;
  stage: DbFunnelStage;
  country_code: string;
  theme: string;
  focus: string;
  /** En qué carpeta se ve. Nulo es «sin carpeta». */
  folder_id: string | null;
  /** Cuándo se archivó. Nulo es activa. */
  archived_at: string | null;
  created_at: string;
};

type PrelandingRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  name: string;
  url: string;
  description: string;
  created_at: string;
};

type AdsetRow = {
  id: string;
  user_id: string;
  product_id: string;
  campaign_id: string;
  angle_id: string | null;
  /** La anatomía de la que salió la tanda. Nulo = salió de un ángulo. */
  source_analysis_id: string | null;
  /** 'mismo' | 'ampliado' | 'referencia'. Vacío = no salió de un material. */
  source_level: string;
  name: string;
  number: number;
  stage: DbFunnelStage;
  focus: string;
  destination: string;
  prelanding_id: string | null;
  destination_url: string;
  destination_note: string;
  audience: string;
  objective: string;
  offer_stack: string[];
  always_include: string[];
  created_at: string;
};

type ShortAdRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  adset_id: string;
  name: string;
  number: number;
  format: string;
  primary_text: string;
  headline: string;
  description: string;
  image_prompt: string;
  created_at: string;
};

type CopyRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  angle_id: string | null;
  hook_id: string | null;
  /** De qué app es el texto. Nulo en todo lo que no es casino. */
  app_id: string | null;
  adset_id: string | null;
  ad_number: number | null;
  ad_name: string;
  format: DbCopyFormat;
  method_id: string;
  driver: DbCopyDriver;
  driver_label: string;
  awareness_level: DbAwarenessLevel;
  primary_text: string;
  headline: string;
  description: string;
  word_count: number;
  status: DbCopyStatus;
  model: string;
  /** Escenas sacadas del texto: `[{kind, quote, scene, composition}]`. */
  story_beats: unknown;
  beats_intensity: string | null;
  created_at: string;
  updated_at: string;
};

type ProductImageRow = {
  /** De qué app es la captura. Es la que se manda de referencia al generar. */
  app_id: string | null;
  shopify_url: string | null;
  copy_id: string | null;
  ad_id: string | null;
  landing_id: string | null;
  concept: string | null;
  origin_label: string | null;
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  pattern: string;
  name: string;
  storage_path: string;
  storage_bucket: string;
  mime_type: string;
  size_bytes: number | null;
  prompt: string;
  model_id: string;
  is_primary: boolean;
  source: DbImageSource;
  /** Cuándo se descartó al rehacerla. Nulo es vigente. */
  discarded_at: string | null;
  created_at: string;
};

type AdCreativeRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  name: string;
  brand: string;
  kind: DbProductOwner;
  platform: string;
  country: string;
  tags: string[];
  status: string;
  storage_path: string;
  storage_bucket: string;
  created_at: string;
};

type PerformanceRecordRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  target_type: DbPerformanceTarget;
  target_id: string;
  rating: DbPerformanceRating;
  note: string;
  roas: number | null;
  spend: number | null;
  ctr: number | null;
  cpa: number | null;
  created_at: string;
  updated_at: string;
};

type AnalysisRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  title: string;
  kind: string;
  status: string;
  summary: string;
  payload: Json | null;
  created_at: string;
};

type ProviderConfigRow = {
  user_id: string;
  anthropic_secret_id: string | null;
  higgsfield_secret_id: string | null;
  anthropic_api_key: string | null;
  higgsfield_key_id: string | null;
  higgsfield_key_secret: string | null;
  /** La de sync.so, para el lipsync. Nunca sale de la base sin `service_role`. */
  sync_api_key: string | null;
  /** USD por crédito de Higgsfield. `numeric`, así que llega como cadena. */
  higgsfield_usd_per_credit: string | null;
  claude_model: string;
  claude_copy_model: string;
  claude_extraction_model: string;
  active_provider: string;
  chatgpt_api_key: string | null;
  chatgpt_model: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Registro de gasto.
 *
 * `cost_usd` llega como texto: `numeric` de Postgres no cabe siempre en un
 * `number` de JavaScript y el driver lo devuelve como cadena para no perder
 * precisión. Tipificarlo como `number` daría un `NaN` silencioso al sumar.
 */
type GenerationRunRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  product_name: string | null;
  kind: string;
  detail: string | null;
  model: string | null;
  status: string;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  /** Lo que costó **meter** el contexto en la caché. Un poco más que no usarla. */
  cache_write_tokens: number;
  /** Lo que vino **de** la caché. Es el número que dice si sirvió. */
  cache_read_tokens: number;
  web_searches: number;
  cost_usd: string;
  created_at: string;
};

/** Trabajo en segundo plano. `result` es libre: cada tipo guarda lo suyo. */
type BackgroundJobRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  kind: string;
  label: string;
  status: string;
  /** Por dónde va mientras corre. */
  progress: string;
  /** Con qué relanzarlo si se corta. Solo identificadores. */
  resume: unknown;
  /** Si se ha pedido que se pare. Lo mira él entre pasos. */
  cancel_requested: boolean;
  summary: string | null;
  error: string | null;
  result: unknown;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
  created_at: string;
  finished_at: string | null;
};

/** Un fallo, con dónde ocurrió y con qué datos. Para diagnosticar, no para avisar. */
type ErrorLogRow = {
  id: string;
  user_id: string | null;
  product_id: string | null;
  context: string;
  message: string;
  stack: string | null;
  kind: string | null;
  detail: unknown;
  created_at: string;
};

type LandingPageRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  copy_id: string | null;
  title: string;
  slug: string;
  method_id: string | null;
  hide_theme_chrome: boolean;
  utm_campaign: string | null;
  shopify_page_id: string | null;
  shopify_url: string | null;
  published_at: string | null;
  header: unknown;
  author: unknown;
  sections: unknown;
  image_slots: unknown;
  comments: unknown;
  /** Colores, letra y ancho. `null` es el aspecto de siempre. */
  theme: unknown;
  created_at: string;
  /** La forma editorial con la que se escribió. Vacío en las anteriores. */
  shape_id: string;
};

/** Un copy que ya se probó, guardado como referencia para escribir más. */
type SwipeCopyRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  title: string;
  body: string;
  status: string;
  source: string | null;
  format: string | null;
  note: string | null;
  /** 'propio' se puede heredar entero; de 'ajeno', solo la construcción. */
  ownership: "propio" | "ajeno";
  created_at: string;
};

type LandingExperimentRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  name: string;
  slug: string;
  active: boolean;
  created_at: string;
};

type LandingVariantRow = {
  id: string;
  experiment_id: string;
  landing_id: string;
  weight: number;
  created_at: string;
};

type LandingEventRow = {
  id: string;
  user_id: string;
  experiment_id: string | null;
  variant_id: string | null;
  kind: string;
  visitor: string | null;
  value: string | null;
  currency: string | null;
  utm_content: string | null;
  created_at: string;
};

/* --------------------------- Beneficio real por tienda -------------------------- */

/**
 * Los importes son `string`, no `number`.
 *
 * Es lo que devuelve PostgREST para `numeric`: se manda como texto para no
 * perder precisión al pasar por JSON. Tipearlos como número aquí compilaría y
 * después sumaría cadenas —«5.03» + «8.68» = «5.038.68»—, así que la conversión
 * es obligatoria y se hace en el mapeador.
 */
type ShopOrderRow = {
  id: string;
  user_id: string;
  store_id: string;
  shopify_ref: string;
  name: string;
  processed_at: string;
  currency: string;
  gross_sales: string;
  discounts: string;
  returns: string;
  taxes: string;
  shipping_charged: string;
  tips: string;
  total: string;
  gateway: string;
  financial_status: string;
  test: boolean;
  customer_ref: string;
  is_first_order: boolean;
  landing_page: string;
  utm: unknown;
  synced_at: string;
};

type ShopOrderItemRow = {
  id: string;
  order_id: string;
  product_ref: string;
  variant_ref: string;
  sku: string;
  title: string;
  quantity: number;
  unit_price: string;
  discount: string;
  refunded_quantity: number;
};

type AdAccountRow = {
  id: string;
  user_id: string;
  store_id: string;
  provider: string;
  external_id: string;
  name: string;
  currency: string;
  /** De qué Business Manager es. Vacío en las dadas de alta antes de guardarlo. */
  business_id: string;
  business_name: string;
  /** Con qué sesión se lee. Null: la de la tienda o la de por defecto. */
  meta_login_id: string | null;
  active: boolean;
  include_filters: string[];
  exclude_filters: string[];
  last_synced_at: string | null;
  created_at: string;
};

type AdSpendRow = {
  id: string;
  account_id: string;
  day: string;
  campaign_ref: string;
  campaign_name: string;
  spend: string;
  impressions: number;
  clicks: number;
  reported_purchases: number;
  reported_value: string;
  currency: string;
  synced_at: string;
};

type AdCredentialRow = {
  id: string;
  user_id: string;
  store_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  client_id: string | null;
  client_secret: string | null;
  developer_token: string | null;
  login_customer_id: string | null;
  /** Meta: la configuración de Facebook Login for Business, cuando la app la usa. */
  config_id: string | null;
  /** Meta: con qué app dada de alta se conecta esta tienda. */
  meta_app_id: string | null;
  /** Meta: con qué sesión de Facebook lee su gasto. */
  meta_login_id: string | null;
  /** Nulo = no caduca. Es el caso de Google con la app publicada. */
  token_expires_at: string | null;
  scopes: string[];
  account_name: string | null;
  connected_at: string | null;
  updated_at: string;
};

type CostCogsRow = {
  id: string;
  user_id: string;
  store_id: string;
  product_ref: string;
  variant_ref: string;
  label: string;
  amount: string;
  currency: string;
  /** `manual` manda sobre `shopify`: quien lo ajustó a mano sabía algo más. */
  source: string;
  updated_at: string;
};

type CostShippingZoneRow = {
  id: string;
  user_id: string;
  store_id: string;
  name: string;
  countries: string[];
  is_default: boolean;
  tiers: unknown;
  /** Si el precio del proveedor ya incluye el envío. */
  dropshipping: boolean;
  updated_at: string;
};

type CostGatewayFeeRow = {
  id: string;
  user_id: string;
  store_id: string;
  gateway: string;
  percent: string;
  fixed: string;
  /** Lo que la pasarela cobra por encima de su tarifa publicada. */
  extra_percent: string;
  extra_fixed: string;
  updated_at: string;
};

type CostCustomRow = {
  id: string;
  user_id: string;
  store_id: string;
  name: string;
  kind: string;
  amount: string;
  basis: string;
  category: string;
  starts_on: string;
  ends_on: string;
  repeat: string;
  in_ltv_cac: boolean;
  created_at: string;
};

/* ---------------------------------- Vídeos -------------------------------------- */

/* ---------------------------- Instagram -------------------------------------- */

type InstagramPostRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  product_id: string;
  format: string;
  caption: string;
  hashtags: string[];
  /** Qué se ve, para poder generar la media. */
  scene: string;
  media_url: string | null;
  /** Si el producto sale en la imagen. Decide si se le pasa su foto de referencia. */
  shows_product: boolean;
  /** `imagen` o `video`. */
  media_kind: string;
  /** `borrador` → `aprobado` → `publicando` → `publicado` | `error`. */
  status: string;
  scheduled_at: string | null;
  /** Cuándo la cogió el cron. Es lo que evita publicar dos veces. */
  claimed_at: string | null;
  published_at: string | null;
  instagram_id: string | null;
  error: string;
  /** En qué cuenta salió. Es lo que permite contar el tope por cuenta. */
  ig_user_id: string | null;
  /** Cuántas veces se le ha intentado generar la imagen. El tope corta el gasto. */
  intentos_media: number;
  created_at: string;
};

/** El autopiloto de un producto: si publica solo, dónde y a qué ritmo. */
type InstagramAutopilotRow = {
  product_id: string;
  user_id: string;
  workspace_id: string | null;
  activo: boolean;
  /** La cuenta de Instagram. `null` mientras no se elige ninguna. */
  ig_user_id: string | null;
  por_dia: number;
  colchon_dias: number;
  hora_desde: number;
  hora_hasta: number;
  /** IANA (`America/Mexico_City`). En qué reloj se leen las dos horas de arriba. */
  zona_horaria: string;
  ultima_publicacion_at: string | null;
  fallos_seguidos: number;
  /** Vacío es «no está pausado». Con texto, dice por qué. */
  pausado_por: string;
  created_at: string;
};

/**
 * El semáforo de las vueltas del cron: una a la vez.
 *
 * No lleva `workspace_id` a propósito: no es un dato de nadie, es un turno, y
 * es uno para todo el servidor.
 */
type CronArriendoRow = {
  nombre: string;
  /** Nulo es «libre». Con hora, «lo tiene alguien desde entonces». */
  tomado_at: string | null;
  /** Quién lo tiene, para que solo lo suelte quien lo cogió. */
  token: string;
};

/* ------------------------- Espacio de trabajo -------------------------------- */

type WorkspaceRow = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

type WorkspaceMemberRow = {
  workspace_id: string;
  user_id: string;
  role: string;
  /** Excepciones sobre las capacidades de su papel. Nulo es «las de su papel». */
  capabilities: string[] | null;
  created_at: string;
};

/**
 * A quién se le saca de qué producto.
 *
 * Se guarda lo que se quita, no lo que se concede: por defecto el equipo ve
 * todo. Al revés, cada producto nuevo nacería invisible hasta que alguien lo
 * repartiera.
 */
type ProductExclusionRow = {
  workspace_id: string;
  product_id: string;
  user_id: string;
  reason: string;
  created_at: string;
};

type VideoRow = {
  id: string;
  user_id: string;
  product_id: string;
  /** De qué mercado es la pieza. **Nulo es general**: vale en todos. */
  market_id: string | null;
  copy_id: string | null;
  title: string;
  status: string;
  style_render: string;
  style_accent: string;
  voice_id: string;
  voice_url: string | null;
  /** Palabras con sus tiempos, tal y como llegaron del generador de voz. */
  words: unknown;
  voice_seconds: string;
  final_url: string | null;
  thumbnail_url: string | null;
  spent_usd: string;
  created_at: string;
  updated_at: string;
  /** Música de fondo, ya baja de volumen. */
  music_url: string;
  /** Con qué modelo se anima: ver `VIDEO_MODELS`. */
  video_model: string;
  /** El estilo de subtítulo. Vacío es sin subtítulos. */
  subtitle_preset: string;
  /** El texto del anuncio, escrito a partir del guion. Vacío si no se ha pedido. */
  headline: string;
  primary_text: string;
  description: string;
};

type VideoShotRow = {
  id: string;
  video_id: string;
  n: string;
  position: number;
  guion: string;
  sub: string | null;
  role: string;
  scene: string;
  motion: string;
  speaking: boolean;
  cut_start: string | null;
  cut_end: string | null;
  keyframe_url: string | null;
  clip_url: string | null;
  lipsync_url: string | null;
  error: string | null;
  created_at: string;
};

type StoreBlueprintRow = {
  id: string;
  user_id: string;
  url: string;
  store_name: string;
  currency: string;
  sections: unknown;
  offers: unknown;
  guarantee: string;
  scripts: unknown;
  /** {colors, fonts, buttonRadius} — la paleta y las tipografías leídas. */
  identity: unknown;
  /** [{url, alt, width}] — direcciones, nunca los archivos. */
  images: unknown;
  pages: unknown;
  notes: string;
  created_at: string;
};

type VideoReferenceRow = {
  id: string;
  user_id: string;
  name: string;
  source_url: string;
  /** `numeric`: llega como cadena desde PostgREST. */
  duration_seconds: number;
  width: number;
  height: number;
  had_audio: boolean;
  frames_analyzed: number;
  /** La construcción descrita, nunca el guion. */
  analysis: unknown;
  warnings: unknown;
  /** Los fotogramas guardados: `[{url, at}]`. El vídeo sigue sin conservarse. */
  frames: unknown;
  created_at: string;
};

/**
 * El cambio de divisa de un día.
 *
 * No cuelga del usuario: un cambio es el mismo para todo el mundo. Se lee con
 * sesión y solo lo escribe el servidor.
 */
type FxRateRow = {
  day: string;
  base: string;
  quote: string;
  /** `numeric`: llega como cadena desde PostgREST. */
  rate: number;
  /** Falso cuando es el de hoy puesto sobre un día para el que no había. */
  exact: boolean;
  created_at: string;
};

type ThemeSectionDraftRow = {
  id: string;
  user_id: string;
  blueprint_id: string;
  page: string;
  kind: string;
  ordinal: number;
  section_type: string;
  liquid: string;
  settings: unknown;
  blocks: unknown;
  created_at: string;
};

type AdaptedImageRow = {
  id: string;
  user_id: string;
  product_id: string;
  source_url: string;
  width: number;
  height: number;
  aspect_ratio: string;
  reading: unknown;
  prompt: string;
  result_url: string;
  warnings: unknown;
  parent_id: string | null;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  user_id: string;
  action: string;
  target: string;
  detail: unknown;
  created_at: string;
};

/** El correo que un administrador propuso y la persona todavía no ha confirmado. */
type PendingEmailChangeRow = {
  user_id: string;
  nuevo_email: string;
  pedido_por: string;
  created_at: string;
};

type StudioProjectRow = {
  id: string;
  user_id: string;
  name: string;
  product_id: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type StudioAssetRow = {
  id: string;
  user_id: string;
  project_id: string;
  kind: string;
  url: string;
  name: string;
  model: string;
  prompt: string;
  /** `numeric`: llega como texto desde PostgREST. */
  seconds: number;
  position: number;
  included: boolean;
  created_at: string;
};

/**
 * Una app de Meta dada de alta.
 *
 * Casi siempre hay una. La segunda hace falta solo cuando entra un perfil de
 * Facebook que no puede tener rol en la primera.
 */
type MetaAppRow = {
  id: string;
  user_id: string;
  name: string;
  app_id: string;
  /** Nunca sale de aquí: la pantalla solo sabe si está puesto. */
  app_secret: string;
  config_id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Un flujo: el anuncio dibujado como un grafo.
 *
 * Es el **plano**, no el resultado: se ejecuta las veces que haga falta y cada
 * ejecución produce lo suyo.
 */
type FlowRow = {
  id: string;
  user_id: string;
  name: string;
  product_id: string;
  /** `{ nodes, edges }`. Ver `flow/graph.ts`. */
  graph: Json;
  created_at: string;
  updated_at: string;
};

type FlowRunRow = {
  id: string;
  user_id: string;
  flow_id: string;
  status: string;
  /** Con qué se ejecutó esta vuelta: el avatar, el ángulo, lo que varíe. */
  variables: Json;
  note: string;
  created_at: string;
  updated_at: string;
};

/** Lo que produjo un nodo. Nodo a nodo, para no volver a pagar lo hecho. */
type FlowOutputRow = {
  id: string;
  user_id: string;
  run_id: string;
  node_id: string;
  kind: string;
  url: string;
  value: string;
  error: string;
  created_at: string;
};

/**
 * Un avatar: una cara suelta, sin producto.
 *
 * Se reutiliza en todos los productos y en todas las tandas — generar una cara
 * por foto sería pagarla veinte veces.
 */
type AvatarRow = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  description: string;
  /** `subido`, o el modelo con el que se generó. */
  source: string;
  created_at: string;
};

/** Una toma: ese avatar con un producto en un contexto. */
type AvatarShotRow = {
  id: string;
  user_id: string;
  avatar_id: string;
  product_id: string;
  url: string;
  context: string;
  prompt: string;
  created_at: string;
};

/**
 * Una sesión de Facebook.
 *
 * El token es de la persona, no de una tienda: con él se ven las cuentas de
 * todos sus Business Manager. Por eso vive aparte y las tiendas la apuntan.
 */
type MetaLoginRow = {
  id: string;
  user_id: string;
  /** Del espacio, no de quien la creó: la política de lectura acota por aquí. */
  workspace_id: string | null;
  name: string;
  /** No sale de aquí: a la pantalla van el nombre y la caducidad. */
  access_token: string;
  /** `null` es «no caduca», no «caducó en 1970». */
  token_expires_at: string | null;
  scopes: string[];
  meta_app_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Las músicas guardadas de un vídeo.
 *
 * Se acumulan en vez de pisarse: cada una cuesta, y con el generador bueno
 * cuesta de verdad.
 */
type VideoMusicRow = {
  id: string;
  user_id: string;
  video_id: string;
  url: string;
  model: string;
  prompt: string;
  /** `numeric`: llega como texto desde PostgREST. Negativo siempre. */
  lufs: string;
  seconds: string;
  created_at: string;
};

/* ------------------------------ El mapa completo -------------------------------- */

/**
 * Columnas que la base de datos rellena sola y que por tanto son opcionales al
 * insertar: la clave, las marcas de tiempo y todo lo que tiene `default`.
 */
type Generated = "id" | "created_at" | "updated_at";

type Insertable<Row, Optional extends keyof Row = never> = Omit<Row, Generated | Optional> &
  Partial<Pick<Row, Extract<Generated | Optional, keyof Row>>>;

type Table<Row, Insert = Insertable<Row>, Rels extends readonly unknown[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: Rels;
};

/**
 * Relaciones para los `select` anidados.
 *
 * PostgREST resuelve `campaigns.select("*, adsets(*)")` por la clave foránea
 * que el hijo tiene hacia el padre, así que la relación se declara en el
 * **hijo**. Sin esto, supabase-js no sabe que la anidación existe y devuelve
 * `SelectQueryError` en tiempo de compilación.
 *
 * Solo están las que se usan: declarar las treinta y tantas restantes sería
 * ruido que nadie va a mantener.
 */
type Belongs<Column extends string, Parent extends string> = {
  foreignKeyName: string;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Parent;
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string }>;
      workspaces: Table<WorkspaceRow, Partial<WorkspaceRow> & { name: string; created_by: string }>;
      workspace_members: Table<
        WorkspaceMemberRow,
        Partial<WorkspaceMemberRow> & { workspace_id: string; user_id: string }
      >;
      instagram_posts: Table<
        InstagramPostRow,
        Partial<InstagramPostRow> & { product_id: string }
      >;
      instagram_autopilot: Table<
        InstagramAutopilotRow,
        Partial<InstagramAutopilotRow> & { product_id: string }
      >;
      cron_arriendos: Table<CronArriendoRow, Partial<CronArriendoRow> & { nombre: string }>;
      product_exclusions: Table<
        ProductExclusionRow,
        Partial<ProductExclusionRow> & { workspace_id: string; product_id: string; user_id: string }
      >;
      stores: Table<StoreRow, Insertable<StoreRow, "brand" | "domain" | "platform" | "mention_brand_in_copy"
          | "shopify_admin_token"
          | "shopify_shop_domain"
          | "shopify_api_key"
          | "shopify_api_secret"
          | "shop_currency"
          | "shop_time_zone"
          | "logo_url"
          | "logo_prompt">>;
      store_markets: Table<
        StoreMarketRow,
        Insertable<StoreMarketRow, "domain" | "path_prefix" | "is_primary">,
        [Belongs<"store_id", "stores">]
      >;
      products: Table<
        ProductRow,
        Insertable<ProductRow, Exclude<keyof ProductRow, "user_id" | "name">>
      >;
      apps: Table<
        AppRow,
        Insertable<AppRow, Exclude<keyof AppRow, "user_id" | "product_id" | "name">>
      >;
      product_markets: Table<
        ProductMarketRow,
        Insertable<
          ProductMarketRow,
          Exclude<keyof ProductMarketRow, "user_id" | "product_id" | "market_id">
        >
      >;
      product_offers: Table<
        ProductOfferRow,
        Insertable<ProductOfferRow, Exclude<keyof ProductOfferRow, "product_id" | "user_id">>
      >;
      offer_tiers: Table<
        OfferTierRow,
        Insertable<
          OfferTierRow,
          Exclude<keyof OfferTierRow, "user_id" | "product_id" | "label" | "total_price">
        >
      >;
      product_notes: Table<
        ProductNoteRow,
        Insertable<ProductNoteRow, "title" | "include_in_prompts">
      >;
      research_documents: Table<
        ResearchDocumentRow,
        Insertable<
          ResearchDocumentRow,
          Exclude<keyof ResearchDocumentRow, "user_id" | "product_id" | "document_id">
        >
      >;
      hooks: Table<
        HookRow,
        Insertable<
          HookRow,
          "market_id" | "desire" | "used" | "used_at" | "title" | "angle" | "format" | "batch_id"
        >
      >;
      angles: Table<
        AngleRow,
        Insertable<AngleRow, Exclude<keyof AngleRow, "user_id" | "product_id" | "name">>
      >;
      campaign_folders: Table<
        CampaignFolderRow,
        Insertable<
          CampaignFolderRow,
          Exclude<keyof CampaignFolderRow, "user_id" | "product_id" | "name">
        >
      >;
      campaigns: Table<
        CampaignRow,
        Insertable<
          CampaignRow,
          // Las tres últimas nacen vacías: una campaña se crea sin carpeta y sin
          // archivar, y ninguna se escribe en el alta.
          | "market_id"
          | "stage"
          | "country_code"
          | "theme"
          | "focus"
          | "folder_id"
          | "archived_at"
        >
      >;
      prelandings: Table<PrelandingRow, Insertable<PrelandingRow, "market_id" | "url" | "description">>;
      adsets: Table<
        AdsetRow,
        Insertable<
          AdsetRow,
          | "angle_id"
          | "source_analysis_id"
          | "source_level"
          | "stage"
          | "focus"
          | "destination"
          | "prelanding_id"
          | "destination_url"
          | "destination_note"
          | "audience"
          | "objective"
          | "offer_stack"
          | "always_include"
        >,
        [Belongs<"campaign_id", "campaigns">, Belongs<"angle_id", "angles">]
      >;
      short_ads: Table<
        ShortAdRow,
        Insertable<
          ShortAdRow,
          "market_id" | "format" | "primary_text" | "headline" | "description" | "image_prompt"
        >,
        [Belongs<"adset_id", "adsets">]
      >;
      copies: Table<
        CopyRow,
        Insertable<
          CopyRow,
          | "market_id"
          | "angle_id"
          | "hook_id"
          | "app_id"
          | "adset_id"
          | "ad_number"
          | "ad_name"
          | "story_beats"
          | "beats_intensity"
          | "primary_text"
          | "headline"
          | "description"
          | "word_count"
          | "status"
          | "model"
        >
      >;
      product_images: Table<
        ProductImageRow,
        Insertable<
          ProductImageRow,
          | "market_id"
          | "app_id"
          | "pattern"
          | "storage_bucket"
          | "mime_type"
          | "size_bytes"
          | "prompt"
          | "model_id"
          | "is_primary"
          | "source"
          // Solo las llevan las creatividades generadas desde un copy.
          | "copy_id"
          | "ad_id"
          | "landing_id"
          | "shopify_url"
          | "concept"
          | "origin_label"
          | "discarded_at"
        >
      >;
      ad_creatives: Table<
        AdCreativeRow,
        Insertable<
          AdCreativeRow,
          Exclude<keyof AdCreativeRow, "user_id" | "name">
        >
      >;
      performance_records: Table<
        PerformanceRecordRow,
        Insertable<PerformanceRecordRow, "market_id" | "rating" | "note" | "roas" | "spend" | "ctr" | "cpa">
      >;
      analyses: Table<
        AnalysisRow,
        Insertable<AnalysisRow, Exclude<keyof AnalysisRow, "user_id" | "title">>
      >;
      provider_configs: Table<
        ProviderConfigRow,
        Insertable<ProviderConfigRow, Exclude<keyof ProviderConfigRow, "user_id">>
      >;
      generation_runs: Table<
        GenerationRunRow,
        Insertable<
          GenerationRunRow,
          Exclude<keyof GenerationRunRow, "user_id" | "kind">
        >
      >;
      error_log: Table<
        ErrorLogRow,
        Insertable<ErrorLogRow, Exclude<keyof ErrorLogRow, "context" | "message">>
      >;
      fx_rates: Table<FxRateRow, Insertable<FxRateRow, "created_at">>;
      landing_pages: Table<
        LandingPageRow,
        Insertable<
          LandingPageRow,
          Exclude<keyof LandingPageRow, "user_id" | "product_id" | "title" | "slug">
        >
      >;
      swipe_copies: Table<
        SwipeCopyRow,
        Insertable<SwipeCopyRow, Exclude<keyof SwipeCopyRow, "user_id" | "title" | "body">>
      >;
      landing_experiments: Table<
        LandingExperimentRow,
        Insertable<
          LandingExperimentRow,
          Exclude<keyof LandingExperimentRow, "user_id" | "product_id" | "name" | "slug">
        >
      >;
      landing_variants: Table<
        LandingVariantRow,
        Insertable<
          LandingVariantRow,
          Exclude<keyof LandingVariantRow, "experiment_id" | "landing_id">
        >
      >;
      landing_events: Table<
        LandingEventRow,
        Insertable<LandingEventRow, Exclude<keyof LandingEventRow, "user_id" | "kind">>
      >;
      background_jobs: Table<
        BackgroundJobRow,
        Insertable<
          BackgroundJobRow,
          Exclude<keyof BackgroundJobRow, "user_id" | "kind" | "label">
        >
      >;
      shop_orders: Table<
        ShopOrderRow,
        Insertable<
          ShopOrderRow,
          Exclude<
            keyof ShopOrderRow,
            "user_id" | "store_id" | "shopify_ref" | "name" | "processed_at" | "currency"
          >
        >,
        [Belongs<"store_id", "stores">]
      >;
      shop_order_items: Table<
        ShopOrderItemRow,
        Insertable<ShopOrderItemRow, Exclude<keyof ShopOrderItemRow, "order_id" | "title">>,
        [Belongs<"order_id", "shop_orders">]
      >;
      ad_accounts: Table<
        AdAccountRow,
        Insertable<
          AdAccountRow,
          Exclude<keyof AdAccountRow, "user_id" | "store_id" | "provider" | "external_id">
        >,
        [Belongs<"store_id", "stores">]
      >;
      ad_spend: Table<
        AdSpendRow,
        Insertable<AdSpendRow, Exclude<keyof AdSpendRow, "account_id" | "day">>,
        [Belongs<"account_id", "ad_accounts">]
      >;
      ad_credentials: Table<
        AdCredentialRow,
        Insertable<
          AdCredentialRow,
          Exclude<keyof AdCredentialRow, "user_id" | "store_id" | "provider">
        >,
        [Belongs<"store_id", "stores">]
      >;
      cost_cogs: Table<
        CostCogsRow,
        Insertable<CostCogsRow, Exclude<keyof CostCogsRow, "user_id" | "store_id">>,
        [Belongs<"store_id", "stores">]
      >;
      cost_shipping_zones: Table<
        CostShippingZoneRow,
        Insertable<
          CostShippingZoneRow,
          Exclude<keyof CostShippingZoneRow, "user_id" | "store_id" | "name">
        >,
        [Belongs<"store_id", "stores">]
      >;
      cost_gateway_fees: Table<
        CostGatewayFeeRow,
        Insertable<
          CostGatewayFeeRow,
          Exclude<keyof CostGatewayFeeRow, "user_id" | "store_id" | "gateway">
        >,
        [Belongs<"store_id", "stores">]
      >;

      audit_log: Table<AuditLogRow, Insertable<AuditLogRow, Exclude<keyof AuditLogRow, "user_id" | "action">>>;
      pending_email_changes: Table<PendingEmailChangeRow, Insertable<PendingEmailChangeRow>>;
      studio_projects: Table<
        StudioProjectRow,
        Insertable<StudioProjectRow, Exclude<keyof StudioProjectRow, "user_id">>
      >;
      studio_assets: Table<
        StudioAssetRow,
        Insertable<StudioAssetRow, Exclude<keyof StudioAssetRow, "user_id" | "project_id" | "kind" | "url">>,
        [Belongs<"project_id", "studio_projects">]
      >;
      adapted_images: Table<
        AdaptedImageRow,
        Insertable<AdaptedImageRow, Exclude<keyof AdaptedImageRow, "user_id" | "product_id" | "source_url">>
      >;
      theme_section_drafts: Table<
        ThemeSectionDraftRow,
        Insertable<
          ThemeSectionDraftRow,
          Exclude<
            keyof ThemeSectionDraftRow,
            "user_id" | "blueprint_id" | "page" | "kind" | "ordinal" | "section_type" | "liquid"
          >
        >,
        [Belongs<"blueprint_id", "store_blueprints">]
      >;
      video_references: Table<
        VideoReferenceRow,
        Insertable<VideoReferenceRow, Exclude<keyof VideoReferenceRow, "user_id">>
      >;
      store_blueprints: Table<
        StoreBlueprintRow,
        Insertable<StoreBlueprintRow, Exclude<keyof StoreBlueprintRow, "user_id" | "url">>
      >;
      videos: Table<
        VideoRow,
        Insertable<VideoRow, Exclude<keyof VideoRow, "user_id" | "product_id" | "title">>,
        [Belongs<"product_id", "products">]
      >;
      flows: Table<FlowRow, Insertable<FlowRow, Exclude<keyof FlowRow, "user_id">>>;
      flow_runs: Table<
        FlowRunRow,
        Insertable<FlowRunRow, Exclude<keyof FlowRunRow, "user_id" | "flow_id">>,
        [Belongs<"flow_id", "flows">]
      >;
      flow_outputs: Table<
        FlowOutputRow,
        Insertable<FlowOutputRow, Exclude<keyof FlowOutputRow, "user_id" | "run_id" | "node_id">>,
        [Belongs<"run_id", "flow_runs">]
      >;
      avatars: Table<AvatarRow, Insertable<AvatarRow, Exclude<keyof AvatarRow, "user_id" | "url">>>;
      avatar_shots: Table<
        AvatarShotRow,
        Insertable<AvatarShotRow, Exclude<keyof AvatarShotRow, "user_id" | "avatar_id" | "url">>,
        [Belongs<"avatar_id", "avatars">]
      >;
      meta_logins: Table<
        MetaLoginRow,
        Insertable<MetaLoginRow, Exclude<keyof MetaLoginRow, "user_id" | "access_token">>,
        [Belongs<"meta_app_id", "meta_apps">]
      >;
      meta_apps: Table<
        MetaAppRow,
        Insertable<MetaAppRow, Exclude<keyof MetaAppRow, "user_id" | "app_id" | "app_secret">>
      >;
      video_music: Table<
        VideoMusicRow,
        Insertable<VideoMusicRow, Exclude<keyof VideoMusicRow, "user_id" | "video_id" | "url">>,
        [Belongs<"video_id", "videos">]
      >;
      video_shots: Table<
        VideoShotRow,
        Insertable<VideoShotRow, Exclude<keyof VideoShotRow, "video_id" | "n">>,
        [Belongs<"video_id", "videos">]
      >;
      cost_custom: Table<
        CostCustomRow,
        Insertable<
          CostCustomRow,
          Exclude<keyof CostCustomRow, "user_id" | "store_id" | "name" | "starts_on" | "ends_on">
        >,
        [Belongs<"store_id", "stores">]
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      /*
       * `mando_sobre` se llama desde el código además de usarse en las
       * políticas, porque hay un sitio donde no hay RLS que ampare —la capa de
       * servicio— y allí esta pregunta es la única comprobación que queda en
       * pie. Es la misma función, así que no puede haber dos respuestas
       * distintas a la misma pregunta.
       */
      mando_sobre: { Args: { persona: string }; Returns: boolean };
    };
    Enums: {
      product_status: DbProductStatus;
      product_owner: DbProductOwner;
      store_platform: DbStorePlatform;
      awareness_level: DbAwarenessLevel;
      research_document_id: DbResearchDocumentId;
      research_document_status: DbResearchDocumentStatus;
      copy_format: DbCopyFormat;
      copy_driver: DbCopyDriver;
      copy_status: DbCopyStatus;
      funnel_stage: DbFunnelStage;
      performance_rating: DbPerformanceRating;
      performance_target: DbPerformanceTarget;
      image_source: DbImageSource;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Atajos para no escribir `Database["public"]["Tables"]["x"]["Row"]` cada vez. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
