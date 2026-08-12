-- Si el producto sale, y si la pieza es imagen o vídeo.
--
-- Sin esto la generación pasaba **siempre** la foto del producto de referencia,
-- así que el envase se colaba en todas las publicaciones y la cuenta entera
-- parecía un catálogo. Un catálogo no se sigue.
--
-- En la mayoría de las publicaciones el producto no sale: sale la persona, el
-- momento o el problema. Ahora lo decide la pieza y no el código.
alter table public.instagram_posts
  add column if not exists shows_product boolean not null default false,
  add column if not exists media_kind text not null default 'imagen';
