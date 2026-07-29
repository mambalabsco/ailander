"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { LaunchResult } from "@/types/jobs";

/**
 * Botón que pone una generación en marcha.
 *
 * Existe porque los siete botones de generación necesitan exactamente lo mismo
 * —bloquearse mientras se encola, avisar de que ya corre, enseñar el error— y
 * repetir eso siete veces garantiza que en el sexto se olvide alguna parte.
 *
 * **Ya no enseña el resultado, y es a propósito.** El trabajo empieza después
 * de responder y puede tardar minutos, así que el resultado no cabe en esta
 * respuesta. Lo enseña el panel de trabajos de la página, que además sobrevive
 * a que cierres la pestaña — que era justamente el problema.
 *
 * Lo que sí sigue haciendo es distinguir «se puso en marcha» de «no había nada
 * que hacer»: lo segundo no gasta nada y merece decirse, no un silencio.
 */

interface GenerateButtonProps {
  /** La acción de servidor. Encola el trabajo y devuelve su id. */
  action: () => Promise<LaunchResult>;
  label: string;
  /** Qué se enseña mientras se encola. Es un instante, no la generación. */
  pendingLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Aviso de coste antes de pulsar, si se sabe. */
  hint?: string;
  variant?: "primary" | "secondary";
  /** Para quien necesita seguir el trabajo por su cuenta (competidores, ideas). */
  onStarted?: (jobId: string) => void;
}

export function GenerateButton({
  action,
  label,
  pendingLabel = "Lanzando...",
  disabled,
  disabledReason,
  hint,
  variant = "primary",
  onStarted,
}: GenerateButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();

        if (result.started) {
          setNotice(`«${result.label}» está en marcha. Puedes cerrar esta pestaña.`);
          onStarted?.(result.jobId);
          // Para que el panel de trabajos vea la fila recién creada.
          router.refresh();
        } else {
          setNotice(result.message);
        }
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "No se pudo lanzar.");
      }
    });
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={variant}
          onClick={run}
          disabled={disabled || isPending}
          title={disabled ? disabledReason : undefined}
        >
          {isPending ? pendingLabel : label}
        </Button>

        {disabled && disabledReason ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">{disabledReason}</p>
        ) : hint ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          {error}
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
