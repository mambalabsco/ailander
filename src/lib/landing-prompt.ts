import "server-only";

import { buildProductContext } from "@/lib/copy-prompts";
import type { CopyMethod } from "@/types/copy";
import type { Product } from "@/types";
import type { ProductResearch } from "@/types/research";
import type { Store } from "@/types/store";

/**
 * Prompt para montar un publirreportaje como página web completa.
 *
 * Sacado de páginas reales que están en producción —`lista-gluco`,
 * `listicle-fatty-liver-cirrhosis`, `dr-amelia-carter`— y no de una idea de
 * cómo debería ser una landing.
 *
 * Lo que las tres comparten:
 *
 * - El producto **no aparece arriba**. Llega después de que el lector se haya
 *   reconocido en el problema.
 * - Las imágenes no decoran: explican el mecanismo o muestran la
 *   transformación, y por eso cada hueco viene con su propio prompt.
 * - Cierran con prueba social, garantía, varias llamadas a la acción y un
 *   aviso legal de que es publicidad.
 */
export function buildLandingPrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  method: CopyMethod;
  /** El texto ya escrito, cuando la página se monta sobre un copy existente. */
  baseCopy?: string;
  /** Una página o un copy ajeno que sirve de modelo. */
  reference?: { label: string; body: string };
  /** Lo cerca que hay que quedarse de la referencia. */
  fidelity?: "calcado" | "inspirado";
  angle?: { name: string; problemMechanism: string; solutionMechanism: string } | null;
  commentStyle: "facebook" | "testimonios";
  countryName: string;
}): string {
  const { product, research, store, method, baseCopy, angle, commentStyle } = options;

  const commentsBlock =
    commentStyle === "facebook"
      ? `### Comentarios estilo Facebook

Doce comentarios que parezcan **capturados de un post de Facebook**, no testimonios de una web.

- Nombres y apellidos reales de ${options.countryName}, del tipo que tendría una mujer de 40 a 60 años.
- **Escritos desde el móvil, en el registro informal de ${options.countryName}**: expresiones locales, alguna falta de acentuación, mayúsculas irregulares, emojis sueltos. Nada de prosa de redactor.
- Longitudes desiguales. Los más creíbles son cortos; uno o dos se extienden porque cuentan su caso.
- \`timeAgo\` en el formato de la red: «hace 2 h», «hace 1 día», «hace 3 sem».
- \`likes\` entre 0 y 90, sin repetir cifras redondas.
- **Tres o cuatro llevan respuestas**: alguien pregunta «¿dónde lo compraste?» y la persona contesta. Ese intercambio es lo que hace real un hilo.
- Dos comentarios deben ser **escépticos o tibios**, con una respuesta que los matiza. Un hilo donde todos están encantados se lee como comprado.
- Nada de nombres de marca inventados ni promesas médicas absolutas.`
      : `### Testimonios

Cuatro testimonios con nombre, edad y contexto médico, en el formato de la sección «Esto es lo que dicen quienes ya lo usan». Concretos: qué pasaba antes, cuánto tardaron en notar el cambio, qué cambió exactamente.`;

  return `${buildProductContext(product, research, store)}

${
  angle
    ? `## Ángulo\n\n**${angle.name}**\n\n- Mecanismo del problema: ${angle.problemMechanism}\n- Mecanismo de la solución: ${angle.solutionMechanism}\n`
    : ""
}
${baseCopy ? `## Texto de partida\n\nAdapta este texto ya escrito a formato de página. Conserva su ángulo y su mecanismo; reorganízalo en secciones y añade lo que le falte.\n\n---\n\n${baseCopy}\n\n---\n` : ""}
${
  options.reference
    ? `## Página de referencia

${options.reference.label}

---

${options.reference.body}

---

${
  options.fidelity === "calcado"
    ? `**Sigue esta referencia de cerca.** Conserva su orden de secciones, su ritmo y su longitud. Cambia el producto, el problema, el mecanismo, los nombres y los datos por los de esta investigación.`
    : `**Úsala como patrón.** Quédate con lo que la hace funcionar —por dónde entra, cómo escala, dónde coloca la prueba y la objeción— y escribe una página nueva. No debe reconocerse el original.`
}

**Nada de lo que afirme la referencia sobre su producto se arrastra aquí**: ni ingredientes, ni estudios, ni cifras de resultados, ni nombres de marca. Solo se queda lo que esta investigación sostiene para este producto. Una página adaptada que promete lo que el producto no hace convierte una vez y devuelve el pedido.
`
    : ""
}

## Tarea

Monta un **publirreportaje completo como página web**, con el marco **${method.name}**: ${method.summary}

### La cabecera

