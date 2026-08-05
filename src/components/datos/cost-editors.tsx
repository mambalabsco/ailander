"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField, TextField } from "@/components/ui";
import {
  deleteCustomCostAction,
  deleteZoneAction,
  importCogsAction,
  saveCogsAction,
  saveCustomCostAction,
  saveGatewayFeesAction,
  saveZoneAction,
} from "@/app/datos/actions";
import { COUNTRIES } from "@/lib/locales";
import type { CustomCost, ShippingZone } from "@/lib/profit";

/**
 * Los cuatro editores de costos.
 *
 * ## La decisión que atraviesa los cuatro
 *
 * **Se guarda al pulsar, no al escribir.** Un guardado automático en cada tecla
 * escribiría un coste de `1`, luego `12`, luego `12.5` mientras se teclea «12.50»,
 * y cada uno de esos recalcularía el informe entero. Peor: si alguien se va a
 * mitad de escribir queda guardado el número a medias, que es un dato falso
 * indistinguible de uno bueno.
 *
 * **Nada se descubre a mano.** Las variantes salen de lo vendido y las pasarelas
 * de los pedidos: una variante sin coste no da error, da un beneficio inflado, así
 * que la lista tiene que venir de los datos y no de que alguien se acuerde.
 */

/* -------------------------- Coste de mercancía ----------------------------- */

export interface VariantRow {
  productRef: string;
  variantRef: string;
  sku: string;
  title: string;
  units: number;
  cogs: number | null;
  /** De dónde salió: `manual` manda y no se refresca. */
  cogsSource?: "manual" | "shopify" | null;
}

