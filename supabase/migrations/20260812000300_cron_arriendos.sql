-- Una sola vuelta del cron a la vez.
--
-- ## Qué evita
--
-- La ruta del autopiloto lee el tope de 24h y la última publicación **al
-- principio** de cada producto, y no vuelve a mirarlos al reservar. La reserva
-- de `instagram_posts` protege una fila de salir dos veces; no protege a la
-- cuenta de que dos vueltas solapadas publiquen dos piezas **distintas** con
-- segundos de diferencia, saltándose los 90 minutos de separación y sumando las
-- dos contra el tope de 25 al día.
--
-- Hoy no ocurre porque el relleno muere al instante sin sesión de Higgsfield. En
-- cuanto el relleno funcione, una vuelta dura minutos —una llamada al modelo por
-- formato más una generación de imagen por pieza, en serie— y el solapamiento
-- con la vuelta de los cinco minutos siguientes será lo normal.
--
-- ## Por qué una fila y no `pg_try_advisory_lock`
--
-- Porque PostgREST atiende cada petición con una conexión de un pool que
-- reutiliza. Un bloqueo de sesión se queda tomado en una conexión que vuelve al
-- pool sin haberlo soltado, y no hay forma fiable de soltarlo después: el
-- `select pg_advisory_unlock(...)` siguiente puede caer en otra conexión.
--
-- Una fila con marca de tiempo la resuelve la base en el `update` condicional,
-- igual que `reservarVencida`, y se puede rescatar por tiempo.
create table if not exists public.cron_arriendos (
  nombre text primary key,
  -- Nulo es «libre». Con hora, es «la tiene alguien desde entonces».
  tomado_at timestamptz,
  -- Quién la tiene. Sin esto, una vuelta que se pasó del plazo soltaría al
  -- salir el arriendo que ya había cogido otra, y las dos seguirían a la vez.
  token text not null default ''
);

-- No lleva `workspace_id`, ni política, ni disparador `poner_espacio`, y es a
-- propósito: esto no es un dato de nadie, es el semáforo del proceso. Con RLS
-- activado y **sin ninguna política**, nadie autenticado lo ve ni lo toca; solo
-- el cliente de servicio del cron, que no pasa por RLS.
alter table public.cron_arriendos enable row level security;
