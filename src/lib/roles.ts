/**
 * Quién puede hacer qué.
 *
 * Sin imports, probado en `roles.test.ts`.
 *
 * ## Los papeles se diseñan por lo que protegen, no por cargos
 *
 * «Redactor» y «diseñador» son cargos, y repartir permisos por cargo lleva a
 * inventar uno nuevo cada vez que entra alguien. Lo que hay que decidir es qué
 * puede hacer daño, y en esta plataforma son cuatro cosas concretas:
 *
 * 1. **Gastar.** Cada generación cuesta dinero de verdad. Una tanda lanzada sin
 *    pensar son unos dólares; repetida sin querer, unos cuantos más.
 * 2. **Publicar.** Escribir en el tema de la tienda o mandar una página lo ven
 *    los clientes en cuanto se guarda. Es lo único que no se deshace solo.
 * 3. **Los secretos.** Las claves de API y las conexiones de Shopify y Meta. Con
 *    ellas se gasta fuera de aquí, y ahí ya no hay límite que valga.
 * 4. **El dinero.** Márgenes, costes y beneficio. No es peligroso, es privado:
 *    hay gente que trabaja en la tienda sin tener por qué saber cuánto se gana.
 *
 * A eso se le suma administrar personas, que es lo que permite dárselo todo a
 * uno mismo — y por eso va aparte.
 *
 * Los papeles son combinaciones de esos permisos, no al revés. Cuando haga falta
 * otro, sale de elegir permisos y no de repartir pantallas.
 *
 * ## Y el código pregunta por permiso, no por papel
 *
 * `can(role, "publicar")` y nunca `role === "admin"`. Comparar con el papel
 * esparce la decisión por cincuenta sitios: el día que un papel nuevo también
 * pueda publicar, hay que encontrarlos todos, y siempre se escapa uno.
 */

/* ------------------------------- Los permisos ------------------------------ */

