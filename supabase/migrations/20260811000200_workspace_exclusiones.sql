-- Espacio compartido — quién NO ve un producto.
--
-- El reparto es al revés de lo que parece: por defecto **todo el equipo ve
-- todo**, y lo que se guarda son las excepciones. Se decidió así porque es como
-- se trabaja: entra alguien y trabaja sobre lo que hay; sacarle de un producto
-- concreto es lo raro.
--
-- Guardar lo contrario —una lista de a qué sí tiene acceso cada uno— parece más
-- seguro y en la práctica es peor: cada producto nuevo nace invisible para todo
-- el mundo hasta que alguien se acuerda de repartirlo, y lo que ocurre entonces
-- es que se reparte a todos por costumbre y la lista deja de significar nada.
--
-- Con exclusiones, olvidarse tiene la consecuencia benigna: se ve. Y una lista
-- corta se lee de un vistazo, que es lo que hace que alguien la revise.
create table if not exists public.product_exclusions (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  product_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Por qué se le sacó. Sin esto, dentro de tres meses nadie sabe si fue una
  -- decisión o un descuido, y en la duda se deja como está.
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (workspace_id, product_id, user_id)
);

create index if not exists product_exclusions_user on public.product_exclusions (user_id);

alter table public.product_exclusions enable row level security;

-- Cada uno ve de qué se le ha sacado. No se esconde: saber que existe algo que
-- no puedes ver evita la media hora buscando un producto que nadie te quitó.
drop policy if exists "cada uno ve sus exclusiones" on public.product_exclusions;
create policy "cada uno ve sus exclusiones" on public.product_exclusions
  for select using (user_id = auth.uid());
