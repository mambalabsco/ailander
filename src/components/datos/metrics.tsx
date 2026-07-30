import { formatMoney } from "@/lib/money";

/**
 * Indicadores del panel de beneficio.
 *
 * Sin `"use client"` ni hooks a propósito: son puro formato y se pintan en el
 * servidor, así que no añaden nada al paquete que descarga el navegador.
 *
 * ## Las reglas que siguen todos
 *
 * **Un dato que no existe se escribe «—», nunca «0».** Un ticket medio de «0 €»
 * afirma que la gente compró sin gastar; «—» dice que no hubo pedidos. Poner
 * cero donde no hay dato es la forma más rápida de decidir sobre una cifra
 * inventada.
 *
 * **Los costos llevan la variación al revés.** Que el gasto publicitario suba un
 * 30% no es una buena noticia, y pintarlo en verde porque el número creció es
 * exactamente el error que hace que nadie se fíe de un panel.
 *
 * **El color nunca lleva la información solo.** Cada variación trae su flecha y
 * su signo, que se leen igual en escala de grises y con cualquier daltonismo.
 */

export function money(value: number, currency: string): string {
  return formatMoney(value, { currency, locale: "es-ES" });
}

/** Un porcentaje, o «—» si no había denominador. */
export function pct(value: number | null, digits = 2): string {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

/** Una razón, como el ROAS: «2,36». */
export function times(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function Change({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return (
      <span className="text-xs text-slate-400 dark:text-slate-500" title="No hubo datos en el periodo anterior">
        sin comparación
      </span>
    );
  }

  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const up = rounded > 0;
  const good = rounded === 0 ? null : invert ? !up : up;

  const className =
    good === null
      ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      : good
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${className}`}
    >
      <span aria-hidden>{rounded === 0 ? "=" : up ? "↑" : "↓"}</span>
      {Math.abs(rounded).toFixed(rounded === 0 ? 0 : 1)}%
    </span>
  );
}

export function MetricCard({
  label,
  value,
  change,
  invert = false,
  hint,
  hero = false,
}: {
  label: string;
  value: string;
  change?: number | null;
  /** Para los costos: subir es malo. */
  invert?: boolean;
  hint?: string;
  hero?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${
        hero ? "sm:col-span-2" : ""
      }`}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 font-semibold ${hero ? "text-4xl" : "text-2xl"}`}>{value}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {change === undefined ? null : <Change value={change} invert={invert} />}
        {hint ? <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
      </div>
    </div>
  );
}

/**
 * Un aviso sobre la calidad del dato.
 *
 * Existe porque el fallo más peligroso de este panel no es un error, es una
 * cifra creíble calculada con la configuración a medias: una variante sin coste
 * de mercancía o una pasarela sin comisión no rompen nada, inflan el beneficio.
 * Si no se dice, nadie lo descubre.
 */
export function DataWarning({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}
