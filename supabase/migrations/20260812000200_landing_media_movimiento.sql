-- El bucket de imágenes también guarda lo que se mueve.
--
-- Un hueco de una landing puede llevar un bucle corto en vez de una foto. La
-- validación del código ya lo admite, pero el bucket tiene la suya y **esa es la
-- que de verdad no se puede saltar**: sin esto, la subida falla con «mime type
-- video/webm is not supported» — el mismo fallo que tuvo el bucket de vídeo.
update storage.buckets
set
  allowed_mime_types = array[
    'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif',
    'video/webm', 'video/mp4'
  ],
  file_size_limit = 20971520
where id = 'product-images';
