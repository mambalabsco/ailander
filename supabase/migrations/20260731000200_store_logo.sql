-- ---------------------------------------------------------------------------
-- El logo de la tienda.
--
-- Hasta ahora el logo se generaba **dentro de cada landing**, así que dos
-- páginas de la misma tienda salían con dos logos distintos — que es justo lo
-- contrario de lo que hace un logo.
--
-- Es una propiedad de la marca, no de una página: vive en la tienda y lo usan
-- las landings, las creatividades y los vídeos. Generarlo una vez y reutilizarlo
-- también ahorra: cada generación cuesta, y hacerlo por página multiplicaba el
-- gasto por algo que debería ser idéntico.
--
-- Se guarda la URL, no la imagen: ya está en el bucket de imágenes con el resto,
-- y duplicar el binario aquí crearía dos copias que pueden divergir.
-- ---------------------------------------------------------------------------

alter table public.stores
  add column if not exists logo_url text,
  -- El prompt con el que se generó, para poder rehacerlo igual o variarlo.
  add column if not exists logo_prompt text;
