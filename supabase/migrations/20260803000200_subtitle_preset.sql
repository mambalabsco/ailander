-- ---------------------------------------------------------------------------
-- El estilo de subtítulo de cada vídeo.
--
-- Va por vídeo y no en la configuración general: el estilo se elige por anuncio,
-- igual que el animador. Uno con mucho movimiento va bien en un gancho corto y
-- estorba en un explicativo largo.
--
-- Vacío es «sin subtítulos», que también es una decisión válida.
-- ---------------------------------------------------------------------------

alter table public.videos
  add column if not exists subtitle_preset text not null default 'hustle';
