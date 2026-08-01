-- ---------------------------------------------------------------------------
-- Le faltaba la política de lectura al bucket de la voz.
--
-- Síntoma: «No se pudo guardar el audio: new row violates row-level security
-- policy» al generar la voz de un vídeo.
--
-- La causa está en el `upsert`. Guardar la voz usa `upsert: true` —una toma se
-- regenera cuando no convence, y sobrescribirla es lo que se quiere— y eso hace
-- que Storage tenga que **mirar antes si el archivo ya existe**. Sin política de
-- lectura no puede mirarlo, y el intento acaba rechazado por la de escritura,
-- que es la que da el nombre en el mensaje. El error apunta a un sitio y el
-- problema está en otro.
--
-- El bucket de imágenes sí la tenía desde el principio; a este se le olvidó. Se
-- añade también un `with check` explícito en la de actualización: sin él,
-- Postgres usa el `using` para las dos cosas —funciona— pero deja al siguiente
-- que lo lea preguntándose si fue a propósito.
-- ---------------------------------------------------------------------------

create policy "video_assets_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "video_assets_update_own" on storage.objects;

create policy "video_assets_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
