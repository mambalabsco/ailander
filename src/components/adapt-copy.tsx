"use client";

import { useState } from "react";
import { Field, SelectField, TextAreaField, TextField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { adaptCopyAction } from "@/app/products/[id]/generate-actions";
import { AWARENESS_LABELS, AWARENESS_LEVELS } from "@/types/research";
import type { AwarenessLevel } from "@/types/research";
import { COPY_METHODS } from "@/types/copy";
import type { SwipeCopy } from "@/types/swipe";

/**
 * Adaptar un copy ajeno a este producto.
 *
 * **Lo que sale entra en la lista de copys del producto**, no en el archivo de
 * referencia. Esa es la diferencia entre «me sirvió de inspiración» y «es mío»:
 * una vez adaptado se comporta como cualquier copy generado, y de él salen
 * anuncios y páginas.
 */
export function AdaptCopy({
  productId,
  hasApiKey,
  swipeCopies,
}: {
  productId: string;
  hasApiKey: boolean;
  swipeCopies: SwipeCopy[];
}) {
  const [open, setOpen] = useState(false);
  const [swipeId, setSwipeId] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [methodId, setMethodId] = useState(COPY_METHODS[0]?.id ?? "");
  const [level, setLevel] = useState<AwarenessLevel>("problem-aware");
  const [fidelity, setFidelity] = useState<"calcado" | "inspirado">("calcado");

  return (
    <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Adaptar un copy a este producto</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Pega uno de otra marca o elige uno guardado. Sale adaptado y entra en la lista de copys
            del producto, listo para hacer anuncios o una página con él.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full border border-slate-200 px-3 py-1 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {open ? "Cerrar" : "Abrir"}
        </button>
      </div>

      {open ? (
        <div className="space-y-3">
          {swipeCopies.length > 0 ? (
            <Field label="Partir de uno guardado">
              <SelectField
                value={swipeId}
                onChange={(event) => {
                  setSwipeId(event.target.value);
                  // Al elegir uno guardado se limpia lo pegado: si no, no se
                  // sabría cuál de los dos manda.
                  if (event.target.value) setSourceText("");
                }}
              >
                <option value="">Pegar uno nuevo</option>
                {swipeCopies.map((copy) => (
                  <option key={copy.id} value={copy.id}>
                    {copy.title}
                    {copy.source ? ` — ${copy.source}` : ""}
                  </option>
                ))}
              </SelectField>
            </Field>
          ) : null}

          {!swipeId ? (
            <>
              <Field label="El copy que quieres adaptar">
                <TextAreaField
                  rows={10}
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder="Pega aquí el texto completo."
                />
              </Field>
              <Field label="De dónde salió (opcional)">
                <TextField
                  value={sourceNote}
                  onChange={(event) => setSourceNote(event.target.value)}
                  placeholder="Marca, anuncio o página"
                />
              </Field>
            </>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Marco">
              <SelectField value={methodId} onChange={(event) => setMethodId(event.target.value)}>
                {COPY_METHODS.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Nivel de conciencia">
              <SelectField
                value={level}
                onChange={(event) => setLevel(event.target.value as AwarenessLevel)}
              >
                {AWARENESS_LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {AWARENESS_LABELS[item]}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Cuánto seguirlo">
              <SelectField
                value={fidelity}
                onChange={(event) => setFidelity(event.target.value as "calcado" | "inspirado")}
              >
                <option value="calcado">Calcado — misma estructura</option>
                <option value="inspirado">Inspirado — pieza nueva</option>
              </SelectField>
            </Field>
          </div>

          {/* Es el riesgo real de este formato y conviene tenerlo delante. */}
          <p className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            No se arrastra nada que el original afirmara de <em>su</em> producto: ni ingredientes, ni
            estudios, ni cifras. Solo se queda lo que tu investigación sostiene. Aun así, léelo antes
            de publicarlo.
          </p>

          <GenerateButton
            action={() =>
              adaptCopyAction({
                productId,
                swipeId,
                sourceText,
                sourceNote,
                methodId,
                awarenessLevel: level,
                fidelity,
              })
            }
            label="Adaptar y guardar en el producto"
            disabled={!hasApiKey || (!swipeId && sourceText.trim().length < 120)}
            disabledReason={
              !hasApiKey ? "Configura tu clave de API en Configuración" : "Pega el copy completo"
            }
            hint="Unos 0,10 USD."
          />
        </div>
      ) : null}
    </div>
  );
}
