-- El bucket también guarda vídeo, no solo audio.
--
-- Se llama `video-assets` pero solo admitía tipos de audio, y eso saltó en
-- cuanto empezamos a devolver vídeos procesados en el propio servidor: la
-- mezcla de música y el acelerador terminan bien y fallan **al guardar**, con
-- «mime type video/mp4 is not supported». El trabajo se hace, se paga el
-- proceso, y se pierde en el último paso.
update storage.buckets
set
  allowed_mime_types = array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac',
    'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
    'audio/ogg', 'audio/webm', 'audio/flac',
    'video/mp4', 'video/webm', 'video/quicktime',
    'text/css'
  ]
where id = 'video-assets';
