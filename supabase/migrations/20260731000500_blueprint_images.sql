-- ---------------------------------------------------------------------------
-- Las imágenes de la tienda analizada, para maquetar con algo dentro.
--
-- Se guarda **la dirección, no el archivo**. Las imágenes se enlazan a donde ya
-- están: no se descarga ni se sube nada a la tienda propia, así que quitarlas es
-- borrar un texto y no queda ningún rastro que limpiar.
--
-- Para qué: una sección con el hueco vacío no se puede juzgar —no se sabe si la
-- foto va a la izquierda, cuánto pesa al lado del texto, si el titular respira—.
-- Con una imagen del tamaño correcto puesta, sí.
--
-- **Son de otra tienda y hay que sustituirlas antes de publicar.** Por eso van
-- contadas en el resumen y hay una acción que las quita todas de golpe.
-- ---------------------------------------------------------------------------

alter table public.store_blueprints
  -- [{url, alt, width}] — direcciones, ordenadas de la más ancha a la menos.
  add column if not exists images jsonb not null default '[]'::jsonb;
