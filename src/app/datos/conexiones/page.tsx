import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { DatosHeader } from "@/app/datos/header";
import {
  AccountList,
  CallbackMessage,
  GoogleConnect,
  MetaConnect,
} from "@/components/datos/connections";
import { reportContext } from "@/app/datos/report";
import {
  credentialsStatus,
  lastSyncedOrderDate,
  listAdAccounts,
  readAdCredentials,
  spendCoverage,
} from "@/lib/data/analytics";
import * as metaOauth from "@/lib/meta-oauth";
import { listMetaApps } from "@/lib/data/meta-apps";
import { listMetaLogins } from "@/lib/data/meta-logins";
import { SpendSplit } from "@/components/datos/spend-split";
import * as googleOauth from "@/lib/google-oauth";

/**
 * Conexiones de una tienda: Shopify, Meta y Google.
 *
 * Las tres se conectan iniciando sesión y **ninguna pide pegar un token**. Aparte
 * de ser más cómodo, es lo correcto: un token de anuncios pegado a mano pasa por
 * el portapapeles, por el historial del navegador y a veces por una captura de
 * pantalla o un chat. Un botón, no.
 *
 * Las credenciales son por tienda, igual que las de Shopify y por el mismo
 * motivo: quien lleva Naturox México y Naturox Chile tiene dos cuentas
 * publicitarias distintas, y unas credenciales globales mezclarían el gasto de
 * las dos en el beneficio de una.
 */

interface PageProps {
  searchParams: Promise<{
    tienda?: string;
    rango?: string;
    desde?: string;
    hasta?: string;
    meta?: string;
    google?: string;
    detalle?: string;
    cuentas?: string;
  }>;
}

export default async function ConexionesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await reportContext(params);
  const { store } = context;

  if (!store) return <DatosHeader context={context} synced={false} />;

  const [accounts, status, lastOrder, facebookCreds, split] = await Promise.all([
    listAdAccounts(store.id),
    credentialsStatus(store.id),
    lastSyncedOrderDate(store.id),
    readAdCredentials(store.id, "facebook"),
    // Del rango que esté mirando: el reparto se juzga sobre gasto de verdad.
    spendCoverage(context.range.from, context.range.to).catch(() => []),
  ]);

  /*
   * Las apps sin sus secretos.
   *
   * A la pantalla solo va lo que hace falta para elegir: el nombre y cuál es la
   * de por defecto. Un secreto aquí acabaría en el HTML de cualquiera que abra
   * esta página.
   */
  const [metaApps, metaLogins] = await Promise.all([
    listMetaApps().then((apps) =>
      apps.map((app) => ({ id: app.id, name: app.name, isDefault: app.isDefault })),
    ),
    listMetaLogins().then((logins) =>
      logins.map((login) => ({ id: login.id, name: login.name, isDefault: login.isDefault })),
    ),
  ]);

  const shopifyConnected = Boolean(store.shopifyAdminToken && store.shopifyShopDomain);
  const googleApp = googleOauth.appConfig();

  return (
    <div className="space-y-6">
      <DatosHeader context={context} synced={Boolean(lastOrder)} />

      {/* El resultado del login vuelve en la URL, no en un JSON crudo. */}
      {params.meta ? (
        <CallbackMessage
          status={params.meta}
          detail={params.detalle}
          accounts={params.cuentas}
        />
      ) : null}
      {params.google ? (
        <CallbackMessage
          status={params.google}
          detail={params.detalle}
          accounts={params.cuentas}
        />
      ) : null}

      <SectionCard
        title="Shopify"
        description="De aquí salen los pedidos: lo que entró de verdad, no lo que declara ninguna red publicitaria."
      >
        <div className="space-y-2 text-sm">
          <p>
            {shopifyConnected ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Conectada · {store.shopifyShopDomain}
              </span>
            ) : (
              <span className="text-rose-600 dark:text-rose-400">Sin conectar</span>
            )}
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            Moneda de liquidación: {store.shopCurrency ?? "sin averiguar"} · zona horaria:{" "}
            {store.shopTimeZone ?? "sin averiguar"}
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            Las dos las declara Shopify y se refrescan en cada sincronización. No son configurables a
            propósito: una tienda puede vender en pesos y liquidar en dólares, y escribirlo a mano
            haría que todos los informes mintieran igual.
          </p>
          <Link
            href="/stores"
            className="inline-block font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
          >
            Gestionar en Tiendas y mercados
          </Link>
        </div>
      </SectionCard>

      <SectionCard
        title="Meta Ads"
        description="Inicias sesión con Facebook y se pide solo permiso de lectura de anuncios. El permiso dura unos sesenta días —es un límite de Meta, no hay tokens permanentes de usuario— y aquí verás siempre cuántos quedan."
      >
        <MetaConnect
          storeId={store.id}
          state={status.facebook}
          configured={metaOauth.isConfigured()}
          apps={metaApps}
          chosenApp={facebookCreds?.metaAppId ?? ""}
          logins={metaLogins}
          chosenLogin={facebookCreds?.metaLoginId ?? ""}
        />
      </SectionCard>

      <SectionCard
        title="Google Ads"
        description="Inicias sesión con Google y el permiso es permanente. Aparte hace falta un developer token, que se pide en Google y lo aprueba una persona: eso no lo resuelve ningún login."
      >
        <GoogleConnect
          storeId={store.id}
          state={status.google}
          configured={googleOauth.isConfigured()}
          developerTokenInEnv={Boolean(googleApp?.developerToken)}
        />
      </SectionCard>

      <SectionCard
        title="A qué tienda va cada gasto"
        description="Una cuenta publicitaria suele llevar campañas de varias tiendas. Aquí se ve si el reparto por filtros cubre todo y no se pisa: lo que no encaja en ninguna desaparece de los informes, y lo que encaja en dos se resta dos veces."
      >
        <SpendSplit accounts={split} />
      </SectionCard>

      <SectionCard
        title="Cuentas publicitarias"
        description="Nacen desactivadas. Activa solo las que pagan las campañas de esta tienda: activarlas todas restaría del beneficio de aquí el gasto de campañas de otro sitio."
      >
        <AccountList
          accounts={accounts.map((account) => ({
            ...account,
            loginName:
              metaLogins.find((login) => login.id === account.metaLoginId)?.name ?? "",
          }))}
        />
      </SectionCard>
    </div>
  );
}
