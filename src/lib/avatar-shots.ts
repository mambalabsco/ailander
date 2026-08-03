/**
 * Fotos de una persona con el producto en la mano.
 *
 * Sin imports, probado en `avatar-shots.test.ts`.
 *
 * ## Qué es esto y en qué se diferencia de `avatar-prompts.ts`
 *
 * Aquel genera **caras** para los comentarios de una página: retratos sueltos,
 * sin producto. Esto es lo contrario: partiendo de una cara que ya existe —una
 * foto subida o generada— produce las fotos de esa misma persona usando el
 * producto. Es lo que hace que un anuncio parezca de alguien y no de una marca.
 *
 * ## Lo que decide si sale bien
 *
 * Dos cosas, y las dos son de encargo, no de modelo:
 *
 * **Que sea la misma persona.** El generador recibe dos imágenes y hay que
 * decirle cuál es cuál. Sin eso mezcla las caras o inventa una tercera, y el
 * conjunto deja de servir: lo que vende es reconocer a la misma persona en las
 * cinco fotos.
 *
 * **Que sea el envase de verdad.** Es el mismo problema del editor de vídeo. Un
 * bote «parecido» pasa la primera mirada y no la segunda, y para entonces ya
 * está pagada la tanda entera.
 *
 * ## Y por qué los contextos van escritos
 *
 * Pedir «cinco fotos variadas» devuelve cinco veces la misma cocina. La
 * variedad hay que nombrarla, y además no es decorativa: una foto en el baño y
 * otra en el gimnasio cuentan cosas distintas del producto. Por eso cada
 * contexto lleva **para qué sirve**, y quien elige sabe qué está eligiendo.
 */

export interface Context {
  id: string;
  label: string;
  /** Para qué sirve esa foto en un anuncio. */
  note: string;
  /** El trozo de encargo, en inglés, que describe la escena. */
  scene: string;
}

/**
 * Los contextos, ordenados por lo que más se usa.
 *
 * Son de casa y de calle a propósito: un estudio con luz de foco delata la foto
 * de marca, que es justo lo que no se busca aquí.
 */
export const CONTEXTS: Context[] = [
  {
    id: "cocina",
    label: "Cocina por la mañana",
    note: "La de siempre. Sitúa el producto en la rutina diaria.",
    scene:
      "standing in a normal home kitchen in the morning, soft daylight from a window, everyday clutter on the counter",
  },
  {
    id: "bano",
    label: "Espejo del baño",
    note: "Selfie de espejo. La que más parece de alguien de verdad.",
    scene:
      "taking a mirror selfie in an ordinary home bathroom, phone visible in one hand, overhead bathroom lighting",
  },
  {
    id: "sofa",
    label: "Sofá de casa",
    note: "Tono de conversación. Va bien con testimonios.",
    scene: "sitting on a sofa in a lived-in living room, warm lamp light, relaxed posture",
  },
  {
    id: "coche",
    label: "En el coche",
    note: "Sensación de sobre la marcha, sin preparar.",
    scene:
      "sitting in the driver seat of a parked car, seatbelt on, natural daylight through the windshield",
  },
  {
    id: "calle",
    label: "Andando por la calle",
    note: "Muestra que se lleva encima. Buena para el gancho.",
    scene:
      "walking on an ordinary city street, overcast daylight, blurred everyday background of shops and parked cars",
  },
  {
    id: "gimnasio",
    label: "Gimnasio o después de entrenar",
    note: "Para energía y recuperación. Ojo si el público no entrena.",
    scene:
      "in a normal gym after a workout, slightly flushed and sweaty, gym equipment out of focus behind",
  },
  {
    id: "escritorio",
    label: "En el escritorio",
    note: "Para concentración y cansancio de media tarde.",
    scene: "at a home desk with a laptop, afternoon light, a mug next to the keyboard",
  },
  {
    id: "jardin",
    label: "Jardín o balcón",
    note: "Aire de calma y de salud. Bien para público mayor.",
    scene: "on a small balcony or garden with plants, late afternoon sun, quiet everyday setting",
  },
  {
    id: "cama",
    label: "En la cama, de noche",
    note: "Para descanso y sueño.",
    scene:
      "sitting on the edge of a bed at night, bedside lamp on, calm end-of-day atmosphere",
  },
  {
    id: "bolso",
    label: "Sacándolo del bolso",
    note: "Enseña el tamaño real y que se lleva a todas partes.",
    scene:
      "taking the product out of a handbag, sitting somewhere ordinary like a bench or a waiting room",
  },
];

export function findContext(id: string): Context {
  return CONTEXTS.find((context) => context.id === id) ?? CONTEXTS[0];
}

/**
 * Qué contextos usar para un número de fotos.
 *
 * Se reparten **sin repetir hasta agotarlos**. Pidiendo tres fotos y cogiendo
 * el azar tres veces salen dos cocinas, que es exactamente el problema que los
 * contextos venían a resolver.
 */
export function contextsFor(count: number, chosen: string[] = []): Context[] {
  const pool = chosen.length > 0 ? chosen.map(findContext) : CONTEXTS;
  const wanted = Math.max(1, Math.round(count));

  return Array.from({ length: wanted }, (_, index) => pool[index % pool.length]);
}

/* ------------------------------ El encargo --------------------------------- */

