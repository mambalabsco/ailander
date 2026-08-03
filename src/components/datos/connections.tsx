"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/ui";
import {
  saveMetaAppAction,
  setFiltersAction,
  setLoginCustomerIdAction,
  toggleAccountAction,
} from "@/app/datos/actions";

/**
 * Conectar Meta y Google iniciando sesión, y decidir qué cuentas cuentan.
 *
 * ## Aquí no se pega ningún token
 *
 * El botón lleva al diálogo del proveedor y se vuelve con el permiso ya
 * guardado. Es mejor que pegar un token por tres motivos, y el tercero es el que
 * de verdad importa:
 *
 * 1. No hay que salir a otra pantalla a generarlo ni entender qué es un usuario
 *    de sistema.
 * 2. El permiso que se concede es exactamente el que se pide —`ads_read`— y se
 *    comprueba al volver.
 * 3. **El token nunca pasa por el portapapeles, ni por el historial del
 *    navegador, ni por una captura de pantalla.** Un token de Meta con
 *    `ads_read` pegado en un chat es un problema de seguridad; un botón, no.
 *
 * El único campo que queda es la cuenta administradora de Google, que no es un
 * secreto: es un número visible en su panel.
 */

export interface AccountRow {
  id: string;
  provider: "facebook" | "google";
  externalId: string;
  name: string;
  currency: string;
  /** De qué Business Manager es. Vacío en las de antes de guardarlo. */
  businessName: string;
  active: boolean;
  includeFilters: string[];
  excludeFilters: string[];
  lastSyncedAt: string | null;
}

export interface ProviderState {
  connected: boolean;
  accountName: string | null;
  daysLeft: number | null;
  scopes: string[];
  hasDeveloperToken: boolean;
  loginCustomerId: string | null;
}

/* ------------------------------ Estado común ------------------------------- */

/**
 * El estado de una conexión, con la caducidad al frente.
 *
 * La caducidad es lo que evita el fallo silencioso: el permiso de Meta dura unos
 * sesenta días y, cuando vence, el gasto publicitario aparece a cero y el
 * beneficio se dispara **sin ningún error**. Decir «quedan 6 días» junto a un
 * botón de un clic es la única forma de que eso no pase.
 */
