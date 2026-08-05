-- Sitio para una pista de música larga sin comprimir.
--
-- ## Por qué otra vez, y por qué tanto
--
-- El tope estaba en 64 MB y una música generada llegó a 84. No es un caso raro:
-- los generadores devuelven **WAV** y ninguno de los que usamos deja pedir otro
-- formato salvo ElevenLabs, que ya lo pide. Tres minutos de WAV estéreo a 48 kHz
-- y 24 bits son unos 52 MB; cinco minutos, unos 86. Con vídeos de VSL que pasan
-- de los tres minutos, 64 se queda corto de forma sistemática.
--
-- 192 MB cubre diez minutos de WAV con margen. Es mucho para un archivo, y es
-- menos malo que lo que pasaba: la música se generaba, se pagaba, y se perdía al
-- guardarla — sin ninguna forma de recuperarla salvo volver a generar.
--
-- El tope sigue existiendo a propósito. Sin ninguno, un archivo equivocado
-- llenaría el disco del proyecto sin avisar.
update storage.buckets
set file_size_limit = 192 * 1024 * 1024
where id = 'video-assets';
