import "server-only";

import { buildProductContext } from "@/lib/copy-prompts";
import type { Product } from "@/types";
import type { ProductResearch } from "@/types/research";
import type { Store } from "@/types/store";

/**
 * Pedirle al modelo el código de una sección de Shopify.
 *
 * ## Por qué se le pide código y no contenido
 *
 * El intento anterior tenía siete disposiciones fijas y el modelo solo rellenaba
 * los huecos. Todas las secciones salían con el mismo aire y no se parecían a
 * nada: un héroe de verdad tiene el texto a un lado, la foto al otro, una fila
 * de estrellas encima del titular y un botón con forma de píldora. Eso no es
 * «rellenar una plantilla centrada», es otra estructura.
 *
 * Escribiendo el Liquid se puede. Lo que hace que sea seguro no es el prompt
 * sino `theme-liquid.ts`, que lo revisa antes de escribir nada en el tema.
 *
 * ## Lo que se le da y lo que no
 *
 * Se le da la paleta leída de la tienda de referencia, la descripción de la
 * sección y la investigación del producto propio. **No se le da el HTML de la
 * otra tienda**: reproduciría su marcado, que es su código. Se reproduce la
 * disposición, que es una idea.
 */

export function buildSectionCodePrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  /** El papel de la sección y cómo la usa la referencia. */
  section: { kind: string; purpose: string; angle: string };
  /** Cómo se llamará el archivo: `lp-comparativa-1`. */
  type: string;
  palette: { background: string; text: string; accent: string };
  /** El aire general de la tienda de referencia, en una línea. */
  vibe: string;
  /** Los tramos de la oferta, solo cuando la sección es la oferta. */
  offers?: { quantity: number; price: number; compareAt: number | null; highlighted: boolean }[];
  guarantee?: string;
  /** Las tipografías de la sección de referencia. */
  referenceFonts?: string[];
  /** Cuántas imágenes lleva la sección de referencia. */
  referenceImages?: number;
  /** Cuántas fotos hay disponibles para dejar puestas. */
  availableImages?: number;
  /** Si van adjuntas capturas de la página de referencia. */
  hasShots?: boolean;
  /** El marcado y el estilo de esa sección en la tienda de referencia. */
  reference?: { type: string; html: string; css: string };
  /** Lo que falló en el intento anterior, si lo hubo. */
  problems?: string[];
}): string {
  const { section, palette } = options;

  return `${buildProductContext(options.product, options.research, options.store)}

# Escribe una sección de Shopify

Tienes que devolver **el archivo entero** de una sección de Online Store 2.0, lista para guardar en \`sections/${options.type}.liquid\`.

${
  options.reference
    ? `## La sección de la referencia, tal como está hecha

Su tema la llama \`${options.reference.type}\`. Este es su marcado:

\`\`\`html
${options.reference.html}
\`\`\`

Y estas son las reglas de estilo que la pintan:

\`\`\`css
${options.reference.css}
\`\`\`

## Pórtalo, no lo reinterpretes

El objetivo es que **se vea exactamente igual**. Así que no mires ese CSS para inspirarte: pásalo, declaración por declaración.

Recorre sus reglas y **conserva todos los valores que afectan a cómo se ve**: los tamaños de letra con su unidad, los pesos, el interletrado, la altura de línea, los márgenes y rellenos exactos, las proporciones de la retícula, los radios, las sombras, los degradados, las transiciones, las transformaciones, los \`object-fit\`, los \`z-index\`, y lo que cambia en cada \`@media\`.

Lo único que cambia son **los nombres de las clases**, que pasan a ser los tuyos y van encerrados en \`#shopify-section-{{ section.id }}\`. Sus clases no existen en este tema: si las dejas, la sección sale sin estilo.

Si una regla usa una variable del tema —\`var(--color-foreground)\`— sustitúyela por el valor al que resuelve, que lo tienes en las variables de arriba, o por el ajuste de color de tu sección. Una variable que aquí no existe deja la propiedad sin valor y el navegador la ignora en silencio.

**No simplifiques.** Si el original tiene una sombra de tres capas y una transición de 0,4 s con una curva concreta, van las tres capas y esa curva. «Parecido» es lo que se lleva pidiendo varias vueltas y no funciona.

Y tres cosas que se escapan si no se miran a propósito:

- **El fondo de la sección.** Si ocupa todo el ancho con un color, tu sección también. Nada de una caja blanca centrada donde la referencia tiene un bloque de color a sangre.
- **Cuánto texto hay.** Cuenta las palabras del titular y los párrafos del cuerpo, y **no te pases**. Si la referencia tiene un titular de ocho palabras y tres líneas de apoyo, eso es lo que va: cinco párrafos donde había tres líneas no se parece, por muy bien escritos que estén.
- **Las imágenes y hasta dónde llegan.** Si la foto ocupa media pantalla y se sale por el borde, hazla así —\`object-fit: cover\` y sin margen por ese lado—; si son tarjetas pequeñas, tarjetas pequeñas.

Copia también lo que se mueve: transiciones al pasar por encima, sombras, degradados, esquinas redondeadas. Con CSS, que da para todo eso.

${
  options.referenceFonts && options.referenceFonts.length > 0
    ? `**Sus tipografías son ${options.referenceFonts.join(" y ")}.** Declara esa misma pila en tu CSS, con un respaldo del sistema detrás —\`font-family: "${options.referenceFonts[0]}", Georgia, serif\` si es serif, o \`, system-ui, sans-serif\` si no—. Si el tema no las tiene cargadas se verá el respaldo, que ya se parece más que la letra por defecto; y quien quiera la exacta la activa en la configuración del tema. **No las cargues de fuera.**

Lo que sí importa aunque falte la fuente: si el titular es serif y el cuerpo sans, esa diferencia se nota más que la familia concreta. Respétala.`
    : ""
}

