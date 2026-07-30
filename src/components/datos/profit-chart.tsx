"use client";

import { useId, useState } from "react";
import { ChartFrame } from "@/components/charts";

/**
 * Ingresos, gasto publicitario y beneficio neto en el tiempo.
 *
 * ## Un solo eje, tres series
 *
 * Las tres son dinero en la misma moneda, así que comparten escala sin trampa.
 * **No hay segundo eje** y no lo habrá: dos escalas en un gráfico permiten hacer
 * que cualquier par de series parezca correlacionado eligiendo bien los mínimos,
 * y es el error más común de los paneles de negocio.
 *
 * Los ingresos y el gasto van en barras contiguas —son magnitudes de un periodo—
 * y el beneficio neto en línea, porque es el resultado y lo que interesa de él es
 * la forma: cuándo cruza el cero. El cero se dibuja explícitamente por eso mismo.
 *
 * ## Por qué está escrito a mano
 *
 * No hay ninguna librería de gráficos en el proyecto, y para tres series sobre un
 * eje común no hace falta: son cuarenta líneas de SVG contra doscientos kilobytes
 * de JavaScript que el navegador tendría que descargar antes de pintar nada.
 */

export interface ProfitPoint {
  label: string;
  revenue: number;
  adSpend: number;
  netProfit: number;
}

const COLORS = {
  revenue: "var(--viz-ramp-3)",
  adSpend: "var(--viz-cat-2)",
  net: "var(--viz-ramp-5)",
};

export function ProfitChart({
  points,
  currency,
}: {
  points: ProfitPoint[];
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const format = (value: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  if (points.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        No hay datos en este periodo. Pulsa «Sincronizar» para traerlos de Shopify.
      </div>
    );
  }

  /*
   * La escala incluye el cero **siempre**, y el mínimo negativo si lo hay.
   * Recortar el eje al mínimo de los datos exagera cualquier variación: una caída
   * del 2% parece un desplome si la base está en el 98%.
   */
  const values = points.flatMap((point) => [point.revenue, point.adSpend, point.netProfit]);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const width = Math.max(320, points.length * 44);
  const height = 220;
  const padding = { top: 12, bottom: 8, left: 0, right: 0 };
  const plot = height - padding.top - padding.bottom;

  const y = (value: number) => padding.top + ((max - value) / span) * plot;
  const zeroY = y(0);
  const step = width / points.length;
  const barWidth = Math.min(11, step / 3);

  const netPath = points
    .map((point, index) => {
      const cx = index * step + step / 2;
      return `${index === 0 ? "M" : "L"} ${cx.toFixed(1)} ${y(point.netProfit).toFixed(1)}`;
    })
    .join(" ");

  return (
    <ChartFrame
      title="Ingresos, publicidad y beneficio"
      description="Las tres series comparten eje porque son la misma moneda. La línea es el beneficio neto; donde cruza el cero, el periodo dio pérdidas."
      legend={[
        { label: "Ingresos", color: COLORS.revenue },
        { label: "Gasto publicitario", color: COLORS.adSpend },
        { label: "Beneficio neto", color: COLORS.net },
      ]}
      table={{
        headers: ["Periodo", "Ingresos", "Publicidad", "Beneficio neto"],
        rows: points.map((point) => [
          point.label,
          format(point.revenue),
          format(point.adSpend),
          format(point.netProfit),
        ]),
      }}
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Ingresos, gasto publicitario y beneficio neto por periodo"
          className="max-w-full"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={width} height={height} />
            </clipPath>
          </defs>

          {/* El cero, en filete continuo. Es la referencia que da sentido a la línea. */}
          <line
            x1="0"
            x2={width}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--viz-axis)"
            strokeWidth="1"
          />

          <g clipPath={`url(#${clipId})`}>
            {points.map((point, index) => {
              const cx = index * step + step / 2;
              const active = hover === index;

              return (
                <g key={point.label}>
                  {/* Zona sensible más ancha que las marcas: apuntar a una barra
                      de once píxeles con el ratón es incómodo. */}
                  <rect
                    x={index * step}
                    y={0}
                    width={step}
                    height={height}
                    fill={active ? "var(--viz-grid)" : "transparent"}
                    opacity={active ? 0.45 : 0}
                    onMouseEnter={() => setHover(index)}
                  />

                  <Bar
                    x={cx - barWidth - 1}
                    value={point.revenue}
                    y={y}
                    zeroY={zeroY}
                    width={barWidth}
                    color={COLORS.revenue}
                  />
                  <Bar
                    x={cx + 1}
                    value={point.adSpend}
                    y={y}
                    zeroY={zeroY}
                    width={barWidth}
                    color={COLORS.adSpend}
                  />
                </g>
              );
            })}

            <path d={netPath} fill="none" stroke={COLORS.net} strokeWidth="2" />

            {points.map((point, index) => (
              <circle
                key={point.label}
                cx={index * step + step / 2}
                cy={y(point.netProfit)}
                r={hover === index ? 5 : 3}
                fill={COLORS.net}
                // Anillo del color de la superficie: separa el punto de la barra
                // que tiene debajo sin dibujar un borde de otro color.
                stroke="var(--viz-surface)"
                strokeWidth="2"
              />
            ))}
          </g>
        </svg>
      </div>

      {/* El detalle va en texto debajo, no en un globo flotante: se lee con el
          teclado, en el móvil y en una captura de pantalla. */}
      <div className="mt-3 min-h-10 text-sm">
        {hover === null ? (
          <p className="text-slate-500 dark:text-slate-400">
            {points.length} periodo(s) · pasa el ratón por encima para ver cada uno
          </p>
        ) : (
          <p className="tabular-nums">
            <span className="font-medium">{points[hover].label}</span>
            <span className="text-slate-500 dark:text-slate-400">
              {" · "}Ingresos {format(points[hover].revenue)} · Publicidad{" "}
              {format(points[hover].adSpend)} · Neto{" "}
            </span>
            <span
              className={
                points[hover].netProfit < 0
                  ? "font-medium text-rose-600 dark:text-rose-400"
                  : "font-medium text-emerald-700 dark:text-emerald-400"
              }
            >
              {format(points[hover].netProfit)}
            </span>
          </p>
        )}
      </div>
    </ChartFrame>
  );
}

/**
 * Una barra anclada al cero, con el extremo del dato redondeado.
 *
 * El redondeo va solo en el extremo que lleva el dato; el que toca la línea base
 * queda recto, porque redondear los cuatro lados despega la barra del eje y
 * falsea de dónde arranca. Con valores negativos el redondeo cambia de lado.
 */
function Bar({
  x,
  value,
  y,
  zeroY,
  width,
  color,
}: {
  x: number;
  value: number;
  y: (value: number) => number;
  zeroY: number;
  width: number;
  color: string;
}) {
  const top = Math.min(y(value), zeroY);
  const height = Math.abs(y(value) - zeroY);
  if (height < 0.5) return null;

  const radius = Math.min(4, width / 2, height);
  const negative = value < 0;

  const path = negative
    ? `M ${x} ${top} h ${width} v ${height - radius} a ${radius} ${radius} 0 0 1 ${-radius} ${radius} h ${-(width - 2 * radius)} a ${radius} ${radius} 0 0 1 ${-radius} ${-radius} z`
    : `M ${x} ${top + height} v ${-(height - radius)} a ${radius} ${radius} 0 0 1 ${radius} ${-radius} h ${width - 2 * radius} a ${radius} ${radius} 0 0 1 ${radius} ${radius} v ${height - radius} z`;

  return <path d={path} fill={color} />;
}
