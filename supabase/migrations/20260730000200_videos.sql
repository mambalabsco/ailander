-- ---------------------------------------------------------------------------
-- Vídeos verticales: guion, tomas, voz y clips.
--
-- El modelo sigue el orden en que se produce, que también es el orden en que se
-- gasta: primero el guion (gratis), después la voz (céntimos), después los
-- keyframes (~$0,02 cada uno) y al final la animación, que es casi todo el
-- coste. Cada paso guarda su resultado para que un fallo en el siguiente no
-- obligue a repetir —y a pagar— los anteriores.
--
-- Las tomas van en su propia tabla y no en un `jsonb` dentro del vídeo porque
-- cada una avanza por su cuenta: una puede tener el keyframe aprobado y el clip
-- fallado mientras la de al lado va entera. Con un JSON habría que reescribir el
-- documento completo en cada actualización parcial, y dos generaciones en
-- paralelo se pisarían.
-- ---------------------------------------------------------------------------

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  -- De qué copy o publirreportaje nace. Nulo si se escribió a mano.
  copy_id uuid references public.copies (id) on delete set null,

  title text not null,
  -- 'borrador' | 'voz' | 'keyframes' | 'clips' | 'montado' | 'error'
  status text not null default 'borrador',

  /*
   * El ancla de estilo, la misma frase en todos los keyframes del vídeo.
   *
   * Es lo único que hace que catorce imágenes generadas por separado parezcan
   * del mismo vídeo. Va aquí y no en cada toma justo por eso.
   */
  style_render text not null default '',
  style_accent text not null default '',

  voice_id text not null default '',
  voice_url text,
  -- Palabras con sus tiempos, tal y como las devolvió el generador de voz.
  words jsonb not null default '[]'::jsonb,
  voice_seconds numeric(8, 2) not null default 0,

  final_url text,
  thumbnail_url text,
  -- Lo que se lleva gastado de verdad, no lo presupuestado.
  spent_usd numeric(10, 4) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videos_product_idx on public.videos (product_id, created_at desc);

create table if not exists public.video_shots (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,

  -- «01», «02»: cadena para que ordene bien y sirva de nombre de archivo.
  n text not null,
  position integer not null default 0,

  -- Lo narrado, escrito fonético para la voz.
  guion text not null default '',
  -- Cómo se escribe en pantalla cuando difiere. Sin esto el subtítulo dice
  -- «eme ce te», que es lo que más delata un vídeo generado.
  sub text,
  role text not null default 'story',
  scene text not null default '',
  motion text not null default '',
  speaking boolean not null default false,

  -- Corte real, derivado de los tiempos de la voz. Nulo hasta que hay voz.
  cut_start numeric(8, 3),
  cut_end numeric(8, 3),

  keyframe_url text,
  clip_url text,
  -- El de lipsync, cuando lo hay. Se prefiere sobre el mudo al montar.
  lipsync_url text,
  -- Por qué falló, si falló. Se guarda para poder distinguir un fallo de red
  -- —que se reintenta— de uno de moderación, que hay que reescribir.
  error text,

  created_at timestamptz not null default now(),
  unique (video_id, n)
);

create index if not exists video_shots_video_idx on public.video_shots (video_id, position);

alter table public.videos enable row level security;
alter table public.video_shots enable row level security;

create policy "videos_own" on public.videos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Las tomas cuelgan del vídeo: se comprueba su dueño.
create policy "video_shots_own" on public.video_shots
  for all to authenticated
  using (
    exists (select 1 from public.videos v where v.id = video_id and v.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.videos v where v.id = video_id and v.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Bucket para la voz.
--
-- **Público, al contrario que el de imágenes.** El servicio de montaje descarga
-- el audio por su cuenta, así que necesita una URL que le sirva: no se le puede
-- pasar un buffer, y una URL firmada de una hora caducaría si el montaje espera
-- en cola.
--
-- Es una voz locutada de un anuncio, no un dato personal: lo que protege el
-- bucket privado —las creatividades antes de publicarlas— no aplica aquí. Aun
-- así, escribir sigue exigiendo ser el dueño de la carpeta.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-assets', 'video-assets', true, 26214400, array['audio/mpeg', 'audio/mp4', 'audio/wav'])
on conflict (id) do nothing;

-- La primera carpeta de la ruta es el id del usuario: es lo que ata cada archivo
-- a su dueño sin necesidad de una tabla aparte.
create policy "video_assets_write_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "video_assets_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "video_assets_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