El marcado, igual: la misma estructura de elementos anidados, en el mismo orden, con las mismas etiquetas. Si su titular es un \`h1\` dentro de un \`div\` con dos hijos, hazlo así — el CSS que estás portando cuenta con esa estructura y con otra no encaja.

Del **texto** que veas ahí, nada: el contenido sale de la investigación de arriba. Se porta cómo se ve, no lo que dice.

`
    : ""
}${
  options.hasShots
    ? `## Tienes la página delante

Las imágenes adjuntas son **capturas de la página de referencia**. Búscate en ellas la sección de la que va esto y reprodúcela: la disposición, las proporciones, el tamaño relativo del titular, dónde cae la foto, la forma de los botones, cuánto aire hay entre las cosas.

Míralas y mide. Si el titular ocupa media columna y la foto la otra media, hazlo así. Si el botón es una píldora blanca con una flecha en un cuadrado a la derecha, hazlo así.

**Lo que reproduces es la disposición, no su código ni su texto.** El HTML y el CSS que hay detrás de esa captura están escritos para su tema y no encajan en el tuyo; escribe el tuyo, que se vea igual y funcione en este tema. Y el contenido sale de la investigación de arriba.

`
    : ""
}## Qué sección

**${section.kind}** — ${section.purpose || "sin descripción"}
${section.angle ? `\nCómo la enfoca la tienda de referencia: ${section.angle}` : ""}

El aire de esa tienda: ${options.vibe}

## La paleta

- Fondo: \`${palette.background}\`
- Texto: \`${palette.text}\`
- Acento (botones, detalles): \`${palette.accent}\`

Son los valores **por defecto** de los ajustes de color, no colores escritos a fuego en el CSS: quien la use tiene que poder cambiarlos desde el editor.

${
  options.offers && options.offers.length > 0
    ? `## Cómo estructura la oferta la referencia

${options.offers
  .map(
    (offer) =>
      `- ${offer.quantity} unidad(es)${offer.compareAt ? `, con precio tachado` : ""}${offer.highlighted ? " — es el que empujan" : ""}`,
  )
  .join("\n")}

Reproduce **la estructura**: cuántos tramos, cuál se destaca y cómo se destaca. Los precios son ajustes que se rellenan después.
`
    : ""
}${options.guarantee ? `## La garantía\n\n${options.guarantee}\n` : ""}
## Cómo tiene que estar hecha

**Que se parezca a la de referencia, no a una sección de tema por defecto.** Si la disposición pide dos columnas, hazla de dos columnas. Si el titular va en serif y grande, ponlo grande. Si el botón es una píldora con una flecha, dibuja la flecha con un SVG en línea. Si encima del titular va una fila de estrellas con la nota y el número de reseñas, ponla.

Y escribe el contenido **de este producto**, con esta investigación. Ni una frase, ni un dato, ni un ingrediente de la referencia.

## Reglas que hacen que funcione

Estas no son estilo: si fallas una, la sección no aparece o rompe la tienda.

