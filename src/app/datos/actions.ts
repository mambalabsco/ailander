"use server";

import { revalidatePath } from "next/cache";
import { runInBackground } from "@/lib/background";
import { findStore } from "@/lib/store-registry";
import { updateStore } from "@/lib/data/stores";
import { gatewaysIn, readOrders, readShopProfile } from "@/lib/shopify-orders";
import * as meta from "@/lib/meta-ads";
import * as google from "@/lib/google-ads";
import {
  deleteCustomCost,
  deleteShippingZone,
  gatewaysInUse,
  listAdAccounts,
  readAdCredentials,
  refreshAdToken,
  saveAdCredentials,
  saveCogs,
  saveCustomCost,
  saveGatewayFees,
  saveOrders,
  saveShippingZone,
  saveSpend,
  setAccountActive,
  setAccountFilters,
  setLoginCustomerId,
} from "@/lib/data/analytics";
import * as metaOauth from "@/lib/meta-oauth";
import { requireCapability } from "@/lib/permissions";
import { clearFinishedJobs } from "@/lib/data/jobs";
import type { LaunchResult } from "@/types/jobs";

/**
 * Acciones del panel de datos.
 *
 * **En un archivo `"use server"` cada exportación se convierte en una acción.**
 * Exportar un tipo desde aquí compila y falla en ejecución con «X is not
 * defined», porque el compilador lo borra y el registro de acciones se queda
 * apuntando a nada. Ya pasó una vez en este proyecto; los tipos se importan.
 */

/* ------------------------------ Sincronizar ------------------------------- */

/**
 * Trae los pedidos de Shopify y el gasto de las redes, en segundo plano.
 *
 * Va en segundo plano porque no es rápido: tres meses de una tienda con volumen
 * son cientos de peticiones paginadas a Shopify más una por cuenta publicitaria.
 * Con la pestaña abierta se cortaría a mitad y quedaría medio sincronizado, que
 * es peor que no sincronizado —el informe daría cifras bajas y creíbles—.
 *
 * Guarda por páginas y no al final: si falla la petición número ochenta, las
 * setenta y nueve anteriores ya están guardadas y la siguiente pasada solo repite
 * lo que falta.
 */
