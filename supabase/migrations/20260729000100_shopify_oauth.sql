-- Credenciales de la app de Shopify de cada tienda.
--
-- Las apps del Dev Dashboard **no entregan el token en pantalla**: hay que
-- conseguirlo con OAuth, y para eso hacen falta la clave y el secreto de la app.
--
-- Van por tienda, como el token, porque una app pertenece a una organización de
-- Shopify y no se puede instalar en tiendas de otra. Quien tenga Naturox México
-- y Naturox Chile en organizaciones distintas necesita dos apps.
alter table public.stores
  add column if not exists shopify_api_key text,
  add column if not exists shopify_api_secret text;
