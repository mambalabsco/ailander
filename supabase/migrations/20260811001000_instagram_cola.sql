-- La cola de publicaciones de Instagram.
--
-- Guarda lo que se va a publicar, cuándo, y qué pasó. No habla con Meta: eso lo
-- hará el cron leyendo de aquí.
--
-- ## Por qué hay un `claimed_at` además del estado
--
-- Porque el cron se ejecuta cada pocos minutos y publicar tarda: crear el
-- contenedor, esperar el procesado del vídeo, publicar. Si la segunda vuelta
-- coge la misma fila mientras la primera sigue, **sale publicada dos veces** —y
-- eso en la cuenta de la marca no se deshace, se borra a mano y ya lo vio todo
-- el mundo.
--
-- Marcar «en curso» **antes** de llamar, y con la hora, es lo que lo evita: una
-- fila reclamada hace un minuto no se toca; una reclamada hace media hora se
-- puede dar por muerta y reintentar.
create table if not exists public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  product_id text not null,

  format text not null default 'feed',
  caption text not null default '',
  hashtags text[] not null default '{}',
  /** Qué se ve, para poder generar la media. */
  scene text not null default '',
  media_url text,

  /*
   * `borrador` → `aprobado` → `publicando` → `publicado` | `error`.
   *
   * Aprobado y publicando son estados distintos a propósito: aprobado es «puede
   * salir», publicando es «se está yendo ahora». Juntándolos no hay forma de
   * saber si una pieza que lleva diez minutos sin terminar está esperando su
   * hora o colgada.
   */
  status text not null default 'borrador',
  scheduled_at timestamptz,
  claimed_at timestamptz,
  published_at timestamptz,
  /** El identificador que devuelve Instagram. Sin él no se puede comprobar nada después. */
  instagram_id text,
  error text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists instagram_posts_pendientes
  on public.instagram_posts (status, scheduled_at);

alter table public.instagram_posts enable row level security;

drop policy if exists "instagram_posts: el equipo ve lo suyo" on public.instagram_posts;
create policy "instagram_posts: el equipo ve lo suyo" on public.instagram_posts
  for select to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_posts: el equipo crea en lo suyo" on public.instagram_posts;
create policy "instagram_posts: el equipo crea en lo suyo" on public.instagram_posts
  for insert to authenticated
  with check (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_posts: el equipo edita lo suyo" on public.instagram_posts;
create policy "instagram_posts: el equipo edita lo suyo" on public.instagram_posts
  for update to authenticated
  using (workspace_id in (select public.mis_espacios()))
  with check (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_posts: el equipo borra lo suyo" on public.instagram_posts;
create policy "instagram_posts: el equipo borra lo suyo" on public.instagram_posts
  for delete to authenticated
  using (workspace_id in (select public.mis_espacios()));

-- El espacio, como en el resto de tablas.
drop trigger if exists poner_espacio on public.instagram_posts;
create trigger poner_espacio before insert on public.instagram_posts
  for each row execute function public.poner_espacio();
