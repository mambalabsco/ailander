-- ============================================================================
-- Alineación del esquema con los tipos de la aplicación
-- ============================================================================
--
-- Al conectar el resto de módulos aparecieron campos que los tipos de
-- `src/types/` tienen y las tablas no. Se añaden aquí en vez de meterlos en un
-- `jsonb` de descarte: son datos que se consultan y se filtran, y esconderlos
-- en un blob es la forma de que dentro de tres meses nadie sepa qué hay dentro.
--
-- Hay tres renombrados. Las tablas están vacías —el proyecto se acaba de
-- crear—, así que no hay migración de datos que hacer; si hubiera filas, un
-- `alter ... rename` las conserva igual.

-- ---------------------------------------------------------------------------
-- Ganchos
-- ---------------------------------------------------------------------------
--
-- `ProductHook` es un título y un cuerpo, no una cadena suelta, y lleva el
-- ángulo, el formato y el identificador de la tanda en la que se generó. Ese
-- último es lo que permite decir «estos diez salieron juntos».

alter table public.hooks rename column text to body;

alter table public.hooks
  add column if not exists title text not null default '',
  add column if not exists angle text not null default '',
  add column if not exists format text not null default '',
  add column if not exists batch_id text not null default '';

create index if not exists hooks_batch_idx on public.hooks (product_id, batch_id);

-- ---------------------------------------------------------------------------
-- Campañas y conjuntos
-- ---------------------------------------------------------------------------

alter table public.campaigns
  add column if not exists focus text not null default '';

-- El conjunto de anuncios es donde vive la estrategia: a quién, con qué
-- objetivo, con qué escalera de precios y qué no puede faltar en el copy.
alter table public.adsets
  add column if not exists focus text not null default '',
  add column if not exists audience text not null default '',
  add column if not exists objective text not null default '',
  add column if not exists offer_stack text[] not null default '{}',
  add column if not exists always_include text[] not null default '{}';

-- El destino no es solo un tipo: puede llevar una URL propia, o una nota de a
-- qué prelanding debería ir cuando todavía no está creada.
alter table public.adsets
  add column if not exists destination_url text not null default '',
  add column if not exists destination_note text not null default '';

alter table public.adsets
  add constraint adsets_destination_check
  check (destination in ('producto', 'prelanding', 'prelanding-pendiente'));

-- ---------------------------------------------------------------------------
-- Anuncios cortos
-- ---------------------------------------------------------------------------
--
-- `visual_brief` prometía menos de lo que guarda: es el prompt de imagen listo
-- para Higgsfield, no un resumen.

alter table public.short_ads rename column visual_brief to image_prompt;

-- ---------------------------------------------------------------------------
-- Prelandings
-- ---------------------------------------------------------------------------

alter table public.prelandings rename column angle to description;

-- ---------------------------------------------------------------------------
-- Rendimiento
-- ---------------------------------------------------------------------------
--
-- Faltaban dos de las cuatro métricas. Sin CTR no se puede distinguir un
-- anuncio que nadie clica de uno que se clica y no convierte, que son dos
-- problemas distintos y con arreglos distintos.

alter table public.performance_records
  add column if not exists ctr numeric(6, 3),
  add column if not exists cpa numeric(12, 2);

-- ---------------------------------------------------------------------------
-- Configuración de proveedores
-- ---------------------------------------------------------------------------

alter table public.provider_configs
  add column if not exists active_provider text not null default 'claude',
  add column if not exists chatgpt_api_key text,
  add column if not exists chatgpt_model text not null default '';

alter table public.provider_configs
  add constraint provider_configs_active_check
  check (active_provider in ('claude', 'chatgpt'));
