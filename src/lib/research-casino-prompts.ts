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

/**
 * Un documento ya escrito, pegado entero en el encargo del siguiente.
 *
 * **Este era el fallo del 16 de agosto.** Los encargos decían «usa el documento
 * 1» y «puntúa los deseos del documento anterior» sin pegarlos: el modelo
 * respondía «no encuentro ningún archivo adjunto, súbelo» y ese texto se
 * guardaba como el informe. Salía `ready`, con mil caracteres de disculpa
 * dentro, y nadie veía un error.
 *
 * Se pega el markdown y no el JSON: es lo que leería una persona, y es lo que
 * los encargos de e-commerce llevan haciendo desde el principio.
 */
function previo(research: ProductResearch, id: ResearchDocumentId, titulo: string): string {
  const texto = research.documents[id]?.markdown ?? "";
  if (!texto) return "";

  return `\n\n## ${titulo}\n\n${texto}`;
}

function paisLine(product: Product): string {
  return `**País:** ${product.country} · **Idioma:** ${product.language}`;
}

/*
 * Aquí había un bloque de «límites» en los ocho documentos, y se ha quitado.
 *
 * Decía que la regulación mandaba sobre lo que se podía escribir, y eso convertía
 * la investigación en un censor. Un documento de investigación **describe**: lo
 * que hace falta del contexto legal no son sus prohibiciones, sino de qué tiene
 * miedo quien juega, que es materia de objeciones y por tanto de copy.
 */

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

Qué cree la gente de ${product.country} sobre la legalidad del juego online, y
**qué teme por ello**.

Esto no es un informe de cumplimiento y no sirve para decidir qué puede decir un
anuncio: sirve para entender el ruido que el jugador ya trae en la cabeza cuando
ve uno.

1. **Estado legal**, dicho sin rodeos: legal y regulado, tolerado, o prohibido.
   El hecho, en una línea.
2. **Quién regula**, si hay alguien, y si el jugador de a pie lo conoce.
3. **Edad mínima**.
4. **Qué cree el jugador que pasa**, sea cierto o no. Aquí interesa la creencia
   más que el dato: es la que le frena.
5. **Qué teme**, y de dónde le viene ese miedo: que le bloqueen la cuenta, que no
   le paguen, que tenga que declararlo, que en su casa se enteren.
6. **Cómo pesa todo eso** cuando se plantea probar un casino que no conoce.

Los puntos 4, 5 y 6 son los que importan. Los tres primeros están solo para poder
entenderlos.${extra}`;

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
desconfianza está en cobrar.${extra}`;

    case "casino-landscape":
      return `${paisLine(product)}

## Qué tienes que averiguar

Qué casinos online operan ya en ${product.country} y cómo se presentan.

Por cada uno: **cómo se posiciona**, **qué bono de bienvenida ofrece** —con sus
condiciones, no solo la cifra— y **por dónde es débil**.

Y al final, **cuál es el bono estándar del país**: el que todos ofrecen y por
debajo del cual no se compite.

Una brecha solo vale si se puede atacar: «su app es lenta» sirve, «no son muy
conocidos» no.${extra}`;

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
consciente del producto y comparando. Esa distinción cambia todo el mensaje.${extra}`;

    case "competitors":
      return `${paisLine(product)}

## Qué tienes que averiguar

Los casinos online que compiten por ese jugador.

Aquí el «precio» es el **bono de bienvenida** y sus condiciones: el rollover, el
depósito mínimo y qué juegos lo liberan. Un bono de 100.000 con rollover de 40x
es peor oferta que uno de 20.000 con 5x, y el jugador experimentado lo sabe.

De cada uno: cómo entra por publicidad, qué promete, por dónde mete al usuario
—app, web, enlace de afiliado— y **dónde tiene la brecha**.${extra}`;

    case "avatars":
      return `${paisLine(product)}

## Qué tienes que averiguar

Los avatares, con citas textuales de jugadores reales.

De cada uno: **qué juega** —tragamonedas, ruleta, apuestas deportivas, en vivo—,
**con cuánto** juega en una sesión normal, y **qué le pasó la última vez que
intentó retirar**. Eso último es donde está la confianza o su ausencia, y es lo
que decide si prueba otro casino.

Citas reales, de foros y reseñas, no inventadas.

Trabaja con lo que hay abajo: **no pidas ningún archivo adjunto**, aquí está todo
lo que necesitas.${previo(research, "awareness", "Lo que ya se sabe del mercado (documento 1)")}${extra}`;

    case "master":
      return `${paisLine(product)}

## Qué tienes que hacer

Condensa en un solo documento lo que hay que saber para escribir: quién es el
jugador, qué sabe, qué desea, qué le frena, y con qué lenguaje habla.

Añade lo que digan **contexto legal** y **pagos**: son las dos fuentes de las
objeciones que más veces hay que resolver —el miedo a que no le paguen y el ruido
sobre si esto es legal—.

Todo lo que necesitas está abajo. **No pidas ningún archivo adjunto.**${previo(research, "awareness", "Documento 1 · el mercado")}${previo(research, "competitors", "Documento 2 · los casinos")}${previo(research, "avatars", "Documento 3 · los avatares")}${previo(research, "regulation", "Contexto legal")}${previo(research, "payments", "Pagos y retiros")}${extra}`;

    case "desire-extraction":
      return `${paisLine(product)}

## Qué tienes que hacer

Mapea lo que el casino **hace por el jugador** contra los deseos masivos.

Las «actuaciones» aquí no son beneficios de un producto: son pagar rápido y sin
excusas, un bono que de verdad se puede liberar, un catálogo que entiende, poder
depositar con el método que ya usa, y una plataforma que no le hace sentir tonto.

Sale de la investigación de arriba, no de suposiciones.${previo(research, "master", "El documento maestro")}${extra}`;

    case "desire-validation":
      return `${paisLine(product)}

## Qué tienes que hacer

Puntúa los deseos de abajo con **evidencia real** —lo que dicen los jugadores, no
lo que suena bien— y ordena los cinco más fuertes.

Un deseo sin evidencia se puntúa bajo aunque parezca obvio.

**No pidas ningún archivo adjunto**: los deseos están aquí.${previo(research, "desire-extraction", "Los deseos que hay que puntuar")}${extra}`;

    default:
      return null;
  }
}
