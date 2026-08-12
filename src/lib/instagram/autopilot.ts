/**
 * Qué toca hacer esta vuelta.
 *
 * ## Por qué esto no toca la base ni la red
 *
 * Porque es donde vive la única lógica que puede equivocarse de forma cara:
 * publicar de más, publicar dos veces, o dejar de publicar creyendo que va
 * sobrada. Separado del acceso a datos se prueba entero en milisegundos y sin
 * montar nada; mezclado, se prueba con la cuenta de la marca en producción.
 */

/** El tope duro de Instagram: 25 publicaciones por cuenta cada 24 horas. */
export const TOPE_API = 25;

/**
 * Minutos entre dos publicaciones de la misma cuenta.
 *
 * Es lo que evita que un atasco resuelto —tres piezas vencidas que por fin
 * pueden salir— se vaya entero en quince minutos. Ese día, y solo ese día, la
 * cuenta parecería un bot.
 */
export const SEPARACION_MINUTOS = 90;

export interface AutopilotState {
  /** ISO. Se pasa en vez de leer el reloj para poder probarlo. */
  ahora: string;
  porDia: number;
  colchonDias: number;
  horaDesde: number;
  horaHasta: number;
  /** De la **cuenta**, no del producto: el tope lo impone Instagram sobre ella. */
  publicadasUltimas24h: number;
  ultimaPublicacionAt: string | null;
  /** Aprobadas, con media, con fecha futura. Los borradores no cuentan. */
  listas: { scheduledAt: string }[];
}

export interface AutopilotDecision {
  publicar: boolean;
  /** Por qué no se publica. Vacío cuando sí. */
  motivo: string;
  /** Cuántas piezas faltan para llenar el colchón. */
  escribir: number;
}

export function decide(state: AutopilotState): AutopilotDecision {
  const ahora = new Date(state.ahora);

  const objetivo = Math.max(0, state.colchonDias) * Math.max(0, state.porDia);
  const escribir = Math.max(0, objetivo - state.listas.length);

  if (state.publicadasUltimas24h >= TOPE_API) {
    return {
      publicar: false,
      motivo: `Instagram no admite más de ${TOPE_API} publicaciones al día en una cuenta.`,
      escribir,
    };
  }

  if (state.publicadasUltimas24h >= state.porDia) {
    return {
      publicar: false,
      motivo: `Alcanzado el tope de ${state.porDia} al día.`,
      escribir,
    };
  }

  if (state.ultimaPublicacionAt) {
    const desde = (ahora.getTime() - new Date(state.ultimaPublicacionAt).getTime()) / 60_000;

    if (desde < SEPARACION_MINUTOS) {
      return {
        publicar: false,
        motivo: `separación mínima: faltan ${Math.ceil(SEPARACION_MINUTOS - desde)} minutos.`,
        escribir,
      };
    }
  }

  return { publicar: true, motivo: "", escribir };
}

/**
 * Un número estable a partir de un texto.
 *
 * No sirve para nada criptográfico y no lo pretende: solo hace falta que la
 * misma pieza dé siempre el mismo número, que es lo que impide que el
 * calendario se mueva solo entre dos vueltas del cron.
 */
function semillaNumerica(texto: string): number {
  let valor = 0;

  for (let i = 0; i < texto.length; i += 1) {
    valor = (valor * 31 + texto.charCodeAt(i)) % 1_000_003;
  }

  return valor;
}

/**
 * Cuántos minutos dura la ventana, contando de `desde:00` a `hasta:59`.
 *
 * Se recorta a 24h menos la separación mínima por un caso concreto: con la
 * ventana abierta de 0 a 23, la última pieza de un día podía caer a las 23:59 y
 * la primera del siguiente a las 00:00 — dos publicaciones con un minuto de
 * diferencia sin que ninguna comprobación de dentro del día lo viera, porque
 * las dos estaban en su sitio.
 */
function ventanaMinutos(horaDesde: number, horaHasta: number): number {
  const desde = Math.min(horaDesde, horaHasta);
  const hasta = Math.max(horaDesde, horaHasta);

  return Math.min((hasta - desde + 1) * 60, 24 * 60 - SEPARACION_MINUTOS);
}

