# Un producto en varios mercados

Escrito el 12 de agosto de 2026.

`docs/producto-multimercado.md` planteaba el cambio y dejaba cuatro preguntas
abiertas. Aquí están respondidas y convertidas en algo construible.

Lo que se quiere: que un producto que sirve a varios países se trabaje **una
vez**, con dos modos —general, que no puede decir nada que no sea cierto en
todos, y de un país, donde ya hay moneda, precio y acento—.

## De dónde se parte

Comprobado en el código, no recordado:

- `products.market_id` apunta a **un** mercado, y de ahí salen moneda y
  configuración regional (`money.ts:17-39`).
- El precio se cuela en cuatro encargos: `copy-prompts.ts:78`,
  `copy-prompts.ts:596`, `research-prompts.ts:58` y `visual-prompts.ts:349`.
  El tercero ya omite la línea cuando el precio es 0, así que el patrón existe.
- `fx_rates` guarda el cambio **por día** y marca si es exacto o aproximado;
  `fx.ts` lo resuelve buscando hacia atrás.
- La regla de qué viaja entre países ya está escrita, dentro del duplicador
  (`product-duplication.ts:29-44`): los documentos 5 y 6 se heredan porque el
  mecanismo del producto no cambia al cruzar una frontera; los 1 a 4 se vacían;
  los ángulos se copian marcados para adaptar; el rendimiento **no** se copia.
- Una landing se publica como página de Shopify con `handle: page.slug`
  (`landing-actions.ts:836`), y la URL del mercado sale de
  `market.domain || store.domain` más el prefijo de ruta (`store.ts:110-117`).
- Las 49 tablas filtran por espacio de trabajo con `mis_espacios()`, y el
  `workspace_id` lo rellena el disparador `poner_espacio`.
- `instagram_posts.product_id` es `text`, no una clave foránea a `products`.

## Las cuatro decisiones

1. **La investigación es seleccionable**, con **un interruptor por producto**.
   Apagado —por mercado— es el valor inicial, también para lo ya existente.
2. **Lo generado recuerda su mercado**, y el selector filtra.
3. **El precio se resuelve en cascada** y sólo un precio escrito a mano se
   publica.
4. **Una landing publicada es una por mercado.** El modo general escribe, el de
   país publica.

## Alcance

**Dentro:** varios mercados por producto, el selector, ocultar el precio en
general, los precios por mercado con su conversión congelada, la etiqueta de
mercado en las piezas con su filtro y su migración, y la publicación por
mercado con sus tres comprobaciones.

**Fuera, a propósito:**

- **Instagram.** No se toca nada: `instagram_posts` no recibe etiqueta y la cola
  sigue igual. Se está construyendo el agente de contenido (`docs/agente-cm.md`)
  y meter mano ahora en la misma cola es pelearse por el mismo archivo. Queda
  como pendiente y se retoma cuando el agente esté: la regla que faltará
  entonces es que la cola publique una pieza sólo si su mercado coincide con el
  de la cuenta, o si es general.
- **La oferta por mercado.** Los escalones de `offer_tiers` son dinero y
  deberían ser por país, pero abre otra pantalla entera y no está en los pasos
  del documento de origen. Aquí sólo se **ocultan en modo general**, igual que el
  precio. Queda anotado en «Lo que este diseño deja pendiente».
- **Los idiomas de Shopify** (Translate & Adapt). Sirven para traducir la misma
  página; aquí no se traduce, se escribe copy distinto por país.

## El modelo

### `product_markets`

Pasa a ser la verdad sobre en qué mercados vive un producto y a qué precio en
cada uno.

```sql
create table if not exists public.product_markets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  market_id uuid not null references public.store_markets (id) on delete cascade,

  price numeric(12, 2) check (price >= 0),
  -- De dónde salió el número. 'manual' gana siempre y no lo pisa ninguna
  -- conversión: no es una preferencia de la interfaz, es que el conversor
  -- filtra por esta columna.
  price_source text not null default 'ninguno'
    check (price_source in ('manual', 'convertido', 'ninguno')),
  -- El cambio con el que se convirtió, congelado. Nulos cuando es manual.
  price_fx_day date,
  price_fx_rate numeric check (price_fx_rate > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (product_id, market_id)
);
```

Con su índice por producto, su `touch_updated_at`, su política —`workspace_id in
(select public.mis_espacios())`, precedida de `drop policy if exists` porque
estas migraciones se reejecutan en cada despliegue— y su disparador
`poner_espacio`.

`products.market_id` se queda, pero con un significado más estrecho: el
**mercado base**, el del precio de `products.price`. La membresía y los precios
por país viven **sólo** en `product_markets`; tener la moneda en dos sitios es
la puerta a que discrepen. La migración inserta una fila en `product_markets`
por cada producto que hoy tiene mercado, con `price = products.price` y
`price_source = 'manual'`, que es la verdad: alguien lo escribió.

