-- ---------------------------------------------------------------------------
-- Carpetas y archivo de campañas, y el descarte de una imagen rehecha.
--
-- La pestaña Ads de un producto acaba con decenas de campañas abiertas a la vez.
-- Esto da las tres cosas que la ordenan: dónde vive una campaña, si está
-- guardada, y esconder la imagen que se rehízo sin borrarla.
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,

  name text not null,
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_folders_product_id_idx
  on public.campaign_folders (product_id);

drop trigger if exists campaign_folders_touch on public.campaign_folders;
create trigger campaign_folders_touch
  before update on public.campaign_folders
  for each row execute function public.touch_updated_at();

drop trigger if exists poner_espacio on public.campaign_folders;
create trigger poner_espacio before insert on public.campaign_folders
  for each row execute function public.poner_espacio();

alter table public.campaign_folders enable row level security;

-- `drop policy if exists` delante de cada una: estas migraciones se reejecutan
-- en cada despliegue y `create policy` no admite `if not exists`.
drop policy if exists "campaign_folders_lectura" on public.campaign_folders;
create policy "campaign_folders_lectura" on public.campaign_folders
  for select to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop policy if exists "campaign_folders_escritura" on public.campaign_folders;
create policy "campaign_folders_escritura" on public.campaign_folders
  for all to authenticated
  using (workspace_id in (select public.mis_espacios()))
  with check (workspace_id in (select public.mis_espacios()));

-- ---------------------------------------------------------------------------
-- Dónde vive una campaña, y si está archivada.
--
-- `set null` y no `cascade`: borrar una carpeta no puede llevarse las campañas
-- que había dentro. Pierden el sitio, que es lo que sobra, no el trabajo.
--
-- `archived_at` es fecha y no booleano. Un booleano dice que está archivada; la
-- fecha dice **cuándo**, y ordenar «Archivadas» por lo último sale gratis.
-- ---------------------------------------------------------------------------

alter table public.campaigns
  add column if not exists folder_id uuid
    references public.campaign_folders (id) on delete set null;

alter table public.campaigns
  add column if not exists archived_at timestamptz;

create index if not exists campaigns_archived_at_idx
  on public.campaigns (product_id, archived_at);

-- ---------------------------------------------------------------------------
-- La imagen que se rehízo.
--
-- No se borra: se esconde. La generación va por la cola y puede fallar, así que
-- la vieja solo se descarta **cuando la nueva ya está guardada**. Y si la nueva
-- sale peor, se recupera.
-- ---------------------------------------------------------------------------

alter table public.product_images
  add column if not exists discarded_at timestamptz;

comment on column public.campaigns.folder_id is
  'En qué carpeta se ve. Nulo = sin carpeta, que es donde nacen todas.';
comment on column public.campaigns.archived_at is
  'Cuándo se archivó. Nulo = activa. La carpeta se conserva para devolverla a ella.';
comment on column public.product_images.discarded_at is
  'Cuándo se descartó al rehacerla. Nulo = vigente. No borra el archivo.';