/**
 * Cuántas piezas caben en la ventana con la separación mínima entre ellas.
 *
 * La ventana de 18 a 21 son cuatro horas: caben tres (18:00, 19:30, 21:00). Un
 * `por_dia` de cinco no cabe ahí, y apilarlas es lo que la separación existe
 * para impedir. Quien llama lo dice en el parte en vez de callárselo.
 */
export function cabenPorDia(horaDesde: number, horaHasta: number): number {
  return Math.floor((ventanaMinutos(horaDesde, horaHasta) - 1) / SEPARACION_MINUTOS) + 1;
}

/**
 * La misma marca de tiempo, contada en la zona que se le pida.
 *
 * `Intl` es lo único que sabe de horarios de verano y de desfases que no son
 * horas enteras (India va a +5:30). Hacerlo a mano con un número de horas
 * funciona hasta el domingo en que un país cambia la hora, y entonces la cuenta
 * publica una hora antes durante seis meses sin que nada falle.
 */
function partesEnZona(
  instante: Date,
  zona: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    // `hour12: false` da «24» a medianoche en algunos motores, y 24 no es una
    // hora: `h23` es lo que devuelve 0.
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const leer = (tipo: string): number =>
    Number(partes.find((una) => una.type === tipo)?.value ?? "0");

  return {
    year: leer("year"),
    month: leer("month"),
    day: leer("day"),
    hour: leer("hour"),
    minute: leer("minute"),
    second: leer("second"),
  };
}

/** Minutos que hay que sumarle a UTC para leer la hora de pared de esa zona. */
function desfaseMinutos(instante: Date, zona: string): number {
  const { year, month, day, hour, minute, second } = partesEnZona(instante, zona);
  const comoSiFueraUTC = Date.UTC(year, month - 1, day, hour, minute, second);

  // El instante, redondeado al segundo: `formatToParts` no da milisegundos, y
  // sin redondear el desfase saldría con una fracción de minuto inventada.
  return (comoSiFueraUTC - Math.floor(instante.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Una zona que `Intl` no conozca no puede tumbar la vuelta.
 *
 * La columna es texto libre y el valor puede venir de una fila vieja o de un
 * cambio de nombre de la base de datos de zonas. Cayendo a UTC se programa a la
 * hora que se programaba antes de que existiera la columna, que es lo peor que
 * puede pasar; lanzando, el producto entero se queda sin vuelta.
 */
function zonaUsable(zona: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });

    return zona;
  } catch {
    return "UTC";
  }
}

/**
 * El instante real de una hora de pared en una zona.
 *
 * Dos pasadas a propósito: la primera estima el desfase usando un instante que
 * todavía es el equivocado —la hora de pared leída como si fuera UTC— y la
 * segunda lo corrige con el instante ya casi bueno. Con una sola pasada, las
 * madrugadas en que un país cambia la hora salen desplazadas sesenta minutos.
 */
function instanteDe(pared: number, zona: string): Date {
  const primera = pared - desfaseMinutos(new Date(pared), zona) * 60_000;

  return new Date(pared - desfaseMinutos(new Date(primera), zona) * 60_000);
}

/**
 * Esa hora de pared, dicha en UTC, con el desfase de hoy.
 *
 * Existe para el panel: los campos decían «Desde las / Hasta las» sin unidad, y
 * una franja sin reloj es una franja que cada uno lee como quiere. Enseñando al
 * lado a qué hora UTC equivale, se ve de un vistazo si la ventana es la que se
 * quería — que es donde estaba el fallo de las seis horas de diferencia.
 */
export function mismaHoraEnUTC(hora: number, zonaHoraria: string, base = new Date()): string {
  const zona = zonaUsable(zonaHoraria);
  const hoy = partesEnZona(base, zona);
  const instante = instanteDe(Date.UTC(hoy.year, hoy.month - 1, hoy.day, hora, 0), zona);

  const dosCifras = (valor: number): string => String(valor).padStart(2, "0");

  return `${dosCifras(instante.getUTCHours())}:${dosCifras(instante.getUTCMinutes())}`;
}

