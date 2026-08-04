/**
 * Cambiar de moneda lo que viene en otra.
 *
 * Sin imports, probado en `fx.test.ts`.
 *
 * ## Qué estaba mal
 *
 * Las cuentas publicitarias facturan en la moneda que tengan, y la mayoría de
 * las cuentas de Meta que se abren desde fuera están en dólares. La tienda vende
 * en pesos. El panel sumaba los dos números **como si fueran la misma moneda**:
 * un gasto de 23,77 USD salía escrito «23,77 CLP».
 *
 * No da error, no se ve raro por sí solo, y el beneficio sale disparado — porque
 * se está restando un gasto veinte mil pesos más pequeño del real. Es el peor
 * tipo de fallo: el número existe, es plausible y está mal.
 *
 * ## Por qué se guarda el cambio de cada día
 *
 * Porque el gasto del martes pasado se gastó al cambio del martes pasado. Si se
 * convierte siempre con el de hoy, el informe de un mes cerrado **cambia solo**
 * cada mañana, y dos capturas del mismo mes no cuadran. Guardar el cambio del
 * día lo deja fijo, que es lo que se espera de una cifra contable.
 *
 * ## Y por qué se dice de dónde salió
 *
 * Porque no siempre hay el del día. Las fuentes gratuitas que dan histórico
 * cubren las monedas del banco central europeo —el peso mexicano sí, el chileno
 * no—, así que para algunas hay que usar el de hoy sobre un día pasado. Eso es
 * una aproximación y se dice, en vez de dar el número con la misma cara que uno
 * exacto.
 */

export interface Rate {
  /** El día al que corresponde, `YYYY-MM-DD`. */
  day: string;
  from: string;
  to: string;
  /** Cuántas unidades de `to` vale una de `from`. */
  rate: number;
  /** Si es el cambio de ese día o el de hoy aplicado a un día pasado. */
  exact: boolean;
}

/** Normaliza el código: vienen en minúsculas, con espacios, o vacíos. */
export function code(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** Si hace falta cambiar algo, o las dos son la misma. */
export function needsConversion(from: string, to: string): boolean {
  const a = code(from);
  const b = code(to);

  return Boolean(a) && Boolean(b) && a !== b;
}

/**
 * El cambio que toca para ese día.
 *
 * Se busca el exacto; si no está, **el más cercano hacia atrás**. Nunca uno
 * posterior: el cambio de mañana no existía el día que se gastó, y usarlo
 * convierte el informe en algo que se mueve solo.
 *
 * Si no hay ninguno anterior se coge el más antiguo que haya, marcado como no
 * exacto: un número aproximado y avisado es mejor que sumar dólares a pesos, que
 * es lo que pasaba antes.
 */
export function pickRate(rates: Rate[], day: string, from: string, to: string): Rate | null {
  const a = code(from);
  const b = code(to);

  const mine = rates.filter((item) => code(item.from) === a && code(item.to) === b);
  if (mine.length === 0) return null;

  const exact = mine.find((item) => item.day === day);
  if (exact) return exact;

  const before = mine.filter((item) => item.day <= day).sort((x, y) => (x.day < y.day ? 1 : -1));
  const chosen = before[0] ?? [...mine].sort((x, y) => (x.day < y.day ? -1 : 1))[0];

  return { ...chosen, day, exact: false };
}

export interface Converted {
  amount: number;
  /** Vacío si salió bien; si no, por qué no se pudo cambiar. */
  problem: string;
  /** Si el cambio era el del día. */
  exact: boolean;
}

/**
 * Cambia un importe, o dice por qué no puede.
 *
 * **No devuelve el importe sin cambiar cuando falla.** Es la decisión que
 * importa de todo el módulo: devolver el número tal cual es exactamente lo que
 * hacía antes —sumar dólares a pesos— y con la ventaja de parecer que funciona.
 * Quien llame tiene que decidir qué hace con un gasto que no se puede convertir,
 * y para eso tiene que enterarse.
 */
export function convert(
  amount: number,
  day: string,
  from: string,
  to: string,
  rates: Rate[],
): Converted {
  if (!needsConversion(from, to)) return { amount, problem: "", exact: true };

  const rate = pickRate(rates, day, from, to);

  if (!rate || !(rate.rate > 0)) {
    return {
      amount: 0,
      problem: `No hay cambio de ${code(from)} a ${code(to)} para el ${day}.`,
      exact: false,
    };
  }

  return { amount: amount * rate.rate, problem: "", exact: rate.exact };
}

/**
 * Suma importes en monedas distintas, contando lo que no se pudo cambiar.
 *
 * Lo que falla no se suma como cero en silencio: se devuelve aparte. Un total al
 * que le faltan tres días de gasto tiene el mismo aspecto que uno completo, y la
 * diferencia son cientos de dólares en el beneficio.
 */
export function sumConverted(
  items: { amount: number; day: string; currency: string }[],
  to: string,
  rates: Rate[],
): { total: number; missing: { day: string; currency: string; amount: number }[]; approx: boolean } {
  let total = 0;
  let approx = false;
  const missing: { day: string; currency: string; amount: number }[] = [];

  for (const item of items) {
    const done = convert(item.amount, item.day, item.currency, to, rates);

    if (done.problem) {
      missing.push({ day: item.day, currency: code(item.currency), amount: item.amount });
      continue;
    }

    if (!done.exact) approx = true;
    total += done.amount;
  }

  return { total, missing, approx };
}

/** Cómo contarlo en una línea, cuando hay algo que contar. */
export function conversionNote(result: {
  missing: { currency: string; amount: number }[];
  approx: boolean;
}): string {
  const parts: string[] = [];

  if (result.missing.length > 0) {
    const monedas = [...new Set(result.missing.map((item) => item.currency))].join(", ");

    parts.push(
      `Faltan ${result.missing.length} día(s) de gasto en ${monedas} porque no se pudo cambiar: el total sale más bajo del real.`,
    );
  }

  if (result.approx) {
    parts.push(
      "Algún día usa el cambio de hoy y no el suyo: para esas monedas la fuente gratuita no da histórico.",
    );
  }

  return parts.join(" ");
}
