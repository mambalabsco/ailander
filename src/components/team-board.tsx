"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField, TextField } from "@/components/ui";
import { CAPABILITIES, CAPABILITY_LABELS, capabilitiesOf, type Role } from "@/lib/roles";
import {
  addMemberAction,
  removeMemberAction,
  setActiveWorkspaceAction,
  setCapabilitiesAction,
  setExclusionAction,
  setRoleAction,
} from "@/app/equipo/actions";

const ROLES = ["dueño", "admin", "editor", "diseñador", "redactor", "analista", "invitado"];

interface Member {
  userId: string;
  email: string;
  role: string;
  capabilities: string[] | null;
  isMe: boolean;
}

/**
 * Quién está en el equipo y qué ve.
 *
 * ## Por qué las exclusiones son una casilla y no una lista de concesiones
 *
 * Porque el equipo ve todo por defecto. Lo que se marca es de qué **se saca** a
 * alguien, y eso hace que la pantalla esté casi siempre vacía de marcas — que
 * es lo que permite leerla de un vistazo y notar lo raro.
 */
export function TeamBoard({
  spaces,
  workspaceId,
  members,
  products,
  exclusions,
}: {
  spaces: { id: string; name: string }[];
  workspaceId: string;
  members: Member[];
  products: { id: string; name: string }[];
  exclusions: { productId: string; userId: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [accesos, setAccesos] = useState<string | null>(null);

  const correr = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await fn();

      setNote(result.message);
      if (result.ok) router.refresh();
    });

  const excluido = (userId: string, productId: string) =>
    exclusions.some((one) => one.userId === userId && one.productId === productId);

  return (
    <div className="grid gap-4">
      {/*
        El selector solo aparece con más de uno.
        Con un solo espacio no es una elección: es un desplegable de una opción
        que hace pensar que falta algo.
      */}
      {spaces.length > 1 ? (
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Espacio que administras</span>
          <SelectField
            value={workspaceId}
            disabled={pending}
            onChange={(event) =>
              start(async () => {
                await setActiveWorkspaceAction(event.target.value);
                router.refresh();
              })
            }
          >
            {spaces.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </SelectField>
        </label>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Correo de quien ya tiene cuenta</span>
          <TextField
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="persona@ejemplo.com"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Papel</span>
          <SelectField value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLES.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </SelectField>
        </label>

        <Button
          variant="primary"
          disabled={pending || !email.trim()}
          onClick={() => correr(() => addMemberAction({ workspaceId, email, role }))}
        >
          {pending ? "…" : "Añadir al equipo"}
        </Button>
      </div>

      {note ? <p className="text-sm text-slate-600 dark:text-slate-300">{note}</p> : null}

      <ul className="grid gap-2">
        {members.map((member) => (
          <li
            key={member.userId}
            className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {member.email}
                {member.isMe ? (
                  <span className="ml-2 text-xs font-normal text-slate-500">tú</span>
                ) : null}
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <SelectField
                  value={member.role}
                  disabled={pending}
                  onChange={(event) =>
                    correr(() =>
                      setRoleAction({ workspaceId, userId: member.userId, role: event.target.value }),
                    )
                  }
                >
                  {ROLES.map((one) => (
                    <option key={one} value={one}>
                      {one}
                    </option>
                  ))}
                </SelectField>

                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setAccesos(accesos === member.userId ? null : member.userId)}
                >
                  Accesos
                </Button>

                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setAbierto(abierto === member.userId ? null : member.userId)}
                >
                  Productos
                </Button>

                {/*
                  Sacarse a uno mismo del equipo se queda fuera: es la forma más
                  fácil de perder el acceso a todo sin que nadie pueda
                  devolverlo.
                */}
                {member.isMe ? null : (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      correr(() => removeMemberAction({ workspaceId, userId: member.userId }))
                    }
                  >
                    Sacar
                  </Button>
                )}
              </div>
            </div>

            {accesos === member.userId ? (
              <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                {/*
                  Lo que puede hacer, con lo de su papel ya marcado.
                  Al tocar la primera casilla deja de heredar y pasa a lista
                  propia: por eso el botón de volver está siempre a la vista.
                */}
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  {member.capabilities
                    ? "Accesos a medida. No sigue los de su papel."
                    : `Los de ${member.role}. Marca algo para hacerle una excepción.`}
                </p>

                <div className="grid gap-1 sm:grid-cols-2">
                  {CAPABILITIES.map((cap) => {
                    const actuales = member.capabilities ?? capabilitiesOf(member.role as Role);
                    const tiene = actuales.includes(cap);

                    return (
                      <label key={cap} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={tiene}
                          disabled={pending}
                          onChange={(event) =>
                            correr(() =>
                              setCapabilitiesAction({
                                workspaceId,
                                userId: member.userId,
                                capabilities: event.target.checked
                                  ? [...actuales, cap]
                                  : actuales.filter((one) => one !== cap),
                              }),
                            )
                          }
                          className="size-4"
                        />
                        {CAPABILITY_LABELS[cap]}
                      </label>
                    );
                  })}
                </div>

                {member.capabilities ? (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      correr(() =>
                        setCapabilitiesAction({
                          workspaceId,
                          userId: member.userId,
                          capabilities: null,
                        }),
                      )
                    }
                  >
                    Volver a los de su papel
                  </Button>
                ) : null}
              </div>
            ) : null}

            {abierto === member.userId ? (
              <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Ve todos los productos salvo los que marques aquí.
                </p>

                <div className="grid gap-1 sm:grid-cols-2">
                  {products.map((product) => {
                    const fuera = excluido(member.userId, product.id);

                    return (
                      <label key={product.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={fuera}
                          disabled={pending}
                          onChange={(event) =>
                            correr(() =>
                              setExclusionAction({
                                workspaceId,
                                userId: member.userId,
                                productId: product.id,
                                excluded: event.target.checked,
                              }),
                            )
                          }
                          className="size-4"
                        />
                        <span className={fuera ? "text-slate-400 line-through" : ""}>
                          {product.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
