-- En qué reloj se leen `hora_desde` y `hora_hasta`.
--
-- Estaban en UTC sin que nada lo dijera: `horaProgramada` usaba `setUTCHours` y
-- el panel etiquetaba los campos «Desde las / Hasta las», a secas. Coincidía con
-- la hora local solo porque el servidor va en UTC. Pedir la franja de 18 a 21
-- desde México publicaba de 12:00 a 15:00 locales, sin dar ningún error: el
-- fallo se ve semanas después, mirando a qué hora sale la cuenta.
--
-- Por producto y no global: una marca puede vender en México y otra en España
-- desde el mismo servidor, y la buena hora para publicar es la de quien mira.
--
-- `UTC` por defecto, que es exactamente lo que hacía antes: así las filas que ya
-- existan no cambian de comportamiento al desplegar esto.
alter table public.instagram_autopilot
  add column if not exists zona_horaria text not null default 'UTC';
