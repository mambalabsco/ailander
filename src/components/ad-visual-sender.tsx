"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ModelPicker, useHiggsfieldModels } from "@/components/model-picker";
import {
  generateAdVisualsAction,
} from "@/app/products/[id]/image-generate-actions";

/**
 * Envía las creatividades de un anuncio a Higgsfield.
 *
 * Como en el resto, el selector sale del catálogo real —las dos vías de
 * Higgsfield juntas—, no de una lista escrita a mano que ofrecería opciones
 * inexistentes. Aquí importa especialmente que el modelo admita referencias: si
 * no, el producto del anuncio será uno inventado.
 */

interface Visual {
  title: string;
  prompt: string;
  aspectRatio: string;
  /** Concepto visual, para el nombre del archivo y para agrupar. */
  concept?: string;
  /** El gancho del que nace: lo que hace reconocible la descarga. */
  origin?: string;
  /** Su anuncio, cuando se generan varios de una vez. */
  adId?: string;
  /** Su página, cuando el hueco pertenece a una landing. */
  landingId?: string;
  /**
   * Si esta creatividad enseña el producto.
   *
   * Va por creatividad y no por tanda porque las escenas sacadas de la historia
   * casi nunca lo enseñan: mandarles la foto de referencia les mete un frasco de
   * suplemento en medio del desagüe de la ducha.
   */
  withReference?: boolean;
}

export function AdVisualSender({
  productId,
  copyId,
  adId,
  landingId,
  visuals,
  label,
  compact = false,
}: {
  productId: string;
  /** Ata las imágenes al copy, para poder enseñarlas dentro de su anuncio. */
  copyId?: string;
  /** O al anuncio corto, cuando vienen de la estructura de campaña. */
  adId?: string;
  /** O a la página, cuando son los huecos de una landing. */
  landingId?: string;
  visuals: Visual[];
  /** El texto del botón. Por defecto, el de generar un lote. */
  label?: string;
  /**
   * Sin selector de modelo ni lista de casillas.
   *
   * Para rehacer **un** hueco, elegir qué generar de una lista de uno es un
   * paso vacío, y repetir el selector de modelo en setenta y cinco huecos
   * llenaría la pantalla de desplegables idénticos.
   */
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const catalog = useHiggsfieldModels();
  const [chosen, setChosen] = useState<Set<string>>(new Set(visuals.map((v) => v.title)));
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = visuals.filter((visual) => chosen.has(visual.title));

  const toggle = (title: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const run = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const outcome = await generateAdVisualsAction({
          productId,
          copyId,
          adId,
          landingId,
          modelSlug: catalog.slug,
          visuals: selected,
        });
        setNotice(
          outcome.started
            ? `«${outcome.label}» está en marcha. Puedes cerrar esta pestaña: el progreso sale en Trabajos.`
            : outcome.message,
        );
        router.refresh();
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "No se pudo generar.");
      }
    });
  };

  if (compact) {
    return (
      <div>
        <Button variant="secondary" onClick={run} disabled={isPending}>
          {isPending ? "Generando…" : (label ?? "Generar")}
        </Button>

        {notice ? (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{notice}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <ModelPicker
        label="Modelo"
        models={catalog.models}
        warnings={catalog.warnings}
        slug={catalog.slug}
        onChange={catalog.setSlug}
        selected={catalog.selected}
        count={selected.length}
      />

      <div className="mb-3 space-y-1">
        {visuals.map((visual) => (
          <label key={visual.title} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.has(visual.title)}
              onChange={() => toggle(visual.title)}
              className="size-4 accent-violet-600"
            />
            {visual.title}
            <span className="text-slate-500 dark:text-slate-400">({visual.aspectRatio})</span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={run}
          disabled={isPending || selected.length === 0 || !catalog.slug}
        >
          {isPending ? "Lanzando..." : `Generar ${selected.length}`}
        </Button>
        <p className="text-sm text-slate-500 dark:text-slate-400">Van de una en una.</p>
      </div>

      {error || catalog.loadError ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          {error ?? catalog.loadError}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
