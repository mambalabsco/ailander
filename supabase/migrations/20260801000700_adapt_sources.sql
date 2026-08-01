-- ---------------------------------------------------------------------------
-- Imágenes subidas a mano para adaptar.
--
-- El adaptador solo podía trabajar con las de una tienda analizada, y no todo lo
-- que hay que rehacer sale de ahí: una foto del móvil, un montaje de un
-- proveedor, una captura de un anuncio que funcionó.
--
-- El bucket es **público** por el mismo motivo que el de la voz: el generador de
-- imágenes descarga el archivo por su cuenta y no se le puede pasar un buffer.
-- Una dirección firmada caducaría en mitad de una tanda larga y las últimas
-- imágenes fallarían sin motivo aparente.
--
-- Son fotos de las que se parte para generar, no material privado: lo que sí es
-- privado —las creatividades antes de publicarlas— sigue en su bucket cerrado.
-- Escribir exige seguir siendo el dueño de la carpeta.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adapt-sources',
  'adapt-sources',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- La primera carpeta de la ruta es el id del usuario, igual que en los demás.
create policy "adapt_sources_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'adapt-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "adapt_sources_write_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'adapt-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Con `with check` explícito: el `upsert` de una imagen repetida pasa por aquí.
create policy "adapt_sources_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'adapt-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'adapt-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "adapt_sources_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'adapt-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
