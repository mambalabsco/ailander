-- ---------------------------------------------------------------------------
-- Trabajos en segundo plano.
--
-- Hasta ahora cada generación vivía dentro de la petición del navegador: cerrar
-- la pestaña la mataba a mitad, con el dinero ya gastado. La investigación se
-- resolvió marcando su estado en `research_documents`, pero eso solo sirve para
-- ella — los ángulos, los copys o las imágenes no tienen dónde apuntar «esto
-- está en marcha».
--
-- Esta tabla es ese sitio, para todos por igual.
--
-- `result` existe porque algunos trabajos devuelven algo que la interfaz
-- necesita para seguir: la búsqueda de competidores propone candidatos y espera
-- que confirmes cuáles entran. Si el resultado solo viviera en la respuesta
-- HTTP, ese trabajo no podría correr en segundo plano.
-- ---------------------------------------------------------------------------

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,

  -- 'angulos', 'ganchos', 'copys', 'competidores', 'imagenes'…
  kind text not null,
  -- Lo que se le enseña a la persona: «12 ganchos para Revital Serum».
  label text not null,

  status text not null default 'running',
  -- Qué pasó, en una frase. Es lo que sustituye al mensaje que antes devolvía
  -- la acción directamente.
  summary text,
  error text,

  -- Solo para los trabajos cuyo resultado la interfaz necesita en mano.
  result jsonb,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,

  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- La consulta que hace la interfaz cada pocos segundos: los de este producto,
-- los más nuevos primero. Sin índice, cada sondeo recorre la tabla entera.
create index if not exists background_jobs_product_idx
  on public.background_jobs (product_id, created_at desc);

create index if not exists background_jobs_user_status_idx
  on public.background_jobs (user_id, status);

alter table public.background_jobs enable row level security;

create policy "background_jobs_select_own" on public.background_jobs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "background_jobs_insert_own" on public.background_jobs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Update sí, a diferencia del registro de gasto: un trabajo cambia de estado al
-- terminar. Lo que no puede es cambiar de dueño.
create policy "background_jobs_update_own" on public.background_jobs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "background_jobs_delete_own" on public.background_jobs
  for delete to authenticated
  using (user_id = (select auth.uid()));
