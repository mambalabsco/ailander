import "server-only";

import { cache } from "react";
import {
  listAdAccounts,
  readCostSettings,
  readOrdersForRange,
  readSpendForRange,
} from "@/lib/data/analytics";
import { listStores } from "@/lib/store-registry";
import {
  bucketRows,
  dailyRows,
  kpis,
  sumRows,
  type CostSettings,
  type DayRow,
  type Grain,
  type Kpis,
  type Totals,
} from "@/lib/profit";
import {
  isPreset,
  previousRange,
  resolveRange,
  todayIn,
  type DateRange,
  type RangePreset,
} from "@/lib/date-range";
import type { Store } from "@/types/store";

/**
 * Carga de informes: lo que comparten todas las pestañas de Datos.
 *
 * Va envuelto en `cache()` de React para que la cabecera con los indicadores y
 * la tabla de abajo, que son dos componentes distintos, no hagan cada uno su
 * propia ronda de consultas. Dentro de una misma petición se calcula una vez.
 */

/** Sin tienda conectada no hay nada que enseñar, y hay que decirlo sin romper. */
export interface ReportContext {
  stores: Store[];
  store: Store | null;
  currency: string;
  timeZone: string;
  today: string;
  preset: RangePreset;
  range: DateRange;
  comparison: DateRange;
}

/**
 * Resuelve tienda y rango a partir de la URL.
 *
 * Todo el estado del informe vive en la barra de direcciones —la tienda, el
 * rango, el grano— y no en el estado de un componente. Así un informe se puede
 * marcar, compartir y recargar sin perder lo que estabas mirando, y las seis
 * pestañas se navegan sin volver a elegir nada.
 */
export async function reportContext(params: {
  tienda?: string;
  rango?: string;
  desde?: string;
  hasta?: string;
}): Promise<ReportContext> {
  const stores = await listStores();
  const store = stores.find((item) => item.id === params.tienda) ?? stores[0] ?? null;

  /*
   * Cuando la tienda todavía no se ha sincronizado no se sabe su moneda ni su
   * zona. Se cae a UTC y a dólares **y la interfaz lo dice**: enseñar «€» sobre
   * importes en pesos sería peor que enseñar un aviso.
   */
  const currency = store?.shopCurrency || "USD";
  const timeZone = store?.shopTimeZone || "UTC";

  const today = todayIn(timeZone);
  const preset: RangePreset = isPreset(params.rango) ? params.rango : "30d";
  const range = resolveRange(preset, today, { from: params.desde, to: params.hasta });

  return {
    stores,
    store,
    currency,
    timeZone,
    today,
    preset,
    range,
    comparison: previousRange(range, preset),
  };
}

export interface Report {
  rows: DayRow[];
  totals: Totals;
  kpis: Kpis;
  previous: Kpis;
  settings: CostSettings;
  /** Cuántas cuentas publicitarias hay activas: sin ninguna, el ROAS no existe. */
  activeAccounts: number;
}

/**
 * El informe completo de una tienda en un rango, con su periodo de comparación.
 *
 * El periodo anterior se calcula entero, no solo su total: cuesta lo mismo y
 * permite que cualquier indicador enseñe su variación sin pedir nada más.
 */
export const loadReport = cache(
  async (
    storeId: string,
    range: DateRange,
    comparison: DateRange,
    shop: { currency: string; timeZone: string },
  ): Promise<Report> => {
    const settings = await readCostSettings(storeId, shop);

    /*
     * Se pide el rango unido —desde el principio de la comparación hasta el
     * final del actual— en **una** consulta, y se parte después. Dos consultas
     * traerían dos veces la configuración y doblarían la latencia por nada.
     */
    const from = comparison.from < range.from ? comparison.from : range.from;
    const to = comparison.to > range.to ? comparison.to : range.to;

    const [orders, spend, accounts] = await Promise.all([
      readOrdersForRange(storeId, from, to),
      // A la moneda del panel: sin esto se sumaban dólares y pesos como si
      // fueran lo mismo, y el beneficio salía disparado.
      readSpendForRange(storeId, from, to, shop.currency),
      listAdAccounts(storeId),
    ]);

    const current = dailyRows({ orders, spend, settings, from: range.from, to: range.to });
    const before = dailyRows({
      orders,
      spend,
      settings,
      from: comparison.from,
      to: comparison.to,
    });

    const totals = sumRows(current);

    return {
      rows: current,
      totals,
      kpis: kpis(totals),
      previous: kpis(sumRows(before)),
      settings,
      activeAccounts: accounts.filter((account) => account.active).length,
    };
  },
);

/** El grano de la tabla de pérdidas y ganancias, también desde la URL. */
export function grainFrom(value: string | undefined, days: number): Grain {
  if (value === "diario" || value === "semanal" || value === "mensual") return value;

  /*
   * Por defecto, el grano que quepa: un año en columnas diarias son 365 columnas
   * que nadie puede leer, y un solo día en columnas mensuales es una columna.
   */
  if (days <= 14) return "diario";
  if (days <= 120) return "semanal";
  return "mensual";
}

export { bucketRows };
