-- El dominio `.myshopify.com` de la tienda.
--
-- **La Admin API solo responde ahí.** Con el dominio propio —`naturoxchile.com`—
-- devuelve 404 «Not Found», que parece un problema de permisos y no lo es.
--
-- Se guarda aparte de `domain` porque los dos hacen falta: el propio es el que
-- ve el cliente y el que va en los enlaces de las landings; este solo sirve para
-- hablar con la API.
alter table public.stores
  add column if not exists shopify_shop_domain text;