/**
 * El encargo de una foto, con la cara primero y el producto después.
 *
 * El orden importa y por eso está escrito: el generador recibe las dos imágenes
 * en el orden en que se le mandan, y el encargo se refiere a ellas por ese
 * orden. Cambiarlo sin cambiar el texto produce a la persona convertida en
 * envase, que es tan absurdo como suena.
 */
export function buildShotPrompt(options: {
  scene: string;
  productName: string;
  /** Cómo es la persona, si se sabe. Ayuda a que no la reinvente. */
  person?: string;
  /** Si el producto va en la mano o solo en la escena. */
  holding?: boolean;
}): string {
  const holding = options.holding !== false;

  return [
    // Quién: la primera imagen manda sobre la cara.
    `The person in the FIRST reference image. Keep her exact face, hair, skin tone, age and build — it must be recognisably the same person.`,
    options.person ? `She is ${options.person}.` : "",

    // Qué: la segunda manda sobre el envase.
    `The product in the SECOND reference image is ${options.productName}. Reproduce its packaging exactly: same shape, same label, same colours, same text. Do not redesign it and do not invent a different container.`,
    holding
      ? "She is holding the product in her hand, clearly visible, label facing the camera."
      : "The product sits in the scene next to her, label visible.",

    // Dónde.
    `Scene: ${options.scene}.`,

    /*
     * Y que parezca una foto de móvil.
     *
     * Sin esto sale una foto de catálogo —luz de estudio, piel perfecta, fondo
     * limpio— y una foto de catálogo con una persona dentro sigue siendo un
     * anuncio de marca. Lo que hace que funcione es que parezca que la sacó
     * ella.
     */
    "Shot on a phone camera: natural uneven lighting, visible skin texture and pores, slight motion blur, ordinary background clutter.",
    "Not a studio photo, not a stock photo, no professional lighting, no retouching, no beauty filter.",
    "No text overlays, no logos other than the product's own label, no watermarks.",
  ]
    .filter(Boolean)
    .join(" ");
}

/* --------------------------- Describir a la persona ------------------------ */

export interface PersonSuggestion {
  id: string;
  label: string;
  description: string;
}

/**
 * Descripciones de partida, para no empezar en un campo vacío.
 *
 * Están pensadas para suplementos y son **gente normal**, no modelos: la cara
 * que vende un suplemento es la de alguien a quien podría pasarle lo que
 * cuenta el anuncio. Quien las use puede reescribirlas enteras.
 */
export const PEOPLE: PersonSuggestion[] = [
  {
    id: "mujer-45",
    label: "Mujer de 45, cansada",
    description:
      "a woman in her mid 40s, shoulder-length dark hair with some grey showing, medium skin, slightly tired eyes, ordinary build, casual clothes",
  },
  {
    id: "mujer-55",
    label: "Mujer de 55, tranquila",
    description:
      "a woman in her mid 50s, short practical grey hair, light skin with visible lines, warm calm expression, wearing a cardigan",
  },
  {
    id: "mujer-35",
    label: "Mujer de 35, con prisa",
    description:
      "a woman in her mid 30s, dark hair tied back, olive skin, no makeup, wearing a plain t-shirt, in a hurry",
  },
  {
    id: "hombre-45",
    label: "Hombre de 45, normal",
    description:
      "a man in his mid 40s, short dark hair thinning slightly, medium skin, a few days of stubble, plain shirt, average build",
  },
  {
    id: "hombre-60",
    label: "Hombre de 60, sano",
    description:
      "a man in his early 60s, grey hair, light-brown skin, glasses, fit but not athletic, wearing a polo shirt",
  },
];

export function findPerson(id: string): PersonSuggestion | null {
  return PEOPLE.find((person) => person.id === id) ?? null;
}

/**
 * El encargo de una cara nueva, para el generador de personas.
 *
 * Es un retrato **suelto**, sin producto: esta cara se guarda y después se usa
 * como referencia en todas sus fotos. Generarla ya con el producto la ataría a
 * un solo encuadre y habría que rehacerla para el siguiente.
 */
export function buildPersonPrompt(options: { description: string; countryName?: string }): string {
  return [
    `Casual smartphone photo of ${options.description}.`,
    options.countryName ? `An ordinary person from ${options.countryName}, not a model.` : "",
    "Head and shoulders, looking at the camera, neutral friendly expression, plain everyday background.",
    "Natural everyday appearance: no makeup styling, no retouching, visible skin texture and small imperfections.",
    "Even soft daylight so the face is clearly visible — this photo will be used as a reference for other photos.",
    "Not a studio portrait, not a stock photo, no professional lighting.",
  ]
    .filter(Boolean)
    .join(" ");
}

/* -------------------------------- Lo que cuesta ---------------------------- */

/** Dólares por imagen del generador barato, medidos en producción. */
export const USD_PER_IMAGE = 0.02;

/**
 * Cuántas imágenes salen y qué cuestan.
 *
 * Se enseña **antes** de lanzar porque multiplica: seis avatares por cinco
 * fotos son treinta generaciones, y desde el formulario eso no se ve —se ven un
 * seis y un cinco—.
 */
export function tally(avatars: number, perAvatar: number): { images: number; usd: number } {
  const images = Math.max(0, Math.round(avatars)) * Math.max(0, Math.round(perAvatar));

  return { images, usd: Number((images * USD_PER_IMAGE).toFixed(2)) };
}