export async function syncStoreAction(
  storeId: string,
  from: string,
  to: string,
): Promise<LaunchResult> {
  const store = await findStore(storeId);
  if (!store) return { started: false, message: "No se encontró la tienda." };

  if (!store.shopifyAdminToken || !store.shopifyShopDomain) {
    return {
      started: false,
      message: `«${store.name}» no está conectada a Shopify. Conéctala en Tiendas antes de sincronizar.`,
    };
  }

  if (!from || !to || from > to) {
    return { started: false, message: "El rango de fechas no es válido." };
  }

  return runInBackground({
    kind: "datos",
    label: `${store.name} · ${from} a ${to}`,
    revalidate: "/datos",
    work: async () => {
      const notes: string[] = [];

      /*
       * Lo primero, la moneda y la zona horaria de la tienda.
       *
       * Es lo que decide en qué moneda están todos los importes y a qué día
       * pertenece cada pedido, así que se refresca antes de traer nada: guardar
       * pedidos y después descubrir que la tienda liquida en otra moneda dejaría
       * un informe coherente y equivocado.
       */
      const profile = await readShopProfile(store);
      await updateStore(storeId, {
        shopCurrency: profile.currency,
        shopTimeZone: profile.timeZone,
      });

      if (store.shopCurrency && store.shopCurrency !== profile.currency) {
        notes.push(`ojo: la moneda de la tienda cambió de ${store.shopCurrency} a ${profile.currency}`);
      }

      /* --- Pedidos --- */

      let orders = 0;
      let lines = 0;
      const gateways = new Set<string>();

      await readOrders(store, {
        from,
        to,
        onPage: async (page) => {
          const result = await saveOrders(storeId, page);
          orders += result.saved;
          lines += result.lines;
          for (const gateway of gatewaysIn(page)) gateways.add(gateway);
        },
      });

      notes.push(`${orders} pedidos, ${lines} líneas`);

      /*
       * Las pasarelas encontradas se dan de alta con comisión cero.
       *
       * Cero es honesto: la plataforma no puede saber lo que cobra cada pasarela
       * y adivinar un 2,9% daría un beneficio con una cifra inventada dentro. La
       * fila existiendo con cero es lo que hace que la interfaz pueda enseñarla
       * en rojo pidiendo el dato, en vez de que la pasarela sea invisible.
       */
      const existing = new Set(
        (await gatewaysInUse(storeId))
          .filter((item) => item.configured)
          .map((item) => item.gateway),
      );

      const missing = [...gateways].filter((gateway) => !existing.has(gateway));
      if (missing.length > 0) {
        await saveGatewayFees(
          storeId,
          missing.map((gateway) => ({ gateway, percent: 0, fixed: 0 })),
        );
        notes.push(`${missing.length} pasarela(s) nueva(s) sin comisión puesta`);
      }

      /* --- Gasto publicitario --- */

      const accounts = (await listAdAccounts(storeId)).filter((account) => account.active);
      let spendRows = 0;

      let facebook = await readAdCredentials(storeId, "facebook");
      const googleCreds = await readAdCredentials(storeId, "google");

      /*
       * Se intenta renovar el permiso de Meta antes de usarlo.
       *
       * El token de usuario dura unos sesenta días y **Meta no garantiza que el
       * re-canje amplíe el plazo**, así que esto es un intento, no una solución:
       * cuesta una llamada y a veces gana otros sesenta días. Lo que de verdad
       * protege es guardar la caducidad y que la interfaz avise —y por eso el
       * fallo aquí no interrumpe nada, solo se anota—.
       */
      if (facebook?.accessToken && metaOauth.shouldRenew(facebook.expiresAt ?? null)) {
        // La app de esta tienda: el re-canje tiene que ir contra la que emitió
        // el token, no contra la del entorno si son distintas.
        const app = metaOauth.pickAppConfig(facebook);

        if (app) {
          try {
            const renewed = await metaOauth.exchangeForLongLived(app, facebook.accessToken);
            await refreshAdToken(storeId, "facebook", renewed.accessToken, renewed.expiresAt);
            facebook = { ...facebook, accessToken: renewed.accessToken, expiresAt: renewed.expiresAt };

            const left = metaOauth.daysLeft(renewed.expiresAt);
            notes.push(
              left === null
                ? "permiso de Meta renovado"
                : `permiso de Meta renovado, ${left} día(s)`,
            );
          } catch {
            notes.push("no se pudo renovar el permiso de Meta: vuelve a iniciar sesión");
          }
        }
      }

      if (facebook?.accessToken && metaOauth.isExpired(facebook.expiresAt ?? null)) {
        // Se dice en vez de leer cero en silencio, que es el fallo que hace que
        // el beneficio se dispare sin motivo aparente.
        notes.push("el permiso de Meta caducó: el gasto de Meta no se ha traído");
      }

      for (const account of accounts) {
        try {
          if (account.provider === "facebook") {
            if (!facebook?.accessToken) continue;
            if (metaOauth.isExpired(facebook.expiresAt ?? null)) continue;
            const rows = await meta.readDailySpend(facebook.accessToken, account.externalId, {
              from,
              to,
            });
            spendRows += await saveSpend(account.id, rows);
          } else {
            if (!googleCreds?.refreshToken || !googleCreds.clientId || !googleCreds.clientSecret) {
              continue;
            }
            const rows = await google.readDailySpend(
              {
                clientId: googleCreds.clientId,
                clientSecret: googleCreds.clientSecret,
                refreshToken: googleCreds.refreshToken,
                developerToken: googleCreds.developerToken,
                loginCustomerId: googleCreds.loginCustomerId,
              },
              account.externalId,
              { from, to },
            );
            spendRows += await saveSpend(
              account.id,
              rows.map((row) => ({ ...row, currency: row.currency || account.currency })),
            );
          }
        } catch (error) {
          /*
           * Una cuenta que falla no tumba la sincronización de las demás.
           *
           * Es lo correcto aquí: los pedidos ya están guardados y el gasto de
           * las otras cuentas también. Se anota cuál falló y por qué, para que
           * el resumen del trabajo lo diga en vez de dar un total silenciosamente
           * incompleto.
           */
          notes.push(
            `${account.name}: ${error instanceof Error ? error.message : "no se pudo leer"}`,
          );
        }
      }

      if (accounts.length === 0) {
        notes.push("sin cuentas publicitarias conectadas");
      } else {
        notes.push(`${spendRows} filas de gasto`);
      }

      return { summary: notes.join(" · ") };
    },
  });
}