- \`header.enabled\`: verdadero salvo que la pieza sea un fragmento suelto.
- \`header.announcement\`: la barra fina de arriba del todo, sobre fondo negro. Corta y con urgencia real: «Oferta por tiempo limitado — 40% de descuento» o «Últimas unidades del lote de enero».
- \`header.logoText\`: el nombre que va de logo. **No uses el nombre del producto tal cual**: inventa un nombre editorial creíble para el medio que publica esto, coherente con el nicho y con ${options.countryName} — «Salud & Bienestar MX», «Reporte Metabólico». Es el medio, no la marca.
- \`header.kicker\`: la línea pequeña bajo el logo, en versalitas. «Contenido patrocinado», «Salud hormonal», «Investigación».

### El autor

- \`author.name\`: nombre y apellido creíbles de ${options.countryName}. Con «Dra.» o «Dr.» solo si el marco es de autoridad.
- \`author.credentials\`: especialidad y años de experiencia, en una línea. «Endocrinóloga · Especialista en tiroides · 16 años de práctica clínica».
- \`author.updatedAt\`: una fecha reciente escrita en largo, «12 de marzo de 2026».

### Las secciones

Devuelve la página como una lista de secciones en orden. Los tipos disponibles:

- \`titular\` — el titular principal. Uno solo, el primero.
- \`valoracion\` — nota y número de reseñas. Justo bajo el titular. Usa \`rating\` y \`reviews\`.
- \`entradilla\` — dos o tres frases que plantean el problema.
- \`autor\` — la ficha del autor. Va después de la entradilla, una sola vez.
- \`medios\` — la fila de «Visto en». En \`items\`, de cuatro a seis nombres de medios reales de ${options.countryName}.
- \`subtitulo\` — encabezado de sección. Debe **contar algo**, no etiquetar: «Por qué tu análisis sale normal y tú sigues igual», no «El problema».
- \`parrafo\`, \`lista\`, \`cita\`, \`destacado\` — el cuerpo.
- \`dato\` — una cifra grande con su explicación. \`value\` es la cifra («89%», «4 de cada 5»); \`text\`, qué significa.
- \`mecanismo\` — los pasos del mecanismo, numerados, en \`items\`. De tres a cinco.
- \`comparativa\` — dos columnas. \`left\` es lo que pasa sin el producto, \`right\` con él. Tres o cuatro puntos cada una.
- \`garantia\` — el sello. \`value\` es el titular («90 días de garantía»); \`text\`, la condición.
- \`oferta\` — los escalones de precio, uno por elemento de \`items\`. El segundo se resalta solo.
- \`faq\` — preguntas frecuentes en \`pairs\`. De cuatro a seis, con las objeciones reales de la investigación.
- \`separador\` — una línea, para marcar cambio de bloque.
- \`imagen\` — un hueco de imagen. Su campo \`slot\` enlaza con \`imageSlots\`.
- \`cta\` — llamada a la acción. El \`href\` es ${product.landingUrl || "la URL del producto"}.
- \`comentarios\` — dónde va el bloque social. Una sola vez, cerca del final.
- \`aviso-legal\` — la última sección, siempre.

**Usa la variedad.** Una página de veinte párrafos seguidos se abandona. Alterna: un dato tras una sección densa, una comparativa antes de la oferta, el mecanismo numerado cuando expliques el porqué, las preguntas frecuentes antes del cierre. Como mínimo deben aparecer \`valoracion\`, \`autor\`, \`dato\`, \`mecanismo\`, \`comparativa\`, \`garantia\` y \`faq\`.

### Reglas que vienen de páginas que funcionan

1. **El producto no aparece en el primer tercio.** Primero el lector tiene que reconocerse en el problema.
2. Entre 1.100 y 1.500 palabras de cuerpo.
3. Frases por debajo de 15 palabras, nivel de 5.º grado, párrafos de una a tres frases.
4. **Tres llamadas a la acción repartidas**: una a mitad, otra tras la prueba social, otra al final. Con texto del tipo «Ver disponibilidad», nunca «Comprar ahora».
5. El aviso legal final debe decir que esto es un publirreportaje y no un artículo de noticias, un blog ni una comunicación de una autoridad sanitaria.

### Imágenes

De cinco a siete huecos, y **dos de ellos son fijos**:

- \`logo\` — el logotipo del medio. Descríbelo como un **logotipo horizontal que llena el encuadre de lado a lado**, con el texto grande y sin márgenes alrededor: si queda pequeño dentro de la imagen, en la página se verá diminuto. Tipográfico y limpio, para una publicación de salud de ${options.countryName}, sobre fondo blanco, sin fotografía. Ponle \`aspectRatio\` **16:9**, nunca 1:1.
- \`autor\` — el retrato del autor. Cuadrado, de medio cuerpo, en consulta o despacho, mirando a cámara, luz natural. Es el que da credibilidad a la ficha.

Los demás, libres. Cada uno con:

- \`slot\`: un identificador corto y estable, \`img-1\`, \`img-2\`…
- \`purpose\`: qué hace ahí, en una frase.
- \`prompt\`: el prompt completo en **inglés**, listo para un generador de imágenes. Descriptivo y concreto: encuadre, luz, sujeto, estilo. Si lleva texto incrustado, escríbelo entre comillas.
- \`alt\`: el texto alternativo, en español.
- \`aspectRatio\`: \`16:9\`, \`1:1\` o \`4:5\`.

Al menos uno debe **explicar el mecanismo** —un diagrama, un antes y después— y no ser una foto bonita.

${commentsBlock}

Escribe todo en español de ${options.countryName}, salvo los prompts de imagen, que van en inglés.`;
}
