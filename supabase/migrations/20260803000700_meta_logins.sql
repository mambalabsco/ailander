-- ---------------------------------------------------------------------------
-- Las sesiones de Facebook, aparte de la tienda.
--
-- El token que devuelve Facebook es **de la persona**, no de una tienda: con él
-- se ven las cuentas publicitarias de todos los Business Manager a los que ese
-- perfil llegue. Guardarlo dentro de `ad_credentials` obligaba a repetir el
-- mismo inicio de sesión en cada tienda, y a repetirlo otra vez en todas cada
-- sesenta días cuando caduca.
--
-- Ahora se inicia sesión una vez, en Configuración, y cada tienda apunta a esa
-- sesión. Con cinco tiendas eso es un login en vez de cinco, y una renovación
-- en vez de cinco.
--
-- `ad_credentials.access_token` se queda: es lo que ya tienen las tiendas
-- conectadas, y sigue valiendo mientras no se inicie sesión de la forma nueva.
-- ---------------------------------------------------------------------------

create table if not exists public.meta_logins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- El nombre del perfil de Facebook, para reconocerlo en un desplegable.
  name text not null default '',
  access_token text not null,
  -- `null` significa «no caduca», no «caducó en 1970».
  token_expires_at timestamptz,
  scopes text[] not null default '{}',

  -- Con qué app se hizo. Renovar el token tiene que ir contra la misma.
  meta_app_id uuid references public.meta_apps (id) on delete set null,

  -- La que usan las tiendas que no eligen otra.
  is_default boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_logins_user_idx on public.meta_logins (user_id, created_at);

/*
 * Una sola por defecto y por persona, igual que con las apps: con dos marcadas,
 * cuál gana dependería del orden de la consulta y una tienda leería el gasto de
 * un Business Manager u otro según el día.
 */
create unique index if not exists meta_logins_one_default
  on public.meta_logins (user_id) where is_default;

alter table public.meta_logins enable row level security;

create policy "meta_logins_own" on public.meta_logins
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Y la tienda apunta a una sesión. `set null` para que borrar una sesión no se
-- lleve por delante la fila de la tienda con sus cuentas y sus filtros.
alter table public.ad_credentials
  add column if not exists meta_login_id uuid references public.meta_logins (id) on delete set null;
