"use client";

import { useState } from "react";
import { TextField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { copyLandingAction } from "@/app/products/[id]/landing-actions";

/**
 * Copiar una página entera, tal cual.
 *
 * ## En qué se diferencia de calcarla
 *
 * Calcarla reutiliza su **texto** y lo reparte en las secciones que la
 * plataforma sabe pintar: sale con nuestros colores, nuestros anchos y nuestros
 * tamaños. Para inspirarse vale; cuando lo que se quiere es *esa* página, no.
 *
 * Esto reutiliza su marcado y su CSS, y solo cambia el texto visible. Colores,
 * anchos, tamaños de bloque y posiciones salen de la referencia porque son
 * literalmente los suyos.
 *
 * ## Lo que hay que mirar después
 *
 * Las imágenes siguen siendo las suyas. Se ven, así que la página se puede
 * revisar entera, pero enseñan el producto de otro: hay que cambiarlas antes de
 * publicar. Se dice aquí y se repite al terminar, porque es lo único de esta
 * pantalla que se puede publicar por descuido.
 */
export function CopyPage({ productId }: { productId: string }) {
  const [pageUrl, setPageUrl] = useState("");
  const [fresh, setFresh] = useState(false);

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Se descarga la página, se separa en secciones y se le cambia solo el texto: el marcado y el
        CSS son los suyos, así que los colores, los anchos y las posiciones salen idénticos.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            La dirección de la página
          </span>

          <TextField
            value={pageUrl}
            onChange={(event) => setPageUrl(event.target.value)}
            placeholder="https://…/la-pagina-que-vende"
          />
        </label>

        <GenerateButton
          variant="primary"
          action={() => copyLandingAction({ productId, pageUrl, fresh })}
          label="Copiarla"
          disabled={!pageUrl.trim()}
          disabledReason={!pageUrl.trim() ? "Pega la dirección primero." : undefined}
          hint="Una petición por sección. Va en segundo plano y se puede cerrar la pestaña."
        />
      </div>

      {/*
        Empezar de cero.

        La copia siempre parte de cero —se descarga sin caché y se guarda en una
        fila nueva—, así que esto no cambia cómo se copia: cambia lo que queda.
        Sin ello cada intento deja otra copia en la lista y a la cuarta ya no se
        sabe cuál es la buena.

        Va apagado por defecto: borrar algo que alguien pudo haber editado a
        mano no se hace sin pedirlo, y el borrado ocurre **después** de que la
        nueva esté guardada.
      */}
      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={fresh}
          onChange={(event) => setFresh(event.target.checked)}
        />
        Empezar de cero: quitar las copias anteriores de esta misma página cuando la nueva esté
        lista
      </label>

      <p className="text-xs text-amber-800 dark:text-amber-300">
        Las imágenes siguen siendo las de la página original: se ven para poder revisarla, pero
        enseñan el producto de otro. Cámbialas antes de publicar.
      </p>
    </div>
  );
}
