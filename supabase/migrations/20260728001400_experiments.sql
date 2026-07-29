-- ---------------------------------------------------------------------------
-- Reparto de tráfico entre landings y embudo por variante.
--
-- Un experimento agrupa varias páginas con un peso cada una: 40/30/20/10, o
-- cinco al 20%. El visitante entra por **una sola URL** y el servidor decide
-- cuál le toca, así que un mismo anuncio puede repartir entre varias páginas.
--
-- El embudo se arma con eventos, no con consultas a Shopify, porque los pasos
-- intermedios —carrito, pasarela— no existen en la API de pedidos: solo se ven
-- desde el navegador. La visita sí la cuenta el servidor, que es el dato menos
-- manipulable de los cuatro.
-- ---------------------------------------------------------------------------

create table if not exists public.landing_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,

  name text not null,
  -- El tramo de la URL: `/apps/lp/<slug>`.
  slug text not null,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.landing_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.landing_experiments (id) on delete cascade,
  landing_id uuid not null references public.landing_pages (id) on delete cascade,

  -- Peso relativo, no porcentaje: así 30/30/40 y 3/3/4 se comportan igual y no
  -- hay que validar que sumen cien.
  weight integer not null default 1 check (weight >= 0),

  created_at timestamptz not null default now(),
  unique (experiment_id, landing_id)
);

create table if not exists public.landing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  experiment_id uuid references public.landing_experiments (id) on delete cascade,
  variant_id uuid references public.landing_variants (id) on delete cascade,

  -- 'visita' | 'carrito' | 'pasarela' | 'compra'
  kind text not null,

  /*
   * Quién, de forma anónima.
   *
   * Es un identificador que se genera en el navegador, no un dato personal.
   * Sirve para no contar cinco veces al mismo visitante y para saber que quien
   * compró es quien vio esa variante.
   */
  visitor text,

  -- Solo en 'compra': importe y moneda, para el ticket medio.
  value numeric(12, 2),
  currency text,

  -- Qué anuncio lo trajo, de la etiqueta de la URL.
  utm_content text,

  created_at timestamptz not null default now()
);

create index if not exists landing_events_experiment_idx
  on public.landing_events (experiment_id, kind, created_at desc);
create index if not exists landing_events_variant_idx
  on public.landing_events (variant_id, kind);
-- Para descartar visitas repetidas del mismo navegador sin recorrer la tabla.
create index if not exists landing_events_visitor_idx
  on public.landing_events (experiment_id, visitor, kind);

alter table public.landing_experiments enable row level security;
alter table public.landing_variants enable row level security;
alter table public.landing_events enable row level security;

create policy "experiments_own" on public.landing_experiments
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Las variantes cuelgan de un experimento: se comprueba su dueño.
create policy "variants_own" on public.landing_variants
  for all to authenticated
  using (
    exists (select 1 from public.landing_experiments e
             where e.id = experiment_id and e.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.landing_experiments e
             where e.id = experiment_id and e.user_id = (select auth.uid()))
  );

create policy "events_own" on public.landing_events
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
