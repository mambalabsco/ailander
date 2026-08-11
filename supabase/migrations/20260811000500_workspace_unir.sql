-- Todos los que ya estaban, al mismo espacio.
--
-- **Esto junta datos que hasta ahora estaban separados por persona.** A partir
-- de aquí, todo el que ya tenía cuenta ve lo de todos los demás. Es lo que se
-- pidió —«que ya tiene datos, pasan todos a todo»— y es **irreversible**: la
-- columna anterior no se guarda en ningún sitio.
--
-- Si hay alguna cuenta que no deba ver el resto, esta migración no es lo que
-- quieres: sácala del espacio después, o no la apliques.
--
-- Solo afecta a quien existía al aplicarla. Quien se registre luego recibe su
-- propio espacio, como dice `20260811000400`.

do $$
declare
  comun uuid;
begin
  -- El más antiguo manda, para que aplicarla dos veces no cambie el resultado.
  select id into comun from public.workspaces order by created_at, id limit 1;

  if comun is null then
    return;
  end if;

  update public.workspaces set name = 'Equipo' where id = comun;

  -- Todo el mundo dentro, conservando el papel que tuviera. El creador del
  -- espacio común se queda de dueño; los demás entran como editores, que es
  -- quien saca el trabajo adelante sin ver claves ni márgenes.
  insert into public.workspace_members (workspace_id, user_id, role)
  select comun, p.id, case when p.id = (select created_by from public.workspaces where id = comun)
                           then 'dueño' else 'editor' end
  from public.profiles p
  on conflict (workspace_id, user_id) do nothing;

  update public.stores set workspace_id = comun where workspace_id is distinct from comun;
  update public.store_markets set workspace_id = comun where workspace_id is distinct from comun;
  update public.products set workspace_id = comun where workspace_id is distinct from comun;
  update public.product_offers set workspace_id = comun where workspace_id is distinct from comun;
  update public.offer_tiers set workspace_id = comun where workspace_id is distinct from comun;
  update public.product_notes set workspace_id = comun where workspace_id is distinct from comun;
  update public.research_documents set workspace_id = comun where workspace_id is distinct from comun;
  update public.hooks set workspace_id = comun where workspace_id is distinct from comun;
  update public.angles set workspace_id = comun where workspace_id is distinct from comun;
  update public.campaigns set workspace_id = comun where workspace_id is distinct from comun;
  update public.prelandings set workspace_id = comun where workspace_id is distinct from comun;
  update public.adsets set workspace_id = comun where workspace_id is distinct from comun;
  update public.short_ads set workspace_id = comun where workspace_id is distinct from comun;
  update public.copies set workspace_id = comun where workspace_id is distinct from comun;
  update public.product_images set workspace_id = comun where workspace_id is distinct from comun;
  update public.ad_creatives set workspace_id = comun where workspace_id is distinct from comun;
  update public.performance_records set workspace_id = comun where workspace_id is distinct from comun;
  update public.analyses set workspace_id = comun where workspace_id is distinct from comun;
  update public.provider_configs set workspace_id = comun where workspace_id is distinct from comun;
  update public.generation_runs set workspace_id = comun where workspace_id is distinct from comun;
  update public.background_jobs set workspace_id = comun where workspace_id is distinct from comun;
  update public.error_log set workspace_id = comun where workspace_id is distinct from comun;
  update public.landing_pages set workspace_id = comun where workspace_id is distinct from comun;
  update public.swipe_copies set workspace_id = comun where workspace_id is distinct from comun;
  update public.landing_experiments set workspace_id = comun where workspace_id is distinct from comun;
  update public.landing_events set workspace_id = comun where workspace_id is distinct from comun;
  update public.shop_orders set workspace_id = comun where workspace_id is distinct from comun;
  update public.ad_accounts set workspace_id = comun where workspace_id is distinct from comun;
  update public.ad_credentials set workspace_id = comun where workspace_id is distinct from comun;
  update public.cost_cogs set workspace_id = comun where workspace_id is distinct from comun;
  update public.cost_shipping_zones set workspace_id = comun where workspace_id is distinct from comun;
  update public.cost_gateway_fees set workspace_id = comun where workspace_id is distinct from comun;
  update public.cost_custom set workspace_id = comun where workspace_id is distinct from comun;
  update public.videos set workspace_id = comun where workspace_id is distinct from comun;
  update public.store_blueprints set workspace_id = comun where workspace_id is distinct from comun;
  update public.video_references set workspace_id = comun where workspace_id is distinct from comun;
  update public.theme_section_drafts set workspace_id = comun where workspace_id is distinct from comun;
  update public.adapted_images set workspace_id = comun where workspace_id is distinct from comun;
  update public.audit_log set workspace_id = comun where workspace_id is distinct from comun;
  update public.studio_projects set workspace_id = comun where workspace_id is distinct from comun;
  update public.studio_assets set workspace_id = comun where workspace_id is distinct from comun;
  update public.video_music set workspace_id = comun where workspace_id is distinct from comun;
  update public.meta_apps set workspace_id = comun where workspace_id is distinct from comun;
  update public.meta_logins set workspace_id = comun where workspace_id is distinct from comun;
  update public.avatars set workspace_id = comun where workspace_id is distinct from comun;
  update public.avatar_shots set workspace_id = comun where workspace_id is distinct from comun;
  update public.flows set workspace_id = comun where workspace_id is distinct from comun;
  update public.flow_runs set workspace_id = comun where workspace_id is distinct from comun;
  update public.flow_outputs set workspace_id = comun where workspace_id is distinct from comun;

  -- Y fuera los espacios que se quedan sin nada, para que el selector de la
  -- pantalla no acabe lleno de «Mi espacio» vacíos.
  delete from public.workspace_members where workspace_id <> comun;
  delete from public.workspaces where id <> comun;
end $$;
