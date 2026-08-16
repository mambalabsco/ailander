# La sección Ads: orden, lote y rehacer

Escrito el 16 de agosto de 2026.

Pedido, en cinco partes: generar de golpe todas las imágenes de una campaña;
rehacer una imagen suelta desde la propia imagen; que las campañas no salgan
desplegadas, porque llenan la pantalla; archivar una campaña y poder devolverla;
y crear carpetas para ordenarlas.

## De dónde se parte

Comprobado en el código, no recordado:

- **La acción de servidor ya acepta el lote.** `generateAdVisualsAction` lee
  `adId` **por creatividad** (`image-generate-actions.ts:382`), con un comentario
  que dice literalmente «al generar toda la campaña de golpe cada imagen
  pertenece a un anuncio distinto». El bucle de generación
  (`image-generate-actions.ts:442`) recorre `visuals` y guarda cada una con el
  suyo. **No hay que tocar el motor: falta el botón que le pase la lista.**
- **Hoy se genera de una en una porque cada anuncio monta su propio
  `AdVisualSender` con un solo visual dentro** (`campaign-structure.tsx:356`).
- **`product_images` ya guarda `prompt` y `model_id`** (`visuals.ts:375`), así
  que rehacer puede repetir exactamente lo que produjo la imagen. Ojo: las dos
  columnas son `NOT NULL` con cadena vacía para las subidas
  (`images.ts:305`), y una imagen sin prompt no se puede rehacer.
- **Las imágenes de un producto se leen todas por `readProductImages`**
  (`image-store.ts:31`), que envuelve `listProductImages` (`images.ts:99`) y una
  rama de respaldo local. Es lo que hace viable esconder las descartadas sin
  repasar quince llamadas — pero hay que filtrar **las dos ramas**.
- **`readCampaignTrees` (`campaigns.ts:146`) lee la jerarquía en una consulta
  anidada.** Filtrar por archivado cabe ahí sin volver al N+1.
- **`campaign-structure.tsx` pinta todas las campañas abiertas**: no hay ningún
  estado de plegado que respetar.
- El patrón de tabla nueva —`workspace_id`, disparador `poner_espacio`, dos
  políticas contra `mis_espacios()`— está en `20260816000300_apps_de_casino.sql`.

## Las decisiones

1. **Archivar y las carpetas son dos cosas distintas.** Archivar es un
   interruptor; la carpeta es dónde vive. Una campaña archivada **recuerda su
   carpeta** y vuelve a ella.
2. **El lote va en campaña y en conjunto**, con los dos botones haciendo lo
   mismo a distinta altura.
3. **El lote se salta lo que ya tiene imagen**, y lo dice en el propio botón. Una
   casilla al lado permite incluirlas.
4. **Rehacer no borra: descarta.** La imagen anterior se esconde y se puede
   recuperar.
5. **Lo descartado se filtra en la lectura, no en cada pantalla.**

## El modelo

Migración `20260816000400_carpetas_y_archivo_de_campanas.sql`.

### Las carpetas

```sql
create table if not exists public.campaign_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Con su índice por `product_id`, sus disparadores `touch_updated_at` y
`poner_espacio`, y sus dos políticas contra `mis_espacios()` — cada una con su
`drop policy if exists` delante, porque estas migraciones se reejecutan en cada
despliegue.

Son **de un producto**, no globales: las campañas de un producto no se ordenan
junto a las de otro, y una lista compartida obligaría a filtrarla en cada
pantalla para acabar en el mismo sitio.

### Dónde se engancha

```sql
alter table public.campaigns
  add column if not exists folder_id uuid
    references public.campaign_folders (id) on delete set null;

alter table public.campaigns
  add column if not exists archived_at timestamptz;

alter table public.product_images
  add column if not exists discarded_at timestamptz;
