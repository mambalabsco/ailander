-- ---------------------------------------------------------------------------
-- Las apps de un casino.
--
-- En el vertical de casino el producto **es el país**, y dentro viven las apps
-- —Monticello Online y las demás—, cada una con su propio enfoque. El copy se
-- escribe para una app concreta: es lo que se descarga.
-- ---------------------------------------------------------------------------

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,

  name text not null,
  -- Con qué entra esta app y no otra. Es lo que la distingue dentro del copy, y
  -- por eso es una columna y no una nota: se pega en el encargo.
  focus text not null default '',
  -- A dónde va el tráfico del anuncio.
  download_url text not null default '',
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apps_product_id_idx on public.apps (product_id);

drop trigger if exists apps_touch on public.apps;
create trigger apps_touch
  before update on public.apps
  for each row execute function public.touch_updated_at();

drop trigger if exists poner_espacio on public.apps;
create trigger poner_espacio before insert on public.apps
  for each row execute function public.poner_espacio();

alter table public.apps enable row level security;

-- `drop policy if exists` delante de cada una: estas migraciones se reejecutan
-- en cada despliegue y `create policy` no admite `if not exists`.
drop policy if exists "apps_lectura" on public.apps;
create policy "apps_lectura" on public.apps
  for select to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop policy if exists "apps_escritura" on public.apps;
create policy "apps_escritura" on public.apps
  for all to authenticated
  using (workspace_id in (select public.mis_espacios()))
  with check (workspace_id in (select public.mis_espacios()));

-- ---------------------------------------------------------------------------
-- De qué app es cada pieza. **Nulo es general** en las tres.
--
-- Es el mismo significado que ya tiene `market_id` en estas tablas, y por el
-- mismo motivo: una historia sirve para varias apps, y obligar a elegir una
-- duplicaría el trabajo por app desde el primer día.
--
-- `set null` y no `cascade`: borrar una app no puede llevarse por delante los
-- copys y las imágenes que ya se escribieron con ella. Pierden la referencia,
-- que es lo que sobra, no el trabajo.
-- ---------------------------------------------------------------------------

alter table public.angles
  add column if not exists app_id uuid references public.apps (id) on delete set null;

alter table public.copies
  add column if not exists app_id uuid references public.apps (id) on delete set null;

alter table public.product_images
  add column if not exists app_id uuid references public.apps (id) on delete set null;

comment on column public.angles.app_id is
  'De qué app es el ángulo. Nulo = general: vale para todas las del producto.';
comment on column public.copies.app_id is
  'Para qué app se escribió el texto. Nulo en todo lo que no es casino.';
comment on column public.product_images.app_id is
  'De qué app es la captura. Es la que se manda de referencia al generar.';
