-- ---------------------------------------------------------------------------
-- La identidad visual de una tienda analizada: colores y tipografías.
--
-- Es lo que faltaba para que adaptar un tema sirviera de algo. Reordenar
-- secciones cambia la estructura, pero dos tiendas con la misma estructura y
-- distinta paleta no se parecen en nada: lo que hace que una web «se vea igual»
-- son, por este orden, los colores, la tipografía y el radio de los botones.
--
-- Son datos, no obra: una paleta no se registra y el nombre de una familia
-- tipográfica tampoco. Lo que sigue sin guardarse es el código del tema —eso sí
-- tiene licencia—, el logo, las imágenes y los textos.
--
-- Va en su propia columna y no dentro de `pages` porque es de la tienda, no de
-- una página: se lee de la portada y vale para todo el análisis.
-- ---------------------------------------------------------------------------

alter table public.store_blueprints
  -- {colors: [{hex, uses, role}], fonts: [{family, handle}], buttonRadius}
  add column if not exists identity jsonb not null default '{}'::jsonb;
