-- El espacio se rellena solo al crear.
--
-- La fase 3 hizo que escribir exija pertenecer al espacio de la fila, pero la
-- aplicación nunca ha escrito `workspace_id`: escribe `user_id`, como toda la
-- vida. Así que cada `insert` llegaba con el espacio vacío y la comprobación lo
-- rechazaba. Crear un producto fallaba, y con él todo lo demás.
--
-- Se arregla en la base y no en las 49 llamadas del código, por dos motivos:
-- son 49 sitios donde olvidarse, y el que se olvide no dará un error claro —
-- dará «no se pudo crear» sin decir por qué.
--
-- Solo rellena cuando viene vacío. Si alguien manda un espacio a propósito, se
-- respeta; y si manda uno que no es suyo, la comprobación de la política lo
-- rechaza igual. Esto no concede nada: solo pone lo que faltaba.
create or replace function public.poner_espacio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is null then
    select m.workspace_id into new.workspace_id
    from public.workspace_members m
    where m.user_id = (select auth.uid())
    order by m.created_at
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists poner_espacio on public.stores;
create trigger poner_espacio before insert on public.stores
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.store_markets;
create trigger poner_espacio before insert on public.store_markets
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.products;
create trigger poner_espacio before insert on public.products
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.product_offers;
create trigger poner_espacio before insert on public.product_offers
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.offer_tiers;
create trigger poner_espacio before insert on public.offer_tiers
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.product_notes;
create trigger poner_espacio before insert on public.product_notes
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.research_documents;
create trigger poner_espacio before insert on public.research_documents
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.hooks;
create trigger poner_espacio before insert on public.hooks
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.angles;
create trigger poner_espacio before insert on public.angles
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.campaigns;
create trigger poner_espacio before insert on public.campaigns
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.prelandings;
create trigger poner_espacio before insert on public.prelandings
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.adsets;
create trigger poner_espacio before insert on public.adsets
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.short_ads;
create trigger poner_espacio before insert on public.short_ads
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.copies;
create trigger poner_espacio before insert on public.copies
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.product_images;
create trigger poner_espacio before insert on public.product_images
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.ad_creatives;
create trigger poner_espacio before insert on public.ad_creatives
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.performance_records;
create trigger poner_espacio before insert on public.performance_records
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.analyses;
create trigger poner_espacio before insert on public.analyses
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.provider_configs;
create trigger poner_espacio before insert on public.provider_configs
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.generation_runs;
create trigger poner_espacio before insert on public.generation_runs
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.background_jobs;
create trigger poner_espacio before insert on public.background_jobs
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.error_log;
create trigger poner_espacio before insert on public.error_log
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.landing_pages;
create trigger poner_espacio before insert on public.landing_pages
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.swipe_copies;
create trigger poner_espacio before insert on public.swipe_copies
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.landing_experiments;
create trigger poner_espacio before insert on public.landing_experiments
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.landing_events;
create trigger poner_espacio before insert on public.landing_events
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.shop_orders;
create trigger poner_espacio before insert on public.shop_orders
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.ad_accounts;
create trigger poner_espacio before insert on public.ad_accounts
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.ad_credentials;
create trigger poner_espacio before insert on public.ad_credentials
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.cost_cogs;
create trigger poner_espacio before insert on public.cost_cogs
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.cost_shipping_zones;
create trigger poner_espacio before insert on public.cost_shipping_zones
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.cost_gateway_fees;
create trigger poner_espacio before insert on public.cost_gateway_fees
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.cost_custom;
create trigger poner_espacio before insert on public.cost_custom
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.videos;
create trigger poner_espacio before insert on public.videos
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.store_blueprints;
create trigger poner_espacio before insert on public.store_blueprints
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.video_references;
create trigger poner_espacio before insert on public.video_references
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.theme_section_drafts;
create trigger poner_espacio before insert on public.theme_section_drafts
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.adapted_images;
create trigger poner_espacio before insert on public.adapted_images
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.audit_log;
create trigger poner_espacio before insert on public.audit_log
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.studio_projects;
create trigger poner_espacio before insert on public.studio_projects
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.studio_assets;
create trigger poner_espacio before insert on public.studio_assets
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.video_music;
create trigger poner_espacio before insert on public.video_music
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.meta_apps;
create trigger poner_espacio before insert on public.meta_apps
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.meta_logins;
create trigger poner_espacio before insert on public.meta_logins
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.avatars;
create trigger poner_espacio before insert on public.avatars
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.avatar_shots;
create trigger poner_espacio before insert on public.avatar_shots
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.flows;
create trigger poner_espacio before insert on public.flows
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.flow_runs;
create trigger poner_espacio before insert on public.flow_runs
  for each row execute function public.poner_espacio();

drop trigger if exists poner_espacio on public.flow_outputs;
create trigger poner_espacio before insert on public.flow_outputs
  for each row execute function public.poner_espacio();
