-- ============================================================================
-- Esquema de plataforma-ia
-- ============================================================================
--
-- Decisiones que conviene tener presentes antes de aplicar esto:
--
-- 1. **Todo cuelga de `auth.users`.** Cada tabla lleva `user_id` y la política
--    RLS compara contra `auth.uid()`. No hay tabla de organizaciones: si más
--    adelante hacen falta equipos, se añade `workspace_id` y se cambian las
--    políticas, pero meterlo ahora sería complejidad sin uso.
--
-- 2. **Los identificadores dejan de ser slugs.** Hasta ahora el id del producto
--    era `nombre-hash`, que colisiona en cuanto dos usuarios dan de alta el
--    mismo producto. Aquí la clave es `uuid` y el slug pasa a ser una columna
--    informativa.
--
-- 3. **La investigación se guarda como documento, no descompuesta en tablas.**
--    Cada documento tiene su Markdown y su JSON validado. Normalizar el
--    contenido de los 6 documentos en tablas relacionales daría decenas de
--    tablas que solo se leen enteras y siempre juntas, y cada cambio en el
--    esquema del informe obligaría a una migración. El JSON se valida en la
--    aplicación contra los tipos de `types/research.ts`.
--
-- 4. **Las imágenes guardan la ruta de Storage, no el binario.** En Postgres
--    solo vive `storage_path`; el archivo está en un bucket privado y se sirve
--    con URL firmada.
--
-- 5. **Las claves de API van en su propia tabla, sin política de SELECT para
--    nadie.** Ver el comentario extenso en `provider_configs` más abajo.
--
-- 6. **`on delete cascade` en todas partes.** Borrar un producto tiene que
--    llevarse su investigación, sus copys y sus anuncios; dejar huérfanos que
--    nadie puede ver ni borrar es peor que perder el dato.

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

-- `search_path` fijado a vacío: si no, un esquema malicioso en el path podría
-- suplantar a `now()` dentro de una función `security definer`.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------------

create type public.product_status as enum ('active', 'draft');
create type public.product_owner as enum ('own', 'competitor');
create type public.store_platform as enum ('shopify', 'woocommerce', 'otra');

create type public.awareness_level as enum (
  'unaware', 'problem-aware', 'solution-aware', 'product-aware', 'most-aware'
);

create type public.research_document_id as enum (
  'awareness', 'competitors', 'avatars', 'master', 'desire-extraction', 'desire-validation'
);

create type public.research_document_status as enum (
  'empty', 'queued', 'generating', 'ready', 'error'
);

create type public.copy_format as enum ('long-copy', 'advertorial', 'short-ad');
create type public.copy_driver as enum ('desire', 'angle');
create type public.copy_status as enum ('draft', 'approved', 'used');

create type public.funnel_stage as enum ('TOFU', 'MOFU', 'BOFU');

create type public.performance_rating as enum (
  'ganador', 'prometedor', 'perdedor', 'sin-probar'
);
create type public.performance_target as enum ('copy', 'short-ad', 'imagen');

create type public.image_source as enum ('subida', 'generada');

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- El perfil se crea con el usuario. Es `security definer` a propósito: se
-- ejecuta desde el trigger de `auth.users`, donde el usuario todavía no tiene
-- sesión y por tanto no pasaría su propia política RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Tiendas y mercados
-- ---------------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand text not null default '',
  domain text not null default '',
  platform public.store_platform not null default 'otra',
  -- Si el cuerpo del texto puede nombrar la marca. El enlace siempre lleva al
  -- dominio, esto solo afecta al copy.
  mention_brand_in_copy boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stores_user_id_idx on public.stores (user_id);

create trigger stores_touch
  before update on public.stores
  for each row execute function public.touch_updated_at();

create table public.store_markets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  country_code text not null check (char_length(country_code) between 2 and 3),
  country_name text not null,
  language_code text not null check (char_length(language_code) between 2 and 5),
  language_name text not null,
  currency text not null check (char_length(currency) = 3),
  -- Dominio propio del mercado. Vacío significa "usa el de la tienda".
  domain text not null default '',
  -- Prefijo de ruta con barra inicial y sin barra final: `/es-mx`.
  path_prefix text not null default '',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  -- Un país e idioma no pueden repetirse dentro de la misma tienda: serían dos
  -- mercados indistinguibles y los productos no sabrían a cuál pertenecen.
  unique (store_id, country_code, language_code)
);

