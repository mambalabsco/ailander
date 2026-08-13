-- ---------------------------------------------------------------------------
-- De dónde sale un ángulo, cuando sale de un anuncio analizado.
--
-- `set null` y no `cascade`: borrar la anatomía no puede llevarse ángulos que ya
-- se están usando en copys y en vídeos. Pierden la referencia, que es lo que
-- sobra, no el trabajo.
--
-- Y la promesa que el ángulo pide y la investigación no sostiene. Se guarda, no
-- se censura: un ángulo silenciado es un ángulo que no se puede discutir, y esto
-- existe precisamente para poder discutirlos. Vacío es lo normal.
-- ---------------------------------------------------------------------------

alter table public.angles
  add column if not exists source_analysis_id uuid
    references public.analyses (id) on delete set null;

alter table public.angles
  add column if not exists promise_to_validate text not null default '';

comment on column public.angles.promise_to_validate is
  'Lo que el ángulo pide y la investigación no sostiene. Vacío = se sostiene.';
