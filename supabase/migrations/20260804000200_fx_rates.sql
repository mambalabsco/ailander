-- ---------------------------------------------------------------------------
-- El cambio de cada día, guardado.
--
-- Las cuentas publicitarias facturan en la moneda que tengan —la mayoría de las
-- de Meta abiertas desde fuera están en dólares— y la tienda vende en pesos. El
-- panel sumaba los dos números **como si fueran la misma moneda**: un gasto de
-- 23,77 USD salía escrito «23,77 CLP», y el beneficio salía disparado porque se
-- restaba un gasto veinte mil pesos más pequeño del real.
--
-- Se guarda por día y no se convierte al vuelo con el cambio de hoy, porque el
-- gasto del martes pasado se gastó al cambio del martes pasado. Convirtiendo
-- siempre con el de hoy, el informe de un mes cerrado cambia solo cada mañana y
-- dos capturas del mismo mes no cuadran.
--
-- `exact` distingue el cambio de ese día del de hoy aplicado a un día pasado.
-- Las fuentes gratuitas con histórico cubren las monedas del banco central
-- europeo —el peso mexicano sí, el chileno no—, así que para algunas no queda
-- otra. Eso es una aproximación y se dice en vez de darla con la misma cara que
-- un dato exacto.
--
-- No cuelga del usuario: un cambio de divisa es el mismo para todo el mundo y no
-- es de nadie. Por eso se puede leer entero y solo lo escribe el servidor.
-- ---------------------------------------------------------------------------

create table if not exists public.fx_rates (
  day date not null,
  base text not null,
  quote text not null,
  rate numeric not null check (rate > 0),
  -- Falso cuando es el cambio de hoy puesto sobre un día para el que no había.
  exact boolean not null default true,
  created_at timestamptz not null default now(),

  primary key (day, base, quote)
);

create index if not exists fx_rates_pair_idx on public.fx_rates (base, quote, day desc);

alter table public.fx_rates enable row level security;

-- Lectura para cualquiera con sesión: es un dato público y compartirlo evita
-- que cada persona vuelva a pedir el mismo cambio a la misma fuente.
create policy "fx_rates_read" on public.fx_rates
  for select to authenticated using (true);

-- La escritura la hace el servidor con la clave de servicio, que se salta RLS.
-- Sin política de escritura, nadie con sesión puede inventarse un cambio.
