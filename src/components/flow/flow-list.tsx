"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField, TextField } from "@/components/ui";
import {
  createFlowAction,
  deleteFlowAction,
  renameFlowAction,
} from "@/app/flujos/actions";

/**
 * La lista de flujos y el de arriba, con su producto.
 *
 * El producto va **en el flujo** y no en cada nodo: los nodos de producto tiran
 * de él, así que cambiarlo aquí sirve el mismo plano a otro producto sin tocar
 * ninguna caja. Es la mitad barata de «generar varios anuncios».
 */

export function FlowList({
  flows,
  products,
  currentId,
}: {
  flows: { id: string; name: string; productId: string; nodes: number }[];
  products: { id: string; name: string }[];
  currentId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [product, setProduct] = useState(products[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const current = flows.find((flow) => flow.id === currentId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {flows.length > 0 ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Flujo</span>
            <SelectField
              value={currentId}
              onChange={(event) => router.push(`/flujos?f=${event.target.value}`)}
              className="min-w-56"
            >
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name} · {flow.nodes} nodo(s)
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Nuevo flujo</span>
          <TextField
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Anuncio testimonio · Naturox"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Producto</span>
          <SelectField
            value={product}
            onChange={(event) => setProduct(event.target.value)}
            className="min-w-48"
          >
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        </label>

        <Button
          disabled={busy || !name.trim()}
          onClick={() => {
            setBusy(true);

            void createFlowAction(name, product)
              .then((result) => {
                setNote(result.message);
                if (result.ok && result.id) {
                  setName("");
                  router.push(`/flujos?f=${result.id}`);
                }
              })
              .finally(() => setBusy(false));
          }}
        >
          Crear
        </Button>
      </div>

      {current ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
          {/*
            Cambiar el producto del flujo es servir el mismo plano a otro
            producto sin tocar ninguna caja.
          */}
          <label className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Producto de este flujo</span>
            <SelectField
              value={current.productId}
              disabled={busy}
              onChange={(event) => {
                setBusy(true);

                void renameFlowAction(current.id, current.name, event.target.value)
                  .then((result) => {
                    setNote(result.message);
                    router.refresh();
                  })
                  .finally(() => setBusy(false));
              }}
              className="min-w-44"
            >
              <option value="">Sin producto</option>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          </label>

          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`¿Borrar «${current.name}» y sus ejecuciones?`)) return;

              void deleteFlowAction(current.id).then(() => router.push("/flujos"));
            }}
          >
            Borrar este flujo
          </Button>
        </div>
      ) : null}

      {note ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}
