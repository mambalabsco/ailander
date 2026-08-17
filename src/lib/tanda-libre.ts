/**
 * Una tanda sin molde: el modelo inventa las piezas enteras.
 *
 * Puro y sin imports, probado en `tanda-libre.test.ts`.
 *
 * ## Por qué existe
 *
 * Las otras cuatro formas de generar —ángulo, material analizado, anuncio
 * pegado y el botón que decide él— acaban en el mismo encargo, y ese encargo
 * siempre inyecta la lista de formatos con su instrucción visual escrita
 * palabra por palabra, más las siete reglas de `gramatica-visual.ts`. Cuatro de
 * esas siete no son reglas de calidad sino **una plantilla**: tres alturas de
 * texto, tres viñetas, la misma barra abajo y el envase centrado. Sirven para
 * que una tanda se vea de una marca, y garantizan que ninguna pieza se salga
 * del molde.
 *
 * Aquí se cae la lista y se caen esas cuatro. Quedan las tres que sí son de
 * calidad —un dispositivo, legible en miniatura, una sola paleta— porque sin
 * ellas no sale variedad: sale una diapositiva.
 *
 * **Solo del vertical casino.** No por una limitación técnica: en casino hay
 * material real del que tirar —el bono, los premios, la app— y la investigación
 * es de un país entero, así que hay de dónde inventar. En e-commerce el molde
 * está haciendo un trabajo que aquí no hace falta.
 */

/**
 * El bloque que sustituye a los formatos y a las reglas visuales.
 *
 * `ultimasTandas` son los nombres de los conjuntos ya generados, que llevan su
 * enfoque dentro: es lo más barato que describe qué se ha cubierto. Sin eso
 * este modo converge en lo mismo a la tercera vuelta y **no da ningún error** —
 * simplemente deja de aportar, que es más difícil de notar que un fallo.
 */
export function bloqueLibre(input: { total: number; ultimasTandas: string[] }): string {
  const { total, ultimasTandas } = input;

  return `## De dónde salen estas ideas

No hay ángulo, no hay anuncio de referencia y **no hay lista de formatos**. Cada una de las ${total} piezas la inventas tú a partir de la investigación de arriba: qué le pasa a esta gente, qué se dice en su país, qué la haría abrir la app esta noche.

En el campo \`format\` escribe **el identificador que tú le pongas** a lo que acabas de inventar, en minúsculas y con guiones —\`la-llamada-de-la-hija\`, \`el-recibo-del-arriendo\`, \`el-turno-de-noche\`—. No eches mano de los nombres de siempre si lo que escribiste no es eso: el nombre es lo que después deja ver si esto aportó algo.

## Que no salgan ${total} versiones de lo mismo

Es el fallo de este modo y no avisa: ${total} piezas correctas, bien escritas, que se podrían intercambiar sin que se note. Decide las ${total} entradas **antes** de escribir ninguna y compruébalas unas contra otras.

Entre las ${total} tiene que haber, como mínimo:

- **Tres emociones distintas** tirando de cada una. No tres maneras de decir ilusión: alivio, rabia, culpa, orgullo, aburrimiento y curiosidad son emociones distintas.
- **Tres tipos de imagen distintos**: una persona, un objeto en primer plano, una pantalla, una escena de casa, un documento. Que no sean ${total} fotos de alguien sosteniendo algo.
- **Al menos una sin nadie celebrando.** La celebración es el recurso al que se cae por defecto y satura la tanda entera.
- **Al menos una sin una sola palabra incrustada** en la imagen, que se sostenga por lo que se ve.
- **Al menos una que no hable de dinero.** El motivo por el que alguien abre esto no siempre es la plata.
- **Dos que no se puedan resumir con la misma frase.** Si al terminar dos comparten entrada y emoción, tira una y escribe otra.

## Cómo se ve

Tres reglas, y son de calidad y no de plantilla. **Todo lo demás lo decides pieza a pieza.**

1. **Un dispositivo, siempre.** Cada imagen se organiza alrededor de UNA tensión visual: algo partido, algo roto, dos cosas enfrentadas, una que no encaja. **Nada de rejillas** de tarjetas o cajas repartidas por igual: eso es una diapositiva, no un anuncio.

2. **Legible en una miniatura.** Lo que no se lea a tamaño de pulgar no entra. Cuando pidas un texto grande escribe su medida dentro del prompt —«ocupando un cuarto del alto del lienzo»—, nunca «grande» a secas: es relativo y sale grandecito.

3. **Una sola paleta en las ${total}.** La primera pieza fija fondo, color de acento y color de texto, y las demás los repiten **con las mismas palabras**. Es lo único que hace que ${total} ideas distintas parezcan de la misma marca.

Lo que **ya no** manda, y era el molde: ni un número fijo de alturas de texto, ni tres viñetas, ni barra inferior con la marca, ni el producto abajo y centrado. Si una pieza pide una sola imagen sin una palabra encima, va sin una palabra encima.${
    ultimasTandas.length > 0
      ? `

## Lo que ya se generó, y que **no repitas**

${ultimasTandas.map((item) => `- ${item}`).join("\n")}

Cada nombre lleva dentro su enfoque. Lo que hace útil a esta tanda es cubrir lo que falta, no volver sobre lo que ya está: si una idea tuya se parece a una de esas, es que no era nueva.`
      : ""
  }`;
}
