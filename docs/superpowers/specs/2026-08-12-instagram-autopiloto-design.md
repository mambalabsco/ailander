# El autopiloto de Instagram: que la cuenta se lleve sola

Escrito el 12 de agosto de 2026.

Pedido: integrar las ideas de `alsk1992/instagram-ai-agent` con la plataforma, y
que el cron **cree y publique** solo, respetando los límites de la cuenta.

## De dónde se parte

Lo que ya está, comprobado en el código y no en la memoria:

- El motor de piezas con los límites reales (`instagram/content.ts`), las
  fórmulas de gancho (`hooks.ts`) y el reparto semanal (`plan.ts`).
- El agente con cuatro herramientas y su bucle de conversación
  (`instagram/tools.ts`, `agent-actions.ts`).
- La cola con aprobación y hora (`instagram_posts`, `/instagram`).
- La generación de la imagen de **una** pieza, atada a ella
  (`generatePostMediaAction`).
- El publicador de tres pasos con su espera (`instagram/publish.ts`) y la
  reserva contra la doble publicación (`claimDuePost`).

Y los cuatro huecos que hacen que nada de eso publique solo:

1. **Nadie llama a `publishNow` ni a `claimDuePost`.** No hay ruta de cron ni
   disparador. La cola no publica: ni con fecha, ni aprobada.
2. **`claimDuePost` no puede funcionar desde un cron.** Pasa por
   `requireContext()`, que hace `redirect("/auth/login")` cuando no hay sesión.
   Un cron no es nadie.
3. **`escribir_publicaciones` declara un parámetro `enfoque` que se tira.**
   `agent-actions.ts` no lo pasa y `generateInstagramAction` no lo recibe. El
   agente dice que insistió en el sueño y escribe lo de siempre. Es el fallo más
   grave de los cuatro porque **miente sin dar error**.
4. **`auto` no se guarda.** Es una casilla de la interfaz que vive en el estado
   de un componente. No hay forma de decir «este producto va solo».

## Alcance

Dentro: el bucle autónomo —escribir, generar la imagen, programar, publicar— con
sus guardarraíles, su estado y su panel; y los cuatro huecos de arriba.

Fuera, cada uno con su propio ciclo: vídeo automático, que el agente lea los seis
documentos de investigación, el avatar de marca, carruseles, métricas y
aprendizaje, banco de arquetipos, fuentes de tendencia.

Descartado del repo de origen, y por qué:

- **`instagrapi` y la capa anti-detección.** El scroll previo, la rotación de
  sesión, el fingerprint de dispositivo y los retardos de tecleo existen porque
  ese agente se hace pasar por la app de Instagram desde una IP cualquiera.
  Nosotros publicamos por la Graph API con un token que Meta dio: no hay nada que
  esquivar, y simular retardos humanos no protegería de nada. Adoptarlo además
  costaría la cuenta que se quiere alimentar.
- **El router de varios proveedores de modelo.** Cada modelo escribe distinto: la
  voz de la marca dejaría de ser una.
- **El critic de ocho dimensiones.** Una nota de ocho ejes sobre un texto es una
  nota inventada con decimales.
- **Raspar cuentas de la competencia.** Va contra las condiciones de Instagram.
- **Seguir, ver historias y mandar DMs.** No existen en la API oficial. Responder
  comentarios sí, y queda para otro ciclo.

## Prerrequisito que no es código

La conexión Meta actual pide **un solo permiso, `ads_read`** (comprobado en
`meta-oauth.ts`, y a propósito). Un token lleva dentro los permisos con los que
nació, así que **el que hay no puede publicar**.

Hay que reautorizar con `instagram_basic`, `instagram_content_publish`,
`pages_show_list` y `pages_read_engagement`, y en una **conexión aparte** de la
de anuncios: si algo se rompe en la de publicación, el panel de Gasto no debería
dejar de leerse.

Hasta que eso ocurra el autopiloto se puede construir y probar entero salvo el
último paso. El panel tiene que decir «sin cuenta conectada» en vez de fallar.

## Arquitectura

