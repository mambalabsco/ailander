import "server-only";

import { requireContext } from "@/lib/supabase/session";
import { code, type Rate } from "@/lib/fx";

/**
 * De dónde salen los cambios de divisa.
 *
 * ## Dos fuentes, porque ninguna sola llega
 *
 * - **Frankfurter** da el cambio **del día que le pidas**, que es lo que hace
 *   falta para no reescribir informes cerrados. Pero solo cubre las monedas que
 *   publica el banco central europeo: el peso mexicano está, el chileno no.
 * - **open.er-api** cubre todas las monedas, incluido el peso chileno, pero solo
 *   da el de hoy.
 *
 * Así que se pide primero la buena y, si esa moneda no está, se cae a la otra
 * marcando el dato como aproximado. Ninguna de las dos pide clave, que es la
 * razón de usarlas: un cambio de divisa no merece una cuenta más que gestionar.
 *
 * ## Y una vez pedido, se guarda
 *
 * El cambio de un día no cambia. Volver a pedirlo cada vez que alguien abre el
 * panel son treinta peticiones para treinta días, cada vez, a un servicio
 * gratuito que puede decir que no.
 */

/** Cuántos días atrás se rellenan como mucho de una vez. */
const MAX_DAYS = 120;

interface Fetched {
  rate: number;
  exact: boolean;
}

async function fromFrankfurter(day: string, base: string, quote: string): Promise<Fetched | null> {
  try {
    const url = `https://api.frankfurter.dev/v1/${day}?base=${base}&symbols=${quote}`;
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });

    if (!response.ok) return null;

    const data = (await response.json()) as { rates?: Record<string, number> };
    const rate = Number(data.rates?.[quote]);

    /*
     * Si la moneda no está, Frankfurter **no da error**: devuelve `rates` sin
     * esa clave. Sin comprobarlo, `Number(undefined)` es `NaN` y acabaría
     * guardado como cambio.
     */
    return Number.isFinite(rate) && rate > 0 ? { rate, exact: true } : null;
  } catch {
    return null;
  }
}

async function fromOpenEr(base: string, quote: string): Promise<Fetched | null> {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success") return null;

    const rate = Number(data.rates?.[quote]);

    // Marcado como no exacto **siempre**: es el de hoy, se pida el día que se
    // pida. Decir lo contrario haría pasar una aproximación por un dato.
    return Number.isFinite(rate) && rate > 0 ? { rate, exact: false } : null;
  } catch {
    return null;
  }
}

/** Lo que ya está guardado para ese par y ese tramo de días. */
export async function readRates(
  pairs: { from: string; to: string }[],
  from: string,
  to: string,
): Promise<Rate[]> {
  if (pairs.length === 0) return [];

  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("fx_rates")
    .select("day,base,quote,rate,exact")
    .in("base", [...new Set(pairs.map((pair) => code(pair.from)))])
    .in("quote", [...new Set(pairs.map((pair) => code(pair.to)))])
    /*
     * Se pide un poco antes del tramo: para el primer día puede no haber cambio
     * —un domingo, un festivo— y entonces hace falta el anterior. Sin margen, el
     * primer día del informe se quedaría sin convertir.
     */
    .gte("day", shift(from, -10))
    .lte("day", to);

  return (data ?? []).map((row) => ({
    day: String(row.day).slice(0, 10),
    from: row.base,
    to: row.quote,
    rate: Number(row.rate),
    exact: row.exact,
  }));
}

/**
 * Se asegura de que estén los cambios que hacen falta, pidiendo los que falten.
 *
 * Solo pide **los días que de verdad tienen gasto**. Rellenar el tramo entero
 * serían treinta peticiones para un informe donde se anunció tres días.
 */
export async function ensureRates(
  needed: { day: string; from: string; to: string }[],
): Promise<Rate[]> {
  const wanted = new Map<string, { day: string; from: string; to: string }>();

  for (const item of needed) {
    const base = code(item.from);
    const quote = code(item.to);

    if (!base || !quote || base === quote) continue;

    wanted.set(`${item.day}:${base}:${quote}`, { day: item.day, from: base, to: quote });
  }

  if (wanted.size === 0) return [];

  const days = [...wanted.values()].map((item) => item.day).sort();

  const have = await readRates(
    [...wanted.values()].map((item) => ({ from: item.from, to: item.to })),
    days[0],
    days[days.length - 1],
  );

  const known = new Set(have.map((item) => `${item.day}:${item.from}:${item.to}`));
  const missing = [...wanted.values()].filter((item) => !known.has(`${item.day}:${item.from}:${item.to}`));

  if (missing.length === 0) return have;

  /*
   * Se piden en serie y con tope.
   *
   * Son servicios gratuitos sin clave: treinta peticiones a la vez es la forma
   * de que empiecen a decir que no. Y el tope evita que un tramo absurdo —dos
   * años— se convierta en setecientas.
   */
  const fresh: Rate[] = [];

  for (const item of missing.slice(0, MAX_DAYS)) {
    const found =
      (await fromFrankfurter(item.day, item.from, item.to)) ??
      (await fromOpenEr(item.from, item.to));

    if (!found) continue;

    fresh.push({ day: item.day, from: item.from, to: item.to, ...found });
  }

  if (fresh.length > 0) await saveRates(fresh);

  return [...have, ...fresh];
}

/**
 * Guarda lo pedido, con la clave de servicio.
 *
 * La tabla no deja escribir a quien tiene sesión: un cambio de divisa inventado
 * cambiaría el beneficio de todo el mundo, y no es un dato de nadie.
 */
async function saveRates(rates: Rate[]): Promise<void> {
  try {
    const { createAdminClient, hasAdminCredentials } = await import("@/lib/supabase/admin");
    if (!hasAdminCredentials()) return;

    const supabase = createAdminClient();

    await supabase.from("fx_rates").upsert(
      rates.map((item) => ({
        day: item.day,
        base: item.from,
        quote: item.to,
        rate: item.rate,
        exact: item.exact,
      })),
      { onConflict: "day,base,quote" },
    );
  } catch {
    // Sin guardar se vuelve a pedir la próxima vez. Es más lento, no es un fallo:
    // no poder cachear no puede impedir que el panel enseñe los números bien.
  }
}

/** Un día desplazado, en `YYYY-MM-DD`. */
function shift(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}