export const CAPABILITIES = [
  /** Lanzar generaciones, que cuestan dinero. */
  "gastar",
  /** Escribir en la tienda: temas, páginas, productos. Lo ven los clientes. */
  "publicar",
  /** Ver y cambiar claves de API y conexiones. */
  "secretos",
  /** Ver costes, márgenes y beneficio. */
  "dinero",
  /** Invitar, cambiar papeles y límites, desactivar. */
  "personas",
  /** Cambiar la configuración de la plataforma. */
  "ajustes",
  /**
   * Entrar al estudio: modelos de imagen y vídeo, voces, música.
   *
   * Va aparte de «gastar» aunque el estudio gaste. No es lo mismo generar un
   * copy que tener delante el catálogo entero de modelos y las voces clonadas:
   * quien escribe textos no necesita eso, y una pantalla con todo dentro invita
   * a probar cosas que cuestan.
   */
  "estudio",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLES = [
  "dueño",
  "admin",
  "editor",
  "diseñador",
  "redactor",
  "analista",
  "invitado",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Qué puede cada papel.
 *
 * El reparto sale de una pregunta por cada uno: **qué pasa el día que esta
 * persona se equivoca.**
 *
 * - **editor** publica y gasta: es quien saca el trabajo adelante. No ve las
 *   claves ni los márgenes, que no le hacen falta para eso.
 * - **redactor** gasta pero **no publica**. Es la separación que más se usa: se
 *   escribe y se genera todo el día, y quien decide que algo salga a la tienda
 *   es otra persona. Un descuido cuesta unos céntimos, no una portada rota.
 * - **analista** ve el dinero y no gasta nada. Es quien mira si la campaña va
 *   bien sin poder tocar nada que lo cambie.
 * - **invitado** solo mira lo que no es privado. Sirve para enseñar la
 *   plataforma sin enseñar el margen.
 */
const GRANTS: Record<Role, Capability[]> = {
  dueño: ["gastar", "publicar", "secretos", "dinero", "personas", "ajustes", "estudio"],
  admin: ["gastar", "publicar", "secretos", "dinero", "personas", "ajustes", "estudio"],
  editor: ["gastar", "publicar", "estudio"],
  /*
   * El diseñador gasta y entra al estudio, y **no publica**.
   *
   * Es la separación que tiene sentido en su trabajo: se generan imágenes,
   * clips, voces y música todo el día —y equivocarse ahí cuesta céntimos y se
   * rehace— pero que una pieza salga a la tienda es otra decisión y la toma otro.
   *
   * Tampoco ve márgenes ni claves: no le hacen falta para diseñar, y con las
   * claves se puede gastar fuera de aquí, donde el tope del mes no llega.
   */
  diseñador: ["gastar", "estudio"],
  redactor: ["gastar"],
  analista: ["dinero"],
  invitado: [],
};

export function can(role: Role, capability: Capability): boolean {
  return GRANTS[role]?.includes(capability) ?? false;
}

export function capabilitiesOf(role: Role): Capability[] {
  return [...(GRANTS[role] ?? [])];
}

/**
 * Lo que puede una persona **concreta**, que no siempre es lo de su papel.
 *
 * ## Para qué
 *
 * Para poder decir «este redactor además publica» sin inventar un papel nuevo
 * para una persona. Los papeles existen para no repetir la misma conversación
 * siete veces; las excepciones existen porque en un equipo real siempre hay una.
 *
 * ## Cómo se lee `overrides`
 *
 * Nulo o ausente significa **las de su papel**. No significa «ninguna»: esa
 * confusión dejaría sin permisos a todo el que no tenga excepciones, que es casi
 * todo el mundo, y el fallo aparecería como «no puedo hacer nada» sin más pista.
 *
 * Una lista, aunque esté vacía, **sustituye** al papel. Vacía es «este no toca
 * nada», que es una decisión legítima y hay que poder tomarla.
 *
 * Lo que no está en el catálogo se descarta en vez de confiarse: la columna es
 * texto libre y una capacidad inventada —o una renombrada que quedó vieja— no
 * puede conceder nada.
 */
export function capabilitiesFor(role: Role, overrides?: string[] | null): Capability[] {
  if (!overrides) return capabilitiesOf(role);

  return overrides.filter((one): one is Capability =>
    (CAPABILITIES as readonly string[]).includes(one),
  );
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/* ---------------------------- Quién manda sobre quién ---------------------- */

/**
 * El orden de los papeles, para decidir quién puede tocar a quién.
 *
 * No es jerarquía de importancia sino de alcance: cada uno solo puede repartir
 * lo que él mismo tiene o menos. Sin esto, un admin podría ascender a alguien a
 * dueño y quitarle la casa al dueño.
 */
const RANK: Record<Role, number> = {
  dueño: 5,
  admin: 4,
  editor: 3,
  diseñador: 2,
  redactor: 2,
  analista: 2,
  invitado: 1,
};

export interface Member {
  id: string;
  role: Role;
}

/**
 * Si alguien puede cambiarle el papel a otro, y por qué no cuando no puede.
 *
 * Las tres reglas y el motivo de cada una:
 *
 * - **Nadie se toca a sí mismo.** Es lo que evita que un admin se ascienda a
 *   dueño, y también que se quite el permiso sin querer y se quede fuera.
 * - **Nadie asciende por encima de sí mismo.** Repartir lo que uno no tiene es
 *   la forma más fácil de saltarse cualquier reparto.
 * - **Al dueño no lo toca nadie.** Es la cuenta que no se puede perder: si un
 *   admin pudiera degradarlo, un admin equivocado deja la plataforma sin nadie
 *   que pueda arreglarlo.
 */
export function canAssign(
  actor: Member,
  target: Member,
  next: Role,
): { ok: true } | { ok: false; reason: string } {
  if (!can(actor.role, "personas")) {
    return { ok: false, reason: "No tienes permiso para gestionar personas." };
  }

  if (actor.id === target.id) {
    return {
      ok: false,
      reason: "No puedes cambiarte el papel a ti mismo: pídeselo a otra persona con permiso.",
    };
  }

  if (target.role === "dueño") {
    return { ok: false, reason: "Al dueño no se le puede cambiar el papel." };
  }

  /*
   * Lo de la propiedad se comprueba antes que el rango.
   *
   * Las dos lo rechazarían, pero el motivo que se lee no es el mismo: «no puedes
   * dar un papel por encima del tuyo» hace pensar que con más permisos sí se
   * podría, y no — la propiedad no se asigna nunca, se transfiere.
   */
  if (next === "dueño") {
    return { ok: false, reason: "El dueño se transfiere aparte, no se asigna." };
  }

  if (RANK[next] > RANK[actor.role]) {
    return { ok: false, reason: "No puedes dar un papel por encima del tuyo." };
  }

  return { ok: true };
}

/** Si alguien puede desactivar a otro. Mismas reglas, sin lo del ascenso. */
export function canDisable(
  actor: Member,
  target: Member,
): { ok: true } | { ok: false; reason: string } {
  if (!can(actor.role, "personas")) {
    return { ok: false, reason: "No tienes permiso para gestionar personas." };
  }

  if (actor.id === target.id) {
    // Desactivarse a uno mismo deja la plataforma sin quien la administre si era
    // el último: el caso raro se convierte en un problema sin salida.
    return { ok: false, reason: "No puedes desactivarte a ti mismo." };
  }

  if (target.role === "dueño") {
    return { ok: false, reason: "Al dueño no se le puede desactivar." };
  }

  return { ok: true };
}

/**
 * Si alguien puede administrar la **cuenta** de otro: su contraseña y su correo.
 *
 * Son las mismas tres reglas que `canAssign` porque protegen lo mismo, solo que
 * aquí lo que está en juego es mayor: quien fija una contraseña puede entrar en
 * esa cuenta y leerlo todo como esa persona.
 *
 * Sobre uno mismo devuelve que no, y no es una limitación: lo propio se cambia
 * en `/cuenta`, donde Supabase pide la contraseña actual. Permitirlo aquí sería
 * un camino para saltarse esa comprobación.
 */
export function canManageAccount(
  actor: Member,
  target: Member,
): { ok: true } | { ok: false; reason: string } {
  if (!can(actor.role, "personas")) {
    return { ok: false, reason: "No tienes permiso para gestionar personas." };
  }

  if (actor.id === target.id) {
    return { ok: false, reason: "Lo tuyo se cambia en «Tu cuenta»." };
  }

  if (target.role === "dueño") {
    return { ok: false, reason: "Al dueño no se le administra la cuenta." };
  }

  if (RANK[target.role] > RANK[actor.role]) {
    return { ok: false, reason: "No puedes administrar la cuenta de alguien por encima de ti." };
  }

  return { ok: true };
}

/* ------------------------------- El gasto ---------------------------------- */

/**
 * Si a alguien le queda presupuesto este mes.
 *
 * El límite es por persona y por mes, y existe porque el gasto de esta
 * plataforma no lo decide quien paga: lo decide quien pulsa un botón. Un límite
 * por persona convierte un descuido caro en un aviso.
 *
 * `null` es sin límite, y es lo que tiene el dueño por defecto: ponerle un tope
 * a quien paga la factura solo sirve para bloquearle el trabajo un domingo.
 *
 * Se compara **antes** de lanzar, con lo gastado hasta ahora. No se prorratea ni
 * se estima lo que va a costar la tanda: estimar de menos deja pasar de largo y
 * estimar de más frena trabajo legítimo.
 */
export function spendCheck(options: {
  role: Role;
  limitUsd: number | null;
  spentUsd: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!can(options.role, "gastar")) {
    return { ok: false, reason: "Tu papel no permite lanzar generaciones." };
  }

  if (options.limitUsd === null) return { ok: true };

  if (options.spentUsd >= options.limitUsd) {
    return {
      ok: false,
      reason: `Has llegado a tu límite del mes (${options.limitUsd.toFixed(2)} USD de ${options.spentUsd.toFixed(2)} gastados). Pídele a un administrador que lo suba.`,
    };
  }

  return { ok: true };
}

/* ------------------------------ Para enseñarlo ----------------------------- */

export const ROLE_LABELS: Record<Role, string> = {
  dueño: "Dueño",
  admin: "Administrador",
  editor: "Editor",
  diseñador: "Diseñador",
  redactor: "Redactor",
  analista: "Analista",
  invitado: "Invitado",
};

/** Qué hace cada papel, en una frase, para poder elegir sin adivinar. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  dueño: "Todo, y es el único que no se puede desactivar ni degradar.",
  admin: "Todo salvo transferir la propiedad. Gestiona personas y ajustes.",
  editor: "Genera y publica en la tienda. No ve claves ni márgenes.",
  diseñador:
    "El estudio entero: modelos, voces, música y montaje. No publica en la tienda ni ve márgenes.",
  redactor: "Genera, pero no publica: lo que salga a la tienda lo decide otro.",
  analista: "Ve datos, costes y beneficio. No gasta ni publica.",
  invitado: "Solo mira. Ni gasta, ni publica, ni ve el margen.",
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  gastar: "Lanzar generaciones",
  publicar: "Publicar en la tienda",
  secretos: "Claves y conexiones",
  dinero: "Costes y beneficio",
  personas: "Gestionar personas",
  ajustes: "Configuración",
  estudio: "Estudio de imagen y vídeo",
};
