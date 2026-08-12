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
 */
export function horaProgramada(opciones: {
  base: Date;
  /** Qué hueco de la cola ocupa esta pieza. 0 es el primero libre. */
  hueco: number;
  porDia: number;
  horaDesde: number;
  horaHasta: number;
  /** Para el minuto. Estable por pieza: dos vueltas no le ponen dos horas. */
  semilla: string;
}): string {
  const { base, hueco, porDia, horaDesde, horaHasta, semilla } = opciones;

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

  const cuando = new Date(base);
  cuando.setUTCDate(base.getUTCDate() + dia);
  cuando.setUTCHours(0, desde * 60 + desplazamiento, 0, 0);

  return cuando.toISOString();
}
