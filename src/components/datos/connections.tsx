"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField, TextField } from "@/components/ui";
import {
  importAccountsAction,
  setFiltersAction,
  setStoreMetaAppAction,
  setStoreMetaLoginAction,
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
  apps,
  chosenApp,
  logins,
  chosenLogin,
}: {
  storeId: string;
  state: ProviderState;
  /** Si el servidor tiene META_APP_ID y META_APP_SECRET. */
  configured: boolean;
  /** Las apps dadas de alta, sin secretos. */
  apps: { id: string; name: string; isDefault: boolean }[];
  /** Cuál eligió esta tienda. Vacío es la de por defecto. */
  chosenApp: string;
  /** Las sesiones de Facebook, sin tokens. */
  logins: { id: string; name: string; isDefault: boolean }[];
  chosenLogin: string;
}) {
  const usable = configured || apps.length > 0;

  return (
    <div className="space-y-3">
      {usable ? (
        <ConnectionState state={state} provider="facebook" />
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">No hay ninguna app de Meta</p>
          <p className="mt-1">
            Añade una en <strong>Configuración → Apps de Meta</strong>, o define{" "}
            <code>META_APP_ID</code> y <code>META_APP_SECRET</code> en el servidor.
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

      <MetaStorePanel
        storeId={storeId}
        apps={apps}
        chosenApp={chosenApp}
        logins={logins}
        chosenLogin={chosenLogin}
      />
    </div>
  );
}

/**
 * Lo que esta tienda decide sobre Meta: con qué sesión, con qué app, y sus cuentas.
 *
 * Los dos desplegables **solo aparecen cuando hay más de una** opción. Lo normal
 * es una sesión y una app para todo —un perfil de Facebook ve las cuentas de
 * todos sus Business Manager— y un desplegable de una sola opción solo invita a
 * preguntarse qué hace.
 */
function MetaStorePanel({
  storeId,
  apps,
  chosenApp,
  logins,
  chosenLogin,
}: {
  storeId: string;
  apps: { id: string; name: string; isDefault: boolean }[];
  chosenApp: string;
  logins: { id: string; name: string; isDefault: boolean }[];
  chosenLogin: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const run = (work: Promise<{ message?: string }>) => {
    setBusy(true);
    void work
      .then((result) => {
        if (result.message) setNote(result.message);
        router.refresh();
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-3">
        {logins.length > 1 ? (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Sesión</span>
            <SelectField
              value={chosenLogin}
              disabled={busy}
              onChange={(event) => run(setStoreMetaLoginAction(storeId, event.target.value))}
              className="min-w-48"
            >
              <option value="">La de por defecto</option>
              {logins.map((login) => (
                <option key={login.id} value={login.id}>
                  {login.name}
                  {login.isDefault ? " (por defecto)" : ""}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        {apps.length > 1 ? (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">App</span>
            <SelectField
              value={chosenApp}
              disabled={busy}
              onChange={(event) => run(setStoreMetaAppAction(storeId, event.target.value))}
              className="min-w-44"
            >
              <option value="">La de por defecto</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                  {app.isDefault ? " (por defecto)" : ""}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        {/*
          Traer las cuentas es un paso aparte desde que la sesión es compartida:
          antes solo pasaba al iniciar sesión, así que una tienda nueva se
          quedaba sin cuentas y la única salida era rehacer el login.
        */}
        <Button disabled={busy} onClick={() => run(importAccountsAction(storeId))}>
          {busy ? "Trayendo…" : "Traer las cuentas"}
        </Button>
      </div>

      {note ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        La sesión y la app se configuran una vez en <strong>Configuración</strong>. Aquí solo se
        elige, y casi nunca hace falta.
      </p>
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
  sesion: { ok: true, text: "Sesión iniciada. Ya vale para todas las tiendas." },
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
