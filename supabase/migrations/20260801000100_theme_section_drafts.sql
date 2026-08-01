-- ---------------------------------------------------------------------------
-- Secciones ya escritas, guardadas para no volver a pagarlas.
--
-- Recrear una página son diez u once llamadas al modelo, una por sección, y
-- hasta ahora no se guardaba nada hasta el final: si el servidor se reiniciaba
-- en la novena, se perdían las ocho anteriores y había que pagarlas otra vez.
-- Pasó, y es la clase de fallo que desanima a usar la herramienta.
--
-- Ahora cada sección se guarda en cuanto pasa la revisión. Al volver a lanzarlo,
-- las que ya estaban se reutilizan y solo se paga lo que falta.
--
-- La clave es el plano, la página y el papel con su número de orden. Volver a
-- analizar la tienda crea un plano nuevo, así que un rediseño no reutiliza nada
-- viejo — que es lo correcto: el objetivo es parecerse a la tienda de hoy.
-- ---------------------------------------------------------------------------

create table if not exists public.theme_section_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  blueprint_id uuid not null references public.store_blueprints (id) on delete cascade,
  -- home, catalogo o producto.
  page text not null,
  -- El papel: heroe, comparativa, faq…
  kind text not null,
  -- Su posición en la página, porque puede haber dos del mismo papel.
  ordinal integer not null,

  -- Cómo se llama el archivo: `lp-comparativa-1`.
  section_type text not null,
  liquid text not null,
  -- Los valores de los ajustes de la sección.
  settings jsonb not null default '{}'::jsonb,
  -- [{type, settings}] — los bloques, en orden.
  blocks jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  unique (blueprint_id, page, kind, ordinal)
);

create index if not exists theme_section_drafts_lookup_idx
  on public.theme_section_drafts (user_id, blueprint_id, page);

alter table public.theme_section_drafts enable row level security;

create policy "theme_section_drafts_own" on public.theme_section_drafts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
