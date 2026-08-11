-- Espacio compartido — FASE 3: las políticas pasan a filtrar por equipo.
--
-- **Esta migración cambia quién ve qué.** Hasta aquí cada persona veía solo lo
-- suyo; a partir de aquí ve lo de su espacio.
--
-- El nombre de una política es un **identificador**, así que va con `%I` y no
-- con `%L`: `%L` lo escribe entre comillas simples, que es como se escribe un
-- texto, y Postgres corta con «syntax error at or near». Se parecen tanto que
-- el error no señala al formato sino al nombre.
--
-- Va en un bloque generado y no escrita a mano, por el mismo motivo que las
-- originales: cuatro políticas por tabla escritas cuarenta y nueve veces son
-- casi doscientas ocasiones de colar una errata, y una errata aquí es una fuga
-- de datos entre cuentas. Generándolas, o están bien todas o están mal todas —
-- y lo segundo se ve a la primera prueba.
--
-- Entra entera a propósito. Con la mitad de las tablas migradas, un producto se
-- vería y sus copys no.
--
-- ## Las dos reglas
--
-- 1. Ves una fila si eres miembro de su espacio.
-- 2. Salvo que sea de un producto del que te han sacado.
--
-- La segunda solo se aplica donde hay de qué sacar: la tabla `products` por su
-- `id`, y las que cuelgan de un producto por su `product_id`. Se comprueba
-- contra el catálogo de columnas en vez de mantener una lista a mano, que se
-- queda vieja en cuanto alguien añade una tabla.
--
-- ## Lo que no cambia
--
-- `provider_configs` sigue **sin política de SELECT**: las claves de API no se
-- leen desde el navegador ni siquiera por su dueño. El servidor las lee con
-- `service_role`, que salta RLS.
--
-- `profiles` sigue siendo de cada uno: es la persona, no un dato del equipo.

do $$
declare
  target text;
  tiene_producto boolean;
  es_products boolean;
  filtro text;
  pol record;
  tables text[] := array[
    'stores', 'store_markets', 'products', 'product_offers', 'offer_tiers',
    'product_notes', 'research_documents', 'hooks', 'angles', 'campaigns',
    'prelandings', 'adsets', 'short_ads', 'copies', 'product_images',
    'ad_creatives', 'performance_records', 'analyses', 'provider_configs',
    'generation_runs', 'background_jobs', 'error_log', 'landing_pages',
    'swipe_copies', 'landing_experiments', 'landing_events', 'shop_orders',
    'ad_accounts', 'ad_credentials', 'cost_cogs', 'cost_shipping_zones',
    'cost_gateway_fees', 'cost_custom', 'videos', 'store_blueprints',
    'video_references', 'theme_section_drafts', 'adapted_images', 'audit_log',
    'studio_projects', 'studio_assets', 'video_music', 'meta_apps',
    'meta_logins', 'avatars', 'avatar_shots', 'flows', 'flow_runs',
    'flow_outputs'
  ];
begin
  foreach target in array tables loop
    -- Fuera las viejas, sea cual sea su nombre. Dejando alguna, seguiría
    -- concediendo por `user_id` y el reparto por equipo no se notaría.
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target
    loop
      execute format('drop policy %I on public.%I', pol.policyname, target);
    end loop;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target and column_name = 'product_id'
    ) into tiene_producto;

    es_products := target = 'products';

    -- Miembro del espacio, y sin exclusión sobre ese producto.
    filtro := format(
      'workspace_id in (select m.workspace_id from public.workspace_members m'
      || ' where m.user_id = (select auth.uid()))'
    );

    if es_products then
      filtro := filtro || format(
        ' and not exists (select 1 from public.product_exclusions x'
        || ' where x.user_id = (select auth.uid()) and x.workspace_id = %I.workspace_id'
        || ' and x.product_id = %I.id)', target, target
      );
    elsif tiene_producto then
      filtro := filtro || format(
        ' and not exists (select 1 from public.product_exclusions x'
        || ' where x.user_id = (select auth.uid()) and x.workspace_id = %I.workspace_id'
        || ' and x.product_id = %I.product_id)', target, target
      );
    end if;

    -- Las claves siguen sin poder leerse desde el navegador.
    if target <> 'provider_configs' then
      execute format(
        'create policy %I on public.%I for select to authenticated using (%s)',
        target || ': el equipo ve lo suyo', target, filtro
      );
    end if;

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      target || ': el equipo crea en lo suyo', target, filtro
    );

    /*
     * En UPDATE se comprueban las dos: `using` decide si puedes tocar la fila y
     * `with check` cómo queda después. Sin la segunda, un UPDATE que pasa la
     * primera podría mover la fila al espacio de otro.
     */
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      target || ': el equipo edita lo suyo', target, filtro, filtro
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      target || ': el equipo borra lo suyo', target, filtro
    );
  end loop;
end $$;

-- Las que cuelgan de otra tabla no llevan `workspace_id`: se resuelven por su
-- padre. Escritas a mano porque cada una cuelga de una distinta.
drop policy if exists "video_shots: por su vídeo" on public.video_shots;
create policy "video_shots: por su vídeo" on public.video_shots
  for all to authenticated
  using (exists (select 1 from public.videos v where v.id = video_shots.video_id))
  with check (exists (select 1 from public.videos v where v.id = video_shots.video_id));

drop policy if exists "shop_order_items: por su pedido" on public.shop_order_items;
create policy "shop_order_items: por su pedido" on public.shop_order_items
  for all to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = shop_order_items.order_id))
  with check (exists (select 1 from public.shop_orders o where o.id = shop_order_items.order_id));

drop policy if exists "landing_variants: por su experimento" on public.landing_variants;
create policy "landing_variants: por su experimento" on public.landing_variants
  for all to authenticated
  using (exists (select 1 from public.landing_experiments e where e.id = landing_variants.experiment_id))
  with check (exists (select 1 from public.landing_experiments e where e.id = landing_variants.experiment_id));

drop policy if exists "ad_spend: por su cuenta" on public.ad_spend;
create policy "ad_spend: por su cuenta" on public.ad_spend
  for all to authenticated
  using (exists (select 1 from public.ad_accounts a where a.id = ad_spend.account_id))
  with check (exists (select 1 from public.ad_accounts a where a.id = ad_spend.account_id));
