"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, EmptyState, Field, TextAreaField, TextField } from "@/components/ui";
import { saveAppAction, deleteAppAction } from "@/app/products/[id]/app-actions";
import type { CasinoApp } from "@/types/app";

/**
 * Las apps de un casino, que son sus subproductos.
 *
 * El **enfoque** no es una descripción para la lista: entra tal cual en el
 * encargo del copy, y es lo único que distingue un texto de Monticello de uno de
 * cualquier otra app del mismo país. Por eso ocupa más sitio que el nombre.
 */
export function AppsTab({ productId, apps }: { productId: string; apps: CasinoApp[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState({ id: "", name: "", focus: "", downloadUrl: "" });

  const limpiar = () => setDraft({ id: "", name: "", focus: "", downloadUrl: "" });

  const guardar = () =>
    startTransition(async () => {
      const result = await saveAppAction({ ...draft, productId });
      setMessage(result.message);
      setFailed(!result.ok);
      if (result.ok) {
        limpiar();
        router.refresh();
      }
    });

  const borrar = (id: string) =>
    startTransition(async () => {
      const result = await deleteAppAction(id, productId);
      setMessage(result.message);
      setFailed(!result.ok);
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-6">
      <SectionCard
        title={draft.id ? "Editar la app" : "Añadir una app"}
        description="El producto es el país; cada app es lo que la persona acaba descargando."
      >
        <div className="space-y-3">
          <Field label="Nombre">
            <TextField
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Monticello Online"
            />
          </Field>

          <Field label="Su enfoque">
            <TextAreaField
              rows={4}
              value={draft.focus}
              onChange={(event) => setDraft({ ...draft, focus: event.target.value })}
              placeholder="Con qué entra esta app y no otra: a quién le habla, qué promete, por dónde es distinta de las demás del país."
            />
          </Field>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Esto entra tal cual en el encargo de cada copy. Si dos apps tienen el mismo enfoque, sus
            textos van a salir iguales.
          </p>

          <Field label="Enlace de descarga">
            <TextField
              type="url"
              value={draft.downloadUrl}
              onChange={(event) => setDraft({ ...draft, downloadUrl: event.target.value })}
              placeholder="https://…"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={guardar} disabled={isPending || !draft.name.trim()}>
              {isPending ? "Guardando..." : draft.id ? "Guardar cambios" : "Añadir la app"}
            </Button>
            {draft.id ? (
              <Button variant="secondary" onClick={limpiar} disabled={isPending}>
                Cancelar
              </Button>
            ) : null}
          </div>

          {message ? (
            <p
              className={`text-sm ${
                failed ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {message}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Las apps de este país" description="Los copys se escriben para una.">
        {apps.length === 0 ? (
          <EmptyState
            title="Todavía no hay ninguna app"
            description="Añade la primera arriba. Sin app, los copys no tienen qué mandar a descargar."
          />
        ) : (
          <div className="space-y-3">
            {apps.map((app) => (
              <div
                key={app.id}
                className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{app.name}</p>
                    {app.focus ? (
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{app.focus}</p>
                    ) : (
                      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                        Sin enfoque: sus copys van a salir iguales que los de las demás.
                      </p>
                    )}
                    {app.downloadUrl ? (
                      <a
                        href={app.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block truncate text-sm text-violet-600 hover:underline"
                      >
                        {app.downloadUrl}
                      </a>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setDraft({
                          id: app.id,
                          name: app.name,
                          focus: app.focus,
                          downloadUrl: app.downloadUrl,
                        })
                      }
                      disabled={isPending}
                    >
                      Editar
                    </Button>
                    <Button variant="secondary" onClick={() => borrar(app.id)} disabled={isPending}>
                      Borrar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
