-- ---------------------------------------------------------------------------
-- Imágenes de referencia rehechas con el producto propio.
--
-- Es el paso que convierte una maqueta prestada en material propio: misma
-- escena, mismo encuadre, **otro envase**. Sin él, una página publicada enseña
-- el frasco de otra marca y anuncia algo distinto de lo que llega en el paquete.
--
-- Se guarda de dónde salió cada una para poder rehacerla, y la lectura que se
-- hizo del original —qué texto llevaba, si valía, qué marcas había— porque es lo
-- que permite pedir otra pasada sin volver a analizar la imagen.
--
-- `parent_id` encadena los reintentos: pedir «mejorar la actual» parte del
-- resultado anterior, así que hay que saber cuál era.
-- ---------------------------------------------------------------------------

create table if not exists public.adapted_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  product_id text not null,
  -- La imagen de la que se partió.
  source_url text not null,
  width integer not null default 0,
  height integer not null default 0,
  aspect_ratio text not null default '1:1',

  -- {scene, text, textFits, textReason, suggestedText, brandNames}
  reading jsonb not null default '{}'::jsonb,
  -- Lo que se le pidió al modelo de imagen, para poder repetirlo o ajustarlo.
  prompt text not null default '',
  result_url text not null default '',
  -- Lo que el repaso encontró raro. Se enseña al lado de la imagen.
  warnings jsonb not null default '[]'::jsonb,

  -- De qué intento anterior sale este, cuando se pidió mejorar.
  parent_id uuid references public.adapted_images (id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists adapted_images_user_idx
  on public.adapted_images (user_id, product_id, created_at desc);

alter table public.adapted_images enable row level security;

create policy "adapted_images_own" on public.adapted_images
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
