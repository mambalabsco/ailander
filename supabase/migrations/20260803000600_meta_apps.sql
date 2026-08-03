-- ---------------------------------------------------------------------------
-- Las apps de Meta, en un sitio, y cada tienda elige cuál.
--
-- La migración anterior las puso **por tienda**, y eso obliga a pegar el mismo
-- identificador y el mismo secreto en cada una. Con una tienda da igual; con
-- diez es media hora de copiar y pegar y una probabilidad alta de que en la
-- séptima se cuele un carácter.
--
-- Y no hace falta: casi siempre una app sirve para todo —lo que decide qué
-- cuentas se ven es el perfil de Facebook que inicia sesión, no la app— y solo
-- hace falta otra cuando entra un perfil que no puede tener rol en la primera.
--
-- Así que: una lista de apps, una marcada por defecto, y en cada tienda un
-- desplegable. Lo normal es no tocar el desplegable nunca.
--
-- Las variables de entorno siguen valiendo: si no hay ninguna app dada de alta,
-- se usa la del entorno como hasta ahora.
-- ---------------------------------------------------------------------------

create table if not exists public.meta_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Para reconocerla en un desplegable: «BM Naturox», «BM del cliente».
  name text not null default '',
  app_id text not null,
  -- Nunca se devuelve a la pantalla; solo se dice si está puesto.
  app_secret text not null,
  -- Facebook Login for Business, cuando la app lo usa.
  config_id text not null default '',

  -- La que usan las tiendas que no eligen otra.
  is_default boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_apps_user_idx on public.meta_apps (user_id, created_at);

/*
 * Una sola por defecto y por persona.
 *
 * Con dos marcadas, cuál gana dependería del orden en que las devuelva la
 * consulta — y una tienda conectaría contra un Business Manager u otro según el
 * día. El índice lo impide en la base de datos, que es donde hay que impedirlo.
 */
create unique index if not exists meta_apps_one_default
  on public.meta_apps (user_id) where is_default;

alter table public.meta_apps enable row level security;

create policy "meta_apps_own" on public.meta_apps
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Y la tienda apunta a una, en vez de guardar una copia de sus credenciales.
--
-- `on delete set null` y no `cascade`: borrar una app no puede llevarse por
-- delante la conexión de la tienda con su token dentro. Se queda sin app y la
-- pantalla lo dice, que es recuperable.
-- ---------------------------------------------------------------------------

alter table public.ad_credentials
  add column if not exists meta_app_id uuid references public.meta_apps (id) on delete set null;

/*
 * Y se recogen las que la migración anterior dejó pegadas en cada tienda.
 *
 * Se da de alta una app por cada combinación distinta que hubiera, con el
 * nombre puesto a partir del identificador, y las tiendas pasan a apuntarla. Sin
 * esto, quien ya hubiera rellenado una a mano la perdería en silencio.
 */
insert into public.meta_apps (user_id, name, app_id, app_secret, config_id)
select distinct on (user_id, client_id, client_secret)
  user_id,
  'App ' || client_id,
  client_id,
  client_secret,
  coalesce(config_id, '')
from public.ad_credentials
where provider = 'facebook'
  and client_id is not null and client_id <> ''
  and client_secret is not null and client_secret <> '';

update public.ad_credentials as c
set meta_app_id = a.id
from public.meta_apps as a
where c.provider = 'facebook'
  and c.user_id = a.user_id
  and c.client_id = a.app_id
  and c.client_secret = a.app_secret;