/* ------------------------------- Conexiones -------------------------------- */

/**
 * La cuenta administradora de Google.
 *
 * Es el único dato de conexión que se escribe a mano, y no es un secreto: es un
 * número visible en el panel de Google Ads. Todo lo demás —tokens y secretos—
 * viene del login y no pasa nunca por el navegador.
 */
export async function setLoginCustomerIdAction(
  storeId: string,
  value: string,
): Promise<void> {
  await setLoginCustomerId(storeId, value.trim());
  revalidatePath("/datos/conexiones");
}

/**
 * La app de Meta de esta tienda.
 *
 * Hace falta cuando hay más de un Business Manager: si cuelgan de perfiles de
 * Facebook distintos, Meta obliga a una app por perfil, y la de las variables de
 * entorno solo puede ser una. Con esto cada tienda apunta a la suya.
 *
 * **El secreto entra pero no sale.** Se escribe aquí y a la pantalla solo vuelve
 * si está puesto o no; leerlo de vuelta sería enseñarlo en el navegador de quien
 * abra la página.
 */
export async function saveMetaAppAction(
  storeId: string,
  appId: string,
  appSecret: string,
  configId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await requireCapability("secretos");

    const id = appId.trim();
    const secret = appSecret.trim();

    /*
     * Vaciar los dos a la vez es volver a la del entorno, y es legítimo.
     * Vaciar solo uno deja media configuración, que produce un diálogo de
     * Facebook que falla al canjear el código con un error que no dice cuál de
     * las dos mitades falta.
     */
    if (!id && !secret) {
      await saveAdCredentials(storeId, "facebook", {
        clientId: "",
        clientSecret: "",
        configId: "",
      });

      revalidatePath("/datos/conexiones");
      return { ok: true, message: "Quitada. Esta tienda vuelve a usar la app por defecto." };
    }

    if (!id || !secret) {
      return { ok: false, message: "Hacen falta el identificador y el secreto, o ninguno de los dos." };
    }

    await saveAdCredentials(storeId, "facebook", {
      clientId: id,
      clientSecret: secret,
      configId: configId.trim(),
    });

    revalidatePath("/datos/conexiones");

    return {
      ok: true,
      message: "App guardada. Vuelve a iniciar sesión con Facebook para conectarla con esa app.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar." };
  }
}

export async function setFiltersAction(
  accountId: string,
  include: string[],
  exclude: string[],
): Promise<void> {
  await setAccountFilters(
    accountId,
    include.map((item) => item.trim()).filter(Boolean),
    exclude.map((item) => item.trim()).filter(Boolean),
  );
  revalidatePath("/datos");
}

export async function toggleAccountAction(accountId: string, active: boolean): Promise<void> {
  await setAccountActive(accountId, active);
  revalidatePath("/datos");
}

/* --------------------------------- Costos ---------------------------------- */

