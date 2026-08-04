"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, SelectField, TextAreaField, TextField } from "@/components/ui";
import {
  deleteSwipeCopyAction,
  importLandingAction,
  saveSwipeCopyAction,
  setSwipeStatusAction,
} from "@/app/products/[id]/swipe-actions";
import { SWIPE_STATUS_LABELS, type SwipeCopy, type SwipeStatus } from "@/types/swipe";

/**
 * Copys que ya se probaron, guardados como referencia.
 *
 * **Los que fallaron valen tanto como los que funcionaron.** Saber qué no
 * convirtió evita repetirlo, así que ambos entran en el contexto de cada
 * generación, marcados. Los que están sin probar no entran: no enseñan nada
 * todavía.
 */

const STATUS_STYLES: Record<SwipeStatus, string> = {
  funciona: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  malo: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "sin-probar": "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function SwipeFile({ productId, copies }: { productId: string; copies: SwipeCopy[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    body: "",
    source: "",
    format: "long-copy",
    status: "funciona" as SwipeStatus,
    note: "",
  });

  const usable = copies.filter((copy) => copy.status !== "sin-probar").length;

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveSwipeCopyAction({ ...form, productId });
        setForm({ ...form, title: "", body: "", source: "", note: "" });
        setOpen(false);
        router.refresh();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
      }
    });
  };

  return (
    <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Copys de referencia</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Pega aquí textos y páginas que ya se probaron, tuyos o de otras marcas. Los que
            guardes desde aquí quedan atados a este producto; los {usable} clasificados entran en
            cada generación como referencia de patrón. Para traerte uno de otro producto, usa
            «Adaptar un copy a este producto».
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen((value) => !value)}>
          {open ? "Cancelar" : "Añadir copy"}
        </Button>
      </div>

      {/*
        Traerse una landing entera por su enlace.

        Va arriba y con su propio campo porque es la vía rápida: pegar la
        dirección de la página de un competidor y tenerla como referencia sin
        copiar y pegar a mano media pantalla de texto.

        Se guarda el **texto**, no el código: el CSS de una página está atado al
        armazón de su tema y pegarlo en otro sitio da un diseño roto, no uno
        idéntico.
      */}
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            O pega el enlace de una landing y se trae sola
          </span>
          <TextField
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="trysculptique.com/pages/oferta"
          />
        </label>

        <Button
          disabled={isPending || !link.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await importLandingAction(link, productId);
              setNote(result.message);
              if (result.ok) setLink("");
              router.refresh();
            })
          }
        >
          {isPending ? "Trayendo…" : "Traer la página"}
        </Button>
      </div>

      {note ? (
        <p className="mb-3 rounded-2xl border border-slate-200 p-2 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {note}
        </p>
      ) : null}

      {open ? (
        <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre">
              <TextField
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Advertorial doctora — tiroides"
              />
            </Field>
            <Field label="De dónde salió">
              <TextField
                value={form.source}
                onChange={(event) => setForm({ ...form, source: event.target.value })}
                placeholder="Marca, cuenta o anuncio"
              />
            </Field>
            <Field label="Formato">
              <SelectField
                value={form.format}
                onChange={(event) => setForm({ ...form, format: event.target.value })}
              >
                <option value="long-copy">Long copy</option>
                <option value="advertorial">Publirreportaje</option>
                <option value="short-ad">Anuncio corto</option>
                {/* Una landing entera pegada de otra marca sirve de modelo para
                    generar la tuya con la misma estructura. */}
                <option value="landing">Página / landing</option>
              </SelectField>
            </Field>
            <Field label="Estado">
              <SelectField
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as SwipeStatus })
                }
              >
                <option value="funciona">Funcionó</option>
                <option value="malo">No funcionó</option>
                <option value="sin-probar">Sin probar</option>
              </SelectField>
            </Field>
          </div>

          <Field label="El texto">
            <TextAreaField
              rows={10}
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
              placeholder="Pega aquí el copy completo."
            />
          </Field>

          <Field label="Nota (opcional)">
            <TextField
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="Qué lo hacía funcionar, o por qué falló"
            />
          </Field>

          <Button variant="primary" onClick={save} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>

          {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        </div>
      ) : null}

      {copies.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay ninguno. Un copy que convirtió es la mejor referencia que existe.
        </p>
      ) : (
        <ul className="space-y-2">
          {copies.map((copy) => (
            <li
              key={copy.id}
              className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{copy.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {copy.source ? `${copy.source} · ` : ""}
                    {copy.format ?? ""} · {copy.body.length.toLocaleString("es-ES")} caracteres
                    {/*
                      De dónde sale que aparezca aquí.

                      Los que no son de ningún producto se ven en todas las
                      fichas —son los que se pegan de otras marcas antes de
                      tener a qué atarlos— y sin decirlo parecen un copy de otro
                      producto colado por error.
                    */}
                    {copy.productId ? "" : " · de otras marcas, se ve en todos los productos"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[copy.status]}`}
                >
                  {SWIPE_STATUS_LABELS[copy.status]}
                </span>
              </div>

              <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">
                {copy.body.slice(0, 300)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {(["funciona", "malo", "sin-probar"] as SwipeStatus[])
                  .filter((status) => status !== copy.status)
                  .map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await setSwipeStatusAction(copy.id, status, productId);
                          router.refresh();
                        })
                      }
                      className="text-violet-600 hover:underline disabled:opacity-50"
                    >
                      Marcar como «{SWIPE_STATUS_LABELS[status].toLowerCase()}»
                    </button>
                  ))}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteSwipeCopyAction(copy.id, productId);
                      router.refresh();
                    })
                  }
                  className="text-rose-500 hover:underline disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
