-- ---------------------------------------------------------------------------
-- De qué mercado es cada pieza.
--
-- `null` significa **general**: vale en todos los mercados del producto. Con eso
-- el filtro es una sola regla —en un mercado se ve lo suyo y lo general; en
-- general solo lo general— escrita una vez en la capa de datos.
--
-- `on delete set null` y no `cascade`: borrar un mercado no puede llevarse por
-- delante los copys y las landings que se escribieron para él. Quedan como
-- generales, que es discutible, pero perder el trabajo no lo es.
--
-- `instagram_posts` **no** entra: se está construyendo el agente de contenido y
-- tocar su cola ahora es pelearse por el mismo archivo. Queda pendiente, y la
-- regla que faltará entonces es que la cola publique una pieza solo si su
-- mercado coincide con el de la cuenta, o si es general.
-- ---------------------------------------------------------------------------

do $$
declare
  tabla text;
  tablas text[] := array[
    'copies', 'angles', 'hooks', 'short_ads', 'landing_pages', 'prelandings',
    'landing_experiments', 'videos', 'product_images', 'performance_records',
    'campaigns', 'research_documents'
  ];
begin
  foreach tabla in array tablas loop
    execute format(
      'alter table public.%I add column if not exists market_id uuid'
      || ' references public.store_markets (id) on delete set null', tabla);

    execute format(
      'create index if not exists %I on public.%I (product_id, market_id)',
      tabla || '_market_idx', tabla);

    -- Lo existente se etiqueta con el mercado que el producto tiene hoy, que es
    -- la verdad de cómo se generó. Dejarlo en `null` lo marcaría como «vale en
    -- todos los países», que es plausible y falso: el peor par.
    execute format(
      'update public.%I t set market_id = p.market_id from public.products p'
      || ' where t.product_id = p.id and t.market_id is null and p.market_id is not null',
      tabla);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- La unicidad de los documentos, que cambia de forma.
--
-- Era `unique (product_id, document_id)`. Al añadir el mercado hace falta
-- `nulls not distinct`: Postgres considera dos `null` distintos entre sí, así
-- que sin eso se pueden crear **dos documentos generales del mismo tipo** y la
-- pantalla enseñaría uno de los dos según el orden de la consulta.
-- ---------------------------------------------------------------------------

alter table public.research_documents
  drop constraint if exists research_documents_product_id_document_id_key;

drop index if exists research_documents_unico;
create unique index research_documents_unico
  on public.research_documents (product_id, document_id, market_id)
  nulls not distinct;