export function CogsEditor({ storeId, variants }: { storeId: string; variants: VariantRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      variants.map((variant) => [
        variant.variantRef || variant.productRef,
        variant.cogs === null ? "" : String(variant.cogs),
      ]),
    ),
  );

  if (variants.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Todavía no se ha vendido nada. La lista se llena sola al sincronizar: sale de las variantes
        que aparecen en los pedidos.
      </p>
    );
  }

  const missing = variants.filter(
    (variant) => !draft[variant.variantRef || variant.productRef]?.trim(),
  ).length;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-3 py-2 text-left font-medium">Variante</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-400">
                Vendidas
              </th>
              <th className="px-3 py-2 text-right font-medium">Coste por unidad</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                Origen
              </th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => {
              const key = variant.variantRef || variant.productRef;
              const empty = !draft[key]?.trim();

              return (
                <tr
                  key={key}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-3 py-2">
                    <p className={empty ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                      {variant.title}
                    </p>
                    {variant.sku ? (
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {variant.sku}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {variant.units}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TextField
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      placeholder="sin poner"
                      value={draft[key] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [key]: event.target.value }))
                      }
                      className="w-28 text-right"
                    />
                  </td>

                  {/*
                    De dónde salió cada coste.

                    Importa porque decide qué pasa al traer de Shopify: los
                    manuales se respetan y los traídos se refrescan. Sin verlo,
                    la única forma de saber por qué un número no cambió es
                    volver a importar y comparar.
                  */}
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {empty
                      ? "—"
                      : variant.cogsSource === "shopify"
                        ? "de Shopify"
                        : "a mano · manda"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/*
          Traer los que falten de Shopify.

          No pisa los puestos a mano: quien los ajustó sabía algo que el
          inventario no sabe —un precio de proveedor con el envío dentro, uno
          negociado— y sobrescribirlo devolvería el beneficio a un número
          plausible y distinto sin que nadie se enterara.
        */}
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await importCogsAction(storeId);
              setNote(result.message);
              if (result.ok) router.refresh();
            })
          }
        >
          {isPending ? "Trayendo…" : "Traer de Shopify"}
        </Button>

        {note ? (
          <span className="text-xs text-slate-600 dark:text-slate-300">{note}</span>
        ) : null}

        <Button
          variant="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await saveCogsAction(
                storeId,
                variants
                  .map((variant) => {
                    const key = variant.variantRef || variant.productRef;
                    const raw = draft[key]?.trim();
                    return {
                      productRef: variant.productRef,
                      variantRef: variant.variantRef,
                      label: variant.title,
                      amount: raw ? Number(raw) : NaN,
                    };
                  })
                  // Un campo vacío se deja como estaba en vez de guardarse como
                  // cero: cero es un dato —«esto no me cuesta nada»— y vacío es
                  // la ausencia de dato.
                  .filter((row) => Number.isFinite(row.amount)),
              );
              router.refresh();
            })
          }
        >
          {isPending ? "Guardando…" : "Guardar costes"}
        </Button>

        {missing > 0 ? (
          <span className="text-sm text-amber-700 dark:text-amber-400">
            {missing} sin poner: su margen sale al 100%
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------- Envío ------------------------------------- */

export function ShippingEditor({
  storeId,
  zones,
}: {
  storeId: string;
  zones: ShippingZone[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {zones.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          No hay ninguna zona, así que el envío cuenta cero en todos los informes. Crea al menos una
          marcada por defecto.
        </p>
      ) : (
        <ul className="space-y-3">
          {zones.map((zone) => (
            <li
              key={zone.name}
              className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
            >
              {editing === zone.name ? (
                <ZoneForm
                  storeId={storeId}
                  zone={zone}
                  onDone={() => {
                    setEditing(null);
                    router.refresh();
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {zone.name}
                      {zone.isDefault ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          por defecto
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {zone.countries.length > 0
                        ? zone.countries.join(", ")
                        : "todos los países que no encajen en otra zona"}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-300">
                      {zone.tiers.map((tier) => `${tier.qty} ud → ${tier.cost}`).join(" · ")}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => setEditing(zone.name)}>Editar</Button>
                    <Button
                      onClick={async () => {
                        if (!window.confirm(`¿Borrar la zona «${zone.name}»?`)) return;
                        await deleteZoneAction(storeId, zone.name);
                        router.refresh();
                      }}
                    >
                      Borrar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing === "__nueva" ? (
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <ZoneForm
            storeId={storeId}
            onDone={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        </div>
      ) : (
        <Button onClick={() => setEditing("__nueva")}>Añadir zona</Button>
      )}
    </div>
  );
}

function ZoneForm({
  storeId,
  zone,
  onDone,
}: {
  storeId: string;
  zone?: ShippingZone;
  onDone: () => void;
}) {
  const [name, setName] = useState(zone?.name ?? "");
  const [countries, setCountries] = useState(zone?.countries.join(", ") ?? "");
  const [isDefault, setIsDefault] = useState(zone?.isDefault ?? false);
  const [dropshipping, setDropshipping] = useState(zone?.dropshipping === true);

  /** Los códigos ya elegidos, para pintar la lista. */
  const picked = new Set(
    countries
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  );
  const [tiers, setTiers] = useState<{ qty: string; cost: string }[]>(
    zone?.tiers.map((tier) => ({ qty: String(tier.qty), cost: String(tier.cost) })) ?? [
      { qty: "1", cost: "" },
    ],
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</span>
          <TextField
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="México"
          />
        </label>

        {/*
          Los países se eligen de la lista, no se teclean.

          Escribiendo el código a mano, un «MEX» en vez de «MX» no da error: la
          zona simplemente no encaja con ningún pedido y el envío de ese país
          cuenta cero. El beneficio sale más alto y nada avisa.
        */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Países de esta zona
          </span>

          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-300 p-2 dark:border-slate-700">
            {COUNTRIES.map((country) => {
              const on = picked.has(country.code);

              return (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    const next = new Set(picked);
                    if (on) next.delete(country.code);
                    else next.add(country.code);
                    setCountries([...next].join(", "));
                  }}
                  aria-pressed={on}
                  className={`rounded-full px-2 py-0.5 text-xs transition ${
                    on
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {country.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
          className="h-4 w-4"
        />
        Usar para todo lo que no encaje en otra zona
      </label>

      {/*
        Dropshipping: el proveedor cobra producto y envío en un solo precio.

        No es una etiqueta, cambia la cuenta. Ese precio ya está en el coste por
        unidad, así que sumar además el tramo cuenta el envío dos veces y baja
        el beneficio sin avisar — y con márgenes de dropshipping eso decide si
        un producto parece que pierde dinero.
      */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={dropshipping}
          onChange={(event) => setDropshipping(event.target.checked)}
          className="h-4 w-4"
        />
        Dropshipping: el proveedor ya cobra el envío dentro del precio del producto
      </label>

      {dropshipping ? (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Los tramos de abajo no se van a sumar. Pon el precio del proveedor —producto más envío—
          como coste por unidad en la pestaña de costos.
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Tramos por cantidad. Se aplica el mayor que no pase de las unidades del pedido, así que
          solo hay que declarar los tramos en los que el coste cambia.
        </p>

        {tiers.map((tier, index) => (
          <div key={index} className="flex items-center gap-2">
            <TextField
              type="number"
              min="1"
              value={tier.qty}
              onChange={(event) =>
                setTiers((current) =>
                  current.map((item, position) =>
                    position === index ? { ...item, qty: event.target.value } : item,
                  ),
                )
              }
              className="w-24"
              aria-label="Unidades"
            />
            <span className="text-sm text-slate-500 dark:text-slate-400">ud →</span>
            <TextField
              type="number"
              step="0.01"
              min="0"
              value={tier.cost}
              onChange={(event) =>
                setTiers((current) =>
                  current.map((item, position) =>
                    position === index ? { ...item, cost: event.target.value } : item,
                  ),
                )
              }
              className="w-28"
              aria-label="Coste"
            />
            {tiers.length > 1 ? (
              <button
                type="button"
                onClick={() => setTiers((current) => current.filter((_, p) => p !== index))}
                className="text-sm text-rose-600 hover:underline dark:text-rose-400"
              >
                Quitar
              </button>
            ) : null}
          </div>
        ))}

        <Button
          onClick={() =>
            setTiers((current) => [
              ...current,
              { qty: String(current.length + 1), cost: "" },
            ])
          }
        >
          Añadir tramo
        </Button>
      </div>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveZoneAction(storeId, {
                name,
                countries: countries
                  .split(",")
                  .map((code) => code.trim().toUpperCase())
                  .filter(Boolean),
                isDefault,
                dropshipping,
                tiers: tiers.map((tier) => ({ qty: Number(tier.qty), cost: Number(tier.cost) })),
              });

              if (!result.ok) setError(result.message);
              else onDone();
            })
          }
        >
          {isPending ? "Guardando…" : "Guardar zona"}
        </Button>
        <Button onClick={onDone}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ---------------------------- Comisiones ---------------------------------- */

export interface GatewayRow {
  gateway: string;
  orders: number;
  percent: number;
  fixed: number;
  /** Lo que cobra por encima de su tarifa: divisa, antifraude, lo que sea. */
  extraPercent: number;
  extraFixed: number;
}

export function GatewayEditor({
  storeId,
  gateways,
}: {
  storeId: string;
  gateways: GatewayRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      gateways.map((row) => [
        row.gateway,
        {
          percent: String(row.percent),
          fixed: String(row.fixed),
          extraPercent: String(row.extraPercent),
          extraFixed: String(row.extraFixed),
        },
      ]),
    ),
  );

  if (gateways.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        La lista sale de los pedidos sincronizados. En cuanto cobres por una pasarela aparecerá aquí
        pidiendo su comisión.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-3 py-2 text-left font-medium">Pasarela</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-400">
                Pedidos
              </th>
              <th className="px-3 py-2 text-right font-medium">%</th>
              <th className="px-3 py-2 text-right font-medium">Fijo por pedido</th>
              {/*
                El extra va en columnas propias y no sumado al porcentaje.

                Un 3,4 % que en realidad son 2,9 de tarifa más 0,5 de divisa es
                imposible de revisar seis meses después: lo que se acaba
                haciendo es volver a mirarlo en la factura. Separado se
                comprueba de un vistazo.
              */}
              <th className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-400">
                % extra
              </th>
              <th className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-400">
                Fijo extra
              </th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {gateways.map((row) => {
              const values = draft[row.gateway] ?? {
                percent: "0",
                fixed: "0",
                extraPercent: "0",
                extraFixed: "0",
              };
              const zero = Number(values.percent) === 0 && Number(values.fixed) === 0;

              return (
                <tr
                  key={row.gateway}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-3 py-2">
                    <span className={zero ? "text-amber-700 dark:text-amber-400" : ""}>
                      {row.gateway}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {row.orders}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TextField
                      type="number"
                      step="0.01"
                      min="0"
                      value={values.percent}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [row.gateway]: { ...values, percent: event.target.value },
                        }))
                      }
                      className="w-24 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TextField
                      type="number"
                      step="0.01"
                      min="0"
                      value={values.fixed}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [row.gateway]: { ...values, fixed: event.target.value },
                        }))
                      }
                      className="w-28 text-right"
                    />
                  </td>

                  <td className="px-3 py-2 text-right">
                    <TextField
                      type="number"
                      step="0.01"
                      min="0"
                      value={values.extraPercent}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [row.gateway]: { ...values, extraPercent: event.target.value },
                        }))
                      }
                      className="w-24 text-right"
                    />
                  </td>

                  <td className="px-3 py-2 text-right">
                    <TextField
                      type="number"
                      step="0.01"
                      min="0"
                      value={values.extraFixed}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [row.gateway]: { ...values, extraFixed: event.target.value },
                        }))
                      }
                      className="w-24 text-right"
                    />
                  </td>

                  {/*
                    Lo que de verdad se resta, ya sumado.

                    Es lo que hace que separar tarifa y extra no salga caro: el
                    número que entra en el beneficio se ve sin sumarlo de
                    cabeza, que es justo lo que nadie hace.
                  */}
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {(Number(values.percent) + Number(values.extraPercent) || 0).toFixed(2)}% +{" "}
                    {(Number(values.fixed) + Number(values.extraFixed) || 0).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button
        variant="primary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await saveGatewayFeesAction(
              storeId,
              Object.entries(draft).map(([gateway, values]) => ({
                gateway,
                percent: Number(values.percent) || 0,
                fixed: Number(values.fixed) || 0,
                extraPercent: Number(values.extraPercent) || 0,
                extraFixed: Number(values.extraFixed) || 0,
              })),
            );
            router.refresh();
          })
        }
      >
        {isPending ? "Guardando…" : "Guardar comisiones"}
      </Button>
    </div>
  );
}

/* --------------------------- Costos propios -------------------------------- */

const BASIS_LABELS: Record<CustomCost["basis"], string> = {
  ingresos: "de los ingresos",
  "ventas-brutas": "de las ventas brutas",
  "beneficio-bruto": "del beneficio bruto",
  "gasto-publicitario": "del gasto publicitario",
};

const REPEAT_LABELS: Record<CustomCost["repeat"], string> = {
  ninguno: "una vez",
  diario: "cada día",
  semanal: "cada semana",
  mensual: "cada mes",
  anual: "cada año",
};

export function CustomCostEditor({
  storeId,
  costs,
  currency,
  today,
}: {
  storeId: string;
  costs: CustomCost[];
  currency: string;
  today: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {costs.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sueldos, herramientas, la cuota de Shopify. Los fijos se reparten entre los días de su
          periodo, así que el beneficio diario sale correcto en vez de hundirse el día 1 de cada mes.
        </p>
      ) : (
        <ul className="space-y-2">
          {costs.map((cost) => (
            <li
              key={cost.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <div>
                <p className="font-medium">
                  {cost.name}
                  {cost.category ? (
                    <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                      {cost.category}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-300">
                  {cost.kind === "fijo"
                    ? `${cost.amount} ${currency}`
                    : `${cost.amount}% ${BASIS_LABELS[cost.basis]}`}
                  <span className="text-slate-500 dark:text-slate-400">
                    {" · "}
                    {REPEAT_LABELS[cost.repeat]} · {cost.startsOn} a {cost.endsOn}
                  </span>
                </p>
                {cost.inLtvCac ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    cuenta como coste de adquisición
                  </p>
                ) : null}
              </div>

              <Button
                onClick={async () => {
                  if (!window.confirm(`¿Borrar «${cost.name}»?`)) return;
                  await deleteCustomCostAction(cost.id);
                  router.refresh();
                }}
              >
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <CustomCostForm
            storeId={storeId}
            today={today}
            currency={currency}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        </div>
      ) : (
        <Button onClick={() => setAdding(true)}>Añadir costo</Button>
      )}
    </div>
  );
}

function CustomCostForm({
  storeId,
  today,
  currency,
  onDone,
}: {
  storeId: string;
  today: string;
  currency: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CustomCost["kind"]>("fijo");
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState<CustomCost["basis"]>("ingresos");
  const [category, setCategory] = useState("");
  const [startsOn, setStartsOn] = useState(today.slice(0, 8) + "01");
  const [endsOn, setEndsOn] = useState(today);
  const [repeat, setRepeat] = useState<CustomCost["repeat"]>("ninguno");
  const [inLtvCac, setInLtvCac] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</span>
          <TextField
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cuota de Shopify"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</span>
          <TextField
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Herramientas"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo</span>
          <SelectField
            value={kind}
            onChange={(event) => setKind(event.target.value as CustomCost["kind"])}
          >
            <option value="fijo">Importe fijo</option>
            <option value="variable">Porcentaje</option>
          </SelectField>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {kind === "fijo" ? `Importe en ${currency}` : "Porcentaje"}
          </span>
          <TextField
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        {kind === "variable" ? (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Sobre qué</span>
            <SelectField
              value={basis}
              onChange={(event) => setBasis(event.target.value as CustomCost["basis"])}
            >
              {Object.entries(BASIS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Desde</span>
          <TextField
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Hasta</span>
          <TextField
            type="date"
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Se repite</span>
          <SelectField
            value={repeat}
            onChange={(event) => setRepeat(event.target.value as CustomCost["repeat"])}
          >
            {Object.entries(REPEAT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={inLtvCac}
          onChange={(event) => setInLtvCac(event.target.checked)}
          className="h-4 w-4"
        />
        Cuenta como coste de adquisición (entra en el CAC y en la relación LTV:CAC)
      </label>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveCustomCostAction(storeId, {
                name,
                kind,
                amount: Number(amount),
                basis,
                category,
                startsOn,
                endsOn,
                repeat,
                inLtvCac,
              });

              if (!result.ok) setError(result.message);
              else onDone();
            })
          }
        >
          {isPending ? "Guardando…" : "Guardar costo"}
        </Button>
        <Button onClick={onDone}>Cancelar</Button>
      </div>
    </div>
  );
}
