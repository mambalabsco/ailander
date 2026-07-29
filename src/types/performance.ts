/**
 * Rendimiento de copys y anuncios.
 *
 * No es analítica: es la lectura del equipo sobre qué funcionó. Sirve para dos
 * cosas concretas, y solo para esas dos:
 *
 * 1. Ver **qué ángulos rinden**, agregando lo marcado en sus piezas.
 * 2. Alimentar al modelo con ganadores y perdedores para que las siguientes
 *    ideas partan de lo que ya sabemos, en vez de empezar de cero cada vez.
 *
 * Por eso los estados son pocos y de lectura rápida. Un sistema de puntuación
 * fino se llenaría de datos a medias y no serviría para ninguna de las dos.
 */

export const PERFORMANCE_RATINGS = ["ganador", "prometedor", "perdedor", "sin-probar"] as const;

export type PerformanceRating = (typeof PERFORMANCE_RATINGS)[number];

export const PERFORMANCE_META: Record<
  PerformanceRating,
  { label: string; description: string; weight: number; className: string; dot: string }
> = {
  ganador: {
    label: "Ganador",
    description: "Rinde y se mantiene. Es el patrón a replicar en otros ángulos.",
    weight: 2,
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  prometedor: {
    label: "Prometedor",
    description: "Señales buenas pero sin recorrido suficiente para confirmarlo.",
    weight: 1,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  perdedor: {
    label: "Perdedor",
    description: "No funcionó. Igual de útil que un ganador: acota por dónde no ir.",
    weight: -2,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  "sin-probar": {
    label: "Sin probar",
    description: "Todavía no ha salido o no hay datos.",
    weight: 0,
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
  },
};

export type PerformanceTargetType = "copy" | "short-ad" | "imagen";

export const PERFORMANCE_TARGET_LABELS: Record<PerformanceTargetType, string> = {
  copy: "Copy",
  "short-ad": "Anuncio",
  imagen: "Imagen",
};

/** Métricas opcionales. Se anotan a mano; ninguna es obligatoria. */
export interface PerformanceMetrics {
  spend?: number;
  roas?: number;
  ctr?: number;
  cpa?: number;
}

export interface PerformanceRecord {
  id: string;
  productId: string;
  targetType: PerformanceTargetType;
  targetId: string;
  rating: PerformanceRating;
  metrics: PerformanceMetrics;
  /** Por qué funcionó o por qué no. Es lo que más valor aporta al modelo. */
  note: string;
  updatedAt: string;
}

/* ------------------------------ Agregado por ángulo ---------------------------- */

export interface AnglePerformance {
  angleId: string;
  angleName: string;
  desire: string;
  counts: Record<PerformanceRating, number>;
  /** Suma ponderada de lo marcado. Puede ser negativa. */
  score: number;
  tested: number;
  verdict: string;
  /** Formatos con los que este ángulo ha ganado. */
  winningFormats: string[];
  /** Notas de los ganadores: el material más útil para el modelo. */
  winningNotes: string[];
  losingNotes: string[];
}

/** Lectura del agregado, en una frase. */
export function angleVerdict(score: number, tested: number): string {
  if (tested === 0) return "Sin datos todavía";
  if (score >= 4) return "Funciona con claridad. Conviene ampliar por aquí.";
  if (score >= 1) return "Señales positivas, aún sin confirmar.";
  if (score === 0) return "Mixto: gana en unas piezas y pierde en otras.";
  if (score >= -3) return "Rinde por debajo. Revisa el mecanismo antes de insistir.";
  return "No funciona. Descártalo o replantéalo desde cero.";
}
