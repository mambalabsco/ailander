"use client";

import { useState, useTransition } from "react";
import { Button, SelectField } from "@/components/ui";
import { setDisabledAction, setLimitAction, setRoleAction } from "@/app/admin/actions";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, capabilitiesOf, CAPABILITY_LABELS } from "@/lib/roles";
import type { Role } from "@/lib/roles";

/**
 * Las personas y lo que puede cada una.
 *
 * ## Se enseña el gasto al lado del tope
 *
 * Un tope sin el gasto delante es un número que nadie sabe si está bien puesto.
 * Juntos se ve de un vistazo a quién se le queda corto y a quién le sobra.
 *
 * ## Y qué significa cada papel, sin tener que abrir nada
 *
 * Elegir «editor» sin saber que eso incluye publicar en la tienda es cómo se
 * reparten permisos de más. La descripción va debajo del desplegable.
 */

export interface PersonView {
  id: string;
  email: string;
  name: string;
  role: Role;
  monthlyLimitUsd: number | null;
  disabled: boolean;
  spentThisMonth: number;
  isMe: boolean;
}

const money = (value: number) => `$${value.toFixed(2)}`;

export function AdminPeople({ people }: { people: PersonView[] }) {
  const [message, setMessage] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      people.map((person) => [person.id, person.monthlyLimitUsd?.toString() ?? ""]),
    ),
  );
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
          {message}
        </p>
      ) : null}

      <ul className="space-y-3">
        {people.map((person) => {
          const over =
            person.monthlyLimitUsd !== null && person.spentThisMonth >= person.monthlyLimitUsd;

          return (
            <li
              key={person.id}
              className={`rounded-2xl border p-3 ${
                person.disabled
                  ? "border-slate-200 opacity-60 dark:border-slate-800"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {person.name || person.email || "Sin nombre"}
                    {person.isMe ? (
                      <span className="ml-2 text-xs font-normal text-slate-500">tú</span>
                    ) : null}
                    {person.disabled ? (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-700">
                        desactivada
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{person.email}</p>
                </div>

                <p className={`text-sm ${over ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
                  {money(person.spentThisMonth)} este mes
                  {person.monthlyLimitUsd === null
                    ? " · sin tope"
                    : ` de ${money(person.monthlyLimitUsd)}`}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Papel
                  </span>
                  <SelectField
                    value={person.role}
                    disabled={isPending || person.isMe || person.role === "dueño"}
                    onChange={(event) =>
                      startTransition(async () => {
                        const result = await setRoleAction(person.id, event.target.value);
                        setMessage(result.message);
                      })
                    }
                    className="min-w-44"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role} disabled={role === "dueño"}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </SelectField>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Tope al mes (USD)
                  </span>
                  <div className="flex gap-2">
                    <input
                      value={limits[person.id] ?? ""}
                      onChange={(event) =>
                        setLimits((current) => ({ ...current, [person.id]: event.target.value }))
                      }
                      placeholder="sin tope"
                      inputMode="decimal"
                      disabled={person.isMe}
                      className="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                    <Button
                      disabled={isPending || person.isMe}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await setLimitAction(person.id, limits[person.id] ?? "");
                          setMessage(result.message);
                        })
                      }
                    >
                      Guardar
                    </Button>
                  </div>
                </label>

                <Button
                  variant={person.disabled ? "secondary" : "danger"}
                  disabled={isPending || person.isMe || person.role === "dueño"}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await setDisabledAction(person.id, !person.disabled);
                      setMessage(result.message);
                    })
                  }
                >
                  {person.disabled ? "Reactivar" : "Desactivar"}
                </Button>
              </div>

              {/* Qué significa el papel elegido: sin esto se reparte de más. */}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {ROLE_DESCRIPTIONS[person.role]}
                {capabilitiesOf(person.role).length > 0 ? (
                  <span className="ml-1">
                    Puede: {capabilitiesOf(person.role).map((c) => CAPABILITY_LABELS[c]).join(", ")}.
                  </span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
