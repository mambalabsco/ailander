"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { reimportProductImagesAction } from "@/app/products/[id]/image-actions";

/**
 * Traer las imágenes de la ficha de la tienda.
 *
 * Sirve para recuperar las de un producto que se creó sin ellas y para incorporar
 * las que la tienda haya añadido después. No repite las que ya están.
 */
export function ReimportButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            setFailed(false);
            try {
              const result = await reimportProductImagesAction(productId);
              setMessage(result.message);
              router.refresh();
            } catch (error) {
              setFailed(true);
              setMessage(error instanceof Error ? error.message : "No se pudo importar.");
            }
          })
        }
      >
        {isPending ? "Importando..." : "Importar de la ficha"}
      </Button>

      {message ? (
        <span
          className={`text-sm ${failed ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
