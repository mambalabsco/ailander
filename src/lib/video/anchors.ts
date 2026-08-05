/**
 * Anclas: qué toma se parece a cuál.
 *
 * Sin imports, probado en `anchors.test.ts`.
 *
 * ## El problema
 *
 * Cada fotograma se genera por su cuenta, con su propio prompt. Eso da doce
 * imágenes bonitas y **doce mundos distintos**: la misma mujer sale rubia en la
 * toma dos, morena en la cinco y con otra cara en la nueve; la cocina cambia de
 * encimera entre planos; la luz salta de mañana a tarde y vuelve.
 *
 * No es que las imágenes estén mal — cada una está bien. Es que no son del mismo
 * anuncio, y eso solo se ve cuando ya están las doce y montadas.
 *
 * ## Lo que hace un ancla
 *
 * Ata cada toma a **una anterior que ya salió**, y le manda esa imagen como
 * referencia. La toma cinco no se imagina a la mujer: le llega la de la dos.
 *
 * El ancla no es el fotograma inmediatamente anterior, que sería una cadena y
 * arrastraría cualquier desvío hasta el final. Es **la primera toma de su
 * grupo**: si la persona sale en la 2, la 5 y la 9, las tres se anclan a la 2 y
 * ninguna hereda el error de la anterior.
 *
 * ## Y los grupos
 *
 * Un anuncio no siempre tiene una sola persona. Si el guion habla de otra —«su
 * marido», «la doctora», «otra mujer»— esa abre **su propio grupo** y tiene su
 * propia ancla, porque anclarla a la primera daría dos personajes con la misma
 * cara, que es peor que dos caras distintas para el mismo.
 *
 * Nada de esto adivina bien siempre: son palabras en un texto. Por eso el plan
 * se puede mirar y cada ancla dice por qué está donde está.
 */

export interface AnchorShot {
  n: string;
  role?: string;
  /** Lo que se ve y lo que se mueve, que es de donde se lee quién sale. */
  scene?: string;
  motion?: string;
  /** Lo que se dice, que es donde el guion nombra a otra persona. */
  guion?: string;
}

export interface Anchor {
  n: string;
  /** A qué grupo pertenece: `""` si no sale nadie. */
  group: string;
  /** De qué toma toma su referencia. `""` si es ella la primera de su grupo. */
  from: string;
  /** Por qué, para poder mirarlo sin ejecutar nada. */
  why: string;
}

/* ------------------------------ Quién sale ---------------------------------- */

/**
 * Palabras que delatan que en la toma hay una persona.
 *
 * En los dos idiomas: el guion va en español y las frases de render las escribe
 * el modelo en inglés, mezcladas en el mismo campo.
 */
const PERSON_WORDS =
  /\b(woman|man|person|girl|boy|she|he|her|him|face|hands?|mother|patient|customer|mujer|hombre|persona|chica|chico|señora|señor|madre|padre|paciente|cliente|cara|rostro|manos?|ella|él)\b/i;

/**
 * Palabras que dicen que **no** es la misma persona de antes.
 *
 * Es la lista que abre grupo nuevo. Va corta a propósito: cada palabra de más es
 * una toma que se separa cuando debía heredar, y dos caras distintas para el
 * mismo personaje se notan más que dos personajes parecidos.
 */
const OTHER_WORDS =
  /\b(otra (mujer|persona|chica|señora)|otro (hombre|chico|señor)|su (marido|mujer|hija|hijo|madre|padre|amiga|amigo|hermana|hermano)|la (doctora|médica|enfermera|entrenadora|nutricionista)|el (doctor|médico|enfermero|entrenador|nutricionista)|un (médico|doctor|experto|especialista)|una (médica|doctora|experta|especialista)|another (woman|man|person)|her (husband|daughter|son|mother|friend)|his (wife|daughter|son|mother|friend)|the (doctor|nurse|trainer|expert|specialist))\b/i;

/** Si en esa toma sale alguien. */
export function showsPerson(shot: AnchorShot): boolean {
  if (shot.role === "avatar" || shot.role === "testimonio") return true;

  return PERSON_WORDS.test(`${shot.scene ?? ""} ${shot.motion ?? ""}`);
}

/** Si esa toma habla de **otra** persona distinta a la del anuncio. */
export function showsOther(shot: AnchorShot): boolean {
  return otherKey(shot) !== "";
}

/**
 * De **qué** otra persona habla, normalizado.
 *
 * Es lo que agrupa. Con un contador —«la primera otra», «la segunda otra»— cada
 * mención abría su propio grupo, así que la doctora de la toma dos y la doctora
 * de la tres salían con dos caras distintas: exactamente el problema que esto
 * venía a arreglar, movido un sitio más allá.
 *
 * Se quitan los artículos y los posesivos para que «la doctora» y «una doctora»
 * sean la misma. Lo que no se intenta es cruzar idiomas: «the doctor» y «la
 * doctora» quedan en grupos distintos, y ahí prefiero dos grupos de más que
 * juntar por error a dos personajes.
 */
