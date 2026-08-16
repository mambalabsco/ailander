# Casino online: las apps, sus ángulos y sus imágenes

Escrito el 16 de agosto de 2026. **Segunda de dos partes.** La primera —el
vertical y la investigación por país— está en
`2026-08-16-casino-vertical-design.md` y ya está construida.

Pedido: dentro de cada producto de casino hay **apps** —Monticello Online y las
demás—, cada una con su enfoque. Los copys se escriben para una app. Los ángulos
pueden ser de una app o generales, y los generales se adaptan a otras. Y la foto
de producto es **la captura de la app**: si se pide una foto con el producto,
sale un teléfono con la app en pantalla.

## De dónde se parte

Comprobado en el código, no recordado:

- **El motor de imágenes de referencia ya existe entero**: `readReferenceBytes`
  (`image-generate-actions.ts:88`), `withReference` por creatividad
  (`image-generate-actions.ts:409`), `acceptsReferences` del modelo, y la bandera
  `--image-references` del CLI (`higgsfield-cli.ts:552`). Lo que falta es **de
  dónde sale la referencia**: hoy es la imagen principal del producto.
- `angles` cuelga de un producto y ya tiene `market_id` nulable con el
  significado «vale en todos». El mismo patrón sirve para «vale en todas las
  apps».
- `copies` tiene `angle_id`, `hook_id` y `adset_id` nulables: añadir `app_id` es
  el mismo tipo de columna.
- **Ningún método de copy produce el testimonio que se quiere.** El más cercano,
  `advertorial-trial` (`types/copy.ts:216`), es un diario de prueba de treinta
  días con el resultado al final. El de casino es otra estructura.
- `product_images` tiene `pattern` y `is_primary`, así que la captura cabe sin
  tabla nueva.

## Las decisiones

1. **La app es una tabla propia**, no una etiqueta: tiene enfoque, captura y
   enlace, y los copys apuntan a ella.
2. **Un ángulo puede ser de una app o general.** Nulo es general.
3. **La captura vive en `product_images`** con su `app_id`, no en una tabla de
   archivos aparte.
4. **La referencia de imagen sale de la app elegida**, no de la principal del
   producto.
5. **Un método de copy nuevo**, propio del vertical, que es el que produce el
   testimonio.

## El modelo

### Las apps

```sql
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  -- Con qué entra esta app y no otra. Es lo que la distingue en el copy.
  focus text not null default '',
  -- A dónde va el tráfico: la ficha de la tienda o el enlace de descarga.
  download_url text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Con su `workspace_id`, su política y su disparador `poner_espacio`, como toda
tabla nueva.

### Dónde se engancha

```sql
-- Nulo = general: el ángulo vale para cualquier app de este país.
--
-- Es el mismo significado que `market_id` en esta misma tabla, y por el mismo
-- motivo: una historia sirve para varias apps y obligar a elegir una duplicaría
-- el trabajo por app desde el primer día.
alter table public.angles
  add column if not exists app_id uuid references public.apps (id) on delete set null;

-- De qué app habla el texto. Nulo en todo lo que ya existe.
alter table public.copies
  add column if not exists app_id uuid references public.apps (id) on delete set null;

-- La captura es de la app, no del producto.
alter table public.product_images
  add column if not exists app_id uuid references public.apps (id) on delete set null;
```

`on delete set null` en las tres, y no `cascade`: borrar una app no puede
llevarse los copys ni las imágenes que ya se escribieron con ella. Pierden la
referencia, que es lo que sobra.

## Las imágenes

La captura de la app se sube como una imagen más, con su `app_id` y el patrón
`captura-app`. A partir de ahí, dos patrones nuevos propios del vertical:

| Patrón | Qué es |
|---|---|
| `app-en-movil` | Un teléfono sostenido con la app en pantalla, en una escena real |
| `app-en-mano` | Primer plano de la mano y la pantalla, tipo foto de móvil |

Y **el cambio que los hace servir**: cuando el producto es de casino y hay app
elegida, `readReferenceBytes` devuelve la captura **de esa app** en vez de la
imagen principal del producto. Sin eso, el teléfono de la foto enseña una app
inventada, que es exactamente lo que no se quiere.

La captura no se describe en el prompt: se manda como referencia. Describirla
—«pantalla de casino con ruleta»— produce otra app parecida, no la tuya.

## El método de copy

El ejemplo que hay que poder producir es un testimonio en primera persona, con
esta estructura:

1. **El fondo del pozo**, con detalles concretos y cotidianos: la pega perdida,
   el arriendo, lo que quedaba en la cuenta.
2. **El descubrimiento casual** —un comentario, alguien que lo contó— y el
   escepticismo declarado.
3. **El momento**, contado despacio.
4. **El retiro que sí llegó**, con el plazo. Es la prueba, y responde a la
   objeción que el documento de pagos dice que es la primera.
5. **La vida después**, medida en cosas normales y no en lujos.
6. **El cierre**, que no promete repetir el resultado sino invitar a intentarlo.

Se escribe en el habla del país, con su vocabulario, porque un testimonio en
neutro no se lee como un testimonio.

## La regla que estorbaba, decidida y fuera

El encargo llevaba «nunca prometas ganancias», que prohibía este método entero.
**Se ha quitado**, decidido el 16 de agosto: el testimonio de casino es una
historia de ganancia, y una herramienta que no puede escribir lo que se le pide
no sirve para este vertical.

## Alcance

**Dentro:** la tabla `apps` con su pantalla, el `app_id` en ángulos, copys e
imágenes, los ángulos generales y su adaptación a una app, los dos patrones de
imagen y la referencia desde la captura, y el método de copy.

**Fuera:** medir qué app rinde —no hay métricas de vuelta—, repartir tráfico
entre apps, y cualquier cosa de pedidos o ingresos.

## El flujo

1. En el producto de casino, pestaña **Apps**: das de alta Monticello Online con
   su enfoque y su enlace, y subes su captura.
2. Sacas ángulos como siempre. Cada uno queda **general** o **de una app**.
3. Escribes un copy: eliges app, ángulo y método.
4. Pides una imagen con el patrón `app-en-movil` y sale un teléfono con **tu**
   app, porque la captura va de referencia.

## Pruebas

Puro, y por tanto probado de verdad:

- Que un ángulo general se ofrece para cualquier app, y uno de app solo para la
  suya.
- Que la referencia elegida es la captura de la app cuando la hay, y la principal
  del producto cuando no.
- Que el método nuevo declara sus seis partes y su rango de palabras.

No es puro y se comprueba a mano: dar de alta dos apps, escribir un copy de cada
una y ver que el nombre y el enfoque correctos entran en el texto; y generar una
imagen y comprobar que la pantalla del teléfono es la captura subida.

## Orden de construcción

1. La tabla `apps` y su pantalla. Deja algo usable solo con eso.
2. `app_id` en ángulos, con «general» como estado inicial.
3. `app_id` en copys, y la app en el encargo.
4. El método de copy.
5. Las imágenes: patrones y referencia desde la captura.

## Lo que este diseño deja pendiente

- **Adaptar un ángulo general a una app concreta con una llamada.** El motor
  existe —es el de adaptar una página a otro ángulo— pero conectarlo es trabajo
  aparte.
- **Reutilizar una app entre países.** Cada país es un producto y sus apps son
  suyas.
- **Saber qué app rinde.**
