import type { Product } from "@/types";

/**
 * Prompt para completar la ficha de un producto analizando su web.
 *
 * **Lo que más importa aquí es la separación entre leer y deducir.** El producto
 * es un suplemento: afirmar en un anuncio que lleva un ingrediente que no lleva,
 * o una dosis que nadie ha comprobado, no es una imprecisión de estilo. Por eso
 * cada dato viaja con su procedencia y el prompt insiste en que no se rellenen
 * huecos con lo que suele llevar un producto de esa categoría.
 */
export function buildProductAnalysisPrompt(product: Product, allowInference: boolean): string {
  const known = [
    product.description ? `Descripción actual: ${product.description}` : "",
    product.ingredients.length > 0 ? `Ingredientes anotados: ${product.ingredients.join(", ")}` : "",
    product.benefits.length > 0 ? `Beneficios anotados: ${product.benefits.join("; ")}` : "",
    product.targetAudience ? `Público anotado: ${product.targetAudience}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `Analiza la ficha de este producto en su web y completa su información.

**Producto:** ${product.name}${product.brand ? ` — ${product.brand}` : ""}
**URL de la ficha:** ${product.landingUrl || "(no hay URL; usa búsqueda web por el nombre y la marca)"}
**País:** ${product.country}
${known ? `\n**Lo que ya está anotado:**\n${known}\n` : ""}
## Qué tienes que hacer

1. Abre la ficha y léela entera, incluidas las secciones plegadas de ingredientes, modo de empleo y preguntas frecuentes.
2. Extrae **los ingredientes tal y como los declara la etiqueta**, con su forma química exacta y su dosis si aparece.
3. Para cada ingrediente, explica **qué hace, en términos de mecanismo**: qué proceso del cuerpo activa, bloquea o alimenta. No un beneficio de marketing —«apoya la energía»— sino el mecanismo —«activa la enzima deiodinasa, que convierte T4 en T3».
4. Cuando la forma concreta importe frente a la barata que llevan los genéricos, dilo y explica por qué. Es lo que distingue el producto.
5. Completa también los demás campos que puedas sostener con lo que dice la web.

## La regla que no puedes saltarte

Cada dato lleva su procedencia:

- \`"web"\` — lo dice la ficha o una fuente del fabricante. Es un hecho.
- \`"inferido"\` — lo deduces por el tipo de producto o por conocimiento general. Es una hipótesis.

**Nunca marques como \`web\` algo que no hayas leído.** Este producto se ingiere: un ingrediente inventado acaba en un anuncio que afirma lo que el bote no contiene. Si la etiqueta no da la dosis, deja la dosis vacía; no la estimes y la presentes como leída.

${
  allowInference
    ? `Puedes **proponer** ingredientes o campos que no encuentres, siempre marcados como \`inferido\` y explicando en las notas en qué te basas. Sirven como punto de partida para que la persona los confirme, no como dato.`
    : `**No inventes nada.** Si un campo no está en la web, déjalo vacío y anótalo en las notas. Es preferible una ficha incompleta a una ficha con datos que nadie ha comprobado.`
}

En las notas, di explícitamente qué no encontraste y dónde buscaste. Escribe todo en español.`;
}
