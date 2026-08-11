-- Los tokens que vinieron de la caché, contados aparte.
--
-- Sin esto no se puede saber si la caché de prompts funciona: **no falla si
-- sale mal**, sigue todo igual y se sigue pagando entero. Es el único cambio
-- del proyecto que no se ve en pantalla, así que el número va antes que el
-- cambio — cuando entre, el panel dirá solo si sirvió.
--
-- Dos columnas y no una: escribir en la caché cuesta un poco **más** que no
-- usarla, y leerla cuesta una fracción. Con una sola cifra, una primera llamada
-- cara y una segunda barata se compensan y parece que no pasó nada.
alter table public.generation_runs
  add column if not exists cache_write_tokens integer not null default 0,
  add column if not exists cache_read_tokens integer not null default 0;
