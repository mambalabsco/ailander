-- ---------------------------------------------------------------------------
-- Anuncios en vídeo analizados: cómo están construidos.
--
-- Se guarda **la construcción**, no el vídeo: el gancho descrito, los momentos y
-- sus papeles, el ritmo, dónde entra el producto, cómo cierra. Con eso se escribe
-- un guion nuevo para el producto propio.
--
-- El vídeo no se conserva. Se sube, se le sacan fotogramas y audio, se analiza y
-- se borra: guardarlo sería almacenar la obra de otro para nada, porque lo que se
-- reutiliza es el análisis. También ahorra el disco de un servidor pequeño.
--
-- Tampoco se guarda su guion transcrito. La transcripción se usa durante el
-- análisis y no se persiste: describir cómo entra un anuncio es investigación,
-- archivar su texto es otra cosa.
--
-- Cuelgan del usuario y no de un producto: el mismo anuncio de referencia sirve
-- para varios, y atarlo a uno obligaría a repetir el análisis por cada uno.
-- ---------------------------------------------------------------------------

create table if not exists public.video_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  name text not null default '',
  -- De dónde salió, para poder volver a verlo. Puede ir vacío si se subió.
  source_url text not null default '',

  duration_seconds numeric not null default 0,
  width integer not null default 0,
  height integer not null default 0,
  had_audio boolean not null default false,
  frames_analyzed integer not null default 0,

  -- {hook, promise, voice, beats, averageShotSeconds, productMoment,
  --  callToAction, whyItWorks} — la construcción descrita, nunca su guion.
  analysis jsonb not null default '{}'::jsonb,
  -- Lo que el repaso encontró raro: momentos fuera del vídeo, ritmo imposible.
  warnings jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists video_references_user_idx
  on public.video_references (user_id, created_at desc);

alter table public.video_references enable row level security;

create policy "video_references_own" on public.video_references
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
