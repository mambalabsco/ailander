/**
 * El manual de la plataforma, con su buscador.
 *
 * ## Por qué vive en el código y no en un documento
 *
 * Porque un manual aparte se lee una vez y se queda viejo en tres semanas. Aquí
 * está al lado de lo que describe, se despliega con ello, y cuando algo cambia
 * se cambia en el mismo sitio.
 *
 * ## Por qué con buscador y no con índice
 *
 * Porque nadie llega preguntando «¿dónde está la sección de vídeos?». Llega
 * preguntando «por qué mi vídeo sale sin voz» o «qué permisos pide Shopify», que
 * son las palabras del problema, no las del menú. Un índice obliga a saber en
 * qué capítulo cae tu duda antes de poder buscarla.
 */

export interface HelpArticle {
  id: string;
  /** Dónde vive en la aplicación, para poder ir. */
  where: string;
  title: string;
  /** Lo que hace, en una línea. Es lo que se lee en los resultados. */
  summary: string;
  /** El cuerpo, en párrafos. Sin marcado: lo pinta la pantalla. */
  body: string[];
  /**
   * Las palabras con las que alguien lo buscaría, que no son las del título.
   *
   * «No sale la voz», «se ve pequeño», «me cobró de más». Sin esto, el buscador
   * solo encuentra a quien ya sabe cómo se llama lo que busca — que es justo
   * quien no necesita buscarlo.
   */
  tags: string[];
}

