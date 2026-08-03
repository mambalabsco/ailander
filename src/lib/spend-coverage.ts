/**
 * A qué tienda va cada campaña, y qué se queda sin dueño o con dos.
 *
 * Sin imports, probado en `spend-coverage.test.ts`.
 *
 * ## Qué problema resuelve
 *
 * Una cuenta publicitaria casi nunca es de una sola tienda: la misma cuenta
 * lleva las campañas de México, las de Chile y las de un producto que ya no se
 * vende. Los filtros por nombre de campaña reparten ese gasto, y funcionan.
 *
 * Lo que no había era forma de saber si el reparto **cubre todo y no se pisa**.
 * Y los dos fallos son silenciosos:
 *
 * - **Gasto sin dueño.** Una campaña nueva que no encaja en el filtro de
 *   ninguna tienda desaparece de todos los informes. No da error: el beneficio
 *   sale más alto que el real, que es exactamente el número que uno quiere
 *   creerse.
 * - **Gasto contado dos veces.** Si una tienda incluye «naturox» y otra incluye
 *   «mx», la campaña «Naturox MX» se resta del beneficio de las dos. Las dos
 *   salen peor de lo que son y la suma no cuadra con la factura de Meta.
 *
 * Ninguno de los dos se ve mirando un informe. Se ven comparando la factura con
 * la suma de las tiendas, que es justo lo que hace esto.
 */

export interface Campaign {
  name: string;
  spend: number;
}

export interface StoreFilters {
  storeId: string;
  storeName: string;
  include: string[];
  exclude: string[];
}

/**
 * Si esa campaña entra en ese filtro.
 *
 * Incluir primero y excluir después. Ese orden permite «todo lo de México menos
 * la campaña vieja» con dos reglas en vez de veinte, que es como la gente piensa
 * estos filtros. Por subcadena y sin distinguir mayúsculas: los nombres reales
 * son cosas como `220326_MX_NATUROX - Copia` y pedir la cadena exacta obligaría
 * a mantener el filtro cada vez que alguien duplica una campaña.
 */
export function matches(name: string, include: string[], exclude: string[]): boolean {
  const lower = name.toLowerCase();
  const clean = (list: string[]) => list.map((item) => item.trim().toLowerCase()).filter(Boolean);

  const includes = clean(include);
  const excludes = clean(exclude);

  if (includes.length > 0 && !includes.some((item) => lower.includes(item))) return false;
  if (excludes.some((item) => lower.includes(item))) return false;

  return true;
}

export interface CampaignVerdict {
  name: string;
  spend: number;
  /** Las tiendas que se lo quedan. Cero es huérfana; dos o más, repartida mal. */
  stores: { storeId: string; storeName: string }[];
}

export interface Coverage {
  /** El gasto total de la cuenta en el rango, venga de donde venga. */
  total: number;
  /** Lo que se queda cada tienda. */
  byStore: { storeId: string; storeName: string; spend: number }[];
  /** Campañas que no encajan en ninguna tienda. Su gasto no sale en ningún informe. */
  orphans: CampaignVerdict[];
  /** Campañas que encajan en más de una. Su gasto se resta dos veces. */
  shared: CampaignVerdict[];
  /** Cuánto gasto no aparece en ningún informe. */
  unassigned: number;
  /** Cuánto se está contando de más entre todas las tiendas. */
  doubled: number;
}

/**
 * Reparte el gasto de una cuenta entre las tiendas que la usan.
 *
 * `doubled` cuenta el exceso, no el total repetido: una campaña de 100 en dos
 * tiendas sobra 100 —se cuenta 200 donde debería contar 100—, y en tres sobran
 * 200. Es lo que hay que restar para cuadrar con la factura.
 */
export function coverage(input: { campaigns: Campaign[]; stores: StoreFilters[] }): Coverage {
  const byStore = new Map(
    input.stores.map((store) => [store.storeId, { ...store, spend: 0 }]),
  );

  const orphans: CampaignVerdict[] = [];
  const shared: CampaignVerdict[] = [];

  let total = 0;
  let unassigned = 0;
  let doubled = 0;

  for (const campaign of input.campaigns) {
    total += campaign.spend;

    const owners = input.stores.filter((store) =>
      matches(campaign.name, store.include, store.exclude),
    );

    for (const owner of owners) {
      const entry = byStore.get(owner.storeId);
      if (entry) entry.spend += campaign.spend;
    }

    const verdict: CampaignVerdict = {
      name: campaign.name,
      spend: campaign.spend,
      stores: owners.map((owner) => ({ storeId: owner.storeId, storeName: owner.storeName })),
    };

    if (owners.length === 0) {
      orphans.push(verdict);
      unassigned += campaign.spend;
    } else if (owners.length > 1) {
      shared.push(verdict);
      doubled += campaign.spend * (owners.length - 1);
    }
  }

  const round = (value: number) => Number(value.toFixed(2));

  return {
    total: round(total),
    byStore: [...byStore.values()]
      .map((entry) => ({
        storeId: entry.storeId,
        storeName: entry.storeName,
        spend: round(entry.spend),
      }))
      .sort((a, b) => b.spend - a.spend),
    // Lo caro primero: es lo que hay que arreglar antes.
    orphans: orphans.sort((a, b) => b.spend - a.spend),
    shared: shared.sort((a, b) => b.spend - a.spend),
    unassigned: round(unassigned),
    doubled: round(doubled),
  };
}

/**
 * Si el reparto de esa cuenta está bien.
 *
 * Con un margen: un gasto de céntimos sin asignar es una campaña de prueba
 * apagada hace meses, y avisar de eso enseña a ignorar el aviso.
 */
export function isClean(result: Coverage, tolerance = 1): boolean {
  return result.unassigned <= tolerance && result.doubled <= tolerance;
}
