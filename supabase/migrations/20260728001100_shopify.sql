-- Credenciales de Shopify y estado de publicación de cada página.
--
-- El token de Admin API se guarda junto al resto de claves privadas, en la
-- tabla que solo lee el cliente de servicio: nunca viaja al navegador.
--
-- `shopify_page_id` es lo que permite que republicar **actualice** en vez de
-- crear otra página. Sin él, cada corrección dejaría un enlace nuevo y los
-- anuncios que ya apuntan al primero seguirían mostrando la versión vieja.
alter table public.provider_configs
  add column if not exists shopify_domain text,
  add column if not exists shopify_admin_token text;

alter table public.landing_pages
  add column if not exists shopify_page_id text,
  add column if not exists shopify_url text,
  add column if not exists published_at timestamptz;

-- La URL de CDN de cada imagen ya subida, para no volver a subirla.
alter table public.product_images
  add column if not exists shopify_url text;
