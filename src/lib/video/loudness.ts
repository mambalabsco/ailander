/**
 * A qué volumen va cada cosa en la mezcla.
 *
 * Sin imports, probado en `loudness.test.ts`.
 *
 * ## Por qué en LUFS y no en porcentaje
 *
 * El montaje mezcla pistas sin control de volumen, así que cada archivo tiene
 * que llegar ya al nivel que le toca. Antes eso se hacía multiplicando las
 * muestras por 0,12 dentro del WAV, y tenía dos problemas: solo funcionaba con
 * WAV —los generadores buenos devuelven MP3— y un porcentaje no dice cómo se
 * va a oír. Una pista suave y una comprimida al mismo porcentaje suenan a
 * cosas muy distintas.
 *
 * El LUFS sí lo dice: es la sonoridad que percibe el oído, y es la unidad en la
 * que trabaja todo el mundo que mezcla voz con música.
 *
 * ## Los números
 *
 * La locución va a −16 LUFS, que es el nivel al que publican las plataformas.
 * La cama va **entre 14 y 18 LU por debajo**, que es la distancia con la que la
 * música se oye pero no pelea con las consonantes. Por debajo de 10 LU de
 * diferencia empieza a taparlas; por encima de 22 no se distingue de no tener
 * música.
 */

/** El nivel al que se publica la voz. */
export const VOICE_LUFS = -16;

export interface MusicLevel {
  id: string;
  label: string;
  lufs: number;
  note: string;
}

/**
 * Los tres niveles a elegir, con la distancia a la voz escrita.
 *
 * Son tres y no un deslizador a propósito: el número en LUFS no le dice nada a
 * quien monta, y la decisión real es «se oye poco / está bien / tapa la voz».
 */
export const MUSIC_LEVELS: MusicLevel[] = [
  {
    id: "suave",
    label: "De fondo",
    lufs: -34,
    note: "18 LU por debajo de la voz. Se intuye más que se oye; para anuncios muy hablados.",
  },
  {
    id: "normal",
    label: "Acompañando",
    lufs: -32,
    note: "16 LU por debajo. El punto habitual: se oye y no compite con las consonantes.",
  },
  {
    id: "presente",
    label: "Presente",
    lufs: -30,
    note: "14 LU por debajo. Se nota; úsalo si el vídeo tiene tramos sin locución.",
  },
];

export function findMusicLevel(id: string): MusicLevel {
  return MUSIC_LEVELS.find((level) => level.id === id) ?? MUSIC_LEVELS[1];
}

/** Cuántos LU por debajo de la voz queda ese nivel. */
export function belowVoice(level: MusicLevel): number {
  return Math.round(VOICE_LUFS - level.lufs);
}

/**
 * Si esa distancia deja entender la locución.
 *
 * Sirve para avisar cuando alguien elige un nivel a mano: por debajo de diez LU
 * de diferencia la música empieza a comerse las consonantes, y eso no se
 * arregla después del montaje.
 */
export function drownsVoice(lufs: number): boolean {
  return VOICE_LUFS - lufs < 10;
}
