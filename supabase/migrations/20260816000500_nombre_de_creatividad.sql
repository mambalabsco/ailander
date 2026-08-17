-- ---------------------------------------------------------------------------
-- El nombre de una creatividad es el nombre de su anuncio en Facebook.
--
-- Un anuncio ya no tiene una sola imagen: el lote genera varias y «Rehacer»
-- añade más. Cada una es **un anuncio distinto en el gestor**, así que su
-- archivo tiene que llamarse como se va a llamar allí.
--
-- Y el nombre de hoy no era único: el generador numera con `existing.length`
-- sobre todas las imágenes del producto, y ese contador **retrocede** al
-- borrar. Hay cinco grupos de nombres repetidos en la base — al bajarlos, uno
-- pisa al otro sin decir nada.
--
-- El orden de los cuatro bloques no es libre: el índice único va **después** del
-- renombrado. Crearlo sobre datos aún sin numerar abortaría la migración entera
-- y con ella todo lo que venga detrás en ese despliegue.
-- ---------------------------------------------------------------------------

alter table public.product_images
  add column if not exists ad_sequence integer;

comment on column public.product_images.ad_sequence is
  'Qué lugar ocupa dentro de su anuncio, empezando en 1. Nulo si no es de un anuncio. No se reutiliza nunca.';

-- ---------------------------------------------------------------------------
-- Las que cuelgan de un anuncio: se numeran por fecha y se renombran.
--
-- El desempate por `id` no es adorno: sin él, dos imágenes creadas en el mismo
-- milisegundo podrían intercambiarse el número entre dos despliegues, y esta
-- migración se reejecuta en todos.
-- ---------------------------------------------------------------------------

with numeradas as (
  select i.id,
         a.name as ad_name,
         row_number() over (partition by i.ad_id order by i.created_at, i.id) as n
  from public.product_images i
  join public.short_ads a on a.id = i.ad_id
)
update public.product_images i
set ad_sequence = numeradas.n,
    name = numeradas.ad_name || '_' || lpad(numeradas.n::text, 2, '0')
from numeradas
where i.id = numeradas.id;

-- ---------------------------------------------------------------------------
-- Las sueltas que chocan: solo a partir de la segunda de cada grupo.
--
-- El sufijo es un trozo del identificador y **no un contador**: con un contador,
-- un `foo` duplicado pasaría a `foo_02`, y si ya existiera un `foo_02` en la
-- tabla habríamos creado el choque que veníamos a quitar.
--
-- La más antigua de cada grupo conserva su nombre, así que nada que ya fuera
-- único cambia. Y al reejecutarse no hace nada, porque ya no quedan repetidos.
-- ---------------------------------------------------------------------------

with repetidas as (
  select id,
         row_number() over (partition by name order by created_at, id) as n
  from public.product_images
  where ad_id is null
)
update public.product_images i
set name = i.name || '_' || left(i.id::text, 6)
from repetidas
where i.id = repetidas.id and repetidas.n > 1;

-- ---------------------------------------------------------------------------
-- Y ahora sí, la garantía en la base y no en una promesa del código.
--
-- Parcial: las imágenes que no cuelgan de ningún anuncio —las de copys, landings
-- y galería, que son la mayoría— no deben competir por un número.
-- ---------------------------------------------------------------------------

create unique index if not exists product_images_ad_sequence_uniq
  on public.product_images (ad_id, ad_sequence)
  where ad_id is not null and ad_sequence is not null;