1. **Un solo bloque \`{% schema %}\`, con JSON válido.** Shopify no da ningún error si tiene una coma de más: la sección simplemente no aparece en el editor.
2. **Ni un color escrito a fuego.** Cada color de texto, de fondo, de borde o de botón sale de un ajuste \`color\` del esquema —\`{{ section.settings.titulo_color }}\`—, nunca de un \`#1a1a1a\` en el CSS. Un color literal se ve bien y **no se puede cambiar**: quien abra el editor buscará ese color y no estará, sin ningún error que lo explique. Los valores de la paleta van como \`default\` del ajuste. Se salvan las sombras y los translúcidos \`rgba(...)\`, que son profundidad y no identidad, y los colores dentro de un \`<svg>\`, que son el dibujo de un icono.
3. **Todo ajuste que uses, decláralo.** Cada \`section.settings.x\` en un \`settings\`, cada \`block.settings.y\` en el \`settings\` de un tipo de bloque. Un ajuste sin declarar sale vacío y nada falla.
4. **El esquema lleva \`name\` y \`presets\`.** Sin \`presets\` no se puede añadir desde el editor.
5. **Ningún \`default\` vacío.** Un ajuste puede no tener \`default\`; lo que no puede es tenerlo en blanco. Shopify rechaza el archivo entero con «default can't be blank». Si no hay valor por defecto, no pongas la clave.
6. **Todo el CSS encerrado en \`#shopify-section-{{ section.id }}\`.** Cada selector, sin excepción — uno suelto le cambia los colores al resto de la página.
7. **Cierra todas las etiquetas de bloque**: \`{% for %}\`/\`{% endfor %}\`, \`{% if %}\`/\`{% endif %}\`.
8. **Nada de \`{% render %}\` ni \`{% include %}\`**: no sabemos qué fragmentos trae ese tema.
9. **Nada de \`<script>\`.** Los desplegables se hacen con \`<details>\`, no con JavaScript.
10. **Nada que se cargue de fuera de la tienda.** Los iconos, SVG en línea; las imágenes, un \`image_picker\`.

## Cómo debe verse en cualquier pantalla

- Rejillas con \`grid-template-columns: repeat(auto-fit, minmax(...))\` o un \`@media\`, para que en el móvil caiga a una columna.
- Las imágenes, con \`max-width: 100%\` y \`height: auto\`.
- Una tabla ancha, dentro de un contenedor con \`overflow-x: auto\`: la página nunca debe irse de lado.
## Las imágenes van declaradas por partida doble

Cada imagen necesita **dos ajustes**: un \`image_picker\` llamado, por ejemplo, \`foto\`, y un \`text\` llamado \`foto_url\` justo detrás.

Y se pintan así, el elegido primero:

\`\`\`liquid
{% if section.settings.foto %}
  <img src="{{ section.settings.foto | image_url: width: 1200 }}" alt="{{ section.settings.heading | escape }}" loading="lazy" width="1200" height="1200">
{% elsif section.settings.foto_url != blank %}
  <img src="{{ section.settings.foto_url }}" alt="{{ section.settings.heading | escape }}" loading="lazy" width="1200" height="1200">
{% endif %}
\`\`\`

El motivo es práctico: el valor de un \`image_picker\` es una referencia interna de Shopify que solo se consigue subiendo el archivo, mientras que una dirección se escribe y ya. Con el par, la sección **sale con foto puesta** desde el primer momento y quien la edite puede cambiarla con el selector de siempre, que es lo normal.

Deja \`foto_url\` **vacío** en lo que devuelvas: se rellena después.

${
  options.referenceImages && options.referenceImages > 0
    ? `**Esa sección de la referencia lleva ${options.referenceImages} imagen(es): declara los mismos huecos, en el mismo orden**, con su par cada uno. Se rellenan con **las suyas y en ese orden**, así que el primer hueco que declares recibirá la primera imagen de la sección original, el segundo la segunda, y así. Decláralos en el orden en que salen en el marcado de arriba. Una sección con menos huecos de los que tiene el original sale más pobre, y los que sobren se quedan vacíos sin molestar.${
        options.availableImages
          ? ` Hay ${options.availableImages} fotos disponibles para dejarlas puestas.`
          : ""
      }`
    : ""
}

## Lo que devuelves

Un JSON con:

- \`liquid\`: el archivo entero, tal cual se guarda. Empieza por el \`<style>\` y acaba en \`{% endschema %}\`.
- \`settings\`: los valores de los ajustes de sección para esta página, ya escritos para este producto. Objeto plano de identificador a valor.
- \`blocks\`: los bloques, en orden, cada uno con \`type\` —el que declaraste en el esquema— y sus \`settings\`. Vacío si la sección no usa bloques.

Los textos van en \`settings\` y \`blocks\`, **no escritos dentro del Liquid**: así se editan después desde el editor de Shopify como cualquier otra sección.
${
  options.problems && options.problems.length > 0
    ? `\n## El intento anterior no pasó la revisión\n\n${options.problems.map((problem) => `- ${problem}`).join("\n")}\n\nCorrige esto y devuelve el archivo entero otra vez.`
    : ""
}`;
}
