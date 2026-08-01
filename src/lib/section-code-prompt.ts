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

**Léelo para sacar las medidas.** Cuántas columnas y en qué proporción, el tamaño del titular contra el del cuerpo, el aire entre bloques, el radio y el relleno de los botones, dónde cae la imagen y hasta dónde llega, qué cambia en el móvil.

**Y escribe el tuyo.** Ese CSS está atado al armazón de su tema —sus variables, sus clases, su retícula— y pegado aquí daría un diseño roto, no uno idéntico. Reproduce las medidas con CSS propio, encerrado en tu sección y sin depender de nada de fuera. Sus clases no existen en este tema: usa las tuyas.

Del texto que veas ahí, nada. El contenido sale de la investigación de arriba.

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
2. **Todo ajuste que uses, decláralo.** Cada \`section.settings.x\` en un \`settings\`, cada \`block.settings.y\` en el \`settings\` de un tipo de bloque. Un ajuste sin declarar sale vacío y nada falla.
3. **El esquema lleva \`name\` y \`presets\`.** Sin \`presets\` no se puede añadir desde el editor.
4. **Todo el CSS encerrado en \`#shopify-section-{{ section.id }}\`.** Cada selector, sin excepción — uno suelto le cambia los colores al resto de la página.
5. **Cierra todas las etiquetas de bloque**: \`{% for %}\`/\`{% endfor %}\`, \`{% if %}\`/\`{% endif %}\`.
6. **Nada de \`{% render %}\` ni \`{% include %}\`**: no sabemos qué fragmentos trae ese tema.
7. **Nada de \`<script>\`.** Los desplegables se hacen con \`<details>\`, no con JavaScript.
8. **Nada que se cargue de fuera de la tienda.** Los iconos, SVG en línea; las imágenes, un \`image_picker\`.

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

Deja \`foto_url\` **vacío** en lo que devuelvas: se rellena después con las fotos reales del producto.

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
