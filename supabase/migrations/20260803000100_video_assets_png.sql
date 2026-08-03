-- ---------------------------------------------------------------------------
-- El bucket de piezas de vídeo también acepta imágenes.
--
-- Se creó cuando ahí solo iba la voz, así que solo admitía audio. Los subtítulos
-- se dibujan como PNG y van al mismo sitio —el montaje los descarga por su
-- cuenta, igual que la voz— y **todos se estaban rechazando**.
--
-- Sin ruido: el fallo se tragaba a propósito para que un subtítulo perdido no
-- tumbara el montaje, así que el vídeo salía entero y sin ningún subtítulo, y
-- nada lo decía. Un `catch` que no cuenta nada convierte un fallo de una línea en
-- media hora de buscar.
-- ---------------------------------------------------------------------------

update storage.buckets
set allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/wav', 'image/png']
where id = 'video-assets';
