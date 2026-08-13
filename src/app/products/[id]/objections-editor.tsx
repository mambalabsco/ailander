"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/ui";
import { saveMasterObjectionsAction } from "@/app/products/[id]/research-actions";

/**
 * Corregir a mano las objeciones del documento 4.
 *
 * Son de lo que más pesa en el copy: van al encargo con su «cómo se resuelve» y
 * el modelo las trata como comprobadas. Cuando la investigación saca una que
 * nadie pone —o una respuesta que promete lo que el producto no hace—, hasta
 * ahora la única salida era regenerar el documento entero y pagarlo otra vez.
 */
export function ObjectionsEditor({
  productId,
  objections,
}: {
  productId: string;
  objections: { objection: string; howToAddress: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState(objections);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const update = (index: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = () =>
    startTransition(async () => {
      const result = await saveMasterObjectionsAction(productId, rows);
      setMessage(result.message);
      setFailed(!result.ok);
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 md:grid-cols-2">
          <TextField
            value={row.objection}
            placeholder="La objeción, como la dice el cliente"
            onChange={(event) => update(index, { objection: event.target.value })}
          />
          <div className="flex gap-2">
            <TextField
              value={row.howToAddress}
              placeholder="Cómo se resuelve"
              onChange={(event) => update(index, { howToAddress: event.target.value })}
            />
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              Quitar
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={isPending}
          onClick={() => setRows((current) => [...current, { objection: "", howToAddress: "" }])}
        >
          Añadir objeción
        </Button>
        <Button variant="primary" disabled={isPending} onClick={save}>
          {isPending ? "Guardando..." : "Guardar objeciones"}
        </Button>
        {message ? (
          <span
            className={`text-sm ${failed ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
          >
            {message}
          </span>
        ) : null}
      </div>

      {/*
        Se dice qué se corrige y qué no. Quien edita esto tiene que saber que el
        informe en Markdown se queda como estaba: reescribirlo para que cuadre
        sería inventarse un párrafo que nadie ha revisado.
      */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Esto corrige el dato que entra en los encargos de copy. El informe escrito del documento 4
        se queda como está.
      </p>
    </div>
  );
}