create index store_markets_store_id_idx on public.store_markets (store_id);
create index store_markets_user_id_idx on public.store_markets (user_id);

-- Solo un mercado principal por tienda.
create unique index store_markets_one_primary_idx
  on public.store_markets (store_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- `set null` y no `cascade`: borrar una tienda no debe llevarse los productos
  -- con toda su investigación detrás. Quedan sin asignar y se reubican.
  store_id uuid references public.stores (id) on delete set null,
  market_id uuid references public.store_markets (id) on delete set null,
  -- De qué producto se duplicó, si viene de uno.
  duplicated_from_id uuid references public.products (id) on delete set null,

  name text not null check (char_length(name) between 1 and 300),
  slug text not null default '',
  brand text not null default '',
  category text not null default '',
  description text not null default '',
  target_audience text not null default '',
  country text not null default '',
  language text not null default '',
  price numeric(12, 2) not null default 0 check (price >= 0),
  landing_url text not null default '',
  -- Identificador de la ficha en la tienda, para reconstruir la URL por mercado.
  handle text not null default '',
  tone text not null default '',
  status public.product_status not null default 'draft',
  owner public.product_owner not null default 'own',

  -- Listas cortas y siempre leídas enteras: no merecen tabla propia.
  benefits text[] not null default '{}',
  features text[] not null default '{}',
  ingredients text[] not null default '{}',
  problems_solved text[] not null default '{}',
  objections text[] not null default '{}',

  -- Entradas que exigen los prompts de investigación.
  niche text not null default '',
  competitor_urls text[] not null default '{}',
  amazon_url text not null default '',
  target_age_range text not null default '',
  target_genders text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_user_id_idx on public.products (user_id);
create index products_store_id_idx on public.products (store_id);
create index products_market_id_idx on public.products (market_id);
create index products_owner_idx on public.products (user_id, owner);

create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Ofertas: packs, cantidades y suscripción
-- ---------------------------------------------------------------------------
--
-- Un producto de respuesta directa no se vende a un solo precio. Con Kaching
-- Bundles y similares hay una escalera de packs donde el precio unitario baja
-- con la cantidad, a veces con regalo a partir de cierto nivel, y en paralelo
-- una suscripción con su descuento. El copy vende la oferta, no el producto,
-- así que esto es información de primera clase y no una nota suelta.

create table public.product_offers (
  product_id uuid primary key references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_enabled boolean not null default false,
  subscription_discount_percent numeric(5, 2) not null default 0
    check (subscription_discount_percent between 0 and 100),
  subscription_frequency text not null default '',
  subscription_perks text[] not null default '{}',
  subscription_cancellation_policy text not null default '',
  guarantee text not null default '',
  free_shipping_threshold numeric(12, 2),
  -- 'importada' cuando salió de leer la ficha de la tienda, 'manual' cuando la
  -- escribió una persona. Sirve para saber si conviene revisarla.
  source text not null default 'manual' check (source in ('manual', 'importada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_offers_user_id_idx on public.product_offers (user_id);

create trigger product_offers_touch
  before update on public.product_offers
  for each row execute function public.touch_updated_at();

create table public.offer_tiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null,
  quantity integer not null default 1 check (quantity > 0),
  total_price numeric(12, 2) not null check (total_price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price >= 0),
  free_shipping boolean not null default false,
  gifts text[] not null default '{}',
  is_highlighted boolean not null default false,
  note text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index offer_tiers_product_id_idx on public.offer_tiers (product_id, position);
create index offer_tiers_user_id_idx on public.offer_tiers (user_id);

-- La tienda destaca un pack recomendado, y solo uno.
create unique index offer_tiers_one_highlighted_idx
  on public.offer_tiers (product_id)
  where is_highlighted;

-- ---------------------------------------------------------------------------
-- Notas manuales para la IA
-- ---------------------------------------------------------------------------
--
-- Cosas que sabe el operador y no están en ninguna investigación: una
-- restricción legal del país, una promesa que no se puede hacer, un detalle de
-- fabricación, lo que dijo el proveedor. Se inyectan en los prompts tal cual.

create table public.product_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  title text not null default '',
  body text not null check (char_length(body) between 1 and 20000),
  -- Si esta nota viaja dentro de los prompts. Permite guardar apuntes internos
  -- sin que acaben condicionando lo que escribe el modelo.
  include_in_prompts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_notes_product_id_idx on public.product_notes (product_id);
create index product_notes_user_id_idx on public.product_notes (user_id);

create trigger product_notes_touch
  before update on public.product_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Investigación
-- ---------------------------------------------------------------------------

create table public.research_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  document_id public.research_document_id not null,
  status public.research_document_status not null default 'empty',
  -- El informe que lee una persona.
  markdown text not null default '',
  -- El JSON que alimenta el panel. Se valida en la aplicación contra los tipos.
  data jsonb,
  error text not null default '',
  generated_at timestamptz,
  -- Modelo y coste, para saber qué se gastó en cada documento.
  model text not null default '',
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, document_id)
);

create index research_documents_product_id_idx on public.research_documents (product_id);
create index research_documents_user_id_idx on public.research_documents (user_id);

create trigger research_documents_touch
  before update on public.research_documents
  for each row execute function public.touch_updated_at();

create table public.hooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  awareness_level public.awareness_level not null,
  desire text not null default '',
  text text not null,
  used boolean not null default false,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index hooks_product_id_idx on public.hooks (product_id);
create index hooks_user_id_idx on public.hooks (user_id);

-- ---------------------------------------------------------------------------
-- Ángulos y copys
-- ---------------------------------------------------------------------------

create table public.angles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  desire text not null default '',
  name text not null,
  target_audience text not null default '',
  -- El arco narrativo se lee siempre entero y solo tiene cuatro campos fijos.
  story_start text not null default '',
  story_crisis text not null default '',
  story_discovery text not null default '',
  story_resolution text not null default '',
  -- UMP y UMS: el tejido conectivo entre investigación y copy.
  problem_mechanism text not null default '',
  solution_mechanism text not null default '',
  emotional_moment text not null default '',
  created_at timestamptz not null default now()
);

create index angles_product_id_idx on public.angles (product_id);
create index angles_user_id_idx on public.angles (user_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  stage public.funnel_stage not null default 'TOFU',
  country_code text not null default '',
  theme text not null default '',
  created_at timestamptz not null default now()
);

create index campaigns_product_id_idx on public.campaigns (product_id);
create index campaigns_user_id_idx on public.campaigns (user_id);

create table public.prelandings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  url text not null default '',
  angle text not null default '',
  created_at timestamptz not null default now()
);

