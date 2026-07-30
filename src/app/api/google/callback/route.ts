import { NextResponse } from "next/server";
import { requireContext } from "@/lib/supabase/session";
import { siteOrigin } from "@/lib/site-url";
import { appConfig, exchangeCode, readState } from "@/lib/google-oauth";
import { listAccounts } from "@/lib/google-ads";
import { readAdCredentials, saveAdAccount, saveAdCredentials } from "@/lib/data/analytics";
import { logError } from "@/lib/data/errors";

/** Vuelta del diálogo de Google. */

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

  const app = appConfig();
  if (!app) return back(origin, "", { google: "sin-configurar" });

  const verified = readState(state, app.clientSecret);
  if (!verified) return back(origin, "", { google: "estado-invalido" });

  const storeId = verified.storeId;

  if (denied || !code) return back(origin, storeId, { google: "cancelado" });

  try {
    const token = await exchangeCode({
      app,
      code,
      redirectUri: `${origin}/api/google/callback`,
    });

    /*
     * El developer token se conserva si ya estaba.
     *
     * No viene del login —lo aprueba una persona en Google— y guardar el permiso
     * nuevo sin él lo borraría, dejando la conexión autorizada y a la vez
     * inservible. Es el tipo de regresión que solo se nota al sincronizar.
     */
    const previous = await readAdCredentials(storeId, "google");

    await saveAdCredentials(storeId, "google", {
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      refreshToken: token.refreshToken,
      developerToken: app.developerToken ?? previous?.developerToken,
      loginCustomerId: previous?.loginCustomerId,
      accountName: token.email ?? undefined,
      // El refresh token de Google no caduca con la app publicada, así que no
      // hay fecha que guardar. Nulo significa exactamente eso.
      expiresAt: null,
    });

    /*
     * Listar las cuentas puede fallar y no es motivo para descartar el permiso.
     *
     * Es justo lo que pasa cuando el developer token todavía está en acceso de
     * prueba: el login fue bien y la consulta devuelve 403. Guardado el permiso,
     * en cuanto Google apruebe el token todo funciona sin volver a autorizar.
     */
    let count = 0;
    let warning = "";

    try {
      const credentials = {
        clientId: app.clientId,
        clientSecret: app.clientSecret,
        refreshToken: token.refreshToken,
        developerToken: app.developerToken ?? previous?.developerToken,
        loginCustomerId: previous?.loginCustomerId,
      };

      const accounts = await listAccounts(credentials);
      count = accounts.length;

      for (const account of accounts) {
        await saveAdAccount({
          storeId,
          provider: "google",
          externalId: account.externalId,
          name: account.name,
          currency: account.currency,
          active: false,
        });
      }
    } catch (error) {
      warning = error instanceof Error ? error.message : "no se pudieron listar las cuentas";
    }

    return back(origin, storeId, {
      google: warning ? "conectada-sin-cuentas" : "conectada",
      cuentas: String(count),
      ...(warning ? { detalle: warning } : {}),
    });
  } catch (error) {
    await logError({ context: "google:callback", error, detail: { storeId } });

    return back(origin, storeId, {
      google: "error",
      detalle: error instanceof Error ? error.message : "no se pudo conectar",
    });
  }
}