Invariante: el mercado base tiene que estar entre los mercados del producto. Lo
garantiza la capa de datos al escribir, y la migración lo cumple por
construcción. Cambiar el mercado base **no** reconvierte ningún precio.

`products.country`, `products.language` y `products.currency` quedan como del
mercado base y dejan de alimentar los encargos: el país, el idioma y la moneda de
cada pieza salen del mercado del selector. Sobreviven porque las usan los
productos de la competencia, que no tienen mercado y por eso caían todos a euros.

### El interruptor de investigación

```sql
alter table public.products
  add column if not exists research_shared boolean not null default false;
```

Uno por producto. Apagado significa investigación por mercado, y es el valor
inicial también para lo existente: los seis documentos de cada producto se
migran etiquetados con el mercado que tiene hoy, que es cómo se generaron.
Encenderlo es un acto explícito que dice «esta investigación viaja».

De ahí sale una consecuencia que hay que aceptar de frente: **con la
investigación por mercado, el modo general no tiene investigación que dar.** Las
herramientas que la necesitan —copys largos, ángulos, landings— piden elegir
mercado. Con el interruptor encendido, el modo general funciona entero. La
alternativa sería fabricar un documento «general» promediando cuatro públicos, y
eso es plausible y falso.

### El selector

Vive en la URL: `?mercado=general` o `?mercado=<id>`. Así sobrevive a la
recarga, se puede enlazar y lo leen los componentes de servidor sin cliente de
por medio.

**Con un solo mercado no aparece.** El modo general ni se ofrece y la ficha se
comporta exactamente como hoy; la función surge al añadir el segundo mercado.
Con dos o más, el estado inicial es general.

## El precio

### La cascada

Manda el primero que exista:

1. **`manual`** — escrito a mano para ese mercado. Redondear a `9.990` en Chile
   no sale de ninguna conversión.
2. **`convertido`** — del precio base y el cambio, **congelado al fijarlo**: se
   guardan el importe, el día y la tasa. Nunca se convierte al pintar, por lo
   mismo que `fx_rates` guarda el cambio de cada día: un número que cambia solo
   cada mañana no es un precio.
3. **Sin precio** — el mercado no tiene ninguno, o estás en general.

### Sólo un precio manual se publica

Un precio convertido es una **sugerencia**: se enseña marcada como tal y sirve
para lo de dentro —comparar, el P&L, la gráfica—. Publicar una landing o una
ficha en un mercado cuyo precio es convertido se detiene y pide confirmarlo.
Confirmar es un clic y lo vuelve `manual`.

Esto es lo que impide que `$10.847` acabe en una página, sin depender de que
alguien se acuerde. Para que confirmar no sea un fastidio, al convertir se
ofrecen dos botones: el número convertido y **un redondeo comercial** según la
moneda —terminación `990` en CLP y COP, `,99` en EUR y USD—. Se propone, no se
aplica solo: un redondeo automático que nadie mira es cómo `9.990` se convierte
en `10.000` en la página de alguien.

El cambio no se recalcula solo jamás. Si la conversión tiene más de un mes se
dice al lado —«convertido con el cambio del 12 de agosto»— y hay un botón para
rehacerla.

### En general no hay precio

No se enseña vacío: no se pide, no se pinta y no entra en ningún encargo. En
`money.ts` entra `priceFor(producto, mercado | "general")`, que devuelve `null`
en general, y los cuatro sitios donde el precio se cuela en los prompts omiten
**la línea entera** en vez de escribir un cero. Los escalones de la oferta se
ocultan igual, por la misma razón: son dinero.

## La etiqueta de mercado en lo generado

Una columna `market_id` nullable, donde **`null` significa «general», o sea:
vale en todos los mercados**. El filtro es una sola regla, escrita una vez en la
capa de datos y no repetida en cada pestaña:

- En un mercado se ve lo de ese mercado **y** lo general.
- En general se ve **sólo** lo general.

Llevan etiqueta: `copies`, `angles`, `hooks`, `short_ads`, `landing_pages`,
`prelandings`, `landing_experiments`, `videos`, `product_images`,
`performance_records`, `campaigns` y `research_documents`.

No la llevan: `adsets` y `ad_creatives`, que la heredan de su campaña —duplicarla
en tres niveles es garantizar que algún día discrepen—; `product_notes`, porque
una nota es para ti y no para un país; e `instagram_posts`, que queda fuera de
alcance.

`performance_records` merece decirse aparte porque es la que más se presta al
autoengaño: el rendimiento es del mercado donde se midió, **nunca** es general, y
lo que funcionó en Chile es una hipótesis en México. Deja de depender de que
alguien duplique bien.

**Cuidado con la unicidad.** `research_documents` tiene hoy
`unique (product_id, document_id)`. Al añadir el mercado hay que usar
`unique nulls not distinct (product_id, document_id, market_id)`: Postgres
considera dos `null` distintos entre sí, así que sin eso se pueden crear dos
documentos generales del mismo tipo y la pantalla enseñaría uno de los dos según
el orden de la consulta.

