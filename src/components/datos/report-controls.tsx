"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SelectField, TextField } from "@/components/ui";
import { RANGE_LABELS, RANGE_PRESETS } from "@/lib/date-range";
import { syncSpendAction, syncStoreAction } from "@/app/datos/actions";

/**
 * Tienda y rango, en la barra de direcciones.
 *
 * Todo el estado del informe vive en la URL y no en el estado de este
 * componente. Es lo que permite marcar un informe, mandárselo a alguien o
 * recargar sin perder lo que estabas mirando, y lo que hace que las seis
 * pestañas se naveguen sin volver a elegir tienda y fechas en cada una.
 *
 * `router.replace` y no `push`: cambiar el rango seis veces seguidas no debería
 * dejar seis entradas en el historial que hay que deshacer una por una para
 * volver a la pantalla anterior.
 */

interface StoreOption {
  id: string;
  name: string;
  connected: boolean;
}

export function ReportControls({
  stores,
  currency,
  timeZone,
  preset,
  range,
  syncedRange,
}: {
  stores: StoreOption[];
  currency: string;
  timeZone: string;
  preset: string;
  range: { from: string; to: string };
  /** El rango que se va a sincronizar al pulsar el botón. */
  syncedRange: { from: string; to: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const storeId = params.get("tienda") ?? stores[0]?.id ?? "";
  const store = stores.find((item) => item.id === storeId);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tienda</span>
        <SelectField
          value={storeId}
          onChange={(event) => update({ tienda: event.target.value })}
          className="min-w-52"
        >
          {stores.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.connected ? "" : " · sin conectar"}
            </option>
          ))}
        </SelectField>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Periodo</span>
        <SelectField
          value={preset}
          onChange={(event) => update({ rango: event.target.value })}
          className="min-w-44"
        >
          {RANGE_PRESETS.map((item) => (
            <option key={item} value={item}>
              {RANGE_LABELS[item]}
            </option>
          ))}
        </SelectField>
      </label>

      {preset === "personalizado" ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Desde</span>
            <TextField
              type="date"
              value={range.from}
              onChange={(event) => update({ desde: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Hasta</span>
            <TextField
              type="date"
              value={range.to}
              onChange={(event) => update({ hasta: event.target.value })}
            />
          </label>
        </>
      ) : null}

      <div className="ml-auto flex flex-col items-end gap-1">
        {/*
          Se dice la moneda y la zona horaria porque de las dos depende que las
          cifras signifiquen lo que parecen. Una tienda que liquida en dólares y
          vende en pesos es exactamente el caso en el que hace falta verlo.
        */}
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {currency} · {timeZone}
        </span>

        <button
          type="button"
          disabled={isPending || !store?.connected}
          title={
            store?.connected
              ? `Trae los pedidos y el gasto del ${syncedRange.from} al ${syncedRange.to}`
              : "Conecta la tienda a Shopify antes de sincronizar"
          }
          onClick={() =>
            startTransition(async () => {
              const result = await syncStoreAction(storeId, syncedRange.from, syncedRange.to);
              if (!result.started) window.alert(result.message);
              router.refresh();
            })
          }
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {isPending ? "…" : "Sincronizar"}
        </button>

        {/*
          Solo el gasto, sin los pedidos.

          Los pedidos de tres meses son cientos de peticiones paginadas a Shopify
          y tardan minutos; el gasto son unas pocas llamadas. Después de activar
          una cuenta o cambiar un filtro, repetirlo todo para ver el efecto es
          esperar por nada. Y no depende de Shopify, así que sirve aunque la
          tienda no esté conectada.
        */}
        <button
          type="button"
          disabled={isPending}
          title={`Trae solo el gasto publicitario del ${syncedRange.from} al ${syncedRange.to}`}
          onClick={() =>
            startTransition(async () => {
              const result = await syncSpendAction(storeId, syncedRange.from, syncedRange.to);
              if (!result.started) window.alert(result.message);
              router.refresh();
            })
          }
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {isPending ? "…" : "Solo el gasto"}
        </button>
      </div>
    </div>
  );
}
