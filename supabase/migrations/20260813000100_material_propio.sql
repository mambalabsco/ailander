-- ---------------------------------------------------------------------------
-- De quién es el material que se analiza.
--
-- No es una etiqueta informativa: **decide qué se puede heredar**. De un anuncio
-- propio, una promesa concreta y sus cifras son datos comprobados y pueden pasar
-- al ángulo. De uno ajeno, una cifra es algo que dijo otro sobre otro producto, y
-- heredarla es afirmar lo que nadie ha comprobado.
--
-- El valor por defecto es 'ajeno' porque es el lado seguro: lo que ya hay en el
-- archivo se pegó de otras marcas.
-- ---------------------------------------------------------------------------

alter table public.swipe_copies
  add column if not exists ownership text not null default 'ajeno'
    check (ownership in ('propio', 'ajeno'));

comment on column public.swipe_copies.ownership is
  'propio = comprobado, se puede heredar la promesa. ajeno = solo la construcción.';
