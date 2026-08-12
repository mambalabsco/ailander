"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, Field, TextAreaField, TextField } from "@/components/ui";
import { Copyable } from "@/components/copyable";
import { formatMoney } from "@/lib/money";
import { savingsVsSingle, unitPrice, type OfferTier, type ProductOffers } from "@/types/offer";
import { saveOffersAction } from "@/app/products/[id]/offer-actions";
import type { ProductNote } from "@/types/note";
import { createNoteAction, deleteNoteAction, toggleNoteAction } from "@/app/products/[id]/offer-actions";

interface OfferTabProps {
  productId: string;
  offers: ProductOffers;
  notes: ProductNote[];
  currency: string;
  locale: string;
  /*
   * Si hay mercado elegido. La oferta son precios, así que sigue la misma regla
   * que el precio: en general no se enseña.
   *
   * Los escalones **por mercado** son otro trabajo, anotado en la spec. Hasta
   * entonces los que hay son del mercado base, y enseñarlos bajo el nombre de
   * otro país sería exactamente el error que esto evita.
   */
  hasMarket: boolean;
}

function emptyTier(quantity: number): OfferTier {
  return {
    id: `tier-${quantity}-${Math.random().toString(36).slice(2, 8)}`,
    label: quantity === 1 ? "1 unidad" : `Pack ${quantity}`,
    quantity,
    totalPrice: 0,
    freeShipping: false,
    gifts: [],
    isHighlighted: false,
  };
}

/**
 * La oferta del producto y las notas del equipo.
 *
 * Están juntas porque son las dos cosas que se escriben a mano y que más pesan
 * en lo que escribe la IA: los precios de los packs son lo que vende un anuncio
 * de fondo de embudo, y las notas son lo que el equipo sabe y ninguna
 * investigación puede averiguar.
 */