function ConnectionState({
  state,
  provider,
}: {
  state: ProviderState;
  provider: "facebook" | "google";
}) {
  if (!state.connected) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Sin conectar. El gasto de {provider === "facebook" ? "Meta" : "Google"} cuenta cero en todos
        los informes, así que el beneficio neto sale más alto del real.
      </p>
    );
  }

  const days = state.daysLeft;
  const expiring = days !== null && days <= 10;
  const expired = days !== null && days < 0;

  return (
    <div className="space-y-1 text-sm">
      <p
        className={
          expired
            ? "font-medium text-rose-700 dark:text-rose-400"
            : expiring
              ? "font-medium text-amber-700 dark:text-amber-400"
              : "font-medium text-emerald-700 dark:text-emerald-400"
        }
      >
        {expired ? "El permiso caducó" : "Conectado"}
        {state.accountName ? ` como ${state.accountName}` : ""}
      </p>

      {days === null ? (
        <p className="text-slate-500 dark:text-slate-400">El permiso no caduca.</p>
      ) : expired ? (
        <p className="text-slate-600 dark:text-slate-300">
          El gasto que se lea será cero. Vuelve a iniciar sesión para arreglarlo.
        </p>
      ) : (
        <p className={expiring ? "text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}>
          Caduca en {days} día(s).
          {expiring
            ? " Vuelve a iniciar sesión ahora: cuando venza, el gasto aparecerá a cero sin avisar."
            : " Se intenta renovar solo en cada sincronización."}
        </p>
      )}

      {state.scopes.length > 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          permisos concedidos: {state.scopes.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------- Meta ----------------------------------- */

export function MetaConnect({
  storeId,
  state,
  configured,
  app,
}: {
  storeId: string;
  state: ProviderState;
  /** Si el servidor tiene META_APP_ID y META_APP_SECRET. */
  configured: boolean;
  /** La app propia de esta tienda, si la tiene. El secreto no viaja. */
  app: { appId: string; hasSecret: boolean; configId: string };
}) {
  const usable = configured || (app.appId !== "" && app.hasSecret);

  return (
    <div className="space-y-3">
      {usable ? (
        <ConnectionState state={state} provider="facebook" />
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Esta tienda no tiene app de Meta</p>
          <p className="mt-1">
            Ponle la suya abajo, o define <code>META_APP_ID</code> y <code>META_APP_SECRET</code> en
            el servidor para que valga como la de por defecto.
          </p>
        </div>
      )}

      {/*
        Un enlace y no un botón con `fetch`: el flujo termina en una redirección
        a Facebook, y eso el navegador lo tiene que hacer navegando de verdad.
      */}
      <a
        href={`/api/meta/instalar?tienda=${storeId}`}
        className="inline-flex items-center gap-2 rounded-full bg-[#1877F2] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#166fe0]"
      >
        {/* La «f» de Facebook dibujada, no su logotipo: es la marca de otro. */}
        <span aria-hidden className="text-base font-bold">
          f
        </span>
        {state.connected ? "Volver a iniciar sesión" : "Iniciar sesión con Facebook"}
      </a>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Solo se pide permiso de <strong>lectura</strong> de anuncios (<code>ads_read</code>). La
        plataforma no puede crear, pausar ni modificar nada en tus campañas.
      </p>

      <MetaAppForm storeId={storeId} app={app} fallback={configured} />
    </div>
  );
}

/**
 * La app de Meta de esta tienda.
 *
 * ## Por qué esto existe
 *
 * Una app de Meta sirve para todas las cuentas a las que llegue **el perfil de
 * Facebook con el que se creó**. En cuanto hay un segundo Business Manager en
 * otro perfil, Meta obliga a otra app, y con la configuración en variables de
 * entorno solo cabía una: conectar la segunda tienda significaba cambiar la
 * variable del servidor y dejar la primera apuntando a una app que no es suya.
 *
 * ## El secreto entra y no sale
 *
 * Se escribe aquí y nunca se devuelve: la pantalla solo sabe si está puesto. Un
 * campo que lo reenviara lo dejaría en el navegador de cualquiera que abra esta
 * página.
 */
function MetaAppForm({
  storeId,
  app,
  fallback,
}: {
  storeId: string;
  app: { appId: string; hasSecret: boolean; configId: string };
  /** Si hay una app en el entorno que sirva de respaldo. */
  fallback: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [appId, setAppId] = useState(app.appId);
  const [secret, setSecret] = useState("");
  const [configId, setConfigId] = useState(app.configId);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const own = app.appId !== "" && app.hasSecret;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
        <span className="text-slate-500 dark:text-slate-400">
          {own
            ? `App propia: ${app.appId}`
            : fallback
              ? "Usa la app por defecto del servidor"
              : "Sin app"}
        </span>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {own ? "Cambiar la app" : "Usar otra app"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Solo hace falta si esta tienda va contra un Business Manager de otro perfil de Facebook.
        Con uno solo, deja esto vacío.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          value={appId}
          onChange={(event) => setAppId(event.target.value)}
          placeholder="App ID"
          className="w-48 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          type="password"
          autoComplete="off"
          placeholder={app.hasSecret ? "Secreto (guardado)" : "App Secret"}
          className="w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          value={configId}
          onChange={(event) => setConfigId(event.target.value)}
          placeholder="Config ID (opcional)"
          className="w-52 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={saving}
          onClick={() => {
            setSaving(true);

            void saveMetaAppAction(storeId, appId, secret, configId)
              .then((result) => {
                setNote(result.message);
                if (result.ok) {
                  setSecret("");
                  setOpen(false);
                  router.refresh();
                }
              })
              .finally(() => setSaving(false));
          }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </Button>

        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>

        <span className="text-xs text-slate-500 dark:text-slate-400">
          Vaciando los dos primeros vuelve a la app por defecto.
        </span>
      </div>

      {note ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}

/* -------------------------------- Google ---------------------------------- */

export function GoogleConnect({
  storeId,
  state,
  configured,
  developerTokenInEnv,
}: {
  storeId: string;
  state: ProviderState;
  configured: boolean;
  developerTokenInEnv: boolean;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(state.loginCustomerId ?? "");
  const [isPending, startTransition] = useTransition();

  if (!configured) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-medium">Falta configurar el cliente de Google en el servidor</p>
        <p className="mt-1">
          Hacen falta <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en{" "}
          <code>.env.local</code>. Está en <code>docs/anuncios.md</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ConnectionState state={state} provider="google" />

      <a
        href={`/api/google/instalar?tienda=${storeId}`}
        className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      >
        <span aria-hidden className="text-base font-bold">
          G
        </span>
        {state.connected ? "Volver a iniciar sesión" : "Iniciar sesión con Google"}
      </a>

      {/*
        El developer token no se resuelve con ningún login: lo aprueba una persona
        en Google. Se dice explícitamente porque, sin él, la conexión queda
        autorizada y a la vez inservible — y eso es desconcertante si no se avisa.
      */}
      {state.connected && !state.hasDeveloperToken && !developerTokenInEnv ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Autorizado, pero todavía no puede leer nada</p>
          <p className="mt-1">
            Google Ads no responde sin un <em>developer token</em>, y ese no viene del login: se pide
            en el API Center de tu cuenta administradora y lo aprueba una persona. Cuando lo tengas,
            ponlo como <code>GOOGLE_ADS_DEVELOPER_TOKEN</code> en el servidor.
          </p>
        </div>
      ) : null}

      {state.connected ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Cuenta administradora (no es un secreto: está arriba a la derecha en Google Ads)
            </span>
            <TextField
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              placeholder="123-456-7890"
              className="w-52"
            />
          </label>

          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await setLoginCustomerIdAction(storeId, customerId);
                router.refresh();
              })
            }
          >
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------- Mensaje de vuelta ---------------------------- */

/**
 * El resultado del login, leído de la URL.
 *
 * El callback termina siempre en esta pantalla con un parámetro, nunca en un JSON
 * crudo: quien acaba de autorizar espera volver a donde estaba, y una página con
 * llaves y comillas parece que se rompió todo.
 */
const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  conectada: { ok: true, text: "Conectado. Activa abajo las cuentas de esta tienda." },
  "conectada-sin-cuentas": {
    ok: false,
    text: "Autorizado, pero no se pudieron listar las cuentas. Lo más habitual es que falte el developer token o que esté en acceso de prueba.",
  },
  cancelado: { ok: false, text: "Cancelaste la autorización. No se guardó nada." },
  "sin-permiso": {
    ok: false,
    text: "Faltó conceder algún permiso en el diálogo. Vuelve a iniciar sesión y déjalos todos marcados.",
  },
  "estado-invalido": {
    ok: false,
    text: "La vuelta no se pudo verificar. Vuelve a empezar desde el botón, sin usar un enlace guardado.",
  },
  "sin-configurar": {
    ok: false,
    text: "Falta configurar la app en el servidor. Está en docs/anuncios.md.",
  },
  error: { ok: false, text: "No se pudo conectar." },
};

export function CallbackMessage({
  status,
  detail,
  accounts,
}: {
  status: string;
  detail?: string;
  accounts?: string;
}) {
  const message = MESSAGES[status];
  if (!message) return null;

  return (
    <div
      className={`rounded-2xl border p-4 text-sm ${
        message.ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
      }`}
    >
      <p className="font-medium">
        {message.text}
        {message.ok && accounts ? ` (${accounts} cuenta(s) encontradas)` : ""}
      </p>
      {detail ? <p className="mt-1 text-xs opacity-80">{detail}</p> : null}
    </div>
  );
}

/* -------------------------------- Cuentas --------------------------------- */

export function AccountList({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No hay ninguna cuenta. Inicia sesión arriba y aparecerán solas.
      </p>
    );
  }

  const active = accounts.filter((account) => account.active).length;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-medium">{active}</span> de {accounts.length} activa(s)
        {active === 0 ? (
          <span className="ml-2 text-amber-700 dark:text-amber-400">
            sin ninguna activa el gasto publicitario cuenta cero
          </span>
        ) : null}
      </p>

      <ul className="space-y-2">
        {accounts.map((account) => (
          <li
            key={account.id}
            className={`rounded-2xl border p-4 ${
              account.active
                ? "border-slate-200 dark:border-slate-800"
                : "border-dashed border-slate-300 opacity-70 dark:border-slate-700"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {account.name}
                  <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                    {account.provider === "facebook" ? "Meta" : "Google"} · {account.externalId} ·{" "}
                    {account.currency}
                  </span>
                </p>

                {/*
                  De qué Business Manager es.

                  Con dos BM, dos cuentas pueden llamarse igual y activar la que
                  no es resta el gasto de otra tienda del beneficio de esta.
                */}
                {account.businessName ? (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Business Manager: {account.businessName}
                  </p>
                ) : null}

                {account.includeFilters.length > 0 || account.excludeFilters.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1 text-xs">
                    {account.includeFilters.map((filter) => (
                      <span
                        key={`in-${filter}`}
                        className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      >
                        + {filter}
                      </span>
                    ))}
                    {account.excludeFilters.map((filter) => (
                      <span
                        key={`out-${filter}`}
                        className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      >
                        − {filter}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    todas las campañas
                  </p>
                )}

                {account.lastSyncedAt ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    última sincronización:{" "}
                    {new Date(account.lastSyncedAt).toLocaleString("es-ES")}
                  </p>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Button onClick={() => setEditing(editing === account.id ? null : account.id)}>
                  Filtros
                </Button>
                <Button
                  variant={account.active ? "secondary" : "primary"}
                  onClick={async () => {
                    await toggleAccountAction(account.id, !account.active);
                    router.refresh();
                  }}
                >
                  {account.active ? "Desactivar" : "Activar"}
                </Button>
              </div>
            </div>

            {editing === account.id ? (
              <FilterForm
                account={account}
                onDone={() => {
                  setEditing(null);
                  router.refresh();
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Filtros por nombre de campaña.
 *
 * Existen porque una cuenta publicitaria casi nunca es de una sola tienda: la
 * misma cuenta lleva campañas de México, de Chile y de un producto que ya no se
 * vende. Sin filtrar, el gasto de todas ellas se restaría del beneficio de una
 * tienda que no las pagó.
 */
function FilterForm({ account, onDone }: { account: AccountRow; onDone: () => void }) {
  const [include, setInclude] = useState(account.includeFilters.join("\n"));
  const [exclude, setExclude] = useState(account.excludeFilters.join("\n"));
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Una regla por línea. Coincide por trozo de nombre y sin distinguir mayúsculas. Si hay reglas
        de incluir, solo entra lo que coincida con alguna; después se quita lo que coincida con las
        de excluir.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Incluir solo estas
          </span>
          <textarea
            value={include}
            onChange={(event) => setInclude(event.target.value)}
            rows={4}
            placeholder={"CLNATR\n_MX_"}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-rose-700 dark:text-rose-400">Quitar estas</span>
          <textarea
            value={exclude}
            onChange={(event) => setExclude(event.target.value)}
            rows={4}
            placeholder={"- Copia\nTEST"}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Los filtros se aplican al leer, así que el cambio recalcula también el historial ya
        descargado.
      </p>

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setFiltersAction(account.id, include.split("\n"), exclude.split("\n"));
              onDone();
            })
          }
        >
          {isPending ? "Guardando…" : "Guardar filtros"}
        </Button>
        <Button onClick={onDone}>Cancelar</Button>
      </div>
    </div>
  );
}
