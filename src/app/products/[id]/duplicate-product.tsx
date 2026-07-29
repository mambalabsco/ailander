"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, Field, SelectField, TextField } from "@/components/ui";
import {
  DUPLICATION_BEHAVIOUR_META,
  DUPLICATION_RULES,
  marketLabel,
  type Store,
} from "@/types/store";
import { duplicateProductAction } from "@/app/products/actions";
import type { Product } from "@/types";

interface DuplicateProductProps {
  product: Product;
  stores: Store[];
}

/**
 * Duplicar el producto a otro mercado.
 *
 * Lo importante no es el botón sino la tabla: antes de confirmar hay que ver
 * qué se arrastra y qué habrá que rehacer. Copiar la investigación de un país a
 * otro daría un documento que parece correcto y no lo es, así que lo que
 * depende del país se deja explícitamente vacío.
 */
export function DuplicateProduct({ product, stores }: DuplicateProductProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [storeId, setStoreId] = useState(product.storeId ?? stores[0]?.id ?? "");
  const [marketId, setMarketId] = useState("");
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));

  const store = stores.find((item) => item.id === storeId) ?? stores[0];

  // El mercado en el que ya vive no es un destino válido.
  const targets = (store?.markets ?? []).filter(
    (market) => !(store?.id === product.storeId && market.id === product.marketId),
  );
  const target = targets.find((market) => market.id === marketId) ?? targets[0];

  const handleDuplicate = () => {
    setError(null);
    if (!store || !target) {
      setError("Elige una tienda y un mercado de destino.");
      return;
    }

    startTransition(async () => {
      try {
        const duplicate = await duplicateProductAction({
          productId: product.id,
          storeId: store.id,
          marketId: target.id,
          name,
          price,
        });
        router.push(`/products/${duplicate.id}?tab=documentos`);
        router.refresh();
      } catch (duplicateError) {
        setError(
          duplicateError instanceof Error
            ? duplicateError.message
            : "No se pudo duplicar el producto.",
        );
      }
    });
  };

  return (
    <SectionCard
      title="Duplicar en otro mercado"
      description="El mismo producto en otro país o idioma es otro producto: comparte mecanismo, no comparte mercado."
      action={
        <Button variant={open ? "secondary" : "primary"} onClick={() => setOpen((value) => !value)}>
          {open ? "Cancelar" : "Duplicar"}
        </Button>
      }
    >
      {product.duplicatedFromId ? (
        <p className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          Este producto es a su vez un duplicado. Su deseo masivo y sus ángulos vienen del original.
        </p>
      ) : null}

      {open ? (
        <div className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tienda de destino">
              <SelectField
                value={storeId}
                onChange={(event) => {
                  setStoreId(event.target.value);
                  setMarketId("");
                }}
              >
                {stores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Mercado de destino">
              <SelectField
                value={target?.id ?? ""}
                onChange={(event) => setMarketId(event.target.value)}
                disabled={targets.length === 0}
              >
                {targets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {marketLabel(market)} · {market.currency}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Nombre en el nuevo mercado">
              <TextField value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label={`Precio${target ? ` (${target.currency})` : ""}`}>
              <TextField
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
          </div>

          {targets.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Esta tienda no tiene otro mercado al que llevarlo. Añade uno en Tiendas y mercados.
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              onClick={handleDuplicate}
              disabled={isPending || targets.length === 0}
            >
              {isPending ? "Duplicando..." : "Crear el duplicado"}
            </Button>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No consume tokens: copia lo que ya existe y deja marcado lo que hay que regenerar.
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">Qué</th>
              <th className="py-2 pr-4 font-medium">Al duplicar</th>
              <th className="py-2 font-medium">Por qué</th>
            </tr>
          </thead>
          <tbody>
            {DUPLICATION_RULES.map((rule) => {
              const meta = DUPLICATION_BEHAVIOUR_META[rule.behaviour];
              return (
                <tr
                  key={rule.key}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="py-3 pr-4 font-medium">{rule.label}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${meta.className}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{rule.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
