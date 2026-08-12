-- ---------------------------------------------------------------------------
-- Un producto en varios mercados.
--
-- Hasta ahora un producto vivía en **un** mercado y el mismo producto en dos
-- países eran dos productos. Para una parte del catálogo eso deja de ser cierto.
--
-- La membresía y el precio de cada país viven **solo aquí**. `products.price` y
-- `products.currency` se quedan como el precio base, y `products.market_id` pasa
-- a significar «mercado base». Tener la moneda en dos sitios es la puerta a que
-- los dos discrepen, y cuando discrepan el que se publica es el equivocado.
-- ---------------------------------------------------------------------------

create table if not exists public.product_markets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  market_id uuid not null references public.store_markets (id) on delete cascade,

  price numeric(12, 2) check (price >= 0),
  -- De dónde salió el número. 'manual' gana siempre, y no por educación: el
  -- conversor filtra por esta columna, así que no puede pisarlo.
  price_source text not null default 'ninguno'
    check (price_source in ('manual', 'convertido', 'ninguno')),
  -- El cambio con el que se convirtió, congelado al fijarlo. Nulos cuando el
  -- precio es manual. Se guardan para poder explicar el número meses después.
  price_fx_day date,
  price_fx_rate numeric check (price_fx_rate > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un producto no puede estar dos veces en el mismo mercado: serían dos precios
  -- para la misma página y ganaría el que devolviera antes la consulta.
  unique (product_id, market_id)
);

create index if not exists product_markets_product_id_idx
  on public.product_markets (product_id);
create index if not exists product_markets_market_id_idx
  on public.product_markets (market_id);

drop trigger if exists product_markets_touch on public.product_markets;
create trigger product_markets_touch
  before update on public.product_markets
  for each row execute function public.touch_updated_at();

drop trigger if exists poner_espacio on public.product_markets;
create trigger poner_espacio before insert on public.product_markets
  for each row execute function public.poner_espacio();

alter table public.product_markets enable row level security;

-- `drop policy if exists` delante de cada una: estas migraciones se reejecutan
-- en cada despliegue y `create policy` no admite `if not exists`, así que sin
-- esto el segundo despliegue aborta y se lleva lo que venga detrás.
drop policy if exists "product_markets_lectura" on public.product_markets;
create policy "product_markets_lectura" on public.product_markets
  for select to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop policy if exists "product_markets_escritura" on public.product_markets;
create policy "product_markets_escritura" on public.product_markets
  for all to authenticated
  using (workspace_id in (select public.mis_espacios()))
  with check (workspace_id in (select public.mis_espacios()));

-- ---------------------------------------------------------------------------
-- Lo que ya existe entra sin cambiar de estado.
--
-- Cada producto con mercado pasa a tener ese mercado con su precio marcado como
-- 'manual', porque es la verdad: alguien lo escribió. Marcarlo 'convertido'
-- haría que la plataforma pidiera confirmar precios que llevan meses publicados.
-- ---------------------------------------------------------------------------

insert into public.product_markets
  (user_id, workspace_id, product_id, market_id, price, price_source)
select p.user_id, p.workspace_id, p.id, p.market_id, p.price,
       case when p.price > 0 then 'manual' else 'ninguno' end
from public.products p
where p.market_id is not null
on conflict (product_id, market_id) do nothing;

-- ---------------------------------------------------------------------------
-- El interruptor de la investigación.
--
-- Apagado —por mercado— también para lo existente. El público de Chile y el de
-- México no son el mismo, y ese era el motivo original de duplicar productos.
-- Encenderlo es un acto explícito que dice «esta investigación viaja».
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists research_shared boolean not null default false;

comment on column public.products.research_shared is
  'Si los seis documentos valen para todos los mercados del producto.';

comment on column public.products.market_id is
  'Mercado base: el del precio de products.price. Los demás, en product_markets.';
