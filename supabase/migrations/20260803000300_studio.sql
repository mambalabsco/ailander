-- ---------------------------------------------------------------------------
-- El estudio: piezas sueltas que se van ordenando hasta ser un vídeo.
--
-- El pipeline de producto va de un copy a un vídeo terminado, con sus pasos
-- fijos. Esto es lo contrario: una mesa de trabajo donde se generan piezas —una
-- imagen, un clip, una voz, una música— se miran, se descartan y se ordenan.
--
-- Por eso hay **posición** y no solo fecha. Lo que convierte un montón de piezas
-- en un vídeo es el orden, y ese orden es una decisión que hay que poder cambiar
-- sin volver a generar nada.
--
-- Las piezas son del proyecto, y un proyecto es de una persona. Un diseñador
-- trabaja en varios anuncios a la vez y mezclarlos en una lista única obliga a
-- buscar entre cien miniaturas cuál era de cuál.
-- ---------------------------------------------------------------------------

create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  name text not null default 'Sin título',
  -- Sobre qué producto va, para poder mandarle la foto del envase de referencia.
  product_id text not null default '',
  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.studio_projects (id) on delete cascade,

  -- imagen, clip, voz, musica, video
  kind text not null,
  url text not null,
  name text not null default '',
  -- Con qué se hizo y con qué encargo, para poder repetirla o afinarla.
  model text not null default '',
  prompt text not null default '',
  -- Duración en segundos, cuando la tiene. `numeric` llega como texto.
  seconds numeric not null default 0,

  -- El orden en el montaje. Se separa de veinte en veinte para poder meter una
  -- pieza entre dos sin renumerar todas.
  position integer not null default 0,
  -- Si entra en el montaje. Descartar sin borrar: una toma mala hoy sirve
  -- mañana, y regenerarla cuesta.
  included boolean not null default true,

  created_at timestamptz not null default now()
);

create index if not exists studio_assets_project_idx
  on public.studio_assets (project_id, position);

create index if not exists studio_projects_user_idx
  on public.studio_projects (user_id, updated_at desc);

alter table public.studio_projects enable row level security;
alter table public.studio_assets enable row level security;

create policy "studio_projects_own" on public.studio_projects
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "studio_assets_own" on public.studio_assets
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Y el bucket de lo que se sube aquí: muestras de voz para clonar, imágenes de
-- referencia, música propia.
--
-- Público por lo mismo que los otros: los generadores descargan por su cuenta y
-- una dirección firmada caduca a mitad de una tanda larga.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studio',
  'studio',
  true,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm', 'audio/ogg',
    'video/mp4', 'video/webm'
  ]
)
on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types;

create policy "studio_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'studio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "studio_write_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'studio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "studio_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'studio' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'studio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "studio_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'studio' and (storage.foldername(name))[1] = (select auth.uid())::text);
