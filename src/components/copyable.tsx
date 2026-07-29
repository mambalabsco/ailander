"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Texto que se copia al hacer clic encima.
 *
 * Sustituye a los botones de copia sueltos: el propio contenido es el
 * disparador, así que no hay que buscar dónde pulsar ni se llena la interfaz de
 * botones repetidos. La confirmación se da sobre el elemento — anillo verde y
 * etiqueta «Copiado» — para que quede claro *qué* se copió, que es justo lo que
 * un aviso global no distingue cuando hay varios textos juntos.
 */

type CopyState = "idle" | "copied" | "error";

function useCopy() {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);

  const copy = useCallback(async (value: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("error");
    }
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  }, []);

  return { state, copy };
}

const STATE_LABEL: Record<Exclude<CopyState, "idle">, string> = {
  copied: "Copiado",
  error: "No se pudo copiar",
};

interface CopyableProps {
  /** Lo que se copia. Por defecto, el propio texto mostrado. */
  value: string;
  children?: React.ReactNode;
  className?: string;
  /** Etiqueta accesible, por si el contenido visible no basta. */
  label?: string;
}

/** Versión en línea, para nombres y valores cortos. */
export function Copyable({ value, children, className = "", label }: CopyableProps) {
  const { state, copy } = useCopy();

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => copy(value)}
        aria-label={`Copiar ${label ?? value}`}
        className={`group inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left transition ${
          state === "copied"
            ? "bg-emerald-100 ring-1 ring-emerald-500 dark:bg-emerald-950"
            : state === "error"
              ? "bg-rose-100 ring-1 ring-rose-500 dark:bg-rose-950"
              : "hover:bg-slate-100 dark:hover:bg-slate-800"
        } ${className}`}
      >
        <span className="min-w-0 truncate">{children ?? value}</span>
        <CopyGlyph state={state} />
      </button>

      {state !== "idle" ? <Flash state={state} /> : null}
    </span>
  );
}

interface CopyableBlockProps {
  value: string;
  children: React.ReactNode;
  /** Título pequeño encima del bloque. */
  label?: string;
  className?: string;
  /** Altura máxima antes de hacer scroll interno. */
  maxHeightClass?: string;
}

/**
 * Versión en bloque, para textos largos: todo el recuadro es el área de clic.
 */
export function CopyableBlock({
  value,
  children,
  label,
  className = "",
  maxHeightClass = "max-h-72",
}: CopyableBlockProps) {
  const { state, copy } = useCopy();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => copy(value)}
        aria-label={`Copiar ${label ?? "texto"}`}
        className={`group block w-full rounded-2xl border p-4 text-left transition ${
          state === "copied"
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
            : state === "error"
              ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40"
              : "border-slate-200 bg-slate-50 hover:border-violet-400 dark:border-slate-800 dark:bg-slate-950"
        } ${className}`}
      >
        <span className="mb-2 flex items-center justify-between gap-2">
          {label ? (
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {label}
            </span>
          ) : (
            <span />
          )}
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium transition ${
              state === "copied"
                ? "text-emerald-700 dark:text-emerald-400"
                : state === "error"
                  ? "text-rose-700 dark:text-rose-400"
                  : "text-slate-400 opacity-0 group-hover:opacity-100 dark:text-slate-500"
            }`}
          >
            {state === "idle" ? "Clic para copiar" : STATE_LABEL[state]}
            <CopyGlyph state={state} />
          </span>
        </span>

        <div className={`${maxHeightClass} overflow-y-auto`}>{children}</div>
      </button>
    </div>
  );
}

/** Icono que cambia a check cuando se ha copiado. */
function CopyGlyph({ state }: { state: CopyState }) {
  if (state === "copied") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13 4L6 11.5 3 8.5" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 transition ${
        state === "error"
          ? "text-rose-600 dark:text-rose-400"
          : "text-slate-400 opacity-0 group-hover:opacity-100"
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-1a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5V9a1.5 1.5 0 0 0 1.5 1.5h1" />
    </svg>
  );
}

/** Etiqueta flotante que confirma la acción junto al elemento copiado. */
function Flash({ state }: { state: Exclude<CopyState, "idle"> }) {
  return (
    <span
      role="status"
      className={`pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium text-white shadow-lg ${
        state === "copied" ? "bg-emerald-600" : "bg-rose-600"
      }`}
    >
      {STATE_LABEL[state]}
    </span>
  );
}
