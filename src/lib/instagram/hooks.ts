/**
 * Fórmulas de gancho probadas, y el filtro de relleno.
 *
 * ## Por qué una lista y no dejar que lo invente
 *
 * Porque un modelo al que se le pide «un gancho potente» escribe la media de lo
 * que ha visto: «descubre el secreto», «esto lo cambia todo». Suena a anuncio
 * porque lo es, y en un muro eso se salta sin leerlo.
 *
 * Dándole una forma concreta —«la mayoría cree X; en realidad Y»— tiene que
 * rellenarla con algo de **este** producto, y ahí es donde aparece lo
 * específico. La fórmula no escribe el gancho: obliga a decir algo.
 */

export interface Archetype {
  id: string;
  /** La forma, con huecos. Es lo que se le da al modelo. */
  shape: string;
  /** Cuándo funciona. Sin esto, se usan todas para todo. */
  when: string;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "creencia",
    shape: "La mayoría cree que {creencia}. En realidad {verdad}.",
    when: "Cuando el público hace algo por costumbre que no le sirve.",
  },
  {
    id: "error",
    shape: "Si {síntoma}, probablemente estés {error} sin darte cuenta.",
    when: "Cuando el problema tiene una causa que nadie relaciona.",
  },
  {
    id: "momento",
    shape: "{Momento concreto del día}. Y ahí es cuando {problema}.",
    when: "Para que alguien se reconozca antes de saber de qué va.",
  },
  {
    id: "coste",
    shape: "Llevas {tiempo} {haciendo algo}. Eso son {cifra concreta}.",
    when: "Cuando el coste acumulado es más elocuente que el beneficio.",
  },
  {
    id: "contra",
    shape: "{Consejo habitual} no funciona. Y lo dice quien {credencial honesta}.",
    when: "Para discutir con lo que ya se dice en la categoría. Sube el alcance y también las respuestas.",
  },
  {
    id: "pregunta",
    shape: "¿{Pregunta que el público se hace de verdad}?",
    when: "Cuando la duda es tan común que verla escrita ya para el scroll.",
  },
  {
    id: "antes",
    shape: "Antes: {estado}. Ahora: {estado}. Lo que cambió: {una cosa}.",
    when: "Cuando hay un cambio que se puede contar sin exagerar.",
  },
  {
    id: "lista",
    shape: "{Número} {cosas} que {resultado}. La {n} es la que nadie hace.",
    when: "Para lo que se escanea y se guarda. Los guardados mueven más alcance que los «me gusta».",
  },
  {
    id: "detras",
    shape: "Nadie te cuenta que {realidad incómoda}.",
    when: "Cuando hay algo cierto que la categoría suele callar.",
  },
  {
    id: "instruccion",
    shape: "Haz esto {cuándo} y {resultado} en {plazo}.",
    when: "Solo con un plazo que se pueda sostener. Sin él, es una promesa vacía.",
  },
];

/** Reparte las fórmulas sin repetir hasta agotarlas. */
export function pickArchetypes(count: number, from = 0): Archetype[] {
  return Array.from(
    { length: Math.max(0, count) },
    (_, i) => ARCHETYPES[(from + i) % ARCHETYPES.length],
  );
}

/*
 * Lo que se dice cuando no se tiene nada que decir.
 *
 * Son las palabras que un modelo pone para que la frase suene a marketing sin
 * añadir información. Quitarlas no mejora el texto: **enseña que estaba vacío**,
 * y entonces se puede reescribir con algo concreto.
 */
const RELLENO = [
  "revolucionario",
  "increíble",
  "descubre el secreto",
  "cambiará tu vida",
  "lo que nadie te dice",
  "esto lo cambia todo",
  "no vas a creer",
  "el truco definitivo",
  "sin duda",
  "simplemente",
  "en el mundo de hoy",
  "la clave está en",
  "lleva tu {x} al siguiente nivel",
  "game changer",
  "pro tip",
];

/**
 * Señala el relleno de un texto, sin tocarlo.
 *
 * No se borra automáticamente: quitando «increíble» de «un resultado
 * increíble» queda «un resultado», que no dice más. Lo que hay que hacer es
 * reescribir la frase, y eso lo decide quien escribe — aquí solo se marca.
 */
export function findFiller(text: string): string[] {
  const plano = text.toLowerCase();

  return RELLENO.filter((one) => plano.includes(one.replace(" {x}", "")));
}

/** El bloque de fórmulas para el encargo. */
export function buildHookGuide(archetypes: Archetype[]): string {
  if (archetypes.length === 0) return "";

  return [
    `## Fórmulas de gancho`,
    ``,
    `Cada publicación usa **una distinta** de estas. La fórmula no es el gancho: es la forma que tienes que rellenar con algo concreto de este producto.`,
    ``,
    ...archetypes.map((one) => `- ${one.shape}  _(${one.when})_`),
    ``,
    `Y evita las palabras que suenan a marketing sin decir nada —«revolucionario», «descubre el secreto», «esto lo cambia todo»—. Si al quitarlas la frase no pierde información, es que no la tenía.`,
  ].join("\n");
}
