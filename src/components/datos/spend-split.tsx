import type { AccountCoverage } from "@/lib/data/analytics";
import { isClean } from "@/lib/spend-coverage";

/**
 * A qué tienda va el gasto de cada cuenta publicitaria.
 *
 * ## Qué se está mirando aquí
 *
 * Los filtros por nombre de campaña reparten el gasto de una cuenta que sirve a
 * varias tiendas. Funcionan, pero nadie comprobaba que el reparto **cubra todo
 * y no se pise**, y los dos fallos son invisibles en cualquier informe:
 *
 * - Una campaña que no encaja en ninguna tienda desaparece de todos ellos. El
 *   beneficio sale más alto que el real, sin ningún error.
 * - Una que encaja en dos se resta del beneficio de las dos, y la suma no cuadra
 *   con la factura.
 *
 * Por eso esto se enseña **por cuenta**: solo se ve teniendo delante todas las
 * tiendas que la usan a la vez.
 */

const money = (value: number) =>
  value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SpendSplit({ accounts }: { accounts: AccountCoverage[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Todavía no hay gasto sincronizado en este rango.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((account) => {
        const clean = isClean(account.result);

        return (
          <div
            key={`${account.provider}:${account.externalId}`}
            className={`rounded-2xl border p-4 ${
              clean
                ? "border-slate-200 dark:border-slate-800"
                : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
            }`}
          >
            <p className="font-medium">
              {account.accountName}
              <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                {account.provider === "facebook" ? "Meta" : "Google"} · {account.externalId} ·{" "}
                {money(account.result.total)} en total
              </span>
            </p>

            {/* Lo que se lleva cada tienda, que es lo que acaba en su beneficio. */}
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {account.result.byStore.map((store) => (
                <li
                  key={store.storeId}
                  className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800"
                >
                  {store.storeName}: <span className="font-medium">{money(store.spend)}</span>
                </li>
              ))}
            </ul>

            {clean ? (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                Todo el gasto tiene una tienda y solo una.
              </p>
            ) : null}

            {/*
              Sin dueño: ese dinero no aparece en ningún informe, así que el
              beneficio de todas las tiendas sale más alto del real.
            */}
            {account.result.orphans.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {money(account.result.unassigned)} sin ninguna tienda
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Este gasto no sale en ningún informe, así que el beneficio aparece más alto del
                  real. Añade su nombre al filtro de la tienda que lo paga.
                </p>

                <ul className="mt-1 space-y-0.5 text-xs">
                  {account.result.orphans.slice(0, 8).map((campaign) => (
                    <li key={campaign.name} className="flex justify-between gap-3">
                      <span className="truncate">{campaign.name}</span>
                      <span className="shrink-0 tabular-nums">{money(campaign.spend)}</span>
                    </li>
                  ))}
                </ul>

                {account.result.orphans.length > 8 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    y {account.result.orphans.length - 8} más
                  </p>
                ) : null}
              </div>
            ) : null}

            {/*
              Contado dos veces: cada tienda se lo resta de su beneficio, así
              que las dos salen peor de lo que son.
            */}
            {account.result.shared.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {money(account.result.doubled)} contados de más
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Estas campañas encajan en el filtro de más de una tienda y se restan del
                  beneficio de todas ellas. Afina los filtros para que cada una tenga un solo
                  dueño.
                </p>

                <ul className="mt-1 space-y-0.5 text-xs">
                  {account.result.shared.slice(0, 8).map((campaign) => (
                    <li key={campaign.name} className="flex justify-between gap-3">
                      <span className="truncate">
                        {campaign.name}
                        <span className="ml-2 text-slate-500 dark:text-slate-400">
                          {campaign.stores.map((store) => store.storeName).join(" + ")}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{money(campaign.spend)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
