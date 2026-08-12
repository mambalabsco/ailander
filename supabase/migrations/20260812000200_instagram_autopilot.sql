-- El autopiloto: qué producto publica solo, dónde, cuánto y en qué franja.
--
-- ## Por qué la cuenta va en la fila y no en una variable de entorno
--
-- Porque cada producto puede publicar en una cuenta distinta, y una variable de
-- entorno es una sola para todo el servidor. El día que haya dos marcas, la
-- variable publica las dos en la misma cuenta y nadie se entera hasta verlo.
--
-- ## Por qué `pausado_por` es texto y no un booleano
--
-- Porque cuando el piloto se apaga solo, lo primero que se quiere saber es si
-- fue el tope del día, el token caducado o tres fallos seguidos. Con un booleano
-- hay que ir al registro a averiguarlo, y el registro está en el servidor.
create table if not exists public.instagram_autopilot (
  product_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,

  activo boolean not null default false,
  ig_user_id text,

  por_dia integer not null default 1,
  colchon_dias integer not null default 3,
  hora_desde integer not null default 18,
  hora_hasta integer not null default 21,

  -- Solo para enseñarlo. El tope y la separación se calculan de
  -- `instagram_posts`, porque son de la cuenta y no del producto.
  ultima_publicacion_at timestamptz,
  fallos_seguidos integer not null default 0,
  pausado_por text not null default '',

  created_at timestamptz not null default now()
);

alter table public.instagram_autopilot enable row level security;

drop policy if exists "instagram_autopilot: el equipo ve lo suyo" on public.instagram_autopilot;
create policy "instagram_autopilot: el equipo ve lo suyo" on public.instagram_autopilot
  for select to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_autopilot: el equipo crea en lo suyo" on public.instagram_autopilot;
create policy "instagram_autopilot: el equipo crea en lo suyo" on public.instagram_autopilot
  for insert to authenticated
  with check (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_autopilot: el equipo edita lo suyo" on public.instagram_autopilot;
create policy "instagram_autopilot: el equipo edita lo suyo" on public.instagram_autopilot
  for update to authenticated
  using (workspace_id in (select public.mis_espacios()))
  with check (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_autopilot: el equipo borra lo suyo" on public.instagram_autopilot;
create policy "instagram_autopilot: el equipo borra lo suyo" on public.instagram_autopilot
  for delete to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop trigger if exists poner_espacio on public.instagram_autopilot;
create trigger poner_espacio before insert on public.instagram_autopilot
  for each row execute function public.poner_espacio();

-- En qué cuenta salió cada publicación.
--
-- Sin esto se puede saber cuántas publicó un producto, que no es la pregunta:
-- el tope de 25 al día lo impone Instagram sobre **la cuenta**, y dos productos
-- que compartan cuenta se pasarían entre los dos, cada uno convencido de ir
-- dentro de su límite.
alter table public.instagram_posts add column if not exists ig_user_id text;

create index if not exists instagram_posts_por_cuenta
  on public.instagram_posts (ig_user_id, published_at);
