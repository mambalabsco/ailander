"use client";

import { useId, useMemo, useState } from "react";

/**
 * Primitivos de visualización, construidos en HTML plano.
 *
 * Reglas aplicadas en todos ellos:
 * - Marcas finas (barras ≤ 24 px), extremo del dato redondeado 4 px.
 * - Separación entre marcas contiguas con un hueco de 2 px del color de la
 *   superficie, nunca con un borde dibujado.
 * - Rejilla y ejes en filete continuo, un paso por encima de la superficie.
 * - Leyenda siempre presente a partir de dos series; etiquetas directas solo
 *   donde aportan, nunca un número sobre cada marca.
 * - El texto usa siempre tokens de texto, jamás el color de la serie.
 * - Cada gráfico tiene su gemelo en tabla, así que ningún valor depende del
 *   color ni del tooltip para poder leerse.
 */

const RAMP = [
  "var(--viz-ramp-1)",
  "var(--viz-ramp-2)",
  "var(--viz-ramp-3)",
  "var(--viz-ramp-4)",
  "var(--viz-ramp-5)",
];

/** Blanco o tinta según la luminancia del relleno, para etiquetas dentro de la marca. */
const RAMP_INK = ["#0b0b0b", "#0b0b0b", "#ffffff", "#ffffff", "#ffffff"];

function formatCompact(value: number) {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} MM`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)} K`;
  return value.toLocaleString("es-ES");
}

/* ------------------------------- Marco común ---------------------------------- */