export function otherKey(shot: AnchorShot): string {
  const found = OTHER_WORDS.exec(`${shot.scene ?? ""} ${shot.motion ?? ""} ${shot.guion ?? ""}`);
  if (!found) return "";

  return found[0]
    .toLowerCase()
    .replace(/^(la|el|los|las|un|una|su|the|her|his|another)\s+/, "")
    .trim();
}

/* -------------------------------- El plan ----------------------------------- */

/**
 * A qué se ancla cada toma.
 *
 * ## Por qué a la primera del grupo y no a la anterior
 *
 * Encadenar cada toma con la anterior arrastra: si la tres sale con la cara algo
 * distinta, la cuatro hereda esa y la cinco hereda la de la cuatro, y al final
 * del anuncio la persona ya no se parece a la del principio. Anclando todas a la
 * primera, cada una se desvía como mucho una vez.
 *
 * ## Y por qué las que no llevan a nadie no se anclan
 *
 * Un plano del envase sobre mármol y otro de un pasillo de hospital no tienen
 * nada que compartir. Mandarles la foto de la mujer solo les da una razón para
 * meterla en el plano, que es justo lo que no se quiere.
 */
export function planAnchors(
  shots: AnchorShot[],
  options: { force?: string[] } = {},
): Anchor[] {
  const out: Anchor[] = [];

  /** La primera toma de cada grupo, que es su ancla. */
  const firstOf = new Map<string, string>();

  const forced = new Set(options.force ?? []);

  for (const shot of shots) {
    const other = otherKey(shot);

    /*
     * Forzar el ancla en una toma concreta.
     *
     * `showsPerson` adivina leyendo el texto de la escena y no puede acertar
     * siempre: una toma que dice «primer plano de las manos sobre la encimera»
     * lleva persona y no lo parece. Cuando eso pasa sale con otra cara, y esto
     * es la salida — se marca esa toma y se rehace atada a la primera.
     */
    if (forced.has(shot.n)) {
      const anchor = firstOf.get("principal");

      if (!anchor) {
        firstOf.set("principal", shot.n);
        out.push({
          n: shot.n,
          group: "principal",
          from: "",
          why: "Marcada a mano, y es la primera con persona: esta manda.",
        });
      } else {
        out.push({
          n: shot.n,
          group: "principal",
          from: anchor,
          why: `Marcada a mano para que salga la misma persona: se ancla a la toma ${anchor}.`,
        });
      }

      continue;
    }

    if (!showsPerson(shot) && !other) {
      out.push({ n: shot.n, group: "", from: "", why: "No sale nadie: no necesita ancla." });
      continue;
    }

    /*
     * El grupo sale de **quién** es, no de un contador. Con un contador, la
     * doctora de la toma dos y la de la tres abrían dos grupos y salían con dos
     * caras: el mismo problema, movido un sitio más allá.
     */
    const group = other ? `otro:${other}` : "principal";
    const anchor = firstOf.get(group);

    if (!anchor) {
      firstOf.set(group, shot.n);

      out.push({
        n: shot.n,
        group,
        from: "",
        why:
          group === "principal"
            ? "Es la primera vez que sale la persona del anuncio: esta manda."
            : `El guion habla de «${other}», así que abre su propio grupo.`,
      });

      continue;
    }

    out.push({
      n: shot.n,
      group,
      from: anchor,
      why: `Vuelve a salir ${group === "principal" ? "la persona del anuncio" : `«${other}»`}: se ancla a la toma ${anchor}.`,
    });
  }

  return out;
}

/**
 * Lo que se le añade al prompt cuando la toma va anclada.
 *
 * Va aparte del prompt de la escena porque no describe la escena: dice qué mirar
 * de la imagen que se manda y qué **no** copiar de ella. Sin esa segunda mitad,
 * el generador copia también el encuadre y salen dos tomas iguales.
 */
export function anchorNote(anchor: Anchor, position: number): string {
  if (!anchor.from) return "";

  return [
    `the ${ordinal(position)} reference image shows the same person as this shot`,
    "keep the exact same face, age, hair and build",
    "do not copy its framing, pose, background or lighting: this is a different shot",
  ].join(", ");
}

function ordinal(position: number): string {
  return ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"][
    Math.max(0, Math.min(8, position - 1))
  ];
}

/**
 * En qué orden hay que generarlas.
 *
 * Las anclas primero: una toma no puede recibir una imagen que todavía no
 * existe. Devuelve oleadas —primero las que mandan, después las que heredan— y
 * dentro de cada una el orden del guion.
 *
 * Son **dos** oleadas y no una cadena porque ningún grupo se ancla a otro: todas
 * las herederas dependen solo de la primera de su grupo, así que en cuanto están
 * las primeras, el resto puede ir junto.
 */
export function anchorWaves(anchors: Anchor[]): string[][] {
  const leaders = anchors.filter((item) => !item.from).map((item) => item.n);
  const followers = anchors.filter((item) => item.from).map((item) => item.n);

  return followers.length === 0 ? [leaders] : [leaders, followers];
}
