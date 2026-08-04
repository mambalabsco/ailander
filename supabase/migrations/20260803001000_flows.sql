-- ---------------------------------------------------------------------------
-- Flujos: el anuncio dibujado como un grafo.
--
-- Un flujo es el **plano**: qué nodos hay, cómo se conectan y con qué ajustes.
-- No guarda resultados. Se ejecuta las veces que haga falta —con otro avatar,
-- con otro ángulo— y cada ejecución produce lo suyo.
--
-- Por eso son dos tablas y no una. Mezclarlas obligaría a duplicar el plano
-- entero en cada ejecución, y cambiar un nodo dejaría las ejecuciones viejas
-- describiendo un flujo que ya no es el que produjo aquello.
--
-- ## El grafo en `jsonb` y no en tablas
--
-- Un nodo y una conexión no se consultan por separado: se leen y se escriben
-- **siempre juntos**, porque un grafo a medias no significa nada. Con tablas
-- habría que hacer tres consultas y una transacción para mover una caja.
-- ---------------------------------------------------------------------------

create table if not exists public.flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  name text not null default 'Sin título',
  -- Sobre qué producto va, para que los nodos de fuente sepan de dónde tirar.
  product_id text not null default '',

  -- `{ nodes: [...], edges: [...] }`. Ver `flow/graph.ts`.
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flows_user_idx on public.flows (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Y lo que produjo cada ejecución, nodo a nodo.
--
-- Nodo a nodo y no solo el resultado final por dos motivos. Uno: si el flujo
-- falla en el paso nueve, los ocho anteriores están hechos y pagados —volver a
-- ejecutar no puede volver a pagarlos—. Dos: mirar dónde se torció exige ver
-- qué salió de cada paso, no solo que el último no salió.
-- ---------------------------------------------------------------------------

create table if not exists public.flow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  flow_id uuid not null references public.flows (id) on delete cascade,

  -- `corriendo`, `hecho`, `error`, `cancelado`.
  status text not null default 'corriendo',
  -- Con qué se ejecutó: el avatar de esta vuelta, el ángulo, lo que varíe.
  variables jsonb not null default '{}'::jsonb,
  note text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flow_runs_flow_idx on public.flow_runs (flow_id, created_at desc);

create table if not exists public.flow_outputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid not null references public.flow_runs (id) on delete cascade,

  -- El nodo del grafo que lo produjo.
  node_id text not null,
  -- `texto`, `imagen`, `video`, `audio`, `guion`, `producto`.
  kind text not null default 'texto',
  -- Una dirección para lo que es un archivo; el texto en crudo para lo que no.
  url text not null default '',
  value text not null default '',
  error text not null default '',

  created_at timestamptz not null default now()
);

create unique index if not exists flow_outputs_node_idx
  on public.flow_outputs (run_id, node_id);

alter table public.flows enable row level security;
alter table public.flow_runs enable row level security;
alter table public.flow_outputs enable row level security;

create policy "flows_own" on public.flows
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "flow_runs_own" on public.flow_runs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "flow_outputs_own" on public.flow_outputs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
