-- ---------------------------------------------------------------------------
-- Con qué modelo se anima cada vídeo.
--
-- Se guarda por vídeo y no en la configuración general porque los dos modelos
-- que hay sirven para cosas distintas: uno da mejor imagen y cuesta cuatro veces
-- más, y esa decisión se toma por anuncio.
--
-- Además hace falta para reanimar tomas sueltas: sin saber con cuál se hizo el
-- resto, una toma rehecha saldría con otro aspecto y se notaría en el corte.
-- ---------------------------------------------------------------------------

alter table public.videos
  add column if not exists video_model text not null default 'kling';
