"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { retryResearchExtractionAction } from "@/app/products/[id]/research-actions";

/**
 * Reintenta la extracción de un informe que ya está escrito.
 *
 * **Solo aparece cuando hay informe guardado**, que es justo el caso en el que
 * reintentar es casi gratis: la investigación y las búsquedas web ya están
 * pagadas, y falta únicamente la segunda llamada, la que convierte el texto en
 * datos que el panel pueda leer.
 *
 * Se distingue a propósito del botón de generar, que cuesta dólares y repite las
 * búsquedas. Confundirlos sale caro en la dirección mala.
 */
export function RetryExtraction({
  productId,
  documentId,
}: {
  productId: string;
  documentId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = () => {
    setMessage(null);
    setFailed(false);
    startTransition(async () => {
      try {
        await retryResearchExtractionAction({ productId, documentId });
        setFailed(false);
        // El resultado ya no llega aquí: el trabajo corre en el servidor y lo
        // cuenta el panel de arriba, que además sobrevive a cerrar la pestaña.
        setMessage("Extrayendo en el servidor. El resultado aparece en Trabajos.");
        router.refresh();
      } catch (error) {
        setFailed(true);
        setMessage(error instanceof Error ? error.message : "No se pudo extraer.");
      }
    });
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={run} disabled={isPending}>
          {isPending ? "Extrayendo..." : "Reintentar extracción"}
        </Button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No repite la investigación ni las búsquedas web: usa el informe ya guardado.
        </p>
      </div>

      {message ? (
        <p
          className={`mt-2 text-sm ${
            failed ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
