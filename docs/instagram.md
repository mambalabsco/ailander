# Contenido para Instagram, con publicación programada

Pedido: crear imagen, texto y vídeo a partir del producto y publicarlo solo.

Estado: **sin empezar.** Escrito antes para que no se descubra a mitad lo que
Instagram no deja hacer, que es la mitad del trabajo.

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

## Lo que ya está y hay que mirar antes de escribir nada

Existen las tablas `meta_apps` y `meta_logins`. **Comprobar qué guardan**: si ya
hay token de Página con los permisos de publicación, esto es conectar; si solo
son credenciales de anuncios, hay que pedir permisos nuevos y volver a pasar por
la autorización.

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
