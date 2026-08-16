"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { deleteFolderAction, saveFolderAction } from "@/app/products/[id]/folder-actions";
import type { CampaignFolder } from "@/types/campaign";

/**
 * Las pestañas de carpetas de la sección Ads.
 *
 * El filtrado es de aquí y no del servidor: la barra necesita el número de
 * campañas de cada carpeta, así que ya tiene todas las activas delante, y
 * pedirlas otra vez al cambiar de pestaña sería una ida y vuelta por clic sin
 * ganar nada.
 */
export function FolderBar({
  productId,
  folders,
  counts,
  archivedCount,
  active,
  onChange,
}: {
  productId: string;
  folders: CampaignFolder[];
  /** Campañas activas por carpeta. La clave vacía es «sin carpeta». */
  counts: Record<string, number>;
  archivedCount: number;
  /** `null` es Todas, `"archivadas"` el archivo, y si no el id de la carpeta. */
  active: string | null;
  onChange: (value: string | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const tab = (value: string | null, label: string, count: number) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        active === value
          ? "bg-violet-600 text-white"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {tab(null, "Todas", total)}

      {folders.map((folder) => (
        <span key={folder.id} className="flex items-center">
          {tab(folder.id, folder.name, counts[folder.id] ?? 0)}

          {/*
            Renombrar y borrar, solo en la carpeta abierta.

            Enseñarlos en las cinco pestañas a la vez llena la barra de iconos y
            hace fácil borrar la de al lado por error.
          */}
          {active === folder.id ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const nuevo = window.prompt("Nombre de la carpeta", folder.name);
                  if (!nuevo?.trim() || nuevo.trim() === folder.name) return;
                  startTransition(async () => {
                    await saveFolderAction({
                      id: folder.id,
                      productId,
                      name: nuevo.trim(),
                      position: folder.position,
                    });
                    router.refresh();
                  });
                }}
                title="Renombrar"
                className="ml-1 text-xs text-slate-400 transition hover:text-violet-600"
              >
                ✎
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteFolderAction(folder.id, productId);
                    onChange(null);
                    router.refresh();
                  })
                }
                title="Borrar la carpeta. Las campañas que tenga siguen, sin carpeta."
                className="ml-1 text-xs text-slate-400 transition hover:text-rose-600"
              >
                ×
              </button>
            </>
          ) : null}
        </span>
      ))}

      {/* Siempre está, aunque esté vacía: es donde se busca lo que se archivó, y
          una pestaña que aparece y desaparece no se encuentra. */}
      {tab("archivadas", "Archivadas", archivedCount)}

      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await saveFolderAction({ productId, name });
              setName("");
              setCreating(false);
              router.refresh();
            });
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre de la carpeta"
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Button variant="primary" disabled={isPending || !name.trim()}>
            Crear
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          + Nueva carpeta
        </button>
      )}
    </div>
  );
}
