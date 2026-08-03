-- ---------------------------------------------------------------------------
-- Avatares: caras que después salen usando el producto.
--
-- Son dos cosas distintas y por eso dos tablas.
--
-- Un **avatar** es una persona: una foto de cara y, si se generó, la
-- descripción con la que se pidió. Vive suelto, sin producto, porque la gracia
-- es reutilizarlo: la misma cara sirve para todos los productos y para todas
-- las tandas. Generar una cara por foto sería pagar la cara veinte veces.
--
-- Una **toma** es esa persona con un producto concreto en un contexto concreto.
-- Cuelga del avatar y del producto, y guarda con qué encargo se hizo para poder
-- repetir la que salió bien.
-- ---------------------------------------------------------------------------

create table if not exists public.avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  name text not null default '',
  url text not null,
  -- Cómo es la persona. En las generadas es lo que se pidió; en las subidas, lo
  -- que quiera escribir quien las sube — y sirve igual: se le pasa al generador
  -- para que no reinvente la cara.
  description text not null default '',
  -- `subido` o el modelo con el que se generó.
  source text not null default 'subido',

  created_at timestamptz not null default now()
);

create index if not exists avatars_user_idx on public.avatars (user_id, created_at desc);

create table if not exists public.avatar_shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  avatar_id uuid not null references public.avatars (id) on delete cascade,

  -- El producto va como texto, igual que en el resto de la plataforma: los
  -- productos no viven todos en la misma tabla.
  product_id text not null default '',
  url text not null,
  -- En qué contexto se pidió: `cocina`, `bano`… Ver `avatar-shots.ts`.
  context text not null default '',
  prompt text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists avatar_shots_avatar_idx
  on public.avatar_shots (avatar_id, created_at desc);

create index if not exists avatar_shots_product_idx
  on public.avatar_shots (product_id, created_at desc);

alter table public.avatars enable row level security;
alter table public.avatar_shots enable row level security;

create policy "avatars_own" on public.avatars
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "avatar_shots_own" on public.avatar_shots
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Y su bucket.
--
-- Público por lo mismo que los demás: el generador descarga la cara y el envase
-- por su cuenta, y una dirección firmada caduca a mitad de una tanda larga.
-- Cada quien escribe solo en su carpeta.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types;

create policy "avatares_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatares_write_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatares_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatares_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