export function OfferTab({ productId, offers, notes, currency, locale, hasMarket }: OfferTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [draft, setDraft] = useState<ProductOffers>(offers);
  const [note, setNote] = useState({ title: "", body: "" });

  const money = (value: number) => formatMoney(value, { currency, locale });

  const updateTier = (id: string, patch: Partial<OfferTier>) =>
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)),
    }));

  /** Solo un pack puede ser el destacado: marcar uno desmarca el resto. */
  const highlight = (id: string) =>
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier) => ({ ...tier, isHighlighted: tier.id === id })),
    }));

  const run = (task: () => Promise<unknown>) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await task();
        setSaved(true);
        router.refresh();
      } catch (taskError) {
        setError(taskError instanceof Error ? taskError.message : "No se pudo guardar.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {hasMarket ? (
      <SectionCard
        title="Oferta"
        description="Los packs, el ahorro por cantidad, los regalos y la suscripción. Es lo que vende el anuncio: sin esto, el copy solo sabe decir el precio de una unidad."
        action={
          <Button
            variant="primary"
            disabled={isPending}
            onClick={() => run(() => saveOffersAction(productId, draft))}
          >
            {isPending ? "Guardando..." : "Guardar oferta"}
          </Button>
        }
      >
        {error ? (
          <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            Guardado.
          </p>
        ) : null}

        <div className="space-y-4">
          {draft.tiers.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Todavía no hay packs. Añade al menos el de una unidad: es el que sirve de referencia para
              calcular el ahorro de los demás.
            </p>
          ) : null}

          {draft.tiers.map((tier) => {
            const savings = savingsVsSingle(tier, draft.tiers);
            return (
              <article
                key={tier.id}
                className={`rounded-3xl border p-5 ${
                  tier.isHighlighted
                    ? "border-violet-400 bg-violet-50/50 dark:border-violet-700 dark:bg-violet-950/20"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Cómo lo llama la tienda">
                    <TextField
                      value={tier.label}
                      onChange={(event) => updateTier(tier.id, { label: event.target.value })}
                    />
                  </Field>
                  <Field label="Unidades">
                    <TextField
                      type="number"
                      min={1}
                      value={tier.quantity}
                      onChange={(event) =>
                        updateTier(tier.id, { quantity: Math.max(1, Number(event.target.value)) })
                      }
                    />
                  </Field>
                  <Field label={`Precio total (${currency})`}>
                    <TextField
                      type="number"
                      min={0}
                      step="0.01"
                      value={tier.totalPrice}
                      onChange={(event) => updateTier(tier.id, { totalPrice: Number(event.target.value) })}
                    />
                  </Field>
                  <Field label={`Precio tachado (${currency})`}>
                    <TextField
                      type="number"
                      min={0}
                      step="0.01"
                      value={tier.compareAtPrice ?? ""}
                      onChange={(event) =>
                        updateTier(tier.id, {
                          compareAtPrice: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="Regalos que entran con este pack (uno por línea)">
                    <TextAreaField
                      value={tier.gifts.join("\n")}
                      onChange={(event) =>
                        updateTier(tier.id, {
                          gifts: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                        })
                      }
                      className="min-h-16"
                      placeholder={"Guía de uso en PDF\nFrasco de viaje"}
                    />
                  </Field>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tier.freeShipping}
                      onChange={(event) => updateTier(tier.id, { freeShipping: event.target.checked })}
                      className="size-4 accent-violet-600"
                    />
                    Envío gratis
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="highlighted"
                      checked={tier.isHighlighted}
                      onChange={() => highlight(tier.id)}
                      className="size-4 accent-violet-600"
                    />
                    Es el que destaca la tienda
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        tiers: current.tiers.filter((item) => item.id !== tier.id),
                      }))
                    }
                    className="ml-auto text-xs text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                  >
                    Quitar pack
                  </button>
                </div>

                {/* Las cifras que de verdad usa el copy, ya calculadas. */}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                  <Copyable value={money(unitPrice(tier))} label="Precio por unidad">
                    <span>
                      <span className="text-slate-500 dark:text-slate-400">Por unidad:</span>{" "}
                      <span className="font-medium tabular-nums">{money(unitPrice(tier))}</span>
                    </span>
                  </Copyable>
                  {savings > 0 ? (
                    <Copyable value={money(savings)} label="Ahorro">
                      <span>
                        <span className="text-slate-500 dark:text-slate-400">Ahorro:</span>{" "}
                        <span className="font-medium tabular-nums">{money(savings)}</span>
                      </span>
                    </Copyable>
                  ) : null}
                </div>
              </article>
            );
          })}

          <Button
            onClick={() =>
              setDraft((current) => ({
                ...current,
                tiers: [...current.tiers, emptyTier(current.tiers.length + 1)],
              }))
            }
          >
            Añadir pack
          </Button>
        </div>
      </SectionCard>
      ) : (
        <SectionCard title="Oferta" description="Los packs y lo que cuesta cada uno.">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Los packs son precios, y en general no hay uno solo. Elige un mercado para verlos y
            editarlos.
          </p>
        </SectionCard>
      )}

      <SectionCard
        title="Suscripción y garantía"
        description="El descuento de suscripción se aplica sobre el precio de cada entrega, así que convive con los packs en lugar de sustituirlos."
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={draft.subscription.enabled}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                subscription: { ...current.subscription, enabled: event.target.checked },
              }))
            }
            className="mt-0.5 size-4 accent-violet-600"
          />
          <span className="text-sm font-medium">Este producto se puede comprar por suscripción</span>
        </label>

        {draft.subscription.enabled ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Descuento (%)">
              <TextField
                type="number"
                min={0}
                max={100}
                value={draft.subscription.discountPercent}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    subscription: {
                      ...current.subscription,
                      discountPercent: Number(event.target.value),
                    },
                  }))
                }
              />
            </Field>
            <Field label="Frecuencia">
              <TextField
                value={draft.subscription.frequency}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    subscription: { ...current.subscription, frequency: event.target.value },
                  }))
                }
                placeholder="cada 30 días"
              />
            </Field>
            <Field label="Ventajas de suscribirse (una por línea)">
              <TextAreaField
                value={draft.subscription.perks.join("\n")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    subscription: {
                      ...current.subscription,
                      perks: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                    },
                  }))
                }
                className="min-h-16"
              />
            </Field>
            <Field label="Cancelación">
              <TextField
                value={draft.subscription.cancellationPolicy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    subscription: {
                      ...current.subscription,
                      cancellationPolicy: event.target.value,
                    },
                  }))
                }
                placeholder="cancelas cuando quieras"
              />
            </Field>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Garantía tal y como se anuncia">
            <TextField
              value={draft.guarantee}
              onChange={(event) => setDraft((current) => ({ ...current, guarantee: event.target.value }))}
              placeholder="60 días, devolución sin preguntas"
            />
          </Field>
          <Field label={`Envío gratis a partir de (${currency})`}>
            <TextField
              type="number"
              min={0}
              value={draft.freeShippingThreshold ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  freeShippingThreshold: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Notas para la IA"
        description="Lo que sabes tú y no sale de ninguna investigación: una restricción legal, una promesa que no se puede hacer, lo que contó el proveedor. Va dentro de los prompts y manda sobre lo demás."
      >
        <div className="rounded-3xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="grid gap-4">
            <Field label="Título (opcional)">
              <TextField
                value={note.title}
                onChange={(event) => setNote({ ...note, title: event.target.value })}
                placeholder="Ej. Restricción legal en México"
              />
            </Field>
            <Field label="Nota">
              <TextAreaField
                value={note.body}
                onChange={(event) => setNote({ ...note, body: event.target.value })}
                className="min-h-24"
                placeholder="No se puede decir «cura» ni prometer resultados médicos. Usar «apoyo» y «bienestar»."
              />
            </Field>
          </div>
          <div className="mt-4">
            <Button
              variant="primary"
              disabled={isPending || !note.body.trim()}
              onClick={() =>
                run(async () => {
                  await createNoteAction(productId, note);
                  setNote({ title: "", body: "" });
                })
              }
            >
              Añadir nota
            </Button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Todavía no hay notas.
            </p>
          ) : (
            notes.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
              >
                {item.title ? <p className="font-medium">{item.title}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={item.includeInPrompts}
                      onChange={(event) =>
                        run(() => toggleNoteAction(productId, item.id, event.target.checked))
                      }
                      className="size-4 accent-violet-600"
                    />
                    {item.includeInPrompts ? "Va en los prompts" : "Solo interna"}
                  </label>
                  <button
                    type="button"
                    onClick={() => run(() => deleteNoteAction(productId, item.id))}
                    className="ml-auto text-xs text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                  >
                    Borrar
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}
