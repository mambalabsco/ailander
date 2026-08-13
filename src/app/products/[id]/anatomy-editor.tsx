"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, SelectField, TextAreaField, TextField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import {
  generateAnglesFromMaterialAction,
  saveAnatomiaAction,
} from "@/app/products/[id]/material-actions";
import type { Anatomia } from "@/lib/anatomia";

/**
 * Corregir la anatomía antes de sacar ángulos.
 *
 * Es la mitad del valor de haber partido esto en dos pasadas: lo que se arregla
 * aquí se arregla **una vez**; lo que se descubre después, en cinco ángulos ya
 * escritos, se arregla cinco veces y encima ya está pagado.
 *
 * Se editan todos los campos, no un resumen: el que suele salir mal es el
 * público —el modelo describe a quien él imagina— y ese entra en cada ángulo.
 */
export function AnatomyEditor({
  productId,
  anatomiaId,
  inicial,
}: {
  productId: string;
  anatomiaId: string;
  inicial: Anatomia;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState(inicial);
  const [cuantos, setCuantos] = useState(4);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const set = <K extends keyof Anatomia>(key: K, value: Anatomia[K]) =>
    setData((current) => ({ ...current, [key]: value }));

  const save = () =>
    startTransition(async () => {
      const result = await saveAnatomiaAction(anatomiaId, productId, data);
      setMessage(result.message);
      setFailed(!result.ok);
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Cómo entra">
          <TextAreaField
            rows={2}
            value={data.entrada}
            onChange={(event) => set("entrada", event.target.value)}
          />
        </Field>
        <Field label="Qué promete">
          <TextAreaField
            rows={2}
            value={data.promesa}
            onChange={(event) => set("promesa", event.target.value)}
          />
        </Field>
        <Field label="A quién le habla">
          <TextAreaField
            rows={2}
            value={data.publico}
            onChange={(event) => set("publico", event.target.value)}
          />
        </Field>
        <Field label="El deseo que explota">
          <TextAreaField
            rows={2}
            value={data.deseo}
            onChange={(event) => set("deseo", event.target.value)}
          />
        </Field>
        <Field label="Ritmo y tono">
          <TextAreaField
            rows={2}
            value={data.ritmo}
            onChange={(event) => set("ritmo", event.target.value)}
          />
        </Field>
        <Field label="Qué enseña, y cuándo">
          <TextAreaField
            rows={2}
            value={data.queEnsena}
            onChange={(event) => set("queEnsena", event.target.value)}
          />
        </Field>
        <Field label="Cómo cierra">
          <TextAreaField
            rows={2}
            value={data.cierre}
            onChange={(event) => set("cierre", event.target.value)}
          />
        </Field>
        <Field label="Por qué funciona">
          <TextAreaField
            rows={2}
            value={data.porQueFunciona}
            onChange={(event) => set("porQueFunciona", event.target.value)}
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Cómo está construido</p>
        {data.estructura.map((item, index) => (
          <div key={index} className="mb-2 grid gap-2 md:grid-cols-2">
            <TextField
              value={item.parte}
              placeholder="La parte"
              onChange={(event) =>
                set(
                  "estructura",
                  data.estructura.map((row, i) =>
                    i === index ? { ...row, parte: event.target.value } : row,
                  ),
                )
              }
            />
            <TextField
              value={item.papel}
              placeholder="Qué hace ahí"
              onChange={(event) =>
                set(
                  "estructura",
                  data.estructura.map((row, i) =>
                    i === index ? { ...row, papel: event.target.value } : row,
                  ),
                )
              }
            />
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Objeciones que toca</p>
        {data.objeciones.map((item, index) => (
          <div key={index} className="mb-2 grid gap-2 md:grid-cols-2">
            <TextField
              value={item.objecion}
              placeholder="La objeción"
              onChange={(event) =>
                set(
                  "objeciones",
                  data.objeciones.map((row, i) =>
                    i === index ? { ...row, objecion: event.target.value } : row,
                  ),
                )
              }
            />
            <TextField
              value={item.comoLaResuelve}
              placeholder="Cómo la resuelve"
              onChange={(event) =>
                set(
                  "objeciones",
                  data.objeciones.map((row, i) =>
                    i === index ? { ...row, comoLaResuelve: event.target.value } : row,
                  ),
                )
              }
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={isPending} onClick={save}>
          {isPending ? "Guardando..." : "Guardar la anatomía"}
        </Button>
        {message ? (
          <span
            className={`text-sm ${failed ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
          >
            {message}
          </span>
        ) : null}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Corrige aquí lo que el análisis haya entendido mal. Hacerlo ahora cuesta un minuto;
        descubrirlo en cinco ángulos ya escritos cuesta cinco, y lo que se pagó por escribirlos.
      </p>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <label className="mb-2 flex items-center gap-2 text-sm">
          <span>Cuántos ángulos</span>
          <SelectField
            className="w-auto"
            value={String(cuantos)}
            onChange={(event) => setCuantos(Number(event.target.value))}
          >
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </SelectField>
        </label>

        <GenerateButton
          action={() =>
            generateAnglesFromMaterialAction({ anatomiaId, productId, cuantos })
          }
          label="Sacar ángulos de esta anatomía"
          hint="Cada uno entra por una puerta distinta. Se guardan como ángulos normales: los copys largos y los vídeos ya los usan."
        />
      </div>
    </div>
  );
}
