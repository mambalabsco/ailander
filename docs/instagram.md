# Contenido para Instagram, con publicación programada

Pedido: crear imagen, texto y vídeo a partir del producto y publicarlo solo.

Estado: **el texto y la cola, hechos. La media y la publicación, no.**

Hecho: el motor de las piezas con los límites reales dentro
(`src/lib/instagram/content.ts`), la tabla `instagram_posts` con su
`claimed_at`, la acción que escribe y encola en borrador, y la pantalla
`/instagram` con la cola, la edición, la aprobación y la hora.

Falta:

1. **Generar la media.** Cada pieza guarda `scene` —qué se ve— y la proporción
   sale del formato. Es enchufarlo al generador que ya existe y guardar la
   dirección en `media_url`. **Ojo al enlazarlo de vuelta**: la imagen tiene que
   quedar atada a *esa* publicación, no suelta en la galería, o al programar no
   se sabe cuál va con cuál.
2. **El cron.** Lee lo aprobado con hora pasada, marca `claimed_at` **antes** de
   llamar, crea el contenedor, espera el procesado y publica. Sin lo primero,
   dos vueltas del cron publican dos veces.
3. **La conexión con Meta**, que depende de reautorizar la app con los cuatro
   permisos.

## Lo que la API no deja, y cambia el diseño

Esto no es opcional ni se puede rodear con más código:

- **No se publica en una cuenta personal.** Hace falta una cuenta de Instagram
  *profesional* —empresa o creador— **vinculada a una Página de Facebook**. Si
  la cuenta es personal, no hay API: hay que convertirla primero.
- **Publicar son dos pasos, no uno.** Primero se crea un *contenedor* con la
  media, después se publica. Entre medias hay que esperar a que Instagram
  procese —los vídeos tardan— y preguntar si está listo. Un flujo de un solo
  paso no existe.
- **La media se sube por URL pública**, no como archivo. Instagram descarga
  desde esa dirección, así que tiene que ser accesible sin firmar. Nuestro
  bucket es privado: hace falta una dirección firmada de larga duración o un
  bucket aparte para lo que se publica.
- **Hay tope diario** de publicaciones por cuenta. Un calendario que programe de
  más no dará error al programar: fallará al publicar, horas después.
- **El vídeo tiene requisitos propios** —duración, proporción, códec— y si no
  los cumple el contenedor falla en el procesado, no al crearlo.

## Lo que ya está: la app sirve, el token no

Comprobado en `meta-oauth.ts`: la conexión actual pide **un solo permiso,
`ads_read`**, y a propósito —está escrito allí que no se pide gestión de
anuncios porque la plataforma solo lee gasto.

Un token lleva dentro los permisos con los que nació. Así que el que hay **no
puede publicar**, y no por poco: no tiene ninguno de los que hacen falta.

**La misma app de Meta vale.** Lo que hay que hacer es añadirle estos permisos y
**volver a autorizar**, que genera un token nuevo:

    instagram_basic              ver la cuenta de Instagram vinculada
    instagram_content_publish    publicar
    pages_show_list              encontrar la Página
    pages_read_engagement        leer la Página vinculada

Es la misma lección que con la app de Shopify: añadir un permiso no basta, hay
que reinstalar o reautorizar. Y conviene que los nuevos vayan en una conexión
aparte y no ampliando la de anuncios: si algo sale mal con los de publicación,
el gasto del panel no debería dejar de leerse.

## La forma

1. **Generar**: el texto sale del producto y su investigación —lo mismo que los
   copys, con otro formato—; la imagen y el vídeo, del mismo camino que ya
   existe.
2. **Aprobar**: nada se publica sin que alguien lo vea. Una cola con lo que va a
   salir, editable hasta el momento de irse.
3. **Programar**: fecha y hora por pieza. El cron mira qué toca, publica y anota
   el resultado.
4. **Anotar**: qué se publicó, cuándo y con qué identificador de Instagram. Sin
   eso, un fallo a medias deja publicaciones duplicadas al reintentar.

## Lo que decide si esto es útil o un problema

- **Idempotencia.** El cron se ejecuta cada pocos minutos; si una publicación
  tarda y se vuelve a intentar, sale dos veces. Hay que marcar «en curso» antes
  de llamar, no después.
- **Qué pasa si falla.** Se reintenta, se avisa, o se cancela. Silencioso no:
  una pieza programada que no salió y nadie sabe es peor que no programar.
- **Aprobación obligatoria o no.** Publicar sin revisar en la cuenta de la marca
  es una decisión de negocio, no técnica. Por defecto, con revisión.
