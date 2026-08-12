-- Cuántas veces se ha intentado generarle la imagen a una pieza.
--
-- El relleno del cron regeneraba la imagen de **cada** pieza sin media en cada
-- vuelta. Si la generación falla de forma persistente —la sesión de Higgsfield
-- caída, o una proporción que el generador no acierta nunca— son 288
-- generaciones pagadas al día por cada pieza atascada, para siempre y sin que
-- nadie lo vea: en el parte sale una línea igual a la de la vuelta anterior.
--
-- Con la cuenta en la fila, pasado el tope la pieza deja de reintentarse y lo
-- dice en su `error`, que es lo que la cola ya enseña en rojo. No pausa el
-- piloto: eso lo decide el diseño y se respeta — no publicar hoy es peor que
-- gastar dos veces en una imagen.
alter table public.instagram_posts
  add column if not exists intentos_media integer not null default 0;
