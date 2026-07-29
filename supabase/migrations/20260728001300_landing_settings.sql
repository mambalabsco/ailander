-- Ajustes de cada página y atribución.
--
-- `hide_theme_chrome`: un publirreportaje con la cabecera y el pie de la tienda
-- encima deja de parecer un artículo y se lee como una landing de producto, que
-- es justo lo que este formato evita. Se apaga por página, no globalmente:
-- algunas piezas sí quieren la navegación.
alter table public.landing_pages
  add column if not exists hide_theme_chrome boolean not null default true;

-- La campaña con la que se etiqueta el tráfico de esta página, para poder
-- separar en Shopify qué pedidos vinieron de aquí y desde qué anuncio.
alter table public.landing_pages
  add column if not exists utm_campaign text;
