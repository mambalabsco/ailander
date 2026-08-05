-- Modo dropshipping por zona de envío.
--
-- Cuando el proveedor cobra producto y envío en un solo precio, ese precio ya
-- está en el coste por unidad. Sumarle además el tramo de la zona cuenta el
-- envío **dos veces** y baja el beneficio sin que nada avise — y en
-- dropshipping, donde el margen es fino, esa diferencia decide si un producto
-- parece que pierde dinero.
alter table public.cost_shipping_zones
  add column if not exists dropshipping boolean not null default false;

comment on column public.cost_shipping_zones.dropshipping is
  'Si el precio del proveedor ya incluye el envío. Con esto, el tramo de la zona no se suma.';