Cuatro piezas nuevas de código, dos migraciones y tres retoques.

| Pieza | Qué hace |
|---|---|
| `src/app/api/cron/instagram/route.ts` | La puerta. Comprueba `CRON_SECRET` de cabecera, llama al bucle, devuelve el parte. No razona. |
| `src/lib/instagram/autopilot.ts` | El bucle, **puro**: recibe el estado y devuelve qué toca. No toca base ni red. |
| `src/lib/instagram/duplicates.ts` | El detector de gancho casi-repetido. Puro. |
| `src/lib/data/instagram-service.ts` | La capa de datos sin sesión: cliente de servicio, `workspace_id` explícito en cada consulta. |

Retoques: `instagram/publish.ts` (conservar el código de error de Meta),
`agent-actions.ts` + `instagram-actions.ts` (el `enfoque`), y el panel en
`/instagram`.

`src/lib/data/instagram.ts` **no se toca**: sigue siendo la capa de sesión con
RLS que usa la interfaz.

### Por qué dos capas de datos y no un parámetro opcional

Un `workspaceId` opcional en las funciones que ya existen significaría que a
veces la seguridad la pone la base de datos y a veces la pone quien llama. Esa
ambigüedad es la forma exacta que tiene una fuga entre espacios de trabajo de
pasar desapercibida: se añade una función nueva, se olvida el filtro, y la
consulta devuelve las publicaciones de otro cliente sin dar ningún error.

Separadas, la capa de servicio se lee entera de una sentada, y una consulta suya
sin `.eq("workspace_id", …)` se ve a simple vista.

### El aislamiento es por espacio, no por usuario

Comprobado en `20260811001000_instagram_cola.sql`: las políticas de
`instagram_posts` filtran por `workspace_id in (select public.mis_espacios())`.
La capa de servicio filtra por lo mismo.

Y hay una trampa concreta: el trigger `poner_espacio()` rellena `workspace_id`
leyendo `auth.uid()`, que bajo `service_role` es **NULL**. Un `insert` del
autopiloto que no ponga el espacio a mano deja la fila huérfana: existe, se
publica, y **nadie la ve en la interfaz**. Toda escritura de la capa de servicio
pone `workspace_id` y `user_id` explícitamente.

## Estado: la tabla `instagram_autopilot`

Una fila por producto en autopiloto.

```sql
create table if not exists public.instagram_autopilot (
  product_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,

  activo boolean not null default false,
  -- La cuenta donde publica. Va aquí y no en una variable de entorno porque
  -- cada producto puede publicar en una cuenta distinta.
  ig_user_id text,

  por_dia integer not null default 1,
  colchon_dias integer not null default 3,
  hora_desde integer not null default 18,
  hora_hasta integer not null default 21,

  -- Solo para enseñarlo en el panel. El tope y la separación NO se calculan de
  -- aquí: ver «Los topes son de la cuenta, no del producto».
  ultima_publicacion_at timestamptz,
  fallos_seguidos integer not null default 0,
  -- Texto y no booleano: cuando se apaga solo, lo primero que se quiere saber
  -- es si fue el tope, el token o los fallos. Un booleano obliga a ir al registro.
  pausado_por text not null default '',

  created_at timestamptz not null default now()
);
```

Con RLS por `mis_espacios()` igual que `instagram_posts`, y el mismo trigger
`poner_espacio` para cuando la fila la crea una persona desde la interfaz.

### Los topes son de la cuenta, no del producto

El tope diario y la separación mínima los impone **Instagram sobre la cuenta**, y
dos productos pueden publicar en la misma. Calculándolos desde la fila del
autopiloto —que es por producto— dos productos con la misma cuenta se pasarían
del tope entre los dos, cada uno convencido de ir dentro.

Así que se calculan consultando `instagram_posts`, y para poder hacerlo hace
falta la segunda migración: **añadir `ig_user_id` a `instagram_posts`**, escrito
al publicar. Sin esa columna no hay forma de saber cuántas salieron por una
cuenta, solo cuántas salieron de un producto — que no es la pregunta.

