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
 * A qué hora sale una pieza, dentro de la ventana y sin clavar el minuto.
 *
 * Hoy `planWeekAction` pone las 19:00 en punto todos los días. Publicar siete
 * días seguidos a la misma hora exacta no es lo que hace una persona, y es lo
 * único de la lista del agente ajeno que sí conviene imitar — no para engañar a
 * nadie, sino porque una cuenta que publica a las 19:00:00 clavadas se lee como
 * una máquina.
 */
export function horaProgramada(
  base: Date,
  diaIndex: number,
  horaDesde: number,
  horaHasta: number,
  semilla: string,
): string {
  const cuando = new Date(base);
  cuando.setUTCDate(base.getUTCDate() + diaIndex);

  const desde = Math.min(horaDesde, horaHasta);
  const hasta = Math.max(horaDesde, horaHasta);

  const n = semillaNumerica(semilla);
  const horas = hasta - desde + 1;

  cuando.setUTCHours(desde + (n % horas), n % 60, 0, 0);

  return cuando.toISOString();
}
