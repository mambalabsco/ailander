# El nombre de una creatividad es el nombre de su anuncio en Facebook

Escrito el 16 de agosto de 2026.

Pedido: descargar de una vez todas las imágenes de una campaña o de un conjunto,
y que cada archivo llegue con **un nombre con sentido y único** — el nombre del
anuncio con un identificador al final tras un guion bajo. Como un anuncio ya no
tiene una sola creatividad, ese nombre es el que se escribe en el gestor de
anuncios: **un archivo descargado es un anuncio de Facebook**.

Y arreglar con eso lo ya creado.

## De dónde se parte

Medido contra la base real el 16 de agosto, no recordado:

- **335 imágenes**, de las cuales **solo 10 cuelgan de un anuncio**. Las otras
  325 son de copys, landings y galería. Arreglar lo ya creado *de anuncios* son
  diez filas.
- **Ningún anuncio tiene hoy más de una imagen.** Lo de «no se generan de una en
  una» es lo que viene ahora, con el botón de lote y el de rehacer.
- **Los nombres ya se repiten.** `…_img-3_…_18` existe dos veces, y otros cuatro
  grupos igual. No es que falte un identificador único: **el que hay no lo es**.
- La causa está localizada: `image-generate-actions.ts` numera con
  `existing.length` sobre **todas** las imágenes del producto. Ese contador
  **retrocede** al borrar, y dos nombres iguales acaban pisándose en la carpeta
  de descargas.
- **El nombre de hoy no sirve para esto**: `naturox-metabolic-balance-so_
  beneficios-flotantes_ad48-beneficios-todo-lo-que-cambia-en-8-seman_98` mete
  producto y concepto delante y deja el del anuncio recortado a la mitad.
- **Renombrar no toca ningún archivo.** `useImageDownload` bautiza la descarga
  con `image.name` (`image-downloads.tsx:36`) y la ruta del bucket ya lleva su
  propio sufijo aleatorio (`images.ts:96`). Es una columna.
- `product_images.ad_id` es **`on delete set null`**: borrar un anuncio no borra
  sus imágenes ni sus nombres.
- `downloadMany` ya existe y ya espera 350 ms entre archivos. Sin esa pausa el
  navegador baja el primero y **pierde los demás en silencio**.

## Las decisiones

1. **El nombre del archivo es el nombre del anuncio más un correlativo.** Nada
   más delante.
2. **El correlativo es por anuncio y empieza en 01.**
3. **Un número no se reutiliza nunca**, ni descartando ni borrando.
4. **La unicidad la garantiza la base**, no el código.
5. **Lo ya creado se arregla en la misma migración**, y las 325 sueltas solo
   donde hay choque real.

## El nombre

Función pura nueva en `src/lib/nombre-de-creatividad.ts`:

```ts
export function buildAdImageName(options: { adName: string; sequence: number }): string;
```

`{ adName: "Ad48_Beneficios_Todo_Lo_Que_Cambia_En_8_Semanas", sequence: 2 }` da
`Ad48_Beneficios_Todo_Lo_Que_Cambia_En_8_Semanas_02`.

El nombre del anuncio entra **tal cual**: ya sale limpio de `buildAdName`
—`nameToken` le quitó acentos, espacios y lo acotó en palabras—, y volver a
pasarlo por el `slugify` de las imágenes lo pondría en minúsculas y con guiones,
que es lo que hace que hoy no se parezca al anuncio.

El sufijo va a dos dígitos y **crece si hace falta**: el anuncio 100 de un
anuncio es `_100`, no `_00`.

`buildImageName`, el de siempre, **se queda como está** para todo lo que no
cuelga de un anuncio.

## De dónde sale el número

Columna nueva:

```sql
alter table public.product_images
  add column if not exists ad_sequence integer;
```

El siguiente es **`max(ad_sequence) + 1` entre las imágenes de ese anuncio,
contando las descartadas**. `max` y no `count`, y contando las descartadas: las
dos cosas son el mismo error de hoy visto desde dos lados. Un nombre ya
entregado no vuelve a salir aunque su imagen se esconda o se borre.

Y la garantía, en la base:

```sql
create unique index if not exists product_images_ad_sequence_uniq
  on public.product_images (ad_id, ad_sequence)
  where ad_id is not null and ad_sequence is not null;
```

Parcial, porque 325 filas no tienen anuncio y no deben competir por un número.

**El índice se crea después del renombrado**, no antes. Con las diez filas de hoy
daría igual —`row_number` ya reparte números distintos por anuncio—, pero un
índice único creado sobre datos que aún no se han ordenado aborta la migración
entera, y con ella todo lo que venga detrás en ese despliegue.

