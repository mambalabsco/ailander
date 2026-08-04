"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Cómo se clona un anuncio, en la pantalla donde se clona.
 *
 * ## Por qué está aquí y no en un manual
 *
 * Porque el orden importa y no es evidente: el clonador vive en Flujos pero
 * **empieza en la ficha del producto**, analizando el anuncio. Quien llega aquí
 * primero ve un selector vacío y no hay nada que le diga por qué.
 *
 * Va plegado. Se lee una vez y estorba las cincuenta siguientes.
 */
export function CloneGuide({ productId }: { productId?: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-violet-700 dark:text-violet-300"
      >
        ¿Cómo se clona un anuncio?
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">Clonar un anuncio, paso a paso</p>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 dark:text-slate-400"
        >
          Cerrar
        </button>
      </div>

      <ol className="space-y-2 text-[13px] text-slate-600 dark:text-slate-300">
        <li>
          <span className="font-medium text-slate-900 dark:text-slate-100">
            1. Analiza el anuncio.
          </span>{" "}
          En la ficha del producto,{" "}
          {productId ? (
            <Link
              href={`/products/${productId}`}
              className="underline underline-offset-2"
            >
              «anuncios de referencia»
            </Link>
          ) : (
            "«anuncios de referencia»"
          )}
          . Sube el vídeo —o pega su enlace y lo baja el servidor— y se guarda cómo está
          construido: el gancho, cada cuánto corta, dónde entra el producto, cómo cierra. Y sus
          fotogramas.
        </li>

        <li>
          <span className="font-medium text-slate-900 dark:text-slate-100">
            2. Móntalo, desde ahí mismo o desde aquí.
          </span>{" "}
          En el análisis hay un botón «Montar el flujo» que crea el flujo y lo clona de una vez. Si
          prefieres hacerlo aquí: crea un flujo con este producto, abre «Que lo monte la IA» y pasa
          a la pestaña «Clonando un anuncio».
        </li>

        <li>
          <span className="font-medium text-slate-900 dark:text-slate-100">3. Elige tres cosas.</span>{" "}
          Cuál clonar; si va <em>de una pieza</em> —un solo generador de principio a fin— o{" "}
          <em>plano a plano</em> con montaje, que deja rehacer una toma suelta; y de dónde sale la
          voz. La voz por defecto se decide sola y te dice por qué.
        </li>

        <li>
          <span className="font-medium text-slate-900 dark:text-slate-100">4. Revísalo.</span> Sale
          el lienzo lleno y <strong>no se ha generado nada</strong>: cambia los prompts que no te
          convenzan, elige la cara, ajusta los segundos. Arriba tienes lo que va a costar
          ejecutarlo.
        </li>

        <li>
          <span className="font-medium text-slate-900 dark:text-slate-100">5. Ejecuta.</span>{" "}
          Guarda y lanza. Verás cada caja llenarse. Si una sale mal, se rehace sola desde su panel —
          y lo demás no se vuelve a pagar.
        </li>
      </ol>

      <div className="rounded-xl bg-slate-50 p-2 text-[13px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        <p className="font-medium text-slate-900 dark:text-slate-100">Qué se copia y qué no</p>
        <p className="mt-1">
          Se copia la <strong>construcción</strong>: cuántas tomas, qué hace cada una, el ritmo,
          dónde aparece el producto. No se copia su texto ni sus imágenes — cada toma se rehace con
          tu producto y tu gente. Los fotogramas del original entran como referencia de{" "}
          <em>encuadre</em>, no de contenido.
        </p>
      </div>

      <p className="text-xs text-amber-800 dark:text-amber-300">
        Si el análisis es anterior a que se guardaran los fotogramas, el selector lo dice: se clona
        su construcción pero no sus encuadres. Se arregla volviendo a analizarlo.
      </p>
    </div>
  );
}
