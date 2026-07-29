-- ---------------------------------------------------------------------------
-- Publirreportajes como página web completa.
--
-- Hasta ahora un publirreportaje era texto plano: cuerpo, titular y
-- descripción. Para publicarlo había que maquetarlo a mano en Shopify, decidir
-- dónde van las imágenes, escribir los testimonios aparte y montar los botones.
--
-- Esta tabla guarda la página entera: sus secciones en orden, los huecos de
-- imagen con su prompt, y los comentarios. El HTML se deriva de eso al leer, no
-- se guarda pegado: así un cambio en la plantilla mejora las páginas ya hechas.
-- ---------------------------------------------------------------------------

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,

  -- De qué copy nace, cuando nace de uno.
  copy_id uuid references public.copies (id) on delete set null,

  title text not null,
  -- El identificador de la página en Shopify: /pages/<slug>.
  slug text not null,
  -- Qué marco se usó: listicle, autoridad, pesadilla...
  method_id text,

  -- Las secciones en orden, los huecos de imagen y los comentarios.
  sections jsonb not null default '[]'::jsonb,
  image_slots jsonb not null default '[]'::jsonb,
  comments jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists landing_pages_product_idx
  on public.landing_pages (product_id, created_at desc);

alter table public.landing_pages enable row level security;

create policy "landing_pages_select_own" on public.landing_pages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "landing_pages_insert_own" on public.landing_pages
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "landing_pages_update_own" on public.landing_pages
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "landing_pages_delete_own" on public.landing_pages
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Copys que ya funcionaron, para que la IA aprenda de ellos.
--
-- Un copy que convirtió es la mejor referencia posible, y también uno que
-- fracasó: saber qué no funciona evita repetirlo. Se pueden pegar de otros
-- productos para adaptarlos a este.
-- ---------------------------------------------------------------------------

create table if not exists public.swipe_copies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Nulo a propósito: un copy de otro producto sirve como referencia general.
  product_id uuid references public.products (id) on delete set null,

  title text not null,
  body text not null,
  -- 'funciona' | 'malo' | 'sin-probar'
  status text not null default 'sin-probar',
  -- De dónde salió: la marca o la fuente, para poder juzgarlo.
  source text,
  format text,
  note text,

  created_at timestamptz not null default now()
);

create index if not exists swipe_copies_user_idx
  on public.swipe_copies (user_id, created_at desc);

alter table public.swipe_copies enable row level security;

create policy "swipe_copies_select_own" on public.swipe_copies
  for select to authenticated using (user_id = (select auth.uid()));
create policy "swipe_copies_insert_own" on public.swipe_copies
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "swipe_copies_update_own" on public.swipe_copies
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "swipe_copies_delete_own" on public.swipe_copies
  for delete to authenticated using (user_id = (select auth.uid()));
