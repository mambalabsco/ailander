-- El token de Shopify es **de cada tienda**, no de la cuenta.
--
-- Se puso primero en `provider_configs`, junto a las claves de los modelos, y
-- estaba mal: ahí solo cabe una tienda. Quien lleva Naturox México y Naturox
-- Chile necesita un token por cada una, porque son dos apps distintas en dos
-- tiendas distintas.
--
-- El dominio ya vivía en `stores`, así que solo faltaba el token a su lado.
alter table public.stores
  add column if not exists shopify_admin_token text;

-- Las columnas globales se retiran: nunca llegaron a usarse y dejarlas
-- invitaría a configurar la tienda equivocada.
alter table public.provider_configs
  drop column if exists shopify_domain,
  drop column if exists shopify_admin_token;
