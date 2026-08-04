-- ---------------------------------------------------------------------------
-- Los fotogramas del anuncio analizado, para poder adaptarlos.
--
-- La tabla se creó diciendo que el vídeo no se conserva: se sube, se le sacan
-- fotogramas y audio, se analiza y se borra. Eso sigue siendo cierto — el vídeo
-- no se guarda y su transcripción tampoco.
--
-- Lo que cambia, por decisión explícita, es que **los fotogramas sí se guardan**.
-- El motivo es el modo clonador: sin ellos, cada escena se rehace solo desde su
-- descripción, y describir un plano con palabras pierde justo lo que se quería
-- copiar —el encuadre, la luz, dónde cae el sujeto—. Con el fotograma delante,
-- la escena nueva se genera **con él de referencia** y sale la misma toma con
-- otro producto, que es lo que se pidió.
--
-- Se guarda la dirección en el bucket, no la imagen: un JPEG por fila es lo que
-- convierte una tabla en un disco lleno.
--
-- Solo el segundo del que salió cada uno. Es lo que permite emparejar fotograma
-- y momento del análisis sin volver a mirar el vídeo, que ya no existe.
-- ---------------------------------------------------------------------------

alter table public.video_references
  add column if not exists frames jsonb not null default '[]'::jsonb;

comment on column public.video_references.frames is
  'Los fotogramas guardados: [{url, at}]. `at` es el segundo del vídeo del que salió.';
