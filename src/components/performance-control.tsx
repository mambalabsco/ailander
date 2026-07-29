"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PERFORMANCE_META, PERFORMANCE_RATINGS } from "@/types/performance";
import type { PerformanceRating, PerformanceRecord, PerformanceTargetType } from "@/types/performance";
import { ratePiece } from "@/app/products/[id]/performance-actions";

interface PerformanceControlProps {
  productId: string;
  targetType: PerformanceTargetType;
  targetId: string;
  record?: PerformanceRecord;
  /** Versión reducida, para listas densas. */
  compact?: boolean;
}

/**
 * Marca el rendimiento de una pieza.
 *
 * La nota es opcional pero es lo que más valor tiene: los números dicen que algo
 * funcionó y la nota dice **qué parte** funcionó, que es lo único que se puede
 * trasladar a otro ángulo. Por eso se pide con un texto explícito.
 */
export function PerformanceControl({
  productId,
  targetType,
  targetId,
  record,
  compact = false,
}: PerformanceControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(record?.note ?? "");
  const [roas, setRoas] = useState(record?.metrics.roas?.toString() ?? "");
  const [spend, setSpend] = useState(record?.metrics.spend?.toString() ?? "");

  const current: PerformanceRating = record?.rating ?? "sin-probar";

  const apply = (rating: PerformanceRating) => {
    startTransition(async () => {
      await ratePiece({
        productId,
        targetType,
        targetId,
        rating,
        note,
        metrics: { roas, spend },
      });
      router.refresh();
    });
  };

  const saveDetails = () => {
    startTransition(async () => {
      await ratePiece({
        productId,
        targetType,
        targetId,
        rating: current,
        note,
        metrics: { roas, spend },
      });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div className={compact ? "" : "rounded-2xl border border-slate-200 p-3 dark:border-slate-800"}>
      <div className="flex flex-wrap items-center gap-2">
        {!compact ? (
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Rendimiento
          </span>
        ) : null}

        <div className="flex flex-wrap gap-1">
          {PERFORMANCE_RATINGS.map((rating) => {
            const meta = PERFORMANCE_META[rating];
            const active = current === rating;
            return (
              <button
                key={rating}
                type="button"
                onClick={() => apply(rating)}
                disabled={isPending}
                title={meta.description}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                  active
                    ? meta.className
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? meta.dot : "bg-slate-300 dark:bg-slate-600"}`} />
                {meta.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs text-violet-600 hover:underline"
        >
          {open ? "Cerrar" : record?.note ? "Ver nota" : "Añadir nota"}
        </button>
      </div>

      {record?.note && !open ? (
        <p className="mt-2 line-clamp-2 text-xs italic text-slate-500 dark:text-slate-400">
          {record.note}
        </p>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">
              ¿Qué funcionó o qué falló, y por qué?
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Lo que escribas aquí es lo que el modelo usará para proponer las siguientes ideas."
              className="min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-800 dark:bg-slate-950"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium">ROAS</span>
              <input
                type="number"
                step="0.1"
                value={roas}
                onChange={(event) => setRoas(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-slate-800 dark:bg-slate-950"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Inversión (€)</span>
              <input
                type="number"
                step="1"
                value={spend}
                onChange={(event) => setSpend(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-slate-800 dark:bg-slate-950"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={saveDetails}
            disabled={isPending}
            className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
          >
            {isPending ? "Guardando..." : "Guardar"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Distintivo de solo lectura, para listas y resúmenes. */
export function PerformanceBadge({ rating }: { rating: PerformanceRating }) {
  const meta = PERFORMANCE_META[rating];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