```

Tres decisiones dentro de esas tres líneas:

- **`on delete set null`, no `cascade`.** Borrar una carpeta no puede llevarse
  las campañas que había dentro. Pierden el sitio, que es lo que sobra, no el
  trabajo.
- **`archived_at` es fecha y no booleano.** Un booleano dice que está archivada;
  la fecha dice **cuándo**, y ordenar «Archivadas» por lo último archivado sale
  gratis. Nulo es activa.
- **`discarded_at` igual.** Nulo es vigente.

`database.ts` está escrito a mano: las tres columnas se añaden ahí también, y
las tres van **opcionales** en el `Insertable` de su tabla, porque ninguna se
escribe al crear.

## La lectura

### Campañas

`readCampaignTrees` **filtra `archived_at is null` y no acepta lo contrario**. El
árbol es caro —trae conjuntos, anuncios y copys— y lo archivado crece sin tope:
un producto con doscientas campañas viejas las cargaría enteras en cada visita
para no enseñar ninguna.

Lo archivado se lee aparte y **plano**, con `readArchivedCampaigns(productId)`:

```ts
{ id, name, stage, folderId, archivedAt, adsets: number, ads: number }
```

Los contadores salen de un `count` anidado, no de traerse las filas. En
«Archivadas» no se abre nada ni se genera nada: se ve qué hay y se pulsa
«Devolver». Con eso basta, y es lo que la mantiene barata para siempre.

**El filtro por carpeta es de la pantalla, no del servidor.** La barra necesita
el número de campañas de cada carpeta, así que ya tiene todas las activas
delante; pedirlas otra vez al cambiar de pestaña sería una ida y vuelta por clic
sin ganar nada.

`readCampaignFolders(productId)` es nuevo, en el mismo archivo.

`CampaignTree` gana `folderId`, que es lo que la pantalla necesita para repartir
las cajas entre las pestañas.

### Imágenes, y el aviso que va con esto

**Esto es lo que puede romper cosas lejos de aquí.** Las imágenes de un producto
las leen la galería, las landings, los vídeos, los flujos y el propio generador:
**quince llamadas en once archivos**, contadas. El filtro va **en la lectura y no
en cada llamador**, o el próximo que lea imágenes volverá a enseñar los descartes
sin enterarse.

El punto por el que pasan todos es `readProductImages` (`image-store.ts:31`), y
tiene **dos ramas**:

```ts
if (isSupabaseConfigured()) return storage.listProductImages(productId);
const all = await readAll();          // el respaldo local
```

Las dos filtran, o el respaldo se comporta distinto del real y el fallo aparece
solo en una máquina:

- En `listProductImages`, en el SQL —`.is("discarded_at", null)`—, que es más
  barato que traer las filas para descartarlas.
- En la rama local, en el `filter` que ya tiene.

`readProductImages` acepta `{ incluirDescartadas?: boolean }` y lo pasa a la
rama que toque. Lo piden **dos** sitios, y el segundo no es evidente:

1. El pie de «2 descartadas», que es para lo que existe.
2. **El generador, para numerar.** `image-generate-actions.ts:440` arranca el
   contador del nombre en `existing.length`. Si las descartadas dejan de contar,
   el contador **retrocede**: descartas tres de diez y la siguiente vuelve a
   llamarse `…_08`, que ya existe. En el bucket no chocan —la ruta lleva un
   sufijo aleatorio— pero te bajas dos archivos con el mismo nombre y uno pisa al
   otro en la carpeta de descargas.

   Las dos llamadas del generador (`:236` y `:435`) piden el total **con**
   descartadas. Es la única cuenta que no se puede reducir: el nombre ya
   entregado no se puede reusar aunque la imagen se haya escondido.

## Generar en lote

### Qué se manda

Un módulo puro nuevo, **`src/lib/tanda-de-imagenes.ts`**, sin `server-only` y sin
imports con alias, para poder cargarlo desde un test. Dado un conjunto de
anuncios y las imágenes que ya existen, decide:

```ts
export interface TandaDeImagenes {
  /** Anuncios sin ninguna imagen todavía. */
  faltan: VisualDeAnuncio[];
  /** Los que ya tienen al menos una. */
  yaEstan: VisualDeAnuncio[];
}

