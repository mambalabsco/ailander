import type { Product } from "@/types";
import type { ProductResearch, ResearchDocumentId } from "@/types/research";
import type { Store } from "@/types/store";
import { describeNotes, type ProductNote } from "@/types/note";

/**
 * Los encargos de investigación cuando el producto es un casino online.
 *
 * El sujeto no es quien compra un producto: es **quien juega en un país**. No
 * hay precio, ni envío, ni recompra; hay depósito, retiro, bono y rollover, y la
 * «compra» es un registro con su primer depósito.
 *
 * ## Por qué un archivo aparte y no condicionales dentro de los de siempre
 *
 * Un encargo con un `if` cada tres párrafos deja de poder leerse como lo que es
 * —un texto que alguien escribió con criterio— y cada arreglo de uno arriesga el
 * otro. Aquí los dos juegos se pueden leer enteros y por separado.
 *
 * Devuelve `null` para los documentos que no son de casino, y entonces manda el
 * `switch` de `research-prompts.ts`.
 */

function paisLine(product: Product): string {
  return `**País:** ${product.country} · **Idioma:** ${product.language}`;
}

/**
 * Lo que ningún documento de casino puede olvidar.
 *
 * Va al final de todos porque es lo que acota: un informe que proponga un ángulo
 * ilegal en ese país no es un informe con un error, es uno que hay que tirar
 * entero.
 */
function limites(product: Product): string {
  return `
## Límites

Lo que diga el documento de **regulación** manda sobre todo lo demás. Si algo que
ibas a escribir no se puede decir en ${product.country}, no lo escribas y dilo.

Nunca presentes el juego como una forma de ganar dinero ni de resolver un
problema económico.`;
}

export function buildCasinoResearchPrompt(
  id: ResearchDocumentId,
  product: Product,
  research: ProductResearch,
  store: Store | null | undefined,
  /*
   * Solo las notas, y tipadas aquí en vez de importar `ResearchExtras`.
   *
   * Ese tipo vive en `research-prompts.ts`, que es quien llama a este archivo:
   * importarlo de vuelta sería un ciclo. Lo que hace falta de él es esto.
   */
  extras: { notes?: ProductNote[] },
): string | null {
  const notas = describeNotes(extras.notes ?? []);
  const extra = notas ? `\n\n${notas}` : "";

  switch (id) {
    case "regulation":
      return `${paisLine(product)}

## Qué tienes que averiguar

Cómo está regulado el **juego online** en ${product.country} y qué se puede decir
al anunciarlo.

Necesito, con fuentes:

1. **Estado legal**, dicho sin rodeos: legal y regulado, tolerado, o prohibido.
2. **Quién regula**, si hay alguien.
3. **Edad mínima** para jugar.
4. **Qué no puede decir un anuncio** en este país. Lista concreta.
5. **Qué avisos son obligatorios**, escritos tal y como deben aparecer.
6. **Qué exige Meta** para anunciar juego aquí: permisos, certificaciones o
   restricciones de segmentación.

Esto acota lo que todos los demás documentos pueden prometer, así que **cuando no
lo sepas dilo**: un límite inventado se salta con la misma facilidad que uno real
se incumple.${extra}`;

    case "payments":
      return `${paisLine(product)}

## Qué tienes que averiguar

Cómo deposita y cómo cobra la gente que juega online en ${product.country}.

1. **Métodos de depósito**, del más usado al menos, con qué cuota de uso tiene
   cada uno y qué le pasa a quien lo usa.
2. **Métodos de retiro**, con el **plazo real** de cada uno.
3. **La objeción de dinero más repetida**, en las palabras del jugador y no en
   las nuestras.

El retiro importa más que el depósito: depositar es fácil en todas partes y la
desconfianza está en cobrar.${extra}${limites(product)}`;

    case "casino-landscape":
      return `${paisLine(product)}

## Qué tienes que averiguar

Qué casinos online operan ya en ${product.country} y cómo se presentan.

Por cada uno: **cómo se posiciona**, **qué bono de bienvenida ofrece** —con sus
condiciones, no solo la cifra— y **por dónde es débil**.

Y al final, **cuál es el bono estándar del país**: el que todos ofrecen y por
debajo del cual no se compite.

Una brecha solo vale si se puede atacar: «su app es lenta» sirve, «no son muy
conocidos» no.${extra}${limites(product)}`;

    case "awareness":
      return `${paisLine(product)}

## Qué tienes que averiguar

Quién juega casino online en ${product.country} y en qué punto está.

El «mercado» no son compradores: son **jugadores**. El tamaño se mide en personas
que juegan y en lo que depositan, no en unidades vendidas.

Necesito el nivel de conciencia dominante —de quien no sabe que se puede jugar
legalmente en línea a quien ya tiene cuenta en tres casinos—, el tamaño del
mercado con fuentes, el reparto por edad y género, y los tres avatares
principales.

Un jugador que ya tiene cuenta en otro casino no está «inconsciente»: está
consciente del producto y comparando. Esa distinción cambia todo el mensaje.${extra}${limites(product)}`;

    case "competitors":
      return `${paisLine(product)}

## Qué tienes que averiguar

Los casinos online que compiten por ese jugador.

Aquí el «precio» es el **bono de bienvenida** y sus condiciones: el rollover, el
depósito mínimo y qué juegos lo liberan. Un bono de 100.000 con rollover de 40x
es peor oferta que uno de 20.000 con 5x, y el jugador experimentado lo sabe.

De cada uno: cómo entra por publicidad, qué promete, por dónde mete al usuario
—app, web, enlace de afiliado— y **dónde tiene la brecha**.${extra}${limites(product)}`;

    case "avatars":
      return `${paisLine(product)}

## Qué tienes que averiguar

Los avatares, con citas textuales de jugadores reales.

De cada uno: **qué juega** —tragamonedas, ruleta, apuestas deportivas, en vivo—,
**con cuánto** juega en una sesión normal, y **qué le pasó la última vez que
intentó retirar**. Eso último es donde está la confianza o su ausencia, y es lo
que decide si prueba otro casino.

Citas reales, de foros y reseñas, no inventadas.${
        research.awareness ? "\n\nUsa el reparto por edad y género del documento 1." : ""
      }${extra}${limites(product)}`;

    case "master":
      return `${paisLine(product)}

## Qué tienes que hacer

Condensa en un solo documento lo que hay que saber para escribir: quién es el
jugador, qué sabe, qué desea, qué le frena, y con qué lenguaje habla.

Añade lo que digan **regulación** y **pagos**: lo primero acota lo que se puede
prometer y lo segundo es la objeción que más veces hay que resolver.${extra}${limites(product)}`;

    case "desire-extraction":
      return `${paisLine(product)}

## Qué tienes que hacer

Mapea lo que el casino **hace por el jugador** contra los deseos masivos.

Las «actuaciones» aquí no son beneficios de un producto: son pagar rápido, un
bono que de verdad se puede liberar, un juego que entiende, poder depositar con
lo que ya usa, y que nadie de su casa se entere.${extra}${limites(product)}`;

    case "desire-validation":
      return `${paisLine(product)}

## Qué tienes que hacer

Puntúa los deseos del documento anterior con **evidencia real** —lo que dicen los
jugadores, no lo que suena bien— y ordena los cinco más fuertes.

Un deseo sin evidencia se puntúa bajo aunque parezca obvio.${extra}${limites(product)}`;

    default:
      return null;
  }
}
