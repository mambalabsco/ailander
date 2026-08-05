import "server-only";

import { shopifyGraphql } from "@/lib/shopify";
import type { Store } from "@/types/store";

/**
 * El coste por unidad que ya está cargado en Shopify.
 *
 * ## Por qué se pregunta por variante y no se lee del pedido
 *
 * Porque el pedido no lo trae. Shopify guarda el coste en el **artículo de
 * inventario** de cada variante, no en la línea del pedido: es un dato de hoy,
 * no de cuando se vendió. Traerlo dentro de la consulta de pedidos daría a
 * entender que es el coste histórico de esa venta, y no lo es.
 *
 * Aquí se pide aparte y se guarda como una regla más, que es lo que de verdad
 * es: el coste que se aplica de ahora en adelante.
 *
 * ## Lo que no hace
 *
 * No pisa un coste puesto a mano. Quien lo ajustó sabía algo que el inventario
 * no sabe —un precio de proveedor que ya incluye el envío, un coste negociado—
 * y sobrescribirlo no daría error: devolvería el beneficio a un número
 * plausible y distinto sin que nadie se enterara. Esa decisión vive en quien
 * llama, que es el único que sabe qué reglas son manuales.
 */

export interface VariantCost {
  variantRef: string;
  productRef: string;
  label: string;
  /** En la moneda de la tienda. */
  amount: number;
}

/*
 * Se piden de cien en cien por identificador.
 *
 * `nodes(ids:)` acepta hasta 250, pero el coste de una consulta en Shopify se
 * paga en puntos y las variantes con su artículo de inventario son caras: con
 * doscientas cincuenta, un catálogo grande empieza a chocar contra el límite y
 * la respuesta llega a medias. Cien va sobrado y no se acerca.
 */
const BATCH = 100;

const QUERY = `query VariantCosts($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      title
      product { id title }
      inventoryItem { unitCost { amount } }
    }
  }
}`;

interface VariantNode {
  id?: string;
  title?: string | null;
  product?: { id?: string; title?: string | null } | null;
  inventoryItem?: { unitCost?: { amount?: string | null } | null } | null;
}

/**
 * Los costes de las variantes que se le pidan.
 *
 * Las que no tienen coste cargado **no salen en la lista**. Devolverlas con
 * cero las guardaría como «esta variante cuesta cero», que es indistinguible de
 * un producto regalado y hace que el beneficio salga completo cuando no lo está
 * — el aviso de «variantes sin coste» del panel dejaría de aparecer justo
 * cuando más falta hace.
 */
export async function readVariantCosts(
  store: Store,
  variantRefs: string[],
): Promise<VariantCost[]> {
  const ids = [...new Set(variantRefs.filter(Boolean))];
  const found: VariantCost[] = [];

  for (let at = 0; at < ids.length; at += BATCH) {
    const data = await shopifyGraphql<{ nodes: (VariantNode | null)[] }>(store, QUERY, {
      ids: ids.slice(at, at + BATCH),
    });

    for (const node of data.nodes ?? []) {
      if (!node?.id) continue;

      const raw = node.inventoryItem?.unitCost?.amount;
      if (raw === null || raw === undefined || raw === "") continue;

      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      found.push({
        variantRef: node.id,
        productRef: node.product?.id ?? "",
        label: [node.product?.title, node.title].filter(Boolean).join(" · ") || node.id,
        amount,
      });
    }
  }

  return found;
}
