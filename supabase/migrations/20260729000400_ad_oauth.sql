-- ---------------------------------------------------------------------------
-- Iniciar sesión en Meta y en Google, en vez de pegar tokens a mano.
--
-- Lo que hace falta guardar además del token: **cuándo caduca y de quién es**.
--
-- El token de usuario de Meta dura unos sesenta días y no hay forma de renovarlo
-- sin que alguien vuelva a autorizar. Sin la fecha de caducidad guardada, el
-- síntoma sería que un martes cualquiera el gasto publicitario aparece a cero y
-- el beneficio se dispara — sin ningún error, sin ninguna pista. Guardándola, la
-- interfaz puede avisar una semana antes con un botón de un clic.
--
-- El nombre de quien autorizó se guarda porque en una cuenta con varias personas
-- «reconecta la cuenta» no basta: hay que saber **quién** tiene que hacerlo.
-- ---------------------------------------------------------------------------

alter table public.ad_credentials
  -- Nulo significa «no caduca», que es el caso de Google con la app publicada.
  add column if not exists token_expires_at timestamptz,
  -- Los permisos que de verdad se concedieron. No siempre son los que se
  -- pidieron: en el diálogo de Meta se pueden desmarcar uno por uno, y así se
  -- puede decir «falta ads_read» en vez de dar un 403 más adelante.
  add column if not exists scopes text[] not null default '{}',
  add column if not exists account_name text,
  add column if not exists connected_at timestamptz;