interface ChartFrameProps {
  title: string;
  description?: string;
  legend?: { label: string; color: string }[];
  table: { headers: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
}

export function ChartFrame({ title, description, legend, table, children }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  return (
    <figure className="viz m-0 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <figcaption className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {showTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </figcaption>

      {showTable ? (
        <div id={tableId} className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                {table.headers.map((header) => (
                  <th key={header} className="px-2 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={String(row[0])} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`px-2 py-2 ${cellIndex === 0 ? "" : "tabular-nums text-slate-600 dark:text-slate-300"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {children}
          {legend && legend.length >= 2 ? (
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {legend.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: item.color }}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </figure>
  );
}

/* --------------------- Barra apilada ordinal (part-to-whole) -------------------- */

export interface OrdinalSegment {
  label: string;
  value: number;
  detail?: string;
}

/**
 * Para escalas ordenadas (los 5 niveles de conciencia). Usa la rampa de un solo
 * tono en vez de colores categóricos porque los niveles tienen orden natural:
 * el color codifica la progresión, no la identidad.
 */
export function OrdinalStackedBar({ segments }: { segments: OrdinalSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const [active, setActive] = useState<number | null>(null);

  return (
    <div>
      <div className="flex h-11 w-full overflow-hidden rounded-lg" role="img" aria-label="Distribución por nivel">
        {segments.map((segment, index) => {
          const share = (segment.value / total) * 100;
          const color = RAMP[index % RAMP.length];
          // Una etiqueta solo entra dentro de la marca si cabe con holgura.
          const fitsLabel = share >= 12;
          return (
            <div
              key={segment.label}
              className="relative flex h-full items-center justify-center transition-opacity"
              style={{
                width: `${share}%`,
                background: color,
                // El hueco de 2 px lo hace la superficie, no un borde.
                marginLeft: index === 0 ? 0 : 2,
                opacity: active === null || active === index ? 1 : 0.55,
              }}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              title={`${segment.label}: ${segment.value}%`}
            >
              {fitsLabel ? (
                <span
                  className="px-1 text-xs font-semibold tabular-nums"
                  style={{ color: RAMP_INK[index % RAMP_INK.length] }}
                >
                  {segment.value}%
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {active !== null ? (
        <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-950">
          <p className="font-medium">
            {segments[active].label} · {segments[active].value}%
          </p>
          {segments[active].detail ? (
            <p className="mt-1 text-slate-600 dark:text-slate-300">{segments[active].detail}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Pasa el cursor sobre un tramo para ver el detalle.
        </p>
      )}
    </div>
  );
}

/* --------------------------- Barras horizontales -------------------------------- */

export interface BarDatum {
  label: string;
  value: number;
  note?: string;
}

/**
 * Comparación de magnitud con una sola serie: un tono para todas las barras.
 * `emphasisIndex` resalta una y atenúa el resto cuando la historia es una sola
 * barra, en vez de repartir colores que no significan nada.
 */
export function HorizontalBars({
  data,
  unit = "",
  emphasisIndex,
  maxValue,
}: {
  data: BarDatum[];
  unit?: string;
  emphasisIndex?: number;
  maxValue?: number;
}) {
  const max = maxValue ?? Math.max(...data.map((item) => item.value), 1);

  return (
    <ul className="space-y-3">
      {data.map((item, index) => {
        const share = (item.value / max) * 100;
        const emphasised = emphasisIndex === undefined || emphasisIndex === index;
        return (
          <li key={item.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-600 dark:text-slate-300">{item.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {item.value.toLocaleString("es-ES")}
                {unit}
              </span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-sm"
              style={{ background: "var(--viz-grid)" }}
            >
              <div
                className="h-full rounded-r-[4px]"
                style={{
                  width: `${share}%`,
                  background: emphasised ? "var(--viz-series)" : "var(--viz-series-muted)",
                }}
                title={`${item.label}: ${item.value}${unit}`}
              />
            </div>
            {item.note ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.note}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------- Reparto categórico de dos --------------------------- */

export function CategoricalSplitBar({
  segments,
}: {
  segments: { label: string; value: number }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const colors = ["var(--viz-cat-1)", "var(--viz-cat-2)"];

  return (
    <div className="flex h-11 w-full overflow-hidden rounded-lg" role="img" aria-label="Reparto por género">
      {segments.map((segment, index) => {
        const share = (segment.value / total) * 100;
        return (
          <div
            key={segment.label}
            className="flex h-full items-center justify-center"
            style={{
              width: `${share}%`,
              background: colors[index % colors.length],
              marginLeft: index === 0 ? 0 : 2,
            }}
            title={`${segment.label}: ${segment.value}%`}
          >
            {share >= 12 ? (
              <span className="px-1 text-xs font-semibold tabular-nums text-white">{segment.value}%</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Heatmap ------------------------------------ */

export interface HeatmapRow {
  label: string;
  values: number[];
}

/**
 * Rejilla de magnitud (deseos × dimensiones de Schwartz, 1-5). Un heatmap con
 * rampa de un solo tono lee mucho mejor que un radar, que distorsiona el área y
 * no permite comparar filas.
 */
export function Heatmap({
  rows,
  columns,
  scaleMax = 5,
}: {
  rows: HeatmapRow[];
  columns: string[];
  scaleMax?: number;
}) {
  const stepFor = (value: number) => {
    const index = Math.min(RAMP.length - 1, Math.max(0, Math.round((value / scaleMax) * (RAMP.length - 1)) - 0));
    return index;
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[420px]">
        <div className="mb-2 grid grid-cols-[1.6fr_repeat(3,minmax(0,1fr))] gap-x-2">
          <span />
          {columns.map((column) => (
            <span
              key={column}
              className="text-center text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              {column}
            </span>
          ))}
        </div>
        <div className="space-y-[2px]">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[1.6fr_repeat(3,minmax(0,1fr))] gap-x-[2px]">
              <span className="pr-2 text-sm leading-tight text-slate-600 dark:text-slate-300">{row.label}</span>
              {row.values.map((value, index) => {
                const step = stepFor(value);
                return (
                  <div
                    key={`${row.label}-${columns[index]}`}
                    className="flex h-11 items-center justify-center rounded-sm"
                    style={{ background: RAMP[step] }}
                    title={`${row.label} · ${columns[index]}: ${value} de ${scaleMax}`}
                  >
                    <span
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: RAMP_INK[step] }}
                    >
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Menor</span>
          <div className="flex h-2 flex-1 gap-[2px]">
            {RAMP.map((color) => (
              <span key={color} className="flex-1 rounded-sm" style={{ background: color }} />
            ))}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Mayor</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Tarjetas KPI --------------------------------- */

export function StatTile({
  label,
  value,
  hint,
  prefix = "",
  suffix = "",
  compact = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
}) {
  const rendered = useMemo(() => {
    if (typeof value === "string") return value;
    return compact ? formatCompact(value) : value.toLocaleString("es-ES");
  }, [value, compact]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      {/* Cifras proporcionales: en un número grande, tabular-nums queda suelto. */}
      <p className="mt-2 text-3xl font-semibold">
        {prefix}
        {rendered}
        {suffix}
      </p>
      {hint ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}
