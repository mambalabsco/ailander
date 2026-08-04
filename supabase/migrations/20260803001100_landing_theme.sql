-- ---------------------------------------------------------------------------
-- El aspecto de cada landing.
--
-- Hasta ahora los colores, la letra y el ancho estaban escritos a fuego en el
-- código que las dibuja, y por eso **todas salían iguales**: el generador
-- elegía qué secciones poner y qué decir en cada una, pero el aire era el mismo
-- calcara la página que calcara.
--
-- Y el aire es la mitad que importa. Lo que hace que un publirreportaje parezca
-- un artículo de un medio y no un anuncio es su aspecto: el serif del titular,
-- el fondo hueso, la línea fina entre secciones. Copiar el orden de las
-- secciones sin el aire es copiar el esqueleto sin la piel.
--
-- Se guarda **con la página** y no se recalcula al dibujar. Dos motivos: la
-- referencia puede rediseñarse o desaparecer, y una página publicada no puede
-- cambiar de aspecto sola; y la vista previa y el HTML que se publica tienen que
-- salir idénticos, que si no se revisa una cosa y se sube otra.
--
-- `null` es «el de siempre», que es lo que tienen todas las ya generadas: sin
-- eso cambiaría de golpe el aspecto de lo que ya está publicado.
-- ---------------------------------------------------------------------------

alter table public.landing_pages
  add column if not exists theme jsonb;