export async function saveCogsAction(
  storeId: string,
  rows: { productRef: string; variantRef: string; label: string; amount: number }[],
): Promise<void> {
  await saveCogs(
    storeId,
    rows.filter((row) => Number.isFinite(row.amount) && row.amount >= 0),
  );
  revalidatePath("/datos");
}

export async function saveZoneAction(
  storeId: string,
  zone: {
    name: string;
    countries: string[];
    isDefault: boolean;
    tiers: { qty: number; cost: number }[];
  },
): Promise<{ ok: boolean; message: string }> {
  const name = zone.name.trim();
  if (!name) return { ok: false, message: "La zona necesita un nombre." };

  const tiers = zone.tiers
    .filter((tier) => Number.isFinite(tier.qty) && Number.isFinite(tier.cost) && tier.qty > 0)
    .sort((a, b) => a.qty - b.qty);

  if (tiers.length === 0) {
    return { ok: false, message: "Añade al menos un tramo con su cantidad y su coste." };
  }

  await saveShippingZone(storeId, {
    name,
    countries: zone.countries.map((code) => code.trim().toUpperCase()).filter(Boolean),
    isDefault: zone.isDefault,
    tiers,
  });

  revalidatePath("/datos");
  return { ok: true, message: `Zona «${name}» guardada.` };
}

export async function deleteZoneAction(storeId: string, name: string): Promise<void> {
  await deleteShippingZone(storeId, name);
  revalidatePath("/datos");
}

export async function saveGatewayFeesAction(
  storeId: string,
  fees: { gateway: string; percent: number; fixed: number }[],
): Promise<void> {
  await saveGatewayFees(
    storeId,
    fees.filter((fee) => fee.gateway && Number.isFinite(fee.percent) && Number.isFinite(fee.fixed)),
  );
  revalidatePath("/datos");
}

export async function saveCustomCostAction(
  storeId: string,
  cost: {
    id?: string;
    name: string;
    kind: "fijo" | "variable";
    amount: number;
    basis: "ingresos" | "ventas-brutas" | "beneficio-bruto" | "gasto-publicitario";
    category: string;
    startsOn: string;
    endsOn: string;
    repeat: "ninguno" | "diario" | "semanal" | "mensual" | "anual";
    inLtvCac: boolean;
  },
): Promise<{ ok: boolean; message: string }> {
  if (!cost.name.trim()) return { ok: false, message: "El costo necesita un nombre." };
  if (!cost.startsOn || !cost.endsOn || cost.startsOn > cost.endsOn) {
    return { ok: false, message: "El rango de fechas no es válido." };
  }
  if (!Number.isFinite(cost.amount)) return { ok: false, message: "El importe no es un número." };

  await saveCustomCost(storeId, { ...cost, name: cost.name.trim() });
  revalidatePath("/datos");
  return { ok: true, message: "Costo guardado." };
}

export async function deleteCustomCostAction(id: string): Promise<void> {
  await deleteCustomCost(id);
  revalidatePath("/datos");
}

/* --------------------------------- Trabajos -------------------------------- */

export async function clearDataJobsAction(): Promise<void> {
  await clearFinishedJobs(null);
  revalidatePath("/datos");
}

/**
 * La zona horaria y la moneda de la tienda, tal y como las declara Shopify.
 *
 * Se pregunta en vez de configurarse porque son suyas: la tienda mexicana
 * liquida en dólares aunque venda en pesos, y dejar que alguien escriba «MXN» en
 * un formulario haría que todos los informes mintieran de forma consistente.
 */
export async function readShopProfileAction(
  storeId: string,
): Promise<{ ok: boolean; currency?: string; timeZone?: string; message?: string }> {
  const store = await findStore(storeId);
  if (!store) return { ok: false, message: "No se encontró la tienda." };

  try {
    const profile = await readShopProfile(store);
    return { ok: true, currency: profile.currency, timeZone: profile.timeZone };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo consultar." };
  }
}