**La migración etiqueta todo lo existente con el mercado que el producto tiene
hoy.** Los productos sin mercado —los de la competencia— dejan sus piezas en
`null`, que también es la verdad. Nada queda marcado como general por descuido:
general es un estado al que se llega a propósito, con una acción «vale en todos
los mercados» en cada pieza, para cuando compruebas que un vídeo sin voz o una
foto sin texto viaja.

El trabajo de verdad no es la columna: son las ~doce acciones de servidor de
`src/app/products/[id]/` que generan piezas, que tienen que sellar el mercado
del selector al guardar. Un **único ayudante** lee el selector y devuelve la
etiqueta; ninguna acción decide por su cuenta. Una acción que se olvide sella
`null` y la pieza aparece como general, que es un fallo silencioso y del tipo
caro: se publicaría en otro país.

En modo mercado, una pieza general se ve con su insignia y con un botón de
adaptar. Un copy general no lleva precio y no lo llevará nunca, así que no puede
convertirse en el copy de la landing de México sin pasar por esa adaptación.

## Publicar

**Una landing publicada es una por mercado.** Si dos mercados publican con el
mismo `slug`, la segunda publicación **pisa la página de la primera** sin avisar,
porque para Shopify es el mismo `handle`. El slug pasa a llevar el mercado
dentro, y publicar en un mercado sólo puede escribir sobre la página de ese
mercado: una comprobación de una línea que convierte un desastre silencioso en un
error.

**El modo general escribe, el modo mercado publica.** En general se redactan
estructura y argumentos sin precio; al publicar desde general se pide el
mercado. La publicación exige tres cosas:

1. Mercado elegido. Sin él no hay dominio ni prefijo al que publicar.
2. **Precio `manual`** en ese mercado.
3. Las piezas que se publican son las de ese mercado o las generales, nunca las
   de otro.

Los anuncios no necesitan nada nuevo: `campaigns` ya lleva la etiqueta y las
cuentas publicitarias tienen su moneda, que ya se convierte con `fx_rates`.

## Reglas de la casa que aplican aquí

De `AGENTS.md`, porque este trabajo pisa las tres zonas donde se rompió antes:

- `create policy` no admite `if not exists`: cada política nueva lleva delante su
  `drop policy if exists`, o el segundo despliegue aborta.
- Toda tabla nueva necesita `workspace_id`, su política con `mis_espacios()` y el
  disparador `poner_espacio`.
- **No añadir `.eq("user_id", …)`** a ninguna consulta nueva: la política ya
  acota, y ese filtro no falla —devuelve cero filas y a quien invitas le aparece
  la plataforma vacía—.
- Los tests importan con ruta relativa y sólo prueban módulos puros.
- Nunca ejecutar prettier.

## Pruebas

Puro, y por tanto probado de verdad:

- La cascada del precio: que `manual` gana, que `convertido` no lo pisa, que sin
  precio devuelve `null`.
- `priceFor` en general devolviendo `null`, y los constructores de encargo
  omitiendo la línea del precio en vez de escribir un cero.
- El redondeo comercial por moneda.
- La regla del filtro: mercado ve mercado más general; general ve sólo general.
- El slug por mercado: dos mercados del mismo producto nunca producen el mismo.

No es puro y se comprueba a mano, con lista: las políticas de la tabla nueva
—invitar a alguien y ver que ve los precios—, las ~doce acciones sellando el
mercado, y la publicación deteniéndose con un precio convertido.

## Orden de construcción

Cada paso deja la plataforma funcionando, y un producto de un solo mercado no ve
ninguna diferencia hasta el final.

1. **`product_markets` y el selector.** Migración, capa de datos, selector en la
   URL, oculto con un solo mercado.
2. **Ocultar el precio en general**, en pantallas y encargos. Es el paso que
   evita el error caro y no depende de los precios por país.
3. **Precios por mercado y conversión congelada**, con la regla de que sólo lo
   manual se publica.
4. **Etiqueta y filtro** en las doce tablas, con su migración y el ayudante que
   sella el mercado.
5. **Publicación por mercado**, con el slug y las tres comprobaciones.

## Lo que este diseño deja pendiente

- **Instagram por mercado**, cuando el agente de contenido esté.
- **`offer_tiers` por mercado.** Hoy se ocultan en general y nada más.
- **`product_offers.free_shipping_threshold`** es dinero y sigue siendo del
  producto, sin país. Se va con la oferta por mercado.
- **El coste de la investigación por mercado.** Con el interruptor apagado y
  cuatro países se pagan cuatro investigaciones. Es el precio de no mentir sobre
  el público, pero conviene verlo en el panel de Gasto antes de dar por buena la
  cifra.
