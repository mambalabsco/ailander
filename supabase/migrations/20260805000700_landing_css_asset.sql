-- Sitio para la hoja de estilos de una landing copiada.
--
-- ## Por qué el CSS sale del cuerpo de la página
--
-- Shopify rechaza un `page.body` de más de 512 KB, y una copia de una landing
-- de Shopify pesa más: el marcado son unos 220 KB y el CSS del tema, unos 350.
-- Podando lo que la página no usa baja a 471, que publica con 41 KB de margen —
-- y la siguiente página un poco más pesada vuelve a chocar.
--
-- La salida limpia sería un asset del tema, pero `themeFilesUpsert` exige, además
-- de `write_themes`, una **exención que concede Shopify a mano**, y aplica igual
-- a las apps personalizadas de una tienda.
--
-- Así que la hoja se sirve desde aquí y en la página queda un `<link>`. El cuerpo
-- baja a ~220 KB con margen de sobra. El bucket ya es público porque el servicio
-- de montaje descarga de él.
--
-- Nota: la página copiada ya dependía de un CDN ajeno —las imágenes siguen siendo
-- las del original— así que esto no añade una clase de dependencia nueva, y
-- además es una que sí controlamos.
update storage.buckets
set
  allowed_mime_types = array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac',
    'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
    'audio/ogg', 'audio/webm', 'audio/flac',
    'text/css'
  ]
where id = 'video-assets';
