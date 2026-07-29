import type { GeneratedCopy, MarketingAngle } from "@/types/copy";

/**
 * Ángulos y textos de ejemplo para el producto de demostración.
 *
 * Igual que la investigación, tienen la forma exacta que devolverá la API:
 * sirven para validar la interfaz sin gastar tokens.
 */

const createdAt = "2026-07-21T09:00:00.000Z";
const DESIRE = "Quiero dejar de notar la piel tirante todo el día";

export const anglesFixture: MarketingAngle[] = [
  {
    id: "angle-demo-1",
    productId: "own-1",
    desire: DESIRE,
    name: "La foto de las cinco de la tarde",
    targetAudience:
      "Mujeres de 30 a 42 años que trabajan en oficina con climatización y se ven peor al final del día que al empezarlo",
    storyArc: {
      start: "Sale de casa por la mañana con la piel bien y la rutina hecha",
      crisis: "Una foto de equipo a las cinco de la tarde donde no se reconoce",
      discovery: "Descubre que el problema no es lo que se pone, sino cuánto dura",
      resolution: "Deja de retocarse a media tarde porque ya no hace falta",
    },
    problemMechanism:
      "La crema hidrata en superficie y el aire seco de la climatización la evapora en unas horas. No es que hidrate poco: es que lo que aporta no se queda.",
    solutionMechanism:
      "El ácido hialurónico de bajo peso molecular retiene agua por debajo de la superficie, donde la climatización no llega a evaporarla.",
    emotionalMoment:
      "Ver la foto y pensar «no puedo estar así cada día» delante de todo el equipo",
    createdAt,
  },
  {
    id: "angle-demo-2",
    productId: "own-1",
    desire: DESIRE,
    name: "La semana de las rojeces",
    targetAudience:
      "Mujeres con piel reactiva que ya tuvieron una mala reacción y desde entonces no se atreven a probar nada",
    storyArc: {
      start: "Compra un producto recomendado por alguien de confianza",
      crisis: "Rojeces durante una semana, con un compromiso importante de por medio",
      discovery: "Entiende que reaccionó a un componente que ni siquiera necesitaba estar ahí",
      resolution: "Vuelve a probar, pero leyendo la composición completa antes",
    },
    problemMechanism:
      "La reacción no vino del activo sino de la fragancia y los conservantes que lo acompañan, que están ahí por experiencia de uso y no por eficacia.",
    solutionMechanism:
      "Una formulación sin fragancia con la concentración publicada permite saber exactamente a qué se expone antes de aplicarlo.",
    emotionalMoment: "Mirarse al espejo la mañana del evento y saber que no hay solución",
    createdAt,
  },
  {
    id: "angle-demo-3",
    productId: "own-1",
    desire: DESIRE,
    name: "El cajón de los frascos a medio usar",
    targetAudience:
      "Compradoras que llevan años probando productos y han normalizado que ninguno funcione del todo",
    storyArc: {
      start: "Compra el enésimo producto con la esperanza de siempre",
      crisis: "Al vaciar el cajón del baño cuenta once frascos abiertos y sin terminar",
      discovery: "Suma lo que costaron y entiende que probar sale más caro que acertar",
      resolution: "Cambia el criterio: deja de buscar el más barato y busca el que explica lo que hace",
    },
    problemMechanism:
      "Sin concentración publicada es imposible distinguir un producto eficaz de uno que solo lleva el activo en la etiqueta, así que la elección se convierte en lotería y la lotería se repite.",
    solutionMechanism:
      "Publicar la concentración convierte la compra en una decisión verificable en lugar de una apuesta.",
    emotionalMoment: "Contar los frascos en voz alta y darse cuenta del dinero que suman",
    createdAt,
  },
  {
    id: "angle-demo-4",
    productId: "own-1",
    desire: DESIRE,
    name: "La rutina de siete pasos que nadie mantiene",
    targetAudience:
      "Profesionales con poco tiempo que abandonaron su rutina no por falta de ganas sino por falta de minutos",
    storyArc: {
      start: "Monta una rutina completa siguiendo lo que recomiendan en redes",
      crisis: "A las tres semanas la ha reducido a dos pasos y se siente culpable",
      discovery: "Descubre que la constancia importa más que el número de pasos",
      resolution: "Se queda con un solo paso que sí puede sostener todos los días",
    },
    problemMechanism:
      "Una rutina que exige siete pasos falla por abandono, no por formulación: el resultado depende de la constancia y la constancia depende de la fricción.",
    solutionMechanism:
      "Un solo producto por la mañana elimina la fricción, y al sostenerse en el tiempo produce el resultado que la rutina completa nunca llegó a dar.",
    emotionalMoment: "Sentirse culpable por «no ser capaz» de mantener algo tan básico",
    createdAt,
  },
  {
    id: "angle-demo-5",
    productId: "own-1",
    desire: DESIRE,
    name: "Lo que no dice la etiqueta",
    targetAudience:
      "Compradoras informadas que leen ingredientes y desconfían de las marcas que no publican datos",
    storyArc: {
      start: "Compara dos productos con la misma promesa y precios muy distintos",
      crisis: "Ninguno de los dos dice cuánta cantidad de activo lleva",
      discovery: "Entiende que el orden de la lista de ingredientes revela más que el reclamo",
      resolution: "Decide comprar solo a marcas que publiquen la concentración",
    },
    problemMechanism:
      "La ley obliga a listar ingredientes pero no a declarar concentraciones, así que un producto con un 0,1% de activo y otro con un 2% se anuncian exactamente igual.",
    solutionMechanism:
      "Publicar voluntariamente la concentración es la única forma de que la comparación entre productos signifique algo.",
    emotionalMoment: "La sospecha de llevar años pagando por etiquetas y no por producto",
    createdAt,
  },
];

