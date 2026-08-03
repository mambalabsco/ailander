/**
 * Cómo suena la voz, más allá de elegir cuál.
 *
 * Sin imports, probado en `voice-settings.test.ts`.
 *
 * ## Qué faltaba
 *
 * Se le mandaba el texto y la voz, y nada más. El generador tiene cuatro mandos
 * que cambian el resultado tanto como cambiar de voz, y todos se estaban
 * quedando en su valor por defecto:
 *
 * - **Estabilidad.** Baja, la voz se emociona y varía entre tomas; alta, sale
 *   plana y constante. Es el mando que decide si un anuncio suena a persona
 *   contando algo o a locutor de aeropuerto.
 * - **Parecido.** Cuánto se ciñe a la voz original. Muy alto arrastra también
 *   los defectos de la grabación de la que salió.
 * - **Estilo.** Exagera la forma de hablar del original. Cuesta más y por encima
 *   de la mitad empieza a inventarse énfasis.
 * - **Velocidad.** Uno es lo normal.
 *
 * ## Por qué hay ajustes preparados y no solo deslizadores
 *
 * Porque los números no significan nada hasta que se han probado veinte veces.
 * «Estabilidad 0,35 y estilo 0,45» no le dice nada a nadie; «como quien te
 * cuenta algo que le pasó» sí. Los deslizadores siguen estando para quien
 * quiera afinar.
 */

export interface VoiceSettings {
  /** 0 a 1. Baja emociona, alta aplana. */
  stability: number;
  /** 0 a 1. Cuánto se ciñe a la voz original. */
  similarity: number;
  /** 0 a 1. Exagera su forma de hablar. */
  style: number;
  /** 0,7 a 1,2. Uno es lo normal. */
  speed: number;
  /** Sube el parecido a cambio de algo más de latencia. */
  speakerBoost: boolean;
}

export interface VoicePreset {
  id: string;
  label: string;
  note: string;
  settings: VoiceSettings;
}

/**
 * Los ajustes preparados, pensados para anuncios.
 *
 * El de en medio es el que sale por defecto: es el que hace que un anuncio de
 * respuesta directa suene a alguien contando algo, que es lo que se busca.
 */
export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "narrador",
    label: "Narrador",
    note: "Constante y sin sobresaltos. Para explicar un mecanismo o leer datos.",
    settings: { stability: 0.75, similarity: 0.8, style: 0.1, speed: 1, speakerBoost: true },
  },
  {
    id: "cercano",
    label: "Cercano",
    note: "Como quien te cuenta algo que le pasó. El que mejor funciona en un anuncio.",
    settings: { stability: 0.45, similarity: 0.75, style: 0.35, speed: 1, speakerBoost: true },
  },
  {
    id: "intenso",
    label: "Intenso",
    note: "Se emociona y sube. Para ganchos cortos; en un guion largo cansa.",
    settings: { stability: 0.3, similarity: 0.7, style: 0.55, speed: 1.05, speakerBoost: true },
  },
  {
    id: "calmado",
    label: "Calmado",
    note: "Más lento y suave. Para testimonios y para hablar de salud sin alarmar.",
    settings: { stability: 0.65, similarity: 0.8, style: 0.2, speed: 0.92, speakerBoost: true },
  },
];

/** El de en medio es el que sale por defecto. */
export const DEFAULT_PRESET = "cercano";

export function findVoicePreset(id: string): VoicePreset {
  return VOICE_PRESETS.find((preset) => preset.id === id) ?? VOICE_PRESETS[1];
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

/**
 * Deja los ajustes dentro de lo que acepta la API.
 *
 * Fuera de rango devuelve 422 y la generación se pierde entera. La velocidad
 * tiene además un rango más estrecho del que dice la documentación: por debajo
 * de 0,7 la voz arrastra las sílabas y por encima de 1,2 se come las
 * consonantes, y ninguna de las dos sirve para un anuncio.
 */
export function clampSettings(settings: Partial<VoiceSettings>): VoiceSettings {
  const base = findVoicePreset(DEFAULT_PRESET).settings;

  return {
    stability: clamp(settings.stability ?? base.stability, 0, 1),
    similarity: clamp(settings.similarity ?? base.similarity, 0, 1),
    style: clamp(settings.style ?? base.style, 0, 1),
    speed: clamp(settings.speed ?? base.speed, 0.7, 1.2),
    speakerBoost: settings.speakerBoost ?? base.speakerBoost,
  };
}

/** El objeto que espera la API, con sus nombres. */
export function toApi(settings: VoiceSettings): Record<string, unknown> {
  const safe = clampSettings(settings);

  return {
    stability: safe.stability,
    // La API lo llama `similarity_boost`, no `similarity`.
    similarity_boost: safe.similarity,
    style: safe.style,
    speed: safe.speed,
    use_speaker_boost: safe.speakerBoost,
  };
}

/**
 * Si esos ajustes se van a notar entre una toma y la siguiente.
 *
 * Con la estabilidad muy baja el generador varía tanto que dos tomas del mismo
 * guion suenan a dos personas — y aquí cada toma se genera por separado, así que
 * eso se oye en el montaje como un salto.
 */
export function driftsBetweenShots(settings: VoiceSettings): boolean {
  return settings.stability < 0.35;
}
