"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteToGeneralAction } from "@/app/products/[id]/market-tag-actions";

/**
 * De qué mercado es una pieza, dicho encima de la pieza.
 *
 * Con cuatro países en la misma lista, saber para quién se escribió cada texto
 * deja de ser un detalle: publicar el de Chile en México es un clic de
 * distancia, y la insignia es lo único que lo separa.
 *
 * El botón de «vale en todos» está aquí y no en un menú porque a general **solo
 * se llega a propósito**. Nada nace general por descuido.
 */
export function MarketBadge({
  table,
  id,
  productId,
  marketId,
  marketLabel,
}: {
  table: string;
  id: string;
  productId: string;
  /** Indefinido es general. */
  marketId?: string;
  /** Cómo se llama ese mercado. Vacío si la pieza es general. */
  marketLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!marketId) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        General
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
        {marketLabel || "Un mercado"}
      </span>
      <button
        type="button"
        disabled={isPending}
        title="Úsalo cuando compruebes que esta pieza no dice nada propio de un país: ni precio, ni envío, ni modismos."
        className="text-xs text-slate-500 underline underline-offset-2 transition hover:text-violet-600 disabled:opacity-50 dark:text-slate-400"
        onClick={() =>
          startTransition(async () => {
            await promoteToGeneralAction(table, id, productId);
            router.refresh();
          })
        }
      >
        Vale en todos los mercados
      </button>
    </span>
  );
}
