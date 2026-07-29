-- Las imágenes también se atan a su página.
--
-- Se emparejaban solo por el nombre del hueco —`img-1`, `logo`, `autor`—, que
-- es el mismo en todas las páginas. Con una sola funcionaba; con dos, las
-- imágenes de una aparecerían dentro de la otra.
alter table public.product_images
  add column if not exists landing_id uuid references public.landing_pages (id) on delete set null;

create index if not exists product_images_landing_idx
  on public.product_images (landing_id);