/**
 * A qué hora sale una pieza, dentro de la ventana y sin clavar el minuto.
 *
 * Hoy `planWeekAction` pone las 19:00 en punto todos los días. Publicar siete
 * días seguidos a la misma hora exacta no es lo que hace una persona, y es lo
 * único de la lista del agente ajeno que sí conviene imitar — no para engañar a
 * nadie, sino porque una cuenta que publica a las 19:00:00 clavadas se lee como
 * una máquina.
 *
 * ## Por qué el hueco y no el día
 *
 * Porque antes esto colocaba **una por día de calendario** mientras `decide`
 * apuntaba a `colchonDias × porDia` piezas. Con `por_dia: 2` se escribían seis
 * repartidas en seis días: la cuenta seguía publicando una vez al día y el
 * colchón parecía lleno para siempre. El panel ofrece de 1 a 5 y cuatro de esos
 * cinco valores no hacían nada.
 *
 * Ahora el hueco es global —0 es el primero libre— y de ahí salen el día y el
 * puesto dentro del día. Si en la ventana no caben las `porDia` pedidas, se
 * colocan las que caben y el resto pasa al día siguiente: **no se apilan**.
 * Estirar el reparto es peor que perderlas —una pieza sin hora no la publica
 * nadie y nadie la ve— pero se dice en el parte, que es lo que permite corregir
 * la ventana o el ritmo.
 *
 * ## Y por qué la ventana no es UTC
 *
 * Porque antes lo era y nada lo decía: se usaba `setUTCHours` mientras el
 * `planWeekAction` de al lado usaba `setHours` local, y los dos relojes
 * coincidían solo porque el servidor va en UTC. Pedir la franja de 18 a 21
 * desde México publicaba a las 12:00 locales. La ventana se interpreta en la
 * zona del producto y lo que se devuelve es el instante, en UTC, que le
 * corresponde.
 */
export function horaProgramada(opciones: {
  base: Date;
  /** Qué hueco de la cola ocupa esta pieza. 0 es el primero libre. */
  hueco: number;
  porDia: number;
  horaDesde: number;
  horaHasta: number;
  /** IANA (`America/Mexico_City`). La ventana se lee en este reloj. */
  zonaHoraria: string;
  /** Para el minuto. Estable por pieza: dos vueltas no le ponen dos horas. */
  semilla: string;
}): string {
  const { base, hueco, porDia, horaDesde, horaHasta, semilla } = opciones;
  const zona = zonaUsable(opciones.zonaHoraria);

  const desde = Math.min(horaDesde, horaHasta);
  const ventana = ventanaMinutos(horaDesde, horaHasta);
  const caben = Math.max(1, Math.min(Math.round(porDia) || 1, cabenPorDia(horaDesde, horaHasta)));

  /*
   * El paso es entero y la holgura es lo que sobra sobre la separación.
   *
   * Con el paso mínimo garantizado (`caben` sale de dividir la ventana entre la
   * separación) y el desplazamiento acotado a la holgura, dos piezas seguidas
   * nunca quedan a menos de 90 minutos aunque a una le toque el máximo y a la
   * siguiente el mínimo.
   */
  const paso = caben > 1 ? Math.floor((ventana - 1) / (caben - 1)) : 0;
  const holgura = caben > 1 ? paso - SEPARACION_MINUTOS : ventana - 1;

  const dia = Math.floor(Math.max(0, hueco) / caben) + 1;
  const puesto = Math.max(0, hueco) % caben;

  const n = semillaNumerica(semilla);
  // El tope de la ventana manda sobre el desplazamiento: recortar acerca la
  // pieza a la anterior, y aun así queda a la separación mínima o más.
  const desplazamiento = Math.min(puesto * paso + (n % (holgura + 1)), ventana - 1);

  /*
   * El día se cuenta en el calendario de la zona, no en el del servidor.
   *
   * Sumando 24 horas al instante, el día que un país cambia la hora se salta o
   * se repite una fecha. `Date.UTC` normaliza el desbordamiento del día y del
   * minuto, así que el 32 de agosto es el 1 de septiembre y el minuto 1.100 es
   * la tarde.
   */
  const hoy = partesEnZona(base, zona);
  const pared = Date.UTC(hoy.year, hoy.month - 1, hoy.day + dia, 0, desde * 60 + desplazamiento);

  return instanteDe(pared, zona).toISOString();
}
