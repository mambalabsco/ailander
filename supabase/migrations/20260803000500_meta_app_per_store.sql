-- ---------------------------------------------------------------------------
-- La app de Meta, por tienda.
--
-- Estaba en variables de entorno, una sola para toda la plataforma, y el
-- razonamiento escrito era: «una sola app de Meta sirve para todas las cuentas
-- publicitarias a las que el usuario tenga acceso».
--
-- Eso vale mientras todos los Business Manager cuelguen del mismo perfil de
-- Facebook. En cuanto hay un segundo BM en otro perfil, hace falta otra app
-- —Meta obliga— y con la configuración en el entorno solo cabe una: conectar la
-- segunda tienda significaba cambiar la variable y reiniciar, dejando la
-- primera apuntando a una app que ya no es la suya.
--
-- Así que pasa a ser por tienda, como la de Shopify, con el entorno de
-- respaldo para quien tenga una sola.
--
-- `client_id` y `client_secret` ya existían para Google y son literalmente lo
-- mismo —las credenciales de cliente de OAuth—, así que se reutilizan; el
-- `provider` ya distingue de cuál se habla. Lo único que falta es el
-- `config_id`, que es de Facebook Login for Business y no tiene equivalente.
-- ---------------------------------------------------------------------------

alter table public.ad_credentials
  add column if not exists config_id text;

comment on column public.ad_credentials.client_id is
  'OAuth: identificador de la app. En Google el cliente; en Meta el App ID.';

comment on column public.ad_credentials.client_secret is
  'OAuth: secreto de la app. Nunca se devuelve a la pantalla, solo se dice si está puesto.';

comment on column public.ad_credentials.config_id is
  'Meta: la configuración de Facebook Login for Business, cuando la app la usa.';

-- ---------------------------------------------------------------------------
-- Y de qué Business Manager es cada cuenta publicitaria.
--
-- Sin esto la lista de cuentas es plana: con dos BM que tengan una «Naturox MX»
-- cada uno, no hay forma de saber cuál se está activando salvo mirando el
-- identificador. Meta lo devuelve en el propio nodo de la cuenta, así que es un
-- campo más en la misma llamada.
-- ---------------------------------------------------------------------------

alter table public.ad_accounts
  add column if not exists business_id text not null default '';

alter table public.ad_accounts
  add column if not exists business_name text not null default '';
