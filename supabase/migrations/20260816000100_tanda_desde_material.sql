-- ---------------------------------------------------------------------------
-- De qué material salió una tanda de anuncios, cuando no salió de un ángulo.
--
-- Va en el **conjunto** y no en cada anuncio porque es una propiedad de la
-- tanda: repetirla en las veinte filas es la misma verdad escrita veinte veces,
-- y `angle_id` —lo mismo para el otro camino— ya vive aquí.
--
-- `set null` y no `cascade`: borrar la anatomía no puede llevarse por delante
-- una campaña que está corriendo. Pierde la referencia, que es lo que sobra, no
-- el trabajo.
--
-- El `check` no es adorno: un nivel mal escrito no fallaría al guardar, y al
-- leerlo no coincidiría con ninguno de los tres. La tanda saldría sin nivel y
-- nadie sabría por qué.
-- ---------------------------------------------------------------------------

alter table public.adsets
  add column if not exists source_analysis_id uuid
    references public.analyses (id) on delete set null;

alter table public.adsets
  add column if not exists source_level text not null default ''
    check (source_level in ('', 'mismo', 'ampliado', 'referencia'));

comment on column public.adsets.source_analysis_id is
  'La anatomía de la que salió la tanda. Nulo = salió de un ángulo o de nada.';

comment on column public.adsets.source_level is
  'Con qué cercanía se copió el material. Vacío = no salió de un material.';
