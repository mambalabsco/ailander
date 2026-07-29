-- Cabecera y ficha de autor de la página.
--
-- La estructura anterior empezaba directamente por el titular. Las páginas de
-- referencia llevan una barra de urgencia, un logotipo del medio que publica y
-- una ficha de autor con retrato: sin eso la pieza se lee como una landing de
-- producto y no como un artículo, que es de lo que vive este formato.
alter table public.landing_pages add column if not exists header jsonb;
alter table public.landing_pages add column if not exists author jsonb;
