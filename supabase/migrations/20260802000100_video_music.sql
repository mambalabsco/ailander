-- ---------------------------------------------------------------------------
-- Música de fondo del vídeo.
--
-- Se guarda la dirección de la pista que se elija, no el archivo: quien la sube
-- la deja en el bucket de piezas de vídeo, que ya es público porque el montaje
-- descarga por su cuenta.
--
-- **Tiene que venir ya baja de volumen.** El montaje no tiene control de
-- volumen: una pista a nivel normal tapa la voz y el anuncio no se entiende, y
-- eso no se arregla desde aquí. Se avisa donde se sube.
-- ---------------------------------------------------------------------------

alter table public.videos
  add column if not exists music_url text not null default '';
