-- El texto del anuncio que acompaña al vídeo.
--
-- Un vídeo puede nacer de un copy largo, pero lo que se monta no es ese copy:
-- las tomas se recortan, se reordenan y se reescriben en fonético para la voz.
-- El anuncio publicado tiene que prometer lo que el vídeo dice, así que estos
-- tres campos son suyos y no del copy del que salió.
alter table public.videos
  add column if not exists headline text not null default '',
  add column if not exists primary_text text not null default '',
  add column if not exists description text not null default '';
