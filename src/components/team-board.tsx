"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField, TextField } from "@/components/ui";
import {
  addMemberAction,
  removeMemberAction,
  setExclusionAction,
  setRoleAction,
} from "@/app/equipo/actions";

const ROLES = ["dueño", "admin", "editor", "diseñador", "redactor", "analista", "invitado"];

interface Member {
  userId: string;
  email: string;
  role: string;
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
  workspaceId,
  members,
  products,
  exclusions,
}: {
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