create index prelandings_product_id_idx on public.prelandings (product_id);
create index prelandings_user_id_idx on public.prelandings (user_id);

create table public.adsets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  angle_id uuid references public.angles (id) on delete set null,
  name text not null,
  -- Correlativo global por producto, no por campaña: en `short.md` el conjunto
  -- 13 contenía los anuncios 36 a 40.
  number integer not null,
  stage public.funnel_stage not null default 'TOFU',
  destination text not null default 'producto',
  prelanding_id uuid references public.prelandings (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (product_id, number)
);

create index adsets_campaign_id_idx on public.adsets (campaign_id);
create index adsets_user_id_idx on public.adsets (user_id);

create table public.short_ads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  adset_id uuid not null references public.adsets (id) on delete cascade,
  name text not null,
  number integer not null,
  format text not null default '',
  primary_text text not null default '',
  headline text not null default '',
  description text not null default '',
  visual_brief text not null default '',
  created_at timestamptz not null default now(),
  unique (product_id, number)
);

create index short_ads_adset_id_idx on public.short_ads (adset_id);
create index short_ads_user_id_idx on public.short_ads (user_id);

create table public.copies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  angle_id uuid references public.angles (id) on delete set null,
  hook_id uuid references public.hooks (id) on delete set null,
  -- Un long copy es un anuncio de Meta como cualquier otro: su cuerpo va en el
  -- texto principal, así que entra en la misma jerarquía que los cortos.
  adset_id uuid references public.adsets (id) on delete set null,
  ad_number integer,
  ad_name text not null default '',

  format public.copy_format not null,
  method_id text not null,
  driver public.copy_driver not null,
  driver_label text not null default '',
  awareness_level public.awareness_level not null,

  primary_text text not null default '',
  headline text not null default '',
  description text not null default '',
  word_count integer not null default 0,
  status public.copy_status not null default 'draft',

  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index copies_product_id_idx on public.copies (product_id);
create index copies_adset_id_idx on public.copies (adset_id);
create index copies_user_id_idx on public.copies (user_id);

create trigger copies_touch
  before update on public.copies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Imágenes