/** Sin tildes y en minúsculas: nadie escribe «investigación» con tilde al buscar. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export const HELP: HelpArticle[] = [
  {
    id: "tiendas",
    where: "Tiendas",
    title: "Conectar una tienda de Shopify",
    summary: "La app personalizada, sus ocho permisos y el token.",
    tags: ["shopify", "token", "permisos", "scopes", "app", "conectar", "no me deja publicar"],
    body: [
      "En Tiendas hay una guía desplegable con los cuatro pasos del panel de Shopify y los ocho permisos en un bloque que se copia de golpe.",
      "El que más falla es «write_theme_code»: vive en otra sección del panel («Theme Code», no «Theme templates») y viene desmarcado. Sin él, las landings se publican con el contenido dentro en vez de en secciones editables — y no falla al conectar, falla al publicar.",
      "El token se enseña una sola vez. Si cierras esa pantalla sin copiarlo hay que desinstalar la app y volver a instalarla.",
      "Si añades un permiso después, hay que reinstalar la app: el token que ya tienes conserva los permisos con los que nació.",
    ],
  },
  {
    id: "investigacion",
    where: "Producto → Base de datos",
    title: "Los seis documentos de investigación",
    summary: "De dónde salen los copys, y cómo generar solo el que falta.",
    tags: ["investigacion", "documentos", "maestra", "avatares", "competidores", "deseos"],
    body: [
      "Son la fuente que alimenta el panel, los ganchos y la creación de copy. Se generan en orden porque algunos dependen de otros: la maestra condensa los tres primeros.",
      "Si uno se queda sin generar, tiene su propio botón dentro —«Generar «…»»— que hace solo ese. El botón de arriba, «Regenerar», rehace la investigación entera.",
      "Si un documento no se puede generar todavía, te dice por qué en vez de quedarse callado: casi siempre le falta alguno del que depende.",
    ],
  },
  {
    id: "copys",
    where: "Producto → Copys",
    title: "Escribir copys y convertirlos en página",
    summary: "Long copy y publirreportajes, y las ocho formas de landing.",
    tags: ["copy", "texto", "anuncio", "publirreportaje", "landing", "forma", "listicle"],
    body: [
      "Cada pieza sale con texto principal, título y descripción, listos para pegar en el gestor de anuncios.",
      "Desde un copy se crea una página. La forma decide cómo se cuenta: publirreportaje, carta personal, caso clínico, comparativa, diario de días, entrevista, lista numerada o libre. No son estilos: cada una tiene su orden, su voz y lo que no debe llevar.",
      "«La que toque» elige una que no hayas usado aún, para que dos productos seguidos no salgan con la misma página.",
    ],
  },
  {
    id: "copiador",
    where: "Producto → Landings",
    title: "Copiar una página que ya vende",
    summary: "Se calca el diseño y se reescribe el texto para tu producto.",
    tags: ["copiar", "clonar", "landing", "competencia", "referencia", "sale vacia", "react"],
    body: [
      "Se pega la dirección y sale una copia con el marcado y el CSS originales —así los colores, los anchos y las posiciones salen idénticos— y los textos ya adaptados a tu producto.",
      "Si la página se monta con JavaScript (React, Vue), lo que se descarga viene vacío y la copia saldría en blanco. La plataforma lo detecta y te lo dice: entonces abres la página, pulsas F12, botón derecho sobre la etiqueta <html> → «Copy outerHTML», y lo pegas en el campo que aparece al pulsar «¿La página sale vacía?». La dirección se sigue poniendo arriba: de ella salen los enlaces y las hojas de estilo.",
      "Las imágenes del original quedan listadas para adaptarlas después, una a una, desde su pestaña.",
    ],
  },
  {
    id: "publicar",
    where: "Producto → Landings",
    title: "Publicar en Shopify, y como borrador",
    summary: "Secciones editables, plantilla de producto y visibilidad.",
    tags: ["publicar", "shopify", "borrador", "secciones", "editar", "plantilla", "producto"],
    body: [
      "Al publicar, la página se reparte en secciones editables del tema: cada tramo se abre, se mueve y se oculta por separado desde el editor de temas. Los títulos, los párrafos, las imágenes y los enlaces salen como ajustes que puedes cambiar sin tocar código.",
      "«Como borrador» la sube sin sacarla a internet. Solo aparece la primera vez: al actualizar una página ya publicada no se toca su visibilidad.",
      "«Como página de producto» escribe una plantilla de producto en vez de una página suelta, con la sección de compra del tema delante —precio, variantes y botón—. Después hay que asignarla en Shopify: ficha del producto → Plantilla de tema.",
    ],
  },
  {
    id: "portadas",
    where: "Producto → Landings",
    title: "Rehacer una portada para otro producto",
    summary: "Se copia la estructura y se reescribe todo lo que dice.",
    tags: ["clonar", "portada", "reutilizar", "otro producto", "adaptar"],
    body: [
      "En cada portada, junto a publicar: eliges producto y sale una portada nueva suya. Se copia la forma —qué secciones hay y en qué orden— y se rehacen los textos y los encargos de las imágenes.",
      "Las imágenes no se generan ahí: quedan como huecos con su encargo nuevo, listos para la pestaña de imágenes. Así puedes leer los textos antes de gastar en generarlas.",
      "Los comentarios no se heredan: son reseñas con nombre y edad hablando del producto anterior.",
    ],
  },
  {
    id: "pagina-producto",
    where: "Tiendas",
    title: "Página de producto desde una plantilla tuya",
    summary: "Coge una que ya te funciona y le cambia solo los textos.",
    tags: ["plantilla", "producto", "shopify", "template", "modelo", "referencias"],
    body: [
      "Eliges tienda, tema, la plantilla modelo y el producto. Copia el diseño entero —colores, tamaños, iconos, orden de los bloques, widgets— y reescribe solo el texto.",
      "Escribe una plantilla nueva: la modelo no se toca nunca. Y el desplegable marca cuál es el tema publicado, que es lo único irreversible de esa pantalla.",
      "Puedes pegar hasta tres enlaces de referencia. De ellas sale el enfoque —qué ángulos y qué objeciones—, nunca el texto ni sus cifras.",
      "Al terminar te dice cuántos textos no se reescribieron: una página medio traducida parece terminada, y los que faltan hablan del producto anterior.",
    ],
  },
  {
    id: "videos",
    where: "Producto → Vídeos",
    title: "Montar un vídeo",
    summary: "Guion, tomas, voz, subtítulos, música y montaje.",
    tags: ["video", "montaje", "voz", "subtitulos", "musica", "sin voz", "desincronizado"],
    body: [
      "Del copy sale el guion, del guion las tomas, y de cada toma un fotograma y su animación. La voz se genera aparte y los subtítulos se queman sobre el montaje.",
      "El vídeo dura lo que duran las tomas, no lo que dura el audio. Si la voz es más larga que los planos, se corta: la salida es alargar el último corte o generar un plano más.",
      "La música se mezcla al final con ffmpeg, por debajo de la voz, y se corta con el vídeo. Se puede nivelar su volumen y acelerar el montaje entre 1,05x y 1,2x.",
      "El texto del anuncio —título, texto principal y descripción— se escribe del guion del vídeo, no del copy del que salió.",
    ],
  },
  {
    id: "imagenes",
    where: "Imágenes",
    title: "Adaptar imágenes a tu producto",
    summary: "Coge una imagen que funciona y le pone tu producto.",
    tags: ["imagenes", "adaptar", "higgsfield", "webp", "franja", "gancho", "titular"],
    body: [
      "Se eligen imágenes, se elige el producto y se adaptan: la escena se mantiene y el producto pasa a ser el tuyo, a partir de su foto real.",
      "Se puede poner una franja de titular arriba: eliges el color y o escribes el texto —que se repite en todas— o los generas distintos, uno por imagen. Los colores del texto y del resaltado se calculan para que se lean sobre la franja.",
      "Los ganchos se generan aparte de las imágenes a propósito: así los lees y los corriges antes de gastar en generar.",
    ],
  },
  {
    id: "despliegue",
    where: "En el servidor",
    title: "Actualizar la plataforma",
    summary: "Un solo comando, con migraciones y comprobaciones.",
    tags: ["actualizar", "desplegar", "deploy", "servidor", "version", "no se ve el cambio"],
    body: [
      "Se ejecuta «./actualizar.sh» en el servidor. Aplica las migraciones de base de datos, pasa los tests —si fallan, aborta sin tocar nada—, construye y reinicia.",
      "Al terminar imprime la versión desplegada. Si un cambio «no se ve», eso es lo primero que hay que mirar: el resumen de cada copia también lleva la versión con la que se hizo.",
    ],
  },
];

/**
 * Busca por palabras sueltas, no por la frase entera.
 *
 * Quien busca «video sin voz» escribe tres palabras que no aparecen juntas en
 * ningún sitio. Exigiendo la frase literal no encontraría nada, y un buscador
 * que no encuentra se deja de usar a la segunda.
 *
 * Manda **cuántas** palabras aparecen, y solo después dónde: un artículo que
 * cumple las tres va antes que otro que cumple una en el título. Y las que no
 * aparecen en ningún sitio no descartan el resultado — casi siempre son las
 * palabras de relleno de la pregunta.
 */
export function searchHelp(query: string, articles: HelpArticle[] = HELP): HelpArticle[] {
  const words = normalize(query).split(/\s+/).filter((one) => one.length > 2);

  if (words.length === 0) return articles;

  const scored = articles.map((article) => {
    const title = normalize(`${article.title} ${article.where}`);
    const tags = normalize(article.tags.join(" "));
    const body = normalize(`${article.summary} ${article.body.join(" ")}`);

    let score = 0;

    for (const word of words) {
      // El título pesa más que el cuerpo, y las etiquetas casi igual que el
      // título: están escritas justamente con las palabras del problema.
      if (title.includes(word)) score += 5;
      else if (tags.includes(word)) score += 4;
      else if (body.includes(word)) score += 1;
    }

    return { article, score };
  });

  return scored
    .filter((one) => one.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((one) => one.article);
}
