import "server-only";

import { buildProductContext } from "@/lib/copy-prompts";
import type { Product } from "@/types";
import type { ProductResearch } from "@/types/research";
import type { Store } from "@/types/store";

/**
 * El texto de las secciones que se crean en el tema.
 *
 * ## Qué se le pasa y qué no
 *
 * Se le pasa **el papel de cada sección y su ángulo descrito** —«una comparativa
 * que enfrenta la dosis con la de las cápsulas de farmacia»— y la investigación
 * del producto propio. No se le pasa el texto de la otra tienda: si lo tuviera
 * delante lo parafrasearía, y una comparativa parafraseada compara los
 * ingredientes de otro producto.
 *
 * Es la misma línea que sigue el resto de la plataforma. Lo que se reproduce es
 * la construcción; lo que se dice sale de la investigación.
 *
 * ## Por qué se piden longitudes
 *
 * Una sección de tema no es un copy: es un titular de seis palabras y tres
 * tarjetas de veinte. Sin decirlo, el modelo escribe párrafos que en una rejilla
 * de tres columnas se salen de la tarjeta y hay que recortar a mano.
 */
export function buildSectionContentPrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  sections: { kind: string; purpose: string; angle: string }[];
  /** Los tramos de precio de la referencia, para saber cómo estructura la oferta. */
  offers: { quantity: number; price: number; compareAt: number | null; highlighted: boolean }[];
  guarantee: string;
  currency: string;
}): string {
  const { product, research, store, sections, offers, guarantee } = options;

  const list = sections
    .map(
      (section, index) =>
        `${index + 1}. **${section.kind}** — ${section.purpose || "sin descripción"}${
          section.angle ? `\n   Ángulo de la referencia: ${section.angle}` : ""
        }`,
    )
    .join("\n");

  return `${buildProductContext(product, research, store)}

## Lo que hay que escribir

Una tienda de referencia construye su página con estas secciones, en este orden. Escribe el contenido de **cada una para este producto**, con esta investigación.

${list}

El ángulo dice **cómo enfoca** la referencia esa sección, no qué dice. Úsalo como guía de enfoque y escribe con los datos de arriba: ningún ingrediente, cifra, estudio ni promesa de la referencia se arrastra aquí.

## Cómo rellenar cada campo

Devuelve una entrada por sección, en el mismo orden y con el mismo \`kind\`.

- **heading**: de tres a ocho palabras. Es un titular de sección, no una frase.
- **subheading**: una línea de contexto, o vacío si el titular se basta.
- **body**: solo para \`mecanismo\` y \`contenido\`. Dos o tres párrafos separados por línea en blanco. En las demás, vacío.
- **items**: las tarjetas, filas, preguntas o tramos.
  - \`title\`: de dos a seis palabras.
  - \`body\`: una o dos frases. En \`faq\`, la respuesta entera pero breve.
  - \`other\`: **solo en \`comparativa\`** — lo que ofrece la alternativa. En las demás, vacío.
  - \`price\`, \`compareAt\`, \`highlighted\`: **solo en \`oferta\`**. En las demás, vacío y \`false\`.
- **columnMine** y **columnTheirs**: solo en \`comparativa\`. La propia lleva el nombre de la marca; la otra, lo que se compara —«cápsulas de farmacia», «otras marcas»—. Vacíos en el resto.
- **ctaLabel**: solo en \`heroe\` y \`cta\`. Tres o cuatro palabras, en primera persona: «Lo quiero probar». Vacío en el resto.

Cuántos \`items\`: entre tres y seis en beneficios, prueba social y garantía; de cuatro a seis filas en la comparativa; de tres a cinco testimonios; de cinco a ocho preguntas; los tramos que tenga la oferta.

${
  offers.length > 0
    ? `## Cómo estructura la oferta la referencia

${offers
  .map(
    (offer) =>
      `- ${offer.quantity} unidad(es): ${offer.price} ${options.currency}${offer.compareAt ? ` (antes ${offer.compareAt})` : ""}${offer.highlighted ? " — es el que empujan" : ""}`,
  )
  .join("\n")}

Copia **la estructura** —cuántos tramos, cuál se destaca, si llevan precio tachado—, no las cifras. Los precios salen de los de este producto; si no los tienes, deja \`price\` vacío y se rellenan en Shopify.
`
    : ""
}
${guarantee ? `## La garantía de la referencia\n\n${guarantee}\n\nEscribe la de este producto con el mismo peso en la página. Si aquí no hay garantía declarada, no te la inventes: describe la política de devolución de forma neutra.\n` : ""}

## Lo que no debe pasar

- **Nada de texto de relleno.** «Calidad premium» y «los mejores ingredientes» no dicen nada; si no hay dato que respalde una tarjeta, escribe una tarjeta distinta.
- **Ninguna promesa médica absoluta.** Ni curar, ni garantizar resultados, ni plazos que la investigación no sostenga.
- **Ni una marca inventada**, ni testimonios con nombres de personas reales conocidas.
- Los testimonios son **de este producto y de este país**, con el registro de aquí.`;
}
