-- ============================================================================
-- Storage: buckets y políticas
-- ============================================================================
--
-- Dos buckets, los dos **privados**. Los anuncios y las imágenes de producto
-- son material de trabajo: un bucket público significa que cualquiera con la
-- URL ve las creatividades antes de que se publiquen, y esas URLs acaban en
-- registros de servidor, en el historial del navegador y en capturas.
--
-- Al ser privados, la aplicación sirve las imágenes con URL firmada de duración
-- corta, generada en el servidor para cada petición.
--
-- La convención de rutas es la que hace cumplir la seguridad:
--
--     {user_id}/{product_id}/{nombre-del-archivo}
--
-- La política compara el primer segmento de la ruta con `auth.uid()`, así que
-- nadie puede escribir ni leer fuera de su propia carpeta. Es importante que el
-- id del usuario vaya **primero**: si fuera segundo, un nombre de carpeta
-- inventado dejaría la comprobación sin efecto.

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------
--
-- El límite de tamaño y la lista de tipos se declaran aquí además de validarse
-- en el servidor. La validación de la aplicación se puede saltar llamando a la
-- API de Storage directamente con el token del usuario; esta no.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'product-images',
    'product-images',
    false,
    10485760, -- 10 MB
    array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
  ),
  (
    'ad-creatives',
    'ad-creatives',
    false,
    26214400, -- 25 MB: aquí entran capturas grandes de anuncios
    array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']
  )
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------------
--
-- `storage.foldername(name)` devuelve los segmentos de la ruta. El primero
-- tiene que ser el id del usuario.

create policy "product-images: ver lo propio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "product-images: subir a su carpeta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "product-images: reemplazar lo propio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "product-images: borrar lo propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "ad-creatives: ver lo propio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ad-creatives'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "ad-creatives: subir a su carpeta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ad-creatives'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "ad-creatives: reemplazar lo propio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'ad-creatives'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'ad-creatives'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "ad-creatives: borrar lo propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ad-creatives'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