export const copiesFixture: GeneratedCopy[] = [
  {
    id: "copy-demo-1",
    productId: "own-1",
    format: "long-copy",
    methodId: "long-copy-discovery",
    driver: "angle",
    driverLabel: "La foto de las cinco de la tarde",
    angleId: "angle-demo-1",
    awarenessLevel: "problem-aware",
    wordCount: 1287,
    status: "approved",
    adsetId: "adset-1",
    adNumber: 6,
    adName: "Ad6_LongCopy_Foto_Cinco_Tarde",
    createdAt,
    content: {
      primaryText: `Me etiquetaron en una foto de equipo a las cinco y tardé un segundo en reconocerme.

No era el ángulo. No era la luz de la oficina.

Era mi cara, ocho horas después de haberme arreglado.

Esa mañana había hecho todo bien. Limpiador, crema, protector. Salí de casa sintiéndome tranquila, incluso bien.

Y ahí estaba, en la foto, con la piel apagada y esa sensación tirante que llevaba notando desde después de comer sin darle importancia.

Me pasé el resto de la tarde tocándome la cara. Ese gesto que haces sin pensar, con el dorso de la mano, para comprobar algo que ya sabes.

Llevaba meses así.

Lo que más me molestaba no era verme mal. Era no entender por qué. Estaba haciendo lo que había que hacer.

Empecé a buscar por las noches. Ya sabes cómo va: la una y media, el móvil a diez centímetros de la cara, leyendo hilos de gente con el mismo problema y respuestas que no coincidían entre sí.

Ponte más crema. Ponte crema más espesa. Bebe más agua. Compra un humidificador.

Probé todo. Compré el humidificador. Me llevé un bote a la oficina y me retocaba a media tarde como si eso fuera normal.

Duraba una hora. Después, otra vez.

Lo entendí en una revisión de dermatología a la que fui por otra cosa.

Le conté lo del retoque de media tarde casi de pasada, como un detalle sin importancia. Ella dejó de escribir y me preguntó cuántas horas pasaba con el aire acondicionado puesto.

Nueve. Diez con el trayecto.

Me dijo una frase que me descolocó: el problema no es que te hidrates poco, es que lo que te pones no se queda.

Y me lo explicó de una forma que nadie me había explicado antes.

Una crema convencional trabaja arriba, en la superficie. Aporta agua y forma una película. Funciona. Notas la piel bien al salir de casa.

Pero el aire seco de la climatización evapora esa agua durante el día. Va tirando de ella hora tras hora. A media tarde ya no queda casi nada de lo que te pusiste por la mañana.

Por eso el retoque duraba una hora. Estaba volviendo a poner algo en el mismo sitio del que se iba a evaporar otra vez.

Me quedé pensando en eso todo el camino a casa.

Llevaba meses culpándome por no encontrar el producto correcto, y el producto no era el problema. El problema era dónde se quedaba.

Lo que me pasó después no fue inmediato y prefiero contarlo tal cual.

Empecé a usar un suero de ácido hialurónico de bajo peso molecular. La diferencia con lo que había usado antes está justo en eso, en el peso molecular, aunque yo entonces no tenía ni idea de lo que significaba.

Significa que la molécula es lo bastante pequeña para quedarse por debajo de la superficie, en vez de encima. Y ahí abajo el aire acondicionado no llega a arrastrarla.

No lo noté el primer día. Ni el segundo.

Lo noté un jueves, sobre las seis de la tarde, cuando me di cuenta de que llevaba toda la tarde sin tocarme la cara.

Ese gesto que hacía sin pensar simplemente no había aparecido.

Me quedé quieta un momento intentando recordar cuándo había sido la última vez que llegaba al final del día sin esa sensación de tirantez. No supe decirlo. Hacía demasiado.

Las semanas siguientes fueron así. Poco a poco, sin ningún momento espectacular. Un día la piel se veía menos apagada en la foto. Otro día me di cuenta de que había dejado el bote de crema en el cajón de la oficina y llevaba dos semanas sin abrirlo.

Lo que más me sorprendió no fue la piel.

Fue la cantidad de energía mental que llevaba gastando en algo tan pequeño. La revisión al espejo del baño de la oficina. El cálculo de si me daba tiempo a retocarme antes de la reunión. La decisión de si salía a cenar después del trabajo o me iba a casa porque no me veía bien.

Eran cosas diminutas. Pero eran todos los días.

Y me las había ido quitando sin darme cuenta.

Si estás leyendo esto y te ha sonado lo del gesto de tocarte la cara a media tarde, quiero que sepas una cosa: no estás haciéndolo mal.

Probablemente estés haciendo exactamente lo que hay que hacer, con un producto que trabaja donde no se puede sostener.

No es una cuestión de constancia ni de gastar más. Es una cuestión de dónde se queda lo que te pones.

Ojalá alguien me lo hubiera explicado antes de aquellos meses de retoques y de búsquedas a la una y media de la madrugada.

Por eso lo cuento.`,
      headline: "El problema no es cuánta crema te pones",
      description: "Es dónde se queda",
    },
  },
  {
    id: "copy-demo-2",
    productId: "own-1",
    format: "advertorial",
    methodId: "advertorial-authority",
    driver: "angle",
    driverLabel: "Lo que no dice la etiqueta",
    angleId: "angle-demo-5",
    awarenessLevel: "solution-aware",
    wordCount: 1342,
    status: "draft",
    adsetId: "adset-3",
    adNumber: 7,
    adName: "Ad7_Advertorial_Etiqueta",
    createdAt,
    content: {
      primaryText: `Este producto debería haber funcionado. No funcionó.

Si has comparado dos sueros con la misma promesa y precios muy distintos...

Si has leído la lista de ingredientes entera y aun así no has sabido cuál elegir...

Si sospechas que estás pagando por el envase y no por la fórmula...

Entonces lo que viene a continuación explica por qué.

**El 87% de los sueros faciales del mercado europeo no declara la concentración de sus activos.** Es legal. También es la razón por la que comprar bien es casi imposible.

Pero esto no es un problema de precios. Es un problema de información.

*(Continúa con el desmontaje sistemático de las soluciones habituales, el mecanismo único del problema y el secreto profesional. Texto completo de ejemplo abreviado aquí.)*`,
      headline: "La etiqueta no dice cuánto activo lleva",
      description: "Y por eso no puedes comparar",
    },
  },
];
