"use client";

import { useState } from "react";
import { SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { extractStoryBeatsAction } from "@/app/products/[id]/beats-actions";
import { INTENSITIES, INTENSITY_META, type Intensity, type StoryBeat } from "@/lib/story-beats";

/**
 * Sacar las escenas del copy, con su intensidad.
 *
 * Lo que se enseña **no** son los prompts sino las escenas y su cita, porque es
 * lo que permite juzgar si el motor leyó la historia o se la inventó: la cita
 * está en el texto de arriba y se puede comprobar de un vistazo.
 *
 * Las escenas que no citaban nada real ya se descartaron en el servidor. Aquí
 * solo llegan las que se pueden defender.
 */
export function StoryBeatsControl({
  productId,
  copyId,
  beats,
  intensity,
  hasApiKey,
  /** Los copys cortos no tienen historia de la que tirar. */
  tooShort,
}: {
  productId: string;
  copyId: string;
  beats: StoryBeat[];
  intensity?: Intensity;
  hasApiKey: boolean;
  tooShort: boolean;
}) {
  const [chosen, setChosen] = useState<Intensity>(intensity ?? "crudo");
  const [count, setCount] = useState(6);

  if (tooShort) return null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            Escenas de la historia
            {beats.length > 0 ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {beats.length} listas
              </span>
            ) : null}
          </p>
          <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
            Saca las imágenes de dentro del propio texto. Cada escena trae la frase del copy de la
            que sale: si no puede citarla, se descarta.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Intensidad</span>
          <SelectField
            value={chosen}
            onChange={(event) => setChosen(event.target.value as Intensity)}
            className="min-w-40"
          >
            {INTENSITIES.map((level) => (
              <option key={level} value={level}>
                {INTENSITY_META[level].label}
              </option>
            ))}
          </SelectField>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Cuántas</span>
          <SelectField
            value={String(count)}
            onChange={(event) => setCount(Number(event.target.value))}
            className="w-20"
          >
            {[3, 4, 5, 6, 7].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </label>

        <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
          {INTENSITY_META[chosen].description}
        </p>
      </div>

      <div className="mt-3">
        <GenerateButton
          variant="secondary"
          action={() =>
            extractStoryBeatsAction({ productId, copyId, intensity: chosen, count })
          }
          label={beats.length > 0 ? "Volver a sacar las escenas" : "Sacar las escenas del texto"}
          disabled={!hasApiKey}
          disabledReason={!hasApiKey ? "Configura tu clave de API en Configuración" : undefined}
          hint={
            beats.length > 0
              ? "Reemplaza las de ahora. Unos 0,02 USD."
              : "Después, las creatividades saldrán de estas escenas en vez de las plantillas. Unos 0,02 USD."
          }
        />
      </div>

      {beats.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {beats.map((beat, index) => (
            <li
              key={`${beat.kind}-${index}`}
              className="border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0 dark:border-slate-800/60"
            >
              <p className="font-medium">{beat.scene}</p>
              {/* La cita en cursiva y entrecomillada: es lo que se comprueba. */}
              <p className="mt-1 text-slate-500 italic dark:text-slate-400">«{beat.quote}»</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
