-- «infinite recursion detected in policy for relation "workspace_members"».
--
-- La política de lectura de esa tabla preguntaba «¿de qué espacios soy
-- miembro?» consultando **la misma tabla**, así que para leerla hay que leerla.
--
-- Es la trampa que ya se sorteó en las de escritura con `manda_en`, y aquí se
-- cayó igual: en la de lectura, que se escribió después y parecía inofensiva.
--
-- La consecuencia era peor de lo que suena: las políticas de las 49 tablas
-- preguntan por los espacios del usuario, así que la recursión tumbaba
-- **cualquier consulta de la aplicación**, no solo la pantalla de equipo. Lo que
-- se veía era la plataforma entera caída.
create or replace function public.mis_espacios()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.workspace_id from public.workspace_members m where m.user_id = (select auth.uid());
$$;

drop policy if exists "los del espacio se ven entre ellos" on public.workspace_members;
create policy "los del espacio se ven entre ellos" on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()) or workspace_id in (select public.mis_espacios()));

-- Y las 49 pasan a preguntar por la función en vez de por la tabla.
--
-- No es solo por la recursión: la subconsulta se evaluaba en cada política de
-- cada tabla, y una función `stable` la deja resolverse una vez por consulta.
do $$
declare
  target text;
  pol record;
  filtro text;
  tiene_producto boolean;
  es_products boolean;
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

    filtro := 'workspace_id in (select public.mis_espacios())';

    if es_products then
      filtro := filtro || format(
        ' and not exists (select 1 from public.product_exclusions x'
        || ' where x.user_id = (select auth.uid()) and x.workspace_id = %I.workspace_id'
        || ' and x.product_id = %I.id::text)', target, target
      );
    elsif tiene_producto then
      filtro := filtro || format(
        ' and not exists (select 1 from public.product_exclusions x'
        || ' where x.user_id = (select auth.uid()) and x.workspace_id = %I.workspace_id'
        || ' and x.product_id = %I.product_id::text)', target, target
      );
    end if;

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
