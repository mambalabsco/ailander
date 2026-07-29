/**
 * Retratos para los comentarios, generados con Soul.
 *
 * **Personas sintéticas, nunca referencias de gente real.** La tentación era
 * partir de fotos de perfiles reales del país para que salieran creíbles, y es
 * justo lo que no se puede hacer: la cara de alguien identificable junto a un
 * comentario escrito para la página implica un aval que esa persona nunca dio.
 * Soul produce caras verosímiles a partir de texto, así que la credibilidad se
 * consigue describiendo bien, no copiando a nadie.
 *
 * Se genera un **grupo reutilizable por producto**, no un retrato por
 * comentario: veinte generaciones por página sería un gasto absurdo cuando las
 * mismas caras sirven en todas.
 */

/**
 * Las variantes del grupo.
 *
 * Son veinte y **cada una cambia varias cosas a la vez** —edad, pelo, tono de
 * piel, complexión, gafas, ropa, sitio—. Con la primera versión solo cambiaba la
 * edad y el lugar, y salían veinte mujeres que parecían la misma: en un hilo de
 * comentarios eso se nota antes que ninguna otra cosa.
 */
const LOOKS = [
  "a woman in her early 40s with straight dark hair tied back, medium-brown skin, in her kitchen by a window",
  "a woman in her late 50s with short grey curly hair, light skin, wearing glasses, in her living room",
  "a woman in her mid 40s with long wavy black hair, olive skin, slightly heavyset, sitting in her car",
  "a woman in her early 60s with shoulder-length grey-streaked hair, deep-brown skin, in her garden",
  "a woman in her late 30s with a dark bob haircut, light-olive skin, thin build, in an office",
  "a woman in her early 50s with dyed reddish shoulder-length hair, medium skin, on a cloudy street",
  "a woman in her late 40s with hair in a messy bun, brown skin, round face, in a hallway at home",
  "a woman in her mid 50s with straight silver-grey hair, pale skin, wearing thin-framed glasses, in a café",
  "a woman in her early 40s with long braided dark hair, dark-brown skin, in a bedroom with warm lamp light",
  "a woman in her late 50s with short practical hair, freckled light skin, in a kitchen at night",
  "a woman in her mid 60s with white hair pinned up, wrinkled light-brown skin, in an armchair",
  "a woman in her late 30s with curly shoulder-length hair, medium-brown skin, in a supermarket aisle",
  "a woman in her early 50s with straight hair dyed dark brown, olive skin, wearing a cardigan, at a desk",
  "a woman in her late 40s with grey roots showing in dark hair, tan skin, on a balcony",
  "a woman in her mid 40s with a short pixie cut, light skin, wearing large glasses, in a waiting room",
  "a woman in her early 60s with long grey hair loose, medium skin, heavyset, in her dining room",
  "a woman in her late 50s with hair covered by a scarf, brown skin, outdoors in soft shade",
  "a woman in her mid 30s with long straight black hair, light-olive skin, in a stairwell",
  "a woman in her early 50s with wavy greying hair, dark skin, wearing a work uniform, indoors",
  "a woman in her late 40s with a low ponytail, medium-brown skin, in a bathroom mirror selfie",
];

/**
 * El prompt de un retrato.
 *
 * En inglés porque es lo que mejor entiende el generador, y describiendo una
 * **foto de perfil de móvil**: encuadre cerrado, luz imperfecta, sin retoque.
 * Un retrato de estudio se reconoce como banco de imágenes al instante y rompe
 * justo lo que se busca.
 */
export function buildAvatarPrompt(options: {
  index: number;
  countryName: string;
  /** El público del producto, para que las caras encajen con quien comenta. */
  audience?: string;
}): string {
  const look = LOOKS[options.index % LOOKS.length];

  return `Casual smartphone selfie profile picture of ${look}. Ordinary person from ${options.countryName}, not a model. Natural everyday appearance, no makeup styling, no retouching, visible skin texture, slight imperfections in skin and hair. Friendly relaxed expression, looking at the camera. Shot on a phone front camera: slightly soft focus, uneven natural lighting, plain everyday background, mildly unflattering angle. Head and shoulders, centred, square crop. Absolutely not a studio portrait, not a stock photo, not professionally lit.${
    options.audience ? ` She fits this description: ${options.audience}.` : ""
  }`;
}

/**
 * Cuántos retratos componen el grupo.
 *
 * Veinte, y no ocho como al principio: una página lleva doce comentarios más
 * sus respuestas, así que con ocho caras se repetían tres o cuatro veces en el
 * mismo hilo. Se generan una vez por producto y sirven en todas las páginas.
 */
export const AVATAR_POOL_SIZE = 20;

/** El identificador del hueco. Va en `concept` para poder emparejarlo después. */
export function avatarSlot(index: number): string {
  return `avatar-${index + 1}`;
}

/**
 * Reparte los retratos entre quienes participan en el hilo.
 *
 * **Por orden de aparición y sin repetir**, no por un hash del nombre. Con hash,
 * dos personas cualesquiera podían caer en la misma cara aunque sobraran
 * retratos libres — y dos comentarios seguidos con el mismo rostro delatan la
 * sección entera.
 *
 * El orden es estable porque sale de los datos de la página, así que cada
 * persona conserva su cara entre recargas.
 *
 * Devuelve nombre → URL. Si hay más gente que retratos, los últimos se quedan
 * con su inicial en vez de repetir una cara ya usada.
 */
export function assignAvatars(names: string[], avatars: string[]): Map<string, string> {
  const assigned = new Map<string, string>();
  let next = 0;

  for (const name of names) {
    const key = name.trim();
    // La misma persona puede comentar y luego responder: conserva su cara.
    if (!key || assigned.has(key)) continue;
    if (next >= avatars.length) break;

    assigned.set(key, avatars[next]);
    next += 1;
  }

  return assigned;
}
