"use client";

import { useState, useTransition } from "react";
import { Button, SelectField } from "@/components/ui";
import { buildThemePlanAction, type ThemePlan } from "@/app/stores/theme-plan-actions";
import { PLAN_LIMITS } from "@/lib/theme-structure";

/**
 * El plan de cambios: tu tema contra el plano de otra tienda.
 *
 * Se enseña **tu estructura al lado de los cambios**, no solo la lista de
 * cambios. Sin ver la actual, «mueve la comparativa a la posición tres» no dice
 * nada: hay que poder contar dónde está ahora.
 *
 * Y los límites van escritos donde se lee, no solo en el código: la diferencia
 * entre reproducir una disposición y copiar una página es justo lo que separa
 * esto de un problema, así que tiene que estar a la vista de quien lo use.
 */

const KIND_STYLE: Record<string, string> = {
  añadir: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  mover: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  quitar: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  mantener: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function ThemePlanPanel({
  stores,
  blueprints,
}: {
  stores: { id: string; name: string; connected: boolean }[];
  blueprints: { id: string; storeName: string }[];
}) {
  const [storeId, setStoreId] = useState(stores.find((store) => store.connected)?.id ?? "");
  const [blueprintId, setBlueprintId] = useState(blueprints[0]?.id ?? "");
  const [plan, setPlan] = useState<ThemePlan | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  if (blueprints.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Analiza una tienda arriba y después podrás comparar tu tema con ella.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tu tienda</span>
          <SelectField
            value={storeId}
            onChange={(event) => {
              setStoreId(event.target.value);
              setPlan(null);
            }}
            className="min-w-44"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id} disabled={!store.connected}>
                {store.name}
                {store.connected ? "" : " · sin conectar"}
              </option>
            ))}
          </SelectField>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Comparar con
          </span>
          <SelectField
            value={blueprintId}
            onChange={(event) => {
              setBlueprintId(event.target.value);
              setPlan(null);
            }}
            className="min-w-44"
          >
            {blueprints.map((blueprint) => (
              <option key={blueprint.id} value={blueprint.id}>
                {blueprint.storeName}
              </option>
            ))}
          </SelectField>
        </label>

        <Button
          variant="primary"
          disabled={isPending || !storeId || !blueprintId}
          onClick={() =>
            startTransition(async () => {
              setMessage("");
              const result = await buildThemePlanAction(storeId, blueprintId, "");
              if (result.ok) setPlan(result.plan ?? null);
              else {
                setPlan(null);
                setMessage(result.message ?? "No se pudo comparar.");
              }
            })
          }
        >
          {isPending ? "Comparando…" : "Comparar"}
        </Button>
      </div>

      {message ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {message}
        </p>
      ) : null}

      {plan ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Tu estructura actual: sin verla, «muévelo a la 3» no dice nada. */}
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-sm font-medium">
              Tu página de producto
              <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                {plan.themeName}
              </span>
            </p>
            <ol className="mt-2 space-y-0.5 text-sm">
              {plan.current.map((section) => (
                <li key={`${section.position}-${section.type}`} className="flex gap-2">
                  <span className="w-5 shrink-0 tabular-nums text-slate-400">
                    {section.position}
                  </span>
                  <span className="font-mono text-xs">{section.type}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-sm font-medium">
              Qué cambiar
              <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                {plan.counts.añadir} añadir · {plan.counts.mover} mover
              </span>
            </p>

            <ul className="mt-2 space-y-2">
              {plan.changes
                // Lo que ya está bien va al final: lo que importa es lo que hay
                // que tocar, y mezclarlo obliga a buscarlo.
                .slice()
                .sort((a, b) => (a.kind === "mantener" ? 1 : b.kind === "mantener" ? -1 : 0))
                .map((change, index) => (
                  <li key={index} className="text-sm">
                    <span
                      className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[change.kind]}`}
                    >
                      {change.kind}
                    </span>
                    <span className="font-medium">{change.role}</span>
                    {change.sectionType ? (
                      <span className="ml-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {change.sectionType}
                      </span>
                    ) : null}
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {change.reason}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <p className="text-sm font-medium">Qué hace este plan y qué no</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
          {PLAN_LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