export function tandaDeImagenes(
  anuncios: { id: string; name: string; imagePrompt: string; format: string }[],
  imagenes: { adId?: string }[],
): TandaDeImagenes;
```

Cada `VisualDeAnuncio` es lo que ya espera la acción: `title`, `prompt`,
`aspectRatio`, `concept`, `origin` y **`adId`**. La pantalla los concatena y hace
**una sola llamada** a `generateAdVisualsAction`.

Un anuncio sin `imagePrompt` no entra en ninguna de las dos listas: no hay nada
que generar y contarlo como «falta» daría un botón que promete siete y hace seis.

Y **solo entran los anuncios cortos**. Un conjunto mezcla cortos con piezas
largas —long copy y publirreportajes, la rama `kind: "largo"` de `AdUnit`—, y
esas no tienen prompt de imagen: sus creatividades se preparan en la pestaña de
Copys, con su propio panel. Meterlas aquí daría un botón que cuenta doce y genera
siete.

### El botón

En la cabecera de la campaña y en la de cada conjunto, el mismo componente:

- Dice lo que va a hacer: **«Generar las 7 que faltan»**.
- Al lado, una casilla: *«rehacer también las 5 que ya están»*. **Desmarcada
  siempre al abrir y no se recuerda entre pulsaciones** — es la única defensa
  contra pagar dos veces la misma tanda por costumbre.
- Sin nada que generar y sin la casilla marcada, desactivado y con el motivo
  escrito.

El de campaña es la suma de los de sus conjuntos, no otra cosa.

## Rehacer una imagen

El botón va **sobre cada miniatura** en `ImageDownloads`
(`image-downloads.tsx:105`), junto a «Descargar». Manda una sola creatividad con
el `prompt` y el `modelId` guardados de esa imagen: mismo encargo, otra tirada.
Con `prompt` vacío —las subidas— no aparece.

### Cuándo se descarta la anterior, que es lo fino

**No al pulsar.** La generación pasa por la cola y puede fallar o tardar: marcar
la vieja al pulsar deja el anuncio sin ninguna imagen visible mientras tanto, y
sin ninguna para siempre si la generación falla.

Se descarta **cuando la nueva se guarda**. `Visual` gana `replacesImageId`, viaja
por la acción como los demás campos por creatividad, y `uploadGeneratedImage`
—que ya inserta la fila nueva— pone `discarded_at = now()` en la vieja **en el
mismo paso**. Si la generación falla, no se ha descartado nada.

### Recuperar

Debajo de la rejilla, un pie: **«2 descartadas»**, que las despliega con su botón
de recuperar —`discarded_at = null`— y el de borrar de verdad, que ya existe
(`deleteProductImage`, `images.ts:350`).

## La pantalla

### La barra de carpetas

En `tab-ads.tsx`, encima de todo: **Todas · «las que crees» · Archivadas**, con
el número de campañas de cada una. Más «Nueva carpeta», y sobre cada carpeta
renombrar y borrar — una carpeta mal escrita para siempre es peor que dos
botones.

«Archivadas» va al final y siempre está, aunque esté vacía: es dónde se busca lo
que se archivó, y una pestaña que aparece y desaparece no se encuentra.

### Las cajas

En `campaign-structure.tsx`, cada campaña pasa a ser un `<details>` **cerrado de
entrada**. Es el mismo patrón que ya usa `ad-visuals.tsx:181` y, a diferencia de
un `useState`, no hay estado que reponer: cada generación llama a
`router.refresh()`, y con el plegado en el DOM eso no lo toca.

La cabecera cerrada lleva lo justo para decidir sin abrir:

    ▸ NATUROX_MX_TOFU_01   [TOFU]   3 conjuntos · 12 anuncios · 5 imágenes
                                    [Generar las 7 que faltan] [Carpeta ▾] [Archivar]

Los conjuntos, dentro, siguen como están: el árbol con su guía vertical, y cada
anuncio plegable como hoy.

La vista de tabla no cambia. Es la que sirve para leer todo seguido y copiarlo al
gestor de anuncios, y plegarla ahí sería quitarle lo único que hace.

### Mover y archivar

«Carpeta ▾» es un desplegable con las carpetas del producto y «Sin carpeta».
Nada de arrastrar y soltar: con veinte campañas en una lista larga, arrastrar
falla más de lo que acierta y hay que deshacerlo.

«Archivar» la saca de la vista al instante. En «Archivadas», el mismo botón dice
«Devolver» y la manda **a su carpeta de antes**, que sigue en `folder_id` porque
archivar no la borró.

## Las pruebas

**Automáticas** (`node --test`, import relativo con extensión):
`tanda-de-imagenes.test.ts` — qué falta y qué ya está; un anuncio sin prompt
fuera de las dos listas; el `adId` correcto en cada visual; que el lote de
campaña es la suma de los de sus conjuntos.

**A mano**, que es donde se ve si esto sirve:

1. Un producto con campañas: entran **todas plegadas**.
2. Crear carpeta, mover una campaña, recargar: sigue ahí.
3. Archivar; desaparece de «Todas». Devolverla: vuelve **a su carpeta**.
4. Borrar una carpeta con campañas dentro: las campañas siguen, sin carpeta.
5. Generar el lote de un conjunto; el botón cuenta bien y las imágenes caen cada
   una en **su** anuncio, no todas en el primero.
6. Rehacer una imagen: al llegar la nueva, la vieja desaparece y sale en el pie
   de descartadas. Recuperarla la devuelve.
7. Que una generación fallida **no** descarte nada.
8. La galería del producto, las landings y los flujos no enseñan descartes.
9. Descartar tres imágenes y generar otra: **el nombre nuevo no repite uno ya
   usado**. Es lo que comprueba que el generador sigue contando las descartadas.

Y los cuatro de siempre: `npx tsc --noEmit`, `npm run lint`, `npm test`,
`npm run build`.

## Fuera, a propósito

- **Carpetas anidadas.** Un nivel ordena; dos convierten esto en un explorador de
  archivos con su propio mantenimiento.
- **Arrastrar y soltar.**
- **Carpetas para nada que no sean campañas.** Si después hacen falta para copys
  o vídeos, esto no lo impide, pero adivinar ahora la tabla que serviría para los
  tres es adivinar.
- **Cambiar el prompt al rehacer.** Rehacer es «no me gusta, dame otra»: un clic,
  misma orden, otra tirada. Para cambiar el encargo está el panel del anuncio,
  que ya enseña su `imagePrompt`.
- **Archivar conjuntos o anuncios sueltos.** Se archiva la campaña.
