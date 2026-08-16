-- ---------------------------------------------------------------------------
-- En qué negocio está un producto.
--
-- `ecommerce` por defecto, y ese defecto es la compatibilidad entera: todo lo
-- que existe hoy nace en el vertical de siempre y no cambia de comportamiento.
--
-- Decide tres cosas y solo tres: qué documentos tiene la investigación, con qué
-- encargo se escribe cada uno, y qué pestañas se ven.
--
-- En `casino` el producto **es el país**: su investigación es la de quién juega
-- allí, y las apps cuelgan de él. Por eso los documentos salen por país sin
-- mover la investigación de sitio: ya colgaba del producto.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists vertical text not null default 'ecommerce'
    check (vertical in ('ecommerce', 'casino'));

comment on column public.products.vertical is
  'ecommerce = lo de siempre. casino = el producto es el país, y las apps van dentro.';

-- ---------------------------------------------------------------------------
-- Los tres documentos que no tienen equivalente en e-commerce.
--
-- `if not exists` **no es opcional**: estas migraciones se reejecutan en cada
-- despliegue y sin él la segunda vez aborta y se lleva lo que venga detrás.
--
-- Añadirlos al enum no se los enseña a nadie: quién ve cada documento lo decide
-- `documentsFor(vertical)` en la aplicación, no esta lista.
-- ---------------------------------------------------------------------------

alter type public.research_document_id add value if not exists 'regulation';
alter type public.research_document_id add value if not exists 'payments';
alter type public.research_document_id add value if not exists 'casino-landscape';