```sql
alter table public.instagram_posts add column if not exists ig_user_id text;

create index if not exists instagram_posts_por_cuenta
  on public.instagram_posts (ig_user_id, published_at);
```

## El bucle, cada vuelta

Cada ejecución hace dos cosas **en este orden**, y las dos son idempotentes.

### Primero publicar

`claimDuePost` (versión de servicio) coge **una** pieza: aprobada, con hora
pasada, con media, de un producto con el piloto activo y sin pausar. Publica,
cierra, devuelve.

Una por vuelta y no un lote: un vídeo tarda minutos, y un lote de cinco tiene la
ruta abierta demasiado tiempo — si el servidor la corta a mitad, la fila queda en
«publicando» y no salió nada. Con el cron cada cinco minutos hay 288
oportunidades al día, doce veces el tope de la API.

### Después rellenar

Cuenta las piezas **listas**: `status = 'aprobado'`, con `media_url`, con fecha
futura. Los borradores **no cuentan**, aunque tengan imagen y fecha: `claimDuePost`
solo coge aprobadas, así que un borrador no va a publicarse nunca por sí solo y
contarlo llenaría el colchón con piezas muertas.

Si quedan menos de `colchon_dias × por_dia`, se llama a
`generateInstagramAction` con `auto: true` para escribir las que falten, se les
genera la imagen y se les pone hora dentro de la ventana con dispersión.

**El relleno no pasa por el bucle de conversación del agente** (`agentChatAction`):
llama directamente a la acción. El bucle de herramientas existe para que una
persona pueda pedir cosas en lenguaje suelto; un cron ya sabe lo que quiere, y
meterlo por ahí añade seis vueltas de modelo, coste y una forma nueva de fallar
sin ganar nada.

Las piezas de formato vídeo se escriben, se marcan pendientes de vídeo y **no
cuentan para el colchón**. Si contaran, tres reels sin vídeo llenarían el colchón
y la cuenta dejaría de publicar creyendo que va sobrada — el peor fallo posible,
porque es silencioso y parece que todo va bien.

### Por qué publicar antes que rellenar

Publicar es lo que tiene hora. Si una vuelta se queda sin tiempo, lo que se
pierde es el relleno, que espera cinco minutos sin que nadie lo note.

## Guardarraíles

Lo transferible del repo de origen, cada uno en su sitio.

| Guardarraíl | Dónde | Qué hace |
|---|---|---|
| **Tope diario** | Antes de publicar | Cuenta las publicadas de esa cuenta en 24h. Dos topes: el propio (`por_dia`) y el duro de la API (25). Alcanzado, no publica y lo anota. No es un error. |
| **Separación mínima** | Antes de publicar | 90 minutos entre publicaciones de la misma cuenta. Evita que un atasco resuelto vomite cinco seguidas el día que se arregla algo. |
| **Casi-duplicado** | Tras generar, antes de guardar | Si el gancho normalizado se parece demasiado a uno de los últimos 15, la pieza se descarta y se reescribe. |
| **Proporción** | Al generar la imagen | Con `sharp`, que ya está. Comprueba las dimensiones contra lo que Instagram acepta para ese formato. |
| **Hashtags en el primer comentario** | Al publicar, opcional | Si falta `instagram_manage_comments`, se quedan en el pie y no se rompe nada. |
| **Hora con dispersión** | Al programar | Minuto pseudo-aleatorio dentro de la ventana, determinista por pieza. |

### Sobre el casi-duplicado

Hoy `recentSummary` mete lo ya publicado en el encargo. Eso es prevención blanda
y el modelo la ignora a la décima pieza. Hace falta una comprobación **dura**
después de generar: normalizar el gancho —minúsculas, sin signos, sin palabras
vacías—, compararlo por trigramas contra los últimos quince, y descartar por
encima de un umbral.

El umbral se fija con las piezas que ya hay en la base, no a ojo. Empieza en 0.6
y se ajusta en el primer despliegue.

### Sobre la dispersión

Hoy `planWeekAction` clava las 19:00 todos los días. Determinista por pieza
—derivada del `id`, no aleatoria— para que dos vueltas del cron no le pongan dos
horas distintas a la misma publicación.

