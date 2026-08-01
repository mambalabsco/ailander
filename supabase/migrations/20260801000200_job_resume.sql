-- ---------------------------------------------------------------------------
-- Con qué volver a lanzar un trabajo que se cortó.
--
-- Hasta ahora, retomar algo que murió a mitad obligaba a volver al panel de
-- origen y reconstruir a mano lo que se había elegido: tienda, análisis, tema,
-- producto, página. Cinco decisiones para repetir una acción que ya estaba
-- decidida — y con una equivocada, el trabajo sale distinto sin avisar.
--
-- Aquí se guarda lo que hacía falta para lanzarlo. Solo identificadores: nada
-- que no estuviera ya en la fila de al lado.
-- ---------------------------------------------------------------------------

alter table public.background_jobs
  add column if not exists resume jsonb;
