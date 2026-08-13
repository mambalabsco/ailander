"use client";

import { useState } from "react";
import { Button, SelectField, TextField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { generateLandingAction } from "@/app/products/[id]/landing-actions";
import { landingReferenceId } from "@/lib/reference-id";

/**
 * Adaptar una página que ya funciona a otro ángulo o enfoque.
 *
 * Lo que se reutiliza es la **construcción**: qué secciones tiene, en qué orden,
 * cómo encadena. El texto lo escribe el encargo con el ángulo nuevo, y por eso
 * la fidelidad va a «inspirado» y no se ofrece «calcado» — calcar la propia
 * página con otro ángulo devuelve la misma página con las palabras cambiadas,
 * que es el resultado que no sirve para nada.
 *
 * Vale para cualquier página del producto, incluidas las clonadas y las
 * portadas: todas viven en la misma tabla.
 */
export function AdaptLanding({
  productId,
  landingId,
  methodId,
  angles,
  hasApiKey,
}: {
  productId: string;
  landingId: string;
  /** El marco de escritura de la página de origen, que se hereda. */
  methodId?: string;
  angles: { id: string; name: string }[];
  hasApiKey: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [angleId, setAngleId] = useState("");
  const [enfoque, setEnfoque] = useState("");

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Adaptar a otro ángulo
      </Button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Se escribe una página nueva siguiendo la construcción de esta, con el ángulo o el enfoque
        que le digas. Esta se queda como está.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ángulo</span>
          <SelectField value={angleId} onChange={(event) => setAngleId(event.target.value)}>
            <option value="">Sin ángulo guardado</option>
            {angles.map((angle) => (
              <option key={angle.id} value={angle.id}>
                {angle.name}
              </option>
            ))}
          </SelectField>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            O un enfoque escrito (manda sobre el ángulo)
          </span>
          <TextField
            value={enfoque}
            placeholder="Ej. entrar por el ahorro en vez de por la salud"
            onChange={(event) => setEnfoque(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GenerateButton
          action={() =>
            generateLandingAction({
              productId,
              methodId,
              angleId,
              enfoque,
              referenceId: landingReferenceId(landingId),
              // Nunca «calcado»: sería la misma página con otras palabras.
              fidelity: "inspirado",
            })
          }
          label="Escribir la página adaptada"
          hint="Suele costar lo mismo que una página nueva: es una página nueva."
          disabled={!hasApiKey || (!angleId && !enfoque.trim())}
        />
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>

      {!angleId && !enfoque.trim() ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Elige un ángulo o escribe un enfoque: sin uno de los dos, la página nueva saldría igual
          que esta.
        </p>
      ) : null}
    </div>
  );
}
