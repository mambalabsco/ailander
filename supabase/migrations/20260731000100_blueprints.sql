-- ---------------------------------------------------------------------------
-- Planos de tiendas analizadas.
--
-- Un plano es la **estructura** de una tienda ajena: qué secciones tiene y en
-- qué orden, cómo arma la oferta, qué garantía da, qué scripts carga. Con eso se
-- construye la página propia usando el pipeline que ya existe.
--
-- **No guarda imágenes ni textos de la tienda analizada.** Se guarda cómo está
-- construida, no de qué está hecha: las fotos y los textos son obra de quien los
-- hizo. Lo que se conserva del copy es el ángulo descrito, no sus frases.
--
-- Los planos cuelgan del usuario y no de un producto: el mismo análisis de un
-- competidor sirve para varios productos, y atarlo a uno obligaría a repetirlo
-- —y a pagarlo— por cada uno.
-- ---------------------------------------------------------------------------

create table if not exists public.store_blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  url text not null,
  store_name text not null default '',
  currency text not null default '',

  -- [{kind, purpose, angle, images}] — descripción, nunca el texto literal.
  sections jsonb not null default '[]'::jsonb,
  -- [{quantity, price, compareAt, highlighted}]
  offers jsonb not null default '[]'::jsonb,
  guarantee text not null default '',
  -- [{kind, name, host, importable, note}] — los pixeles salen no importables.
  scripts jsonb not null default '[]'::jsonb,

  -- Qué se leyó, para saber sobre qué se hizo el análisis.
  pages jsonb not null default '[]'::jsonb,
  notes text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists store_blueprints_user_idx
  on public.store_blueprints (user_id, created_at desc);

alter table public.store_blueprints enable row level security;

create policy "store_blueprints_own" on public.store_blueprints
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
