-- ---------------------------------------------------------------------------
-- Las imágenes también se atan al anuncio corto que las usa.
--
-- Ya se ataban al copy, pero los anuncios de campaña son otra entidad: viven en
-- `short_ads`, tienen su propio prompt de imagen y su propio nombre. Sin este
-- enlace, sus creatividades caían en la galería del producto sin poder
-- enseñarse dentro del anuncio.
-- ---------------------------------------------------------------------------

alter table public.product_images
  add column if not exists ad_id uuid references public.short_ads (id) on delete set null;

create index if not exists product_images_ad_idx
  on public.product_images (ad_id);