-- ---------------------------------------------------------------------------

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  -- Patrón de `PRODUCT_IMAGE_PATTERNS`, o 'subida'.
  pattern text not null default 'subida',
  -- Nombre legible que se cita en el anuncio, para localizar el archivo luego.
  name text not null,
  -- Ruta dentro del bucket privado. El binario nunca vive en Postgres.
  storage_path text not null,
  storage_bucket text not null default 'product-images',
  mime_type text not null default '',
  size_bytes bigint,
  prompt text not null default '',
  model_id text not null default '',
  is_primary boolean not null default false,
  source public.image_source not null default 'subida',
  created_at timestamptz not null default now()
);

create index product_images_product_id_idx on public.product_images (product_id);
create index product_images_user_id_idx on public.product_images (user_id);

-- Una sola imagen principal por producto: es la que viaja como referencia a
-- Higgsfield, y dos referencias distintas darían resultados incoherentes.
create unique index product_images_one_primary_idx
  on public.product_images (product_id)
  where is_primary;

-- Biblioteca de anuncios: creatividades propias y de la competencia.
create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  brand text not null default '',
  kind public.product_owner not null default 'own',
  platform text not null default '',
  country text not null default '',
  tags text[] not null default '{}',
  status text not null default 'pending',
  storage_path text not null default '',
  storage_bucket text not null default 'ad-creatives',
  created_at timestamptz not null default now()
);

create index ad_creatives_user_id_idx on public.ad_creatives (user_id);
create index ad_creatives_product_id_idx on public.ad_creatives (product_id);

-- ---------------------------------------------------------------------------
-- Rendimiento
-- ---------------------------------------------------------------------------
--
-- Lo que marca el operador como ganador o perdedor. Es lo que permite que la
-- plataforma aprenda qué ángulos funcionan y proponga ideas nuevas.

create table public.performance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  target_type public.performance_target not null,
  -- Id de la pieza valorada. No lleva clave foránea porque apunta a tres tablas
  -- distintas según `target_type`; la integridad se cubre con el borrado en
  -- cascada del producto.
  target_id uuid not null,
  rating public.performance_rating not null default 'sin-probar',
  note text not null default '',
  roas numeric(10, 2),
  spend numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, target_type, target_id)
);

create index performance_records_product_id_idx on public.performance_records (product_id);
create index performance_records_user_id_idx on public.performance_records (user_id);

create trigger performance_records_touch
  before update on public.performance_records
  for each row execute function public.touch_updated_at();

-- Historial de análisis y generaciones.
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  title text not null,
  kind text not null default 'analysis',
  status text not null default 'draft',
  summary text not null default '',
  payload jsonb,
  created_at timestamptz not null default now()
);

create index analyses_user_id_idx on public.analyses (user_id);

-- ---------------------------------------------------------------------------
-- Claves de proveedores
-- ---------------------------------------------------------------------------
--
-- DECISIÓN IMPORTANTE, y la que más conviene revisar de todo este archivo.
--
-- Esta tabla guarda las claves de Anthropic y de Higgsfield del usuario. Aunque
-- RLS impide que un usuario lea las de otro, la `service_role` key y quien
-- tenga acceso al panel de Supabase pueden leerlas en claro.
--
-- Aquí se guardan **sin política de SELECT para el rol `authenticated`**: el
-- navegador no puede leerlas nunca, ni siquiera las propias. Solo se leen desde
-- el servidor con la `service_role`, que jamás llega al cliente, y la interfaz
-- únicamente recibe booleanos de "configurada / no configurada".
--
-- Si más adelante esto va a manejar claves de terceros en serio, la forma
-- correcta es Supabase Vault (`vault.create_secret`), que las cifra en reposo y
-- deja aquí solo el identificador del secreto. Se ha dejado preparado el hueco.
create table public.provider_configs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Identificadores de secretos de Vault, cuando se migre a Vault.
  anthropic_secret_id uuid,
  higgsfield_secret_id uuid,
  -- Almacenamiento directo mientras no se use Vault.
  anthropic_api_key text,
  higgsfield_key_id text,
  higgsfield_key_secret text,
  claude_model text not null default 'claude-opus-5',
  claude_copy_model text not null default 'claude-sonnet-5',
  -- Interruptor general: con esto en falso no se llama a ninguna API aunque
  -- haya claves guardadas.
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger provider_configs_touch
  before update on public.provider_configs
  for each row execute function public.touch_updated_at();
