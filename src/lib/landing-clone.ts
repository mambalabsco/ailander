import type { LandingImageSlot, LandingSection } from "@/types/landing";

/**
 * Rehacer una portada que ya funciona para otro producto.
 *
 * ## Qué se copia y qué se rehace
 *
 * Se copia **la forma**: qué secciones hay, en qué orden, qué tipo es cada una,
 * dónde van los huecos de imagen y con qué proporción. Se rehace **todo lo que
 * dice**: los textos, y los encargos de las imágenes.
 *
 * Es la misma idea que la plantilla de producto de Shopify, y por el mismo
 * motivo: lo que costó acertar es la estructura —qué se cuenta y en qué orden—,
 * y eso no cambia de un producto a otro. Lo que no puede quedarse es una sola
 * palabra del anterior: una portada medio adaptada es peor que una en blanco,
 * porque parece terminada.
 *
 * ## Por qué los prompts de imagen se rehacen y no se traducen
 *
 * Porque un prompt lleva el producto dentro —«el bote de Lymphatic Complex sobre
 * la mesilla»— y cambiarle el nombre daría el bote del otro producto con la
 * etiqueta cambiada. Se pide el **mismo encargo visual** para el producto nuevo:
 * la misma escena, el mismo plano y la misma intención, con lo suyo dentro.
 */

/** Un texto de la portada, con dónde vive para poder devolverlo a su sitio. */
export interface CloneField {
  /** `3.text`, `3.items.0`, `5.left.title`… Es la clave del intercambio. */
  path: string;
  /** El tipo de sección. Le dice al modelo qué papel cumple ese texto. */
  kind: string;
  value: string;
}

const worth = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 1;

/**
 * Todos los textos de las secciones, en orden de lectura.
 *
 * Las secciones `crudo` se saltan: su contenido es marcado entero y se adapta
 * con el mismo camino que una página copiada, que ya sabe respetar las
 * etiquetas. Mezclarlo aquí devolvería HTML dentro de un campo de texto.
 */
export function collectSectionTexts(sections: LandingSection[]): CloneField[] {
  const fields: CloneField[] = [];

  sections.forEach((section, index) => {
    if (section.kind === "crudo") return;

    const add = (path: string, value: unknown) => {
      if (worth(value)) fields.push({ path: `${index}.${path}`, kind: section.kind, value });
    };

    add("text", section.text);
    add("value", section.value);
    section.items?.forEach((item, at) => add(`items.${at}`, item));

    add("left.title", section.left?.title);
    section.left?.items.forEach((item, at) => add(`left.items.${at}`, item));

    add("right.title", section.right?.title);
    section.right?.items.forEach((item, at) => add(`right.items.${at}`, item));
  });

  return fields;
}

/**
 * Devuelve cada texto adaptado a su sitio, sin tocar nada más.
 *
 * Se escribe por ruta y no reconstruyendo las secciones: lo que no venga en los
 * cambios llega intacto, incluidos los campos que este código no conoce. Y una
 * ruta inventada no crea nada — es la única defensa contra una respuesta larga
 * que se invente un campo.
 */
export function applySectionTexts(
  sections: LandingSection[],
  changes: Record<string, string>,
): LandingSection[] {
  const next = JSON.parse(JSON.stringify(sections)) as LandingSection[];

  for (const [path, value] of Object.entries(changes)) {
    const parts = path.split(".");
    const index = Number(parts[0]);
    const section = next[index];

    if (!section || !Number.isInteger(index)) continue;

    const [, uno, dos, tres] = parts;

    if (uno === "text" && section.text !== undefined) section.text = value;
    else if (uno === "value" && section.value !== undefined) section.value = value;
    else if (uno === "items" && section.items?.[Number(dos)] !== undefined) {
      section.items[Number(dos)] = value;
    } else if (uno === "left" || uno === "right") {
      const lado = section[uno];
      if (!lado) continue;

      if (dos === "title") lado.title = value;
      else if (dos === "items" && lado.items[Number(tres)] !== undefined) {
        lado.items[Number(tres)] = value;
      }
    }
  }

  return next;
}

export function buildClonePrompt(input: {
  fields: CloneField[];
  productName: string;
  audience: string;
  country: string;
  /** De qué producto era la portada. Sirve para saber qué **no** dejar. */
  fromProduct: string;
  context?: string;
}): string {
  return [
    `Eres redactor de páginas de venta de respuesta directa.`,
    ``,
    `Abajo van los textos de una página que **ya funciona**, escrita para ${input.fromProduct}.`,
    `Reescríbelos para ${input.productName}, dirigido a ${input.audience} en ${input.country}.`,
    ``,
    ...(input.context ? [`## Sobre el producto nuevo`, ``, input.context, ``] : []),
    `## Los textos`,
    ``,
    ...input.fields.map((field) => `${field.path} · ${field.kind}\n${field.value}`),
    ``,
    `## Cómo`,
    ``,
    `- Devuelve **la misma ruta** con el texto nuevo. No añadas rutas ni quites ninguna.`,
    `- Respeta la **longitud** de cada uno: la maqueta está hecha a su medida y un texto que no cabe rompe la página.`,
    `- Mantén el papel de cada texto: si era una promesa con número, la nueva también lo es; si era una objeción respondida, sigue siéndolo.`,
    `- No puede quedar **ni una palabra** de ${input.fromProduct}: ni su nombre, ni sus ingredientes, ni su mecanismo. Una página medio adaptada parece terminada, y es peor que una en blanco.`,
    `- Las cifras de prueba social no se heredan: si no tienes el dato del producto nuevo, deja la frase sin número.`,
    `- Sin promesas de curar, revertir o eliminar enfermedades.`,
    `- Escribe en el español de ${input.country}.`,
  ].join("\n");
}

/**
 * El encargo de cada imagen, rehecho para el producto nuevo.
 *
 * Va aparte de los textos porque no es texto de venta: es una instrucción para
 * el generador de imágenes, y se juzga por otra cosa —si describe una escena
 * que se puede fotografiar— y no por si convence.
 */
export function buildSlotPrompt(input: {
  slots: LandingImageSlot[];
  productName: string;
  audience: string;
  fromProduct: string;
}): string {
  return [
    `Eres director de arte de anuncios.`,
    ``,
    `Abajo van los encargos de las imágenes de una página que funciona, hecha para ${input.fromProduct}.`,
    `Reescríbelos para ${input.productName}, dirigido a ${input.audience}.`,
    ``,
    ...input.slots.map((slot) => `${slot.slot} · ${slot.purpose}\n${slot.prompt}`),
    ``,
    `## Cómo`,
    ``,
    `- Devuelve **el mismo identificador de hueco** con el encargo nuevo.`,
    `- Misma escena, mismo plano y misma intención. Lo que cambia es lo que sale dentro.`,
    `- Describe lo que se ve, no lo que se siente: «una mujer de 50 se toca el oído en el coche» se puede fotografiar; «la frustración del tinnitus» no.`,
    `- Nada de texto dentro de la imagen, ni logotipos, ni marcas de agua.`,
    `- Ni una referencia a ${input.fromProduct}.`,
  ].join("\n");
}

/** Lo que devuelve el modelo, filtrado contra lo que se le pidió. */
export function readAdapted(
  known: string[],
  answer: { path?: string; text?: string }[],
): Record<string, string> {
  const validas = new Set(known);
  const changes: Record<string, string> = {};

  for (const item of answer ?? []) {
    const path = (item.path ?? "").trim();
    const text = (item.text ?? "").trim();

    if (!path || !text || !validas.has(path)) continue;

    changes[path] = text;
  }

  return changes;
}
