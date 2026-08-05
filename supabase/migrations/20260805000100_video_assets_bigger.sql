-- ---------------------------------------------------------------------------
-- La música normalizada no cabía.
--
-- El bucket admitía 25 MB y guardaba WAV: lo que devuelve el normalizador de
-- volumen es audio sin comprimir, y tres minutos de estéreo a 48 kHz se van por
-- encima de eso. El error que llegaba —«The object exceeded the maximum allowed
-- size»— no decía ni cuánto pesaba ni cuál era el tope.
--
-- Se sube a 64 MB, que cubre cuatro minutos de WAV con margen. No más: el tope
-- existe para que un archivo equivocado no llene el disco, y sin tope el primer
-- vídeo que alguien suba por error se lleva el sitio de todo lo demás.
--
-- Y se admiten los tipos que devuelven de verdad los proveedores. `audio/x-wav`
-- es el mismo WAV con otro nombre, y rechazarlo por el nombre daba un fallo que
-- parecía del archivo.
-- ---------------------------------------------------------------------------

update storage.buckets
set
  file_size_limit = 67108864,
  allowed_mime_types = array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac',
    'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
    'audio/ogg', 'audio/webm', 'audio/flac'
  ]
where id = 'video-assets';
