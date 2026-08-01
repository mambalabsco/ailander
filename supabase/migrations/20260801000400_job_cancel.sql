-- ---------------------------------------------------------------------------
-- Poder cancelar un trabajo que está corriendo.
--
-- El trabajo vive dentro del proceso del servidor y no hay forma de matarlo
-- desde fuera sin matar el servidor entero. Así que se pide y él se para: entre
-- una sección y la siguiente mira esta marca y, si está puesta, deja de generar.
--
-- Parar entre secciones y no en medio es lo que hace que cancelar no cueste
-- nada: la que estaba a medias se termina y se guarda —ya está pagada— y las que
-- faltaban ni se empiezan. Al continuar después, todo lo hecho se reutiliza.
-- ---------------------------------------------------------------------------

alter table public.background_jobs
  add column if not exists cancel_requested boolean not null default false;