## Cuando falla

Lo que decide si esto es útil o un generador de ruido es distinguir **lo que se
arregla solo** de **lo que no**.

- **Falla al publicar** → `finishPost` ya devuelve la pieza a «aprobado» con su
  error, que es lo correcto. El piloto suma `fallos_seguidos`; a los tres, se
  pausa con el motivo escrito. Reintentar para siempre con un token caducado son
  288 fallos al día que nadie lee.
- **Token caducado, cuenta no profesional, permiso que falta** → pausa
  **inmediata**, sin gastar tres intentos: no se arreglan solos.
- **Falla al generar la imagen** → la pieza se queda sin media, no se programa y
  no cuenta para el colchón. El siguiente ciclo lo reintenta. **No pausa el
  piloto**: no publicar hoy es peor que gastar dos veces en una imagen.
- **Falla al escribir** → igual: se anota y se reintenta en la vuelta siguiente.

### El código de error, no el mensaje

Distinguir lo permanente de lo transitorio por el texto del mensaje es frágil:
Meta lo cambia y lo traduce. Hoy `graph()` en `publish.ts` conserva el mensaje y
**descarta el código**. Hay que conservarlo y decidir por él.

El mensaje sigue devolviéndose tal cual, que es lo que hace útil el registro.

## Interfaz

Un panel en `/instagram` por producto, o el autopiloto no se puede encender:

- Activar y desactivar.
- Cuenta de Instagram donde publica. Si no hay ninguna con permiso de
  publicación, lo dice y enlaza a reautorizar.
- Piezas al día, colchón en días, ventana horaria.
- Estado: última publicación, cuántas listas quedan por delante, y **por qué está
  pausado** si lo está, con botón de reanudar.

Lo último no es adorno: sin ello, un piloto pausado es indistinguible de uno que
funciona pero no tiene nada que publicar.

## Los cuatro huecos de partida

1. **El `enfoque`.** `agentChatAction` lo lee de `args.enfoque` y lo pasa a
   `generateInstagramAction`, que lo recibe como `focus` y lo mete en el encargo,
   junto a la memoria y la guía de ganchos. Sin esto el agente miente.
2. **`auto` persistido.** Deja de ser estado de un componente y pasa a la tabla.
   La casilla de la interfaz sigue existiendo para las tandas a mano.
3. **`claimDuePost` sin sesión.** Se duplica en la capa de servicio. La de sesión
   se queda para la interfaz.
4. **El disparador.** La ruta de cron, y la línea de `crontab` en el servidor
   documentada en `DEPLOY.md`.

## Pruebas

`autopilot.ts` y `duplicates.ts` son puros a propósito, así que se prueban
enteros con el runner que ya usa el proyecto (`node --test`, patrón
`*.test.ts`):

- Colchón lleno, colchón vacío, colchón a medias.
- Piezas de vídeo que no cuentan para el colchón.
- Borradores con imagen y fecha que **no** cuentan para el colchón.
- Tope diario alcanzado, tope de la API alcanzado.
- **Dos productos con la misma cuenta**: el segundo respeta el tope que gastó el
  primero.
- Separación mínima sin cumplir.
- Ventana horaria, y dispersión determinista: la misma pieza da siempre la misma
  hora.
- Casi-duplicado: gancho idéntico, gancho parecido con otras palabras, gancho
  distinto que comparte tema.
- Fallo transitorio suma; fallo permanente pausa a la primera.

La ruta y la capa de datos no se prueban contra red. Se verifican una vez contra
la cuenta real, y `./actualizar.sh` ya aborta el despliegue si algún test falla.

## Lo que hay que verificar en producción antes de dar esto por hecho

Nada de esto cuenta como funcionando hasta que se vea:

1. Una pieza escrita por el cron, con su imagen, programada dentro de la ventana.
2. Esa pieza publicada, con su `instagram_id` anotado.
3. El tope diario deteniendo la segunda publicación del día.
4. Un token inválido pausando el piloto con el motivo escrito en el panel.
