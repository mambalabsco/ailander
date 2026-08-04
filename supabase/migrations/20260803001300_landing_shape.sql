-- ---------------------------------------------------------------------------
-- Qué forma tiene cada página.
--
-- Todas salían iguales: el prompt exigía valoración, autor, dato, mecanismo,
-- comparativa, garantía y preguntas, en ese orden. Esa lista salió de tres
-- publirreportajes que funcionan y para publirreportajes está bien — el problema
-- era que fuese la única forma posible.
--
-- Guardar cuál se usó permite lo único que arregla el síntoma sin pedirle a
-- nadie que se acuerde: proponer para la siguiente página una forma que ese
-- producto no haya usado todavía.
--
-- Vacío en las páginas anteriores a esto. Se lee como «no se sabe», que para la
-- rotación es lo mismo que ninguna.
-- ---------------------------------------------------------------------------

alter table public.landing_pages
  add column if not exists shape_id text not null default '';

comment on column public.landing_pages.shape_id is
  'La forma editorial con la que se escribió: publirreportaje, carta, caso, comparativa, diario, entrevista o libre.';
