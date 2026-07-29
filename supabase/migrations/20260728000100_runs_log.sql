-- ---------------------------------------------------------------------------
-- Registro de generaciones y modelo de extracción aparte.
--
-- Dos cosas que faltaban y que la primera tanda real dejó claras:
--
-- 1. **No había forma de saber cuánto se había gastado.** El coste solo existía
--    en el mensaje efímero de la interfaz; al recargar la página desaparecía.
--    Sin registro no se puede decidir si un modelo sale a cuenta.
--
-- 2. **La extracción usaba el modelo de investigación**, que es el caro. Leer un
--    informe ya escrito y rellenar un esquema no necesita ese nivel.
-- ---------------------------------------------------------------------------

alter table public.provider_configs
  add column if not exists claude_extraction_model text not null
    default 'claude-sonnet-5';

create table if not exists public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Puede quedar en null: si borras el producto, el gasto que hiciste sigue
  -- siendo un hecho y borrar el historial escondería dinero ya pagado.
  product_id uuid references public.products (id) on delete set null,
  product_name text,

  -- 'investigacion', 'extraccion', 'copy', 'imagen'…
  kind text not null,
  -- Qué se pidió exactamente, para poder repetirlo o entenderlo después.
  detail text,

  model text,
  status text not null default 'ok',
  error text,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  web_searches integer not null default 0,

  -- El coste se guarda calculado, no se recalcula al leer: los precios cambian
  -- y un histórico que se recalcula con tarifas nuevas deja de ser un histórico.
  cost_usd numeric(10, 4) not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists generation_runs_user_created_idx
  on public.generation_runs (user_id, created_at desc);

alter table public.generation_runs enable row level security;

-- Cada usuario ve solo su gasto. `(select auth.uid())` en vez de `auth.uid()`
-- para que el planificador lo evalúe una vez y no por fila.
create policy "generation_runs_select_own" on public.generation_runs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "generation_runs_insert_own" on public.generation_runs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Sin update ni delete a propósito: un registro de gasto que se puede editar no
-- sirve para lo que existe.
