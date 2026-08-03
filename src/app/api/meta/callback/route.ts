import { NextResponse } from "next/server";
import { requireContext } from "@/lib/supabase/session";
import { siteOrigin } from "@/lib/site-url";
import { exchangeCode, META_SCOPES } from "@/lib/meta-oauth";
import { peekStore, pickAppConfig, readState } from "@/lib/meta-app";
import { listAccounts } from "@/lib/meta-ads";
import { readAdCredentials, saveAdAccount, saveAdCredentials } from "@/lib/data/analytics";
import { logError } from "@/lib/data/errors";

/**
 * Vuelta del diálogo de Facebook.
 *
 * Termina siempre en la pantalla de conexiones con un mensaje en la URL, nunca en
 * una página de error en blanco: quien acaba de autorizar espera volver a donde
 * estaba, y un JSON crudo en el navegador parece que se rompió todo.
 */

export const dynamic = "force-dynamic";

function back(origin: string, storeId: string, params: Record<string, string>): NextResponse {
  const url = new URL(`${origin}/datos/conexiones`);
  if (storeId) url.searchParams.set("tienda", storeId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  await requireContext();

  const origin = await siteOrigin();
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const denied = url.searchParams.get("error");

  /*
   * Primero la tienda, luego su app, y con ella se comprueba la firma.
   *
   * La tienda sale del `state` sin verificar, que es seguro porque solo elige
   * con qué llave comprobar: una tienda inventada carga otro secreto y la firma
   * deja de cuadrar. Ver `peekStore`.
   */
  const app = pickAppConfig(await readAdCredentials(peekStore(state), "facebook"));
  if (!app) return back(origin, "", { meta: "sin-configurar" });

  /*
   * El `state` se comprueba **antes** de mirar cualquier otra cosa.
   *
   * Es lo que impide que alguien te haga abrir un enlace de retorno preparado por
   * él y acabe conectando sus cuentas publicitarias a tu tienda.
   */
  const verified = readState(state, app.appSecret);
  if (!verified) return back(origin, "", { meta: "estado-invalido" });

  const storeId = verified.storeId;

  // Cancelar en el diálogo no es un error: es una decisión, y se dice así.
  if (denied || !code) {
    return back(origin, storeId, {
      meta: "cancelado",
      detalle: url.searchParams.get("error_description") ?? "",
    });
  }

  try {
    const token = await exchangeCode({
      app,
      code,
      redirectUri: `${origin}/api/meta/callback`,
    });

    /*
     * Se comprueba que `ads_read` se concedió de verdad.
     *
     * En el diálogo de Meta los permisos se pueden desmarcar uno por uno. Sin
     * esta comprobación la conexión se guardaría como buena y el fallo aparecería
     * más tarde, al sincronizar, como un 403 sin relación aparente con lo que se
     * hizo aquí.
     *
     * **Solo se bloquea si Meta declara la lista y falta algo.** Con Login for
     * Business los permisos vienen de la configuración y `/debug_token` a veces
     * devuelve la lista vacía; tratar eso como «faltan permisos» rechazaría una
     * conexión perfectamente válida, que es peor que dejar pasar un 403 después.
     */
    const missing = token.scopes.length
      ? META_SCOPES.filter((scope) => !token.scopes.includes(scope))
      : [];

    if (missing.length > 0) {
      return back(origin, storeId, { meta: "sin-permiso", detalle: missing.join(", ") });
    }

    await saveAdCredentials(storeId, "facebook", {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      scopes: token.scopes,
      accountName: token.userName ?? undefined,
    });

    /*
     * Las cuentas se dan de alta **desactivadas**.
     *
     * Un usuario de Meta suele ver decenas de cuentas: de varias tiendas, de
     * clientes antiguos. Activarlas todas restaría de golpe el gasto de todas
     * ellas del beneficio de esta tienda, y el número saldría catastrófico sin
     * ninguna pista de por qué.
     */
    const accounts = await listAccounts(token.accessToken);
    for (const account of accounts) {
      await saveAdAccount({
        storeId,
        provider: "facebook",
        externalId: account.externalId,
        name: account.name,
        currency: account.currency,
        businessId: account.businessId,
        businessName: account.businessName,
        active: false,
      });
    }

    return back(origin, storeId, { meta: "conectada", cuentas: String(accounts.length) });
  } catch (error) {
    await logError({ context: "meta:callback", error, detail: { storeId } });

    return back(origin, storeId, {
      meta: "error",
      detalle: error instanceof Error ? error.message : "no se pudo conectar",
    });
  }
}
