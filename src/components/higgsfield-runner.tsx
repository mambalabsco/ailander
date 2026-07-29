"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ModelPicker, useHiggsfieldModels } from "@/components/model-picker";
import {
  generateProductImagesAction,
} from "@/app/products/[id]/image-generate-actions";
import type { ProductImagePattern } from "@/types/visuals";

/**
 * Lanza generaciones en Higgsfield.
 *
 * El selector sale de `ModelPicker`, que junta las dos vías —la API de clave y
 * el CLI— en una sola lista. Nano Banana Pro llega por el CLI, y es el que
 * acepta la foto real del producto como referencia.
 */

interface HiggsfieldRunnerProps {
  productId: string;
  patterns: ProductImagePattern[];
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  instructions?: string;
  backgroundStyle?: string;
  paletteNote?: string;
}

export function HiggsfieldRunner({
  productId,
  patterns,
  label,
  disabled,
  disabledReason,
  instructions,
  backgroundStyle,
  paletteNote,
}: HiggsfieldRunnerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const catalog = useHiggsfieldModels();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const outcome = await generateProductImagesAction({
          productId,
          modelSlug: catalog.slug,
          patterns,
          instructions,
          backgroundStyle,
          paletteNote,
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

  return (
    <div className="w-full">
      {!disabled ? (
        <ModelPicker
          models={catalog.models}
          warnings={catalog.warnings}
          slug={catalog.slug}
          onChange={catalog.setSlug}
          selected={catalog.selected}
          count={patterns.length}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={run}
          disabled={disabled || isPending || !catalog.slug}
          title={disabled ? disabledReason : undefined}
        >
          {isPending ? "Lanzando..." : label}
        </Button>

        {isPending ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Poniéndolas en cola...</p>
        ) : disabled && disabledReason ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">{disabledReason}</p>
        ) : null}
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
