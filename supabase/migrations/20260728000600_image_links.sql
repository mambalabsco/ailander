-- ---------------------------------------------------------------------------
-- Las imágenes generadas, atadas a lo que las originó.
--
-- Una creatividad se genera desde un copy concreto, con su ángulo, su gancho y
-- su concepto visual. Todo eso se perdía al guardarla: la imagen caía en la
-- galería del producto como `subida`, sin forma de saber de qué anuncio salió.
--
-- Consecuencias, las dos molestas:
--
-- 1. No se podía enseñar la imagen **dentro del anuncio** que la usa. Había que
--    ir a la galería y adivinar cuál era.
-- 2. El nombre quedaba en `naturox_subida_07`, que no dice nada. Con veinte
--    creatividades no hay forma de saber cuál es cuál al descargarlas.
--
-- `copy_id` con `on delete set null`: si borras el copy, la imagen sigue siendo
-- tuya y sigue en el bucket. Borrarla con él tiraría trabajo ya pagado.
-- ---------------------------------------------------------------------------

alter table public.product_images
  add column if not exists copy_id uuid references public.copies (id) on delete set null;

-- El concepto visual del que salió: 'gancho-visual', 'resena', 'antes-despues'…
alter table public.product_images
  add column if not exists concept text;

-- El gancho o el ángulo que la originó, para poder leer el nombre y entenderlo.
alter table public.product_images
  add column if not exists origin_label text;

create index if not exists product_images_copy_idx
  on public.product_images (copy_id);
