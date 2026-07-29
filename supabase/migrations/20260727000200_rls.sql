-- ============================================================================
-- Row Level Security
-- ============================================================================
--
-- Regla única: cada usuario ve, crea, edita y borra solo lo suyo. Todas las
-- tablas llevan `user_id` y todas las políticas comparan contra `auth.uid()`.
--
-- Cuatro decisiones que explican por qué las políticas están escritas así:
--
-- 1. **Una política por operación**, no una sola `for all`. Postgres evalúa
--    `using` en SELECT/UPDATE/DELETE y `with check` en INSERT/UPDATE. Separarlas
--    deja explícito qué se comprueba en cada caso y evita el fallo clásico de
--    un UPDATE que pasa el `using` y luego reasigna `user_id` a otro usuario.
--
-- 2. **`(select auth.uid())` y no `auth.uid()` a secas.** Envuelto en subconsulta
--    el planificador lo evalúa una vez por consulta en lugar de una vez por
--    fila. En una tabla con muchas filas la diferencia es grande.
--
-- 3. **`to authenticated`** en todas. Sin esa cláusula la política también se
--    evalúa para `anon`, que gasta ciclos comprobando algo que siempre da falso.
--
-- 4. **`provider_configs` no tiene política de SELECT.** Es deliberado: las
--    claves de API no deben poder leerse desde el navegador ni siquiera por su
--    dueño. El servidor las lee con `service_role`, que salta RLS.

-- ---------------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.stores              enable row level security;
alter table public.store_markets       enable row level security;
alter table public.products            enable row level security;
alter table public.product_offers      enable row level security;
alter table public.offer_tiers         enable row level security;
alter table public.product_notes       enable row level security;
alter table public.research_documents  enable row level security;
alter table public.hooks               enable row level security;
alter table public.angles              enable row level security;
alter table public.campaigns           enable row level security;
alter table public.prelandings         enable row level security;
alter table public.adsets              enable row level security;
alter table public.short_ads           enable row level security;
alter table public.copies              enable row level security;
alter table public.product_images      enable row level security;
alter table public.ad_creatives        enable row level security;
alter table public.performance_records enable row level security;
alter table public.analyses            enable row level security;
alter table public.provider_configs    enable row level security;

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------
--
-- El perfil lo crea el trigger, así que aquí no hay INSERT ni DELETE: se borra
-- en cascada al borrar la cuenta.

create policy "profiles: cada uno ve el suyo"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: cada uno edita el suyo"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- El resto de tablas
-- ---------------------------------------------------------------------------
--
-- El patrón se repite en veinte tablas, así que se genera en un bloque en vez
-- de escribirlo a mano: cuatro políticas por tabla escritas veinte veces son
-- ochenta ocasiones de colar una errata, y una errata aquí es una fuga de
-- datos entre cuentas.

do $$
declare
  target text;
  tables text[] := array[
    'stores', 'store_markets', 'products', 'product_offers', 'offer_tiers',
    'product_notes', 'research_documents', 'hooks', 'angles', 'campaigns',
    'prelandings', 'adsets', 'short_ads', 'copies', 'product_images',
    'ad_creatives', 'performance_records', 'analyses'
  ];
begin
  foreach target in array tables loop
    execute format($f$
      create policy %1$I on public.%2$I
        for select to authenticated
        using ((select auth.uid()) = user_id);
    $f$, target || ': ver lo propio', target);

    execute format($f$
      create policy %1$I on public.%2$I
        for insert to authenticated
        with check ((select auth.uid()) = user_id);
    $f$, target || ': crear lo propio', target);

    -- `using` filtra qué filas se pueden tocar; `with check` impide que la fila
    -- editada acabe perteneciendo a otra persona.
    execute format($f$
      create policy %1$I on public.%2$I
        for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id);
    $f$, target || ': editar lo propio', target);

    execute format($f$
      create policy %1$I on public.%2$I
        for delete to authenticated
        using ((select auth.uid()) = user_id);
    $f$, target || ': borrar lo propio', target);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claves de proveedores
-- ---------------------------------------------------------------------------
--
-- Sin SELECT a propósito. El usuario puede guardar y borrar sus claves, pero no
-- puede volver a leerlas desde el navegador: una vez escritas, la interfaz solo
-- muestra si están configuradas o no. Así, un fallo de XSS en la aplicación no
-- se convierte en una filtración de la clave de Anthropic.

create policy "provider_configs: guardar las propias"
  on public.provider_configs for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "provider_configs: actualizar las propias"
  on public.provider_configs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "provider_configs: borrar las propias"
  on public.provider_configs for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Coherencia entre tablas
-- ---------------------------------------------------------------------------
--
-- RLS comprueba que `user_id` sea el de quien llama, pero no que un producto y
-- su tienda pertenezcan a la misma persona. Sin esto, alguien podría crear un
-- producto suyo apuntando a `store_id` de otro y leer indirectamente el nombre
-- de esa tienda a través de un `join`.

create or replace function public.assert_same_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if tg_argv[0] = 'store_id' and new.store_id is not null then
    select user_id into owner_id from public.stores where id = new.store_id;
  elsif tg_argv[0] = 'market_id' and new.market_id is not null then
    select user_id into owner_id from public.store_markets where id = new.market_id;
  elsif tg_argv[0] = 'product_id' and new.product_id is not null then
    select user_id into owner_id from public.products where id = new.product_id;
  else
    return new;
  end if;

  if owner_id is not null and owner_id <> new.user_id then
    raise exception 'La fila referenciada pertenece a otro usuario.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger products_store_owner
  before insert or update on public.products
  for each row execute function public.assert_same_owner('store_id');

create trigger products_market_owner
  before insert or update on public.products
  for each row execute function public.assert_same_owner('market_id');

create trigger store_markets_store_owner
  before insert or update on public.store_markets
  for each row execute function public.assert_same_owner('store_id');

-- Todo lo que cuelga de un producto comprueba que el producto sea suyo.
do $$
declare
  target text;
  tables text[] := array[
    'product_offers', 'offer_tiers', 'product_notes', 'research_documents',
    'hooks', 'angles', 'campaigns', 'prelandings', 'adsets', 'short_ads',
    'copies', 'product_images', 'performance_records',
    -- Estas dos tienen `product_id` opcional; la función devuelve sin más
    -- cuando viene nulo, así que entran igual y cubren el caso de apuntar a un
    -- producto ajeno.
    'ad_creatives', 'analyses'
  ];
begin
  foreach target in array tables loop
    execute format($f$
      create trigger %1$I
        before insert or update on public.%2$I
        for each row execute function public.assert_same_owner('product_id');
    $f$, target || '_product_owner', target);
  end loop;
end;
$$;
