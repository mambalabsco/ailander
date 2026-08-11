-- Espacio de trabajo compartido — FASE 1: las tablas y la columna.
--
-- **Esta migración no cambia lo que ve nadie.** Crea el espacio, la lista de
-- miembros y una columna `workspace_id` en las 49 tablas de datos, y la rellena.
-- Las políticas siguen filtrando por `auth.uid()`, así que el comportamiento es
-- exactamente el de antes.
--
-- Va sola a propósito. El plan (`docs/equipo-compartido.md`) tiene cuatro fases
-- y la tercera —cambiar las políticas— no se puede hacer a medias: con la mitad
-- de las tablas migradas, un producto se ve y sus copys no. Separándolas, esta
-- se puede aplicar hoy sin riesgo y la siguiente se hace con calma.
--
-- Las seis tablas que no llevan columna cuelgan de otra que sí: `video_shots`
-- de `videos`, `shop_order_items` de `shop_orders`, `landing_variants` de
-- `landing_experiments`, `ad_spend` de `ad_accounts`. `profiles` es la persona y
-- `fx_rates` son tipos de cambio, iguales para todo el mundo.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Quién lo creó. No es lo mismo que quién manda hoy: eso vive en la lista de
  -- miembros y puede cambiar. Esto es historia y no se toca.
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- El papel decide las capacidades; las excepciones por persona van en
  -- `capabilities`, que cuando es nulo significa «las de su papel».
  role text not null default 'editor',
  capabilities text[],
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user on public.workspace_members (user_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Un espacio se ve si eres miembro. Nada más por ahora: invitar y cambiar
-- papeles llega en la fase 4, con su pantalla.
-- `create policy` no admite `if not exists`, y estas migraciones se aplican en
-- cada despliegue: sin el guardia, la segunda vez aborta y con ella todo lo que
-- viene detrás.
drop policy if exists "miembros ven su espacio" on public.workspaces;
create policy "miembros ven su espacio" on public.workspaces
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspaces.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "cada uno ve su pertenencia" on public.workspace_members;
create policy "cada uno ve su pertenencia" on public.workspace_members
  for select using (user_id = auth.uid());

-- Un espacio por persona que ya usa la plataforma, con ella dentro.
-- Nadie pierde nada ni ve nada nuevo: cada quien sigue solo en el suyo.
insert into public.workspaces (id, name, created_by)
select gen_random_uuid(), 'Mi espacio', p.id
from public.profiles p
where not exists (
  select 1 from public.workspace_members m where m.user_id = p.id
);

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.created_by, 'dueño'
from public.workspaces w
where not exists (
  select 1 from public.workspace_members m
  where m.workspace_id = w.id and m.user_id = w.created_by
)
on conflict do nothing;

-- La columna, y el relleno de lo que ya hay.
--
-- Se rellena desde `user_id` en la misma migración: una fila sin espacio no la
-- ve nadie cuando las políticas cambien en la fase 3 — se pierde sin borrarse,
-- que es la peor forma de perder algo.


alter table public.stores add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.stores t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists stores_workspace on public.stores (workspace_id);

alter table public.store_markets add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.store_markets t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists store_markets_workspace on public.store_markets (workspace_id);

alter table public.products add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.products t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists products_workspace on public.products (workspace_id);

alter table public.product_offers add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.product_offers t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists product_offers_workspace on public.product_offers (workspace_id);

alter table public.offer_tiers add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.offer_tiers t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists offer_tiers_workspace on public.offer_tiers (workspace_id);

alter table public.product_notes add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.product_notes t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists product_notes_workspace on public.product_notes (workspace_id);

alter table public.research_documents add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.research_documents t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists research_documents_workspace on public.research_documents (workspace_id);

alter table public.hooks add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.hooks t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists hooks_workspace on public.hooks (workspace_id);

alter table public.angles add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.angles t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists angles_workspace on public.angles (workspace_id);

alter table public.campaigns add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.campaigns t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists campaigns_workspace on public.campaigns (workspace_id);

alter table public.prelandings add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.prelandings t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists prelandings_workspace on public.prelandings (workspace_id);

alter table public.adsets add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.adsets t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists adsets_workspace on public.adsets (workspace_id);

alter table public.short_ads add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.short_ads t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists short_ads_workspace on public.short_ads (workspace_id);

alter table public.copies add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.copies t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists copies_workspace on public.copies (workspace_id);

alter table public.product_images add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.product_images t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists product_images_workspace on public.product_images (workspace_id);

alter table public.ad_creatives add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.ad_creatives t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists ad_creatives_workspace on public.ad_creatives (workspace_id);

alter table public.performance_records add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.performance_records t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists performance_records_workspace on public.performance_records (workspace_id);

alter table public.analyses add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.analyses t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists analyses_workspace on public.analyses (workspace_id);

alter table public.provider_configs add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.provider_configs t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists provider_configs_workspace on public.provider_configs (workspace_id);

alter table public.generation_runs add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.generation_runs t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists generation_runs_workspace on public.generation_runs (workspace_id);

alter table public.background_jobs add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.background_jobs t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists background_jobs_workspace on public.background_jobs (workspace_id);

alter table public.error_log add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.error_log t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists error_log_workspace on public.error_log (workspace_id);

alter table public.landing_pages add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.landing_pages t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists landing_pages_workspace on public.landing_pages (workspace_id);

alter table public.swipe_copies add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.swipe_copies t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists swipe_copies_workspace on public.swipe_copies (workspace_id);

alter table public.landing_experiments add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.landing_experiments t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists landing_experiments_workspace on public.landing_experiments (workspace_id);

alter table public.landing_events add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.landing_events t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists landing_events_workspace on public.landing_events (workspace_id);

alter table public.shop_orders add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.shop_orders t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists shop_orders_workspace on public.shop_orders (workspace_id);

alter table public.ad_accounts add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.ad_accounts t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists ad_accounts_workspace on public.ad_accounts (workspace_id);

alter table public.ad_credentials add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.ad_credentials t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists ad_credentials_workspace on public.ad_credentials (workspace_id);

alter table public.cost_cogs add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.cost_cogs t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists cost_cogs_workspace on public.cost_cogs (workspace_id);

alter table public.cost_shipping_zones add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.cost_shipping_zones t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists cost_shipping_zones_workspace on public.cost_shipping_zones (workspace_id);

alter table public.cost_gateway_fees add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.cost_gateway_fees t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists cost_gateway_fees_workspace on public.cost_gateway_fees (workspace_id);

alter table public.cost_custom add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.cost_custom t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists cost_custom_workspace on public.cost_custom (workspace_id);

alter table public.videos add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.videos t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists videos_workspace on public.videos (workspace_id);

alter table public.store_blueprints add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.store_blueprints t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists store_blueprints_workspace on public.store_blueprints (workspace_id);

alter table public.video_references add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.video_references t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists video_references_workspace on public.video_references (workspace_id);

alter table public.theme_section_drafts add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.theme_section_drafts t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists theme_section_drafts_workspace on public.theme_section_drafts (workspace_id);

alter table public.adapted_images add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.adapted_images t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists adapted_images_workspace on public.adapted_images (workspace_id);

alter table public.audit_log add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.audit_log t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists audit_log_workspace on public.audit_log (workspace_id);

alter table public.studio_projects add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.studio_projects t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists studio_projects_workspace on public.studio_projects (workspace_id);

alter table public.studio_assets add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.studio_assets t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists studio_assets_workspace on public.studio_assets (workspace_id);

alter table public.video_music add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.video_music t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists video_music_workspace on public.video_music (workspace_id);

alter table public.meta_apps add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.meta_apps t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists meta_apps_workspace on public.meta_apps (workspace_id);

alter table public.meta_logins add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.meta_logins t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists meta_logins_workspace on public.meta_logins (workspace_id);

alter table public.avatars add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.avatars t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists avatars_workspace on public.avatars (workspace_id);

alter table public.avatar_shots add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.avatar_shots t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists avatar_shots_workspace on public.avatar_shots (workspace_id);

alter table public.flows add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.flows t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists flows_workspace on public.flows (workspace_id);

alter table public.flow_runs add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.flow_runs t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists flow_runs_workspace on public.flow_runs (workspace_id);

alter table public.flow_outputs add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.flow_outputs t
set workspace_id = m.workspace_id
from public.workspace_members m
where t.user_id = m.user_id and t.workspace_id is null;

create index if not exists flow_outputs_workspace on public.flow_outputs (workspace_id);
