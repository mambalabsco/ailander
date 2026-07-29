-- ---------------------------------------------------------------------------
-- Registro de errores.
--
-- Hasta ahora un fallo dejaba, como mucho, una frase en la fila del trabajo que
-- lo sufrió. Eso basta para decirle a la persona qué pasó, pero no para
-- diagnosticar: falta dónde ocurrió, con qué producto, y la traza.
--
-- Cuando se investigó el fallo de «no se pudieron extraer los datos», la causa
-- —saldo agotado— estaba en un mensaje que nadie guardaba entero. Hubo que ir a
-- buscarla a mano a la base de datos.
--
-- `context` es el sitio del código, no una categoría: «research-runner
-- extracción» sirve para ir al fichero; «error de IA» no sirve para nada.
-- ---------------------------------------------------------------------------

create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,

  -- Dónde ocurrió, en términos del código.
  context text not null,
  message text not null,
  -- La traza, recortada: guardarla entera llenaría la tabla de ruido.
  stack text,
  -- Clasificación de `describeApiError`: saldo, credenciales, limite...
  kind text,
  -- Cualquier dato que ayude a reproducirlo (modelo, documento, parámetros).
  detail jsonb,

  created_at timestamptz not null default now()
);

create index if not exists error_log_created_idx
  on public.error_log (created_at desc);

create index if not exists error_log_user_created_idx
  on public.error_log (user_id, created_at desc);

alter table public.error_log enable row level security;

create policy "error_log_select_own" on public.error_log
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "error_log_insert_own" on public.error_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Sin update: un registro de error que se puede editar no sirve de registro.
create policy "error_log_delete_own" on public.error_log
  for delete to authenticated
  using (user_id = (select auth.uid()));
