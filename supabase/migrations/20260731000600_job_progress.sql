-- ---------------------------------------------------------------------------
-- Por dónde va un trabajo que aún no ha terminado.
--
-- Hasta ahora un trabajo solo decía «en marcha» o su resumen al acabar. Para una
-- generación de treinta segundos basta; para una que escribe once secciones —una
-- llamada al modelo por sección, en serie— son varios minutos mirando un botón
-- girando sin saber si va por la segunda o por la décima, ni si se ha colgado.
--
-- Es texto y no un porcentaje a propósito: «Comparativa (4 de 11)» dice más que
-- un 36 %, porque nombra lo que está haciendo y no solo cuánto lleva.
-- ---------------------------------------------------------------------------

alter table public.background_jobs
  add column if not exists progress text not null default '';
