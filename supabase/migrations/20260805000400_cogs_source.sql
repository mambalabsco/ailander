-- De dónde salió cada coste por unidad: de Shopify o de una persona.
--
-- ## Por qué hace falta distinguirlo
--
-- Porque si no, traer los costes de Shopify pisa lo que alguien ajustó a mano.
-- Y el ajuste a mano existe precisamente cuando el de Shopify no vale: un
-- producto de dropshipping cuyo precio de proveedor incluye el envío, o uno con
-- un coste negociado que nunca se cargó en el inventario.
--
-- Sobrescribirlo no daría error. Volvería el beneficio a un número plausible y
-- distinto, y nadie sabría que se ha movido.
alter table public.cost_cogs
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'shopify'));

comment on column public.cost_cogs.source is
  'manual = lo puso una persona y manda; shopify = vino del inventario y se puede refrescar.';

-- Lo que ya existe lo puso una persona: es la única forma que había de ponerlo.
update public.cost_cogs set source = 'manual' where source is null;
