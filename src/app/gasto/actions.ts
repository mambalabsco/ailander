"use server";

import { listRuns } from "@/lib/data/runs";
import { typicalCost } from "@/lib/spend";

/**
 * Lo que cuesta normalmente un trabajo de este tipo.
 *
 * ## Para qué
 *
 * Para poder decirlo **antes** de pulsar. Un botón cuyo precio no se sabe es un
 * botón que no se pulsa: pasó con un documento de investigación que se quedó sin
 * generar porque el único botón decía «Regenerar» y parecía que iba a cobrar los
 * seis. Eso ya es un problema de dinero aunque no salga en ninguna factura.
 *
 * ## Por qué del histórico y no de una tarifa
 *
 * Porque una tarifa hay que mantenerla y envejece sin avisar; el histórico dice
 * lo que **te** ha costado a ti, con tus prompts y tus productos. Y si no hay
 * histórico se devuelve nada en vez de un número inventado: un precio falso es
 * peor que ningún precio, porque se cree.
 */
export async function typicalCostAction(kind: unknown): Promise<{ usd: number | null }> {
  const wanted = typeof kind === "string" ? kind : "";
  if (!wanted) return { usd: null };

  try {
    /*
     * Las últimas trescientas bastan.
     *
     * Es una mediana, así que más muestra no la mueve; y esto se pide al pintar
     * una pantalla, donde lo que se nota es la espera.
     */
    return { usd: typicalCost(await listRuns(300), wanted) };
  } catch {
    return { usd: null };
  }
}
