-- ---------------------------------------------------------------------------
-- Las conexiones de Facebook que ya existían pasan a la lista general.
--
-- Al mover el inicio de sesión de la tienda a Configuración, el token de las
-- tiendas ya conectadas se quedó donde estaba —en `ad_credentials`— y siguió
-- funcionando. Pero la pantalla nueva lista `meta_logins`, así que **el perfil
-- conectado no aparecía por ningún lado**: seguía leyendo el gasto y a la vez
-- parecía que no había ninguna sesión.
--
-- Eso es peor que no haberlo movido. Quien lo mira concluye que la conexión se
-- perdió y vuelve a iniciar sesión — que es justo lo que la pantalla nueva venía
-- a evitar.
--
-- Aquí se adoptan: cada token distinto de Facebook que hubiera guardado una
-- persona pasa a ser una sesión suya, y las tiendas que lo usaban apuntan a
-- ella. El token no se toca ni se duplica por tienda: si cinco tiendas
-- compartían el mismo, sale **una** sesión y las cinco apuntan a ella, que es
-- exactamente lo que la tabla nueva venía a arreglar.
--
-- Es idempotente: solo mira los tokens que todavía no tienen sesión, así que
-- volver a pasarla no crea nada.
-- ---------------------------------------------------------------------------

insert into public.meta_logins (user_id, name, access_token, scopes, is_default)
select
  c.user_id,
  -- Sin nombre del perfil: no se pidió al conectar por tienda. Se pone algo
  -- reconocible en vez de dejarlo vacío, que en un desplegable no se distingue.
  'Conexión anterior',
  c.access_token,
  array['ads_read']::text[],
  -- Por defecto solo si esa persona no tiene ya una marcada. `row_number` para
  -- que con dos tokens distintos solo el primero se lleve la marca: el índice
  -- único de «una por defecto» rechazaría la segunda y tumbaría la migración.
  row_number() over (partition by c.user_id order by c.updated_at) = 1
    and not exists (
      select 1 from public.meta_logins m
      where m.user_id = c.user_id and m.is_default
    )
from (
  select distinct on (user_id, access_token)
    user_id, access_token, updated_at
  from public.ad_credentials
  where provider = 'facebook'
    and access_token is not null
    and length(btrim(access_token)) > 0
  order by user_id, access_token, updated_at desc
) as c
where not exists (
  select 1 from public.meta_logins m
  where m.user_id = c.user_id and m.access_token = c.access_token
);

-- Y las tiendas que ya lo usaban apuntan a su sesión, para que renovar el token
-- en un sitio valga para todas.
update public.ad_credentials as c
set meta_login_id = m.id
from public.meta_logins as m
where c.provider = 'facebook'
  and c.meta_login_id is null
  and c.user_id = m.user_id
  and c.access_token = m.access_token;
