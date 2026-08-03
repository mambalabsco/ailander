-- ---------------------------------------------------------------------------
-- Las músicas de un vídeo, todas, no solo la última.
--
-- Hasta ahora `videos.music_url` guardaba una sola: generar otra pisaba la
-- anterior y no había forma de volver a ella. Eso convierte cada intento en un
-- gasto que se tira, y con ElevenLabs Music —que cobra el minuto empezado—
-- probar tres aires cuesta más que el resto del vídeo entero.
--
-- Con esto se acumulan y se elige. Descartar sigue siendo posible, pero pasa a
-- ser una decisión que se toma, no el efecto secundario de generar otra.
--
-- `videos.music_url` se queda: es la elegida, la que usa el montaje. Esta tabla
-- es de dónde se elige.
-- ---------------------------------------------------------------------------

create table if not exists public.video_music (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,

  url text not null,
  -- Con qué se hizo y con qué encargo, para poder repetir la que funcionó.
  model text not null default '',
  prompt text not null default '',
  -- A qué volumen quedó, en LUFS. Negativo siempre.
  lufs numeric not null default -32,
  seconds numeric not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists video_music_video_idx
  on public.video_music (video_id, created_at desc);

alter table public.video_music enable row level security;

create policy "video_music_own" on public.video_music
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
