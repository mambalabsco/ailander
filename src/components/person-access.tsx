"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { proposeEmailAction, sendRecoveryAction, setPasswordAction } from "@/app/admin/actions";

/**
 * Entrar en la cuenta de alguien: el enlace, el correo y la contraseña.
 *
 * ## Por qué el enlace va primero y la contraseña plegada
 *
 * Porque resuelven el mismo problema con consecuencias muy distintas. El enlace
 * lo pone esa persona y nadie más lo sabe; una contraseña fijada por otro deja a
 * ese otro pudiendo entrar y leerlo todo. Poner los dos botones al lado, del
 * mismo tamaño, haría de la segunda la opción cómoda.
 */
export function PersonAccess({
  personId,
  email,
  pendingEmail,
  onMessage,
}: {
  personId: string;
  email: string;
  pendingEmail: string | null;
  onMessage: (message: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [correo, setCorreo] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Acceso</p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await sendRecoveryAction(personId);
              onMessage(result.message);
            })
          }
        >
          Mandarle enlace para cambiar su contraseña
        </Button>

        <div className="flex gap-2">
          <input
            value={correo}
            onChange={(event) => setCorreo(event.target.value)}
            placeholder="correo nuevo"
            inputMode="email"
            className="w-52 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await proposeEmailAction(personId, correo);
                onMessage(result.message);
                if (result.ok) setCorreo("");
              })
            }
          >
            Proponer
          </Button>
        </div>
      </div>

      {pendingEmail ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Pendiente: propuesto <strong>{pendingEmail}</strong>, esperando a que {email} lo acepte.
        </p>
      ) : null}

      {abierto ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-xs text-rose-900 dark:text-rose-200">
            Si le fijas la contraseña, podrás entrar en su cuenta y ver todo lo suyo. Úsalo solo si
            ya no tiene acceso a su correo, y díselo por otro canal. Queda anotado en el registro.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {/*
              El campo es de texto y no de puntos a propósito: quien la fija
              tiene que dictarla después, y a ciegas se teclea mal.
            */}
            <input
              value={clave}
              onChange={(event) => setClave(event.target.value)}
              placeholder="contraseña nueva"
              type="text"
              className="w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <Button
              variant="danger"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setPasswordAction(personId, clave);
                  onMessage(result.message);
                  if (result.ok) {
                    setClave("");
                    setAbierto(false);
                  }
                })
              }
            >
              Fijar contraseña
            </Button>
            <Button disabled={isPending} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="mt-2 text-xs text-slate-500 underline dark:text-slate-400"
        >
          O fijarle la contraseña a mano
        </button>
      )}
    </div>
  );
}
