"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { deleteMetaLoginAction, setDefaultMetaLoginAction } from "@/app/datos/actions";

/**
 * Las sesiones de Facebook.
 *
 * ## Por qué aquí y no en cada tienda
 *
 * El token que devuelve Facebook es **de la persona**: con él se ven las cuentas
 * publicitarias de todos los Business Manager a los que ese perfil llegue.
 * Guardarlo por tienda obligaba a hacer el mismo login cinco veces —y otras
 * cinco cada sesenta días, cuando caduca—.
 *
 * ## La caducidad al frente
 *
 * Es lo que evita el fallo silencioso: cuando el permiso vence, el gasto
 * publicitario aparece a cero y el beneficio se dispara **sin ningún error**.
 * «Quedan 6 días» junto a un botón de un clic es la única forma de que eso no
 * pase.
 */

export interface MetaLoginView {
  id: string;
  name: string;
  daysLeft: number | null;
  isDefault: boolean;
}

export function MetaLoginsPanel({
  logins,
  canConnect,
  justConnected,
}: {
  logins: MetaLoginView[];
  /** Si hay app de Meta con la que iniciar sesión. */
  canConnect: boolean;
  /** El nombre del perfil que acaba de volver del diálogo, si viene de ahí. */
  justConnected?: string;
}) {
  const router = useRouter();
  /** Cuál se está desconectando, y qué contestó Facebook. */
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-3">
      {justConnected !== undefined ? (
        <p className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Sesión iniciada{justConnected ? ` como ${justConnected}` : ""}. Ya vale para todas las
          tiendas; en cada una, trae sus cuentas desde Datos → Conexiones.
        </p>
      ) : null}
      {logins.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Sin ninguna sesión. Inicia sesión una vez y todas las tiendas podrán leer su gasto: el
          permiso es del perfil de Facebook, no de la tienda.
        </p>
      ) : (
        <ul className="space-y-2">
          {logins.map((login) => {
            const expired = login.daysLeft !== null && login.daysLeft < 0;
            const expiring = login.daysLeft !== null && login.daysLeft >= 0 && login.daysLeft <= 10;

            return (
              <li
                key={login.id}
                className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${
                  expired
                    ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
                    : expiring
                      ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                      : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {login.name}
                    {login.isDefault ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        por defecto
                      </span>
                    ) : null}
                  </p>

                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {login.daysLeft === null
                      ? "No caduca"
                      : expired
                        ? "Caducado: el gasto de Meta se está leyendo como cero. Vuelve a iniciar sesión."
                        : `Quedan ${login.daysLeft} día(s)`}
                  </p>
                </div>

                {login.isDefault ? null : (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void setDefaultMetaLoginAction(login.id).then(() => router.refresh())
                    }
                  >
                    Usar por defecto
                  </Button>
                )}

                {/*
                  «Desconectar» y no una ✕.

                  Una aspa se lee como «quitar de la lista» y esto hace algo más
                  grande: borra el token y **revoca el permiso en Facebook**. Una
                  acción que sale del producto merece decir su nombre.
                */}
                <Button
                  variant="danger"
                  disabled={busy === login.id}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `¿Desconectar «${login.name}»? Se borra el token y se le pide a Facebook que revoque el permiso. Las tiendas que lo usaran dejarán de leer su gasto.`,
                      )
                    ) {
                      return;
                    }

                    setBusy(login.id);

                    void deleteMetaLoginAction(login.id)
                      .then((result) => {
                        setNote(result.message);
                        router.refresh();
                      })
                      .finally(() => setBusy(""));
                  }}
                >
                  {busy === login.id ? "Desconectando…" : "Desconectar"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {note ? (
        <p className="rounded-2xl border border-slate-200 p-2 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {note}
        </p>
      ) : null}

      {canConnect ? (
        <a
          href="/api/meta/instalar"
          className="inline-flex items-center gap-2 rounded-full bg-[#1877F2] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#166fe0]"
        >
          {/* La «f» dibujada, no su logotipo: es la marca de otro. */}
          <span aria-hidden className="text-base font-bold">
            f
          </span>
          {logins.length > 0 ? "Iniciar sesión con otro perfil" : "Iniciar sesión con Facebook"}
        </a>
      ) : (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Añade antes una app de Meta arriba: sin ella no hay con qué iniciar sesión.
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Un perfil ve las cuentas de todos sus Business Manager, así que con una sesión suele
        bastar. Se necesita otra solo si algún Business Manager está en un perfil distinto. En
        cada tienda se elige cuál usar, en Datos → Conexiones.
      </p>
    </div>
  );
}
