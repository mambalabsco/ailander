/**
 * La proporción, comprobada **antes** de crear el contenedor.
 *
 * ## Por qué aquí y no dejar que falle Meta
 *
 * Porque Meta no falla al crear el contenedor: lo acepta, se pone a procesarlo
 * y falla **dentro**, minutos después, con un estado `ERROR` cuyo mensaje no
 * dice que el problema era la proporción. Para entonces la pieza ya se marcó
 * como «publicando» y hay que rescatarla.
 *
 * Comprobarlo aquí cuesta una división y convierte un fallo tardío y opaco en
 * uno inmediato que dice qué pasó.
 */

/** Lo que Instagram acepta en el feed: de 4:5 (0.8) a 1.91:1. */
const FEED_MIN = 0.8;
const FEED_MAX = 1.91;

/** Vertical completa. Se deja holgura: los generadores no clavan el píxel. */
const VERTICAL = 9 / 16;
const VERTICAL_TOLERANCIA = 0.03;

export function checkAspect(
  width: number,
  height: number,
  formatId: string,
): { ok: boolean; reason: string } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: "La imagen no dice cuánto mide." };
  }

  const ratio = width / height;

  if (formatId === "reel" || formatId === "historia") {
    const bien = Math.abs(ratio - VERTICAL) <= VERTICAL_TOLERANCIA;

    return bien
      ? { ok: true, reason: "" }
      : {
          ok: false,
          reason: `Un ${formatId} va en 9:16 y esta mide ${width}×${height}.`,
        };
  }

  if (ratio < FEED_MIN) {
    return {
      ok: false,
      reason: `Más alta de lo que admite el feed: el límite es 4:5 y esta mide ${width}×${height}.`,
    };
  }

  if (ratio > FEED_MAX) {
    return {
      ok: false,
      reason: `Más ancha de lo que admite el feed: el límite es 1.91:1 y esta mide ${width}×${height}.`,
    };
  }

  return { ok: true, reason: "" };
}