**Qué pasa si dos generaciones piden el mismo número a la vez.** Es raro —el
bucle del lote es secuencial dentro de un proceso— pero con dos pestañas es
posible. El índice hace fallar la segunda inserción con `23505`; ahí se recalcula
el máximo y se reintenta **una** vez. Sin el índice no fallaría nada: se
guardarían dos imágenes con el mismo nombre, que es precisamente el fallo que
este documento viene a cerrar.

### Quién lo calcula, y por qué ahí

Dentro de **`uploadGeneratedImage`** (`src/lib/data/images.ts`), no en quien la
llama. Es el único punto por el que entra una imagen generada, así que el número
y el nombre salen iguales por los tres caminos que hoy existen —el lote, el botón
de un anuncio suelto y «Rehacer»— y por el que se añada mañana.

Repartirlo entre los llamadores sería repetir tres veces la consulta del máximo y
dejar que el cuarto se la olvide. La función ya recibe `adId`, que es lo único
que necesita:

- **Con `adId`**: pide el máximo de ese anuncio, suma uno, y el `name` que le
  pasen se ignora en favor de `buildAdImageName`. El nombre de una creatividad de
  anuncio no es negociable desde fuera — es lo que se pega en Facebook.
- **Sin `adId`**: todo sigue exactamente como está. `ad_sequence` queda a nulo y
  el nombre es el que venga.

## Descargar la campaña o el conjunto

Un botón junto al de generar, en las dos alturas, reutilizando `downloadMany`.

Dice cuántas son —«Descargar las 20»— porque a 350 ms cada una son siete
segundos y sin el número parece que se ha colgado. Mientras baja, lo dice.

No se empaqueta en zip: no hay dependencia que lo haga y añadir una por esto no
compensa. La descarga secuencial es la que ya funciona.

## Arreglar lo ya creado

Migración `20260816000500_nombre_de_creatividad.sql`, en dos partes, **las dos
deterministas** — estas migraciones se reejecutan en cada despliegue, así que
volver a pasarlas tiene que dar el mismo resultado.

### Las de anuncios

Se numeran por anuncio, por fecha de creación, y se renombran:

```sql
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
```

Reejecutarla da lo mismo: el orden es el mismo y el nombre calculado es el mismo.
El desempate por `id` no es adorno — sin él, dos imágenes creadas en el mismo
milisegundo podrían intercambiarse el número entre dos despliegues.

### Las sueltas que chocan

Solo las repetidas, y solo a partir de la segunda:

```sql
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
```

La más antigua de cada grupo **conserva su nombre**, así que nada que ya fuera
único cambia. Y al reejecutarse no hace nada, porque ya no quedan repetidos.

**El sufijo es un trozo del id y no un contador**, y esa es la diferencia que
importa: con un contador, un `foo` duplicado pasaría a `foo_02`, y si ya
existiera un `foo_02` en la tabla habríamos creado el choque que veníamos a
quitar. Un trozo del identificador no puede chocar con nada, y sigue siendo
determinista al reejecutar.

Lo que esto **no** arregla: que el contador global siga pudiendo retroceder en
las sueltas. Se cierra aparte, cambiando `existing.length` por el máximo real —
está en «Lo que queda» más abajo, y no aquí porque tocaría el generador de
patrones, que es otro camino.

## Las pruebas

**Automáticas**, sobre `nombre-de-creatividad.ts`: el sufijo a dos dígitos; que
pasado el 99 no se recorta; que el nombre del anuncio no se toca; que el
correlativo sale del máximo y no de la cuenta.

**A mano**, que es donde se ve:

1. Un anuncio sin imágenes: generar tres. Salen `_01`, `_02`, `_03`.
2. Descartar la `_02` y rehacer: la nueva es `_04`. **La `_02` no vuelve.**
3. Descargar la campaña entera: los archivos no se pisan y cada nombre es el que
   se escribe en el gestor de anuncios.
4. Después de la migración, las diez de anuncio se llaman como su anuncio.
5. Reejecutar `actualizar.sh`: los nombres **no cambian** en la segunda pasada.

## Fuera, a propósito

- **Zip.**
- **Renombrar las 325 sueltas que no chocan.** Muchas están en landings
  publicadas y en copys ya descargados; cambiarles el nombre no arregla nada.
- **Copiar el nombre desde la pantalla.** El archivo descargado ya lo lleva, que
  es donde se necesita.

## Lo que queda

- El contador de las imágenes sueltas sigue saliendo de `existing.length` en las
  dos llamadas del generador de patrones. La migración limpia lo repetido de
  hoy; el que vuelvan a chocar mañana se cierra cambiando esa cuenta por el
  máximo real, y es un cambio aparte.
