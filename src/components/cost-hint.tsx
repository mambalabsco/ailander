"use client";

import { useEffect, useState } from "react";
import { typicalCostAction } from "@/app/gasto/actions";

/**
 * Lo que suele costar esta acción, junto al botón que la lanza.
 *
 * ## Por qué «suele» y no «cuesta»
 *
 * Porque es la mediana de lo que ya pasó, no una tarifa. Decir «cuesta 0,12 $»
 * promete un número exacto que no se puede cumplir —un producto con más
 * investigación gasta más— y a la primera vez que no cuadre, nadie vuelve a
 * mirarlo.
 *
 * ## Y por qué no se enseña nada cuando no se sabe
 *
 * Porque un precio inventado es peor que ningún precio: se cree. Sin histórico
 * de ese tipo de trabajo, esto no ocupa ni una línea.
 */
export function CostHint({ kind }: { kind: string }) {
  const [usd, setUsd] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;

    typicalCostAction(kind)
      .then((result) => {
        if (vivo) setUsd(result.usd);
      })
      .catch(() => {});

    return () => {
      vivo = false;
    };
  }, [kind]);

  if (usd === null || usd <= 0) return null;

  return (
    <span className="text-xs text-slate-500 dark:text-slate-400">
      Suele costar{" "}
      {usd.toLocaleString("es-ES", {
        style: "currency",
        currency: "USD",
        // Estas llamadas cuestan céntimos: con dos decimales casi todas saldrían
        // «0,00 $», que se lee como gratis.
        maximumFractionDigits: usd < 0.1 ? 3 : 2,
      })}
    </span>
  );
}
