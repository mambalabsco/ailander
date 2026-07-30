/**
 * Rangos de fecha de los informes.
 *
 * Sin imports, como `profit.ts`, y por lo mismo: un error de un día aquí no se
 * ve —las cifras siguen pareciendo razonables— pero desplaza todas las
 * comparaciones. Las pruebas están en `date-range.test.ts`.
 *
 * **`hoy` se recibe, no se calcula.** La fecha de hoy depende de la zona horaria
 * de la tienda: a las 22:00 en Ciudad de México ya es mañana en Madrid y ayer en
 * Los Ángeles. Quien llama la resuelve con la zona de la tienda y la pasa; así
 * este archivo es determinista y se puede probar.
 */

export const RANGE_PRESETS = [
  "hoy",
  "ayer",
  "7d",
  "30d",
  "90d",
  "este-mes",
  "mes-pasado",
  "este-año",
  "personalizado",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  "este-mes": "Este mes",
  "mes-pasado": "Mes pasado",
  "este-año": "Este año",
  personalizado: "Personalizado",
};

export interface DateRange {
  from: string;
  to: string;
}

function shift(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function firstOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function lastOfMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function isPreset(value: string | undefined): value is RangePreset {
  return typeof value === "string" && (RANGE_PRESETS as readonly string[]).includes(value);
}

/**
 * El rango de un preajuste.
 *
 * «Últimos 7 días» **incluye hoy**: son hoy y los seis anteriores. Es lo que la
 * gente espera al mirar a media tarde, y es también lo que hace TrueProfit. La
 * alternativa —los siete días completos anteriores— es más limpia
 * estadísticamente y contradice lo que dice la etiqueta.
 */
export function resolveRange(preset: RangePreset, today: string, custom?: Partial<DateRange>): DateRange {
  switch (preset) {
    case "hoy":
      return { from: today, to: today };
    case "ayer": {
      const yesterday = shift(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "7d":
      return { from: shift(today, -6), to: today };
    case "30d":
      return { from: shift(today, -29), to: today };
    case "90d":
      return { from: shift(today, -89), to: today };
    case "este-mes":
      return { from: firstOfMonth(today), to: today };
    case "mes-pasado": {
      const lastMonthDay = shift(firstOfMonth(today), -1);
      return { from: firstOfMonth(lastMonthDay), to: lastOfMonth(lastMonthDay) };
    }
    case "este-año":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "personalizado": {
      /*
       * Un rango escrito a mano puede venir con cualquier cosa. Se valida el
       * formato y se ordena: si alguien pone el final antes del principio, se
       * dan la vuelta en vez de devolver un informe vacío que parece «no hubo
       * ventas».
       */
      const from = looksLikeDay(custom?.from) ? custom!.from! : shift(today, -29);
      const to = looksLikeDay(custom?.to) ? custom!.to! : today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

function looksLikeDay(value: string | undefined): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * El periodo anterior con el que se compara, de la misma longitud.
 *
 * Igual de largo y pegado por detrás. Comparar siete días con un mes daría un
 * «−78%» que solo significa que los periodos son distintos, y es el error que
 * convierte una comparación en ruido.
 *
 * «Mes pasado» es la excepción: se compara con el mes anterior completo, no con
 * los treinta días previos, porque los meses tienen distinta longitud y la
 * comparación natural es de mes a mes.
 */
export function previousRange(range: DateRange, preset?: RangePreset): DateRange {
  if (preset === "mes-pasado") {
    const previousMonthDay = shift(range.from, -1);
    return { from: firstOfMonth(previousMonthDay), to: lastOfMonth(previousMonthDay) };
  }

  if (preset === "este-mes") {
    const previousMonthDay = shift(firstOfMonth(range.from), -1);
    const start = firstOfMonth(previousMonthDay);
    // Mismo número de días transcurridos, para comparar lo comparable: el 10 de
    // este mes contra el 10 del pasado, no contra el mes entero.
    const elapsed = daysIn(range) - 1;
    const end = shift(start, elapsed);
    const monthEnd = lastOfMonth(previousMonthDay);
    return { from: start, to: end > monthEnd ? monthEnd : end };
  }

  const length = daysIn(range);
  return { from: shift(range.from, -length), to: shift(range.from, -1) };
}

export function daysIn(range: DateRange): number {
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

/** Hoy en la zona horaria de la tienda, en `AAAA-MM-DD`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** El rango en palabras, para la cabecera del informe. */
export function describeRange(range: DateRange, locale = "es-ES"): string {
  const format = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return range.from === range.to ? format(range.to) : `${format(range.from)} – ${format(range.to)}`;
}
