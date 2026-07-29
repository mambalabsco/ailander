-- ---------------------------------------------------------------------------
-- Moneda propia del producto.
--
-- La moneda salía del mercado de la tienda. Los productos de la **competencia**
-- no tienen tienda en la plataforma, así que caían al valor por defecto —euros—
-- y un producto estadounidense de 49 dólares aparecía como «49 €».
--
-- El daño no era solo cosmético: la gráfica de precios ponía ese importe en la
-- misma barra que el tuyo, en otra moneda, y la comparación era falsa mientras
-- parecía correcta.
--
-- Nula a propósito: cuando hay tienda, la moneda sigue saliendo de su mercado y
-- duplicarla aquí abriría la puerta a que las dos discrepen.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists currency text;
