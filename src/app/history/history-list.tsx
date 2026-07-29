"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { EmptyState, SelectField, TextField } from "@/components/ui";
import { deleteAnalysisAction, duplicateAnalysisAction } from "@/app/history/actions";
import type { AnalysisResult } from "@/types";

interface HistoryListProps {
  analyses: AnalysisResult[];
}

const typeLabels: Record<AnalysisResult["type"], string> = {
  analysis: "Análisis",
  copy: "Copy",
};

export function HistoryList({ analyses }: HistoryListProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return analyses.filter((item) => {
      const matchesQuery =
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.productName.toLowerCase().includes(needle) ||
        item.summary.toLowerCase().includes(needle);
      const matchesType = type === "all" || item.type === type;
      const matchesStatus = status === "all" || item.status === status;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [analyses, query, type, status]);

  const handleDelete = (item: AnalysisResult) => {
    if (!window.confirm(`¿Eliminar "${item.title}"?`)) return;
    startTransition(async () => {
      await deleteAnalysisAction(item.id);
      router.refresh();
    });
  };

  const handleDuplicate = (item: AnalysisResult) => {
    startTransition(async () => {
      await duplicateAnalysisAction(item.id);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <TextField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por título, producto o resumen"
          className="sm:w-72"
          aria-label="Buscar en el historial"
        />
        <SelectField
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="sm:w-40"
          aria-label="Filtrar por tipo"
        >
          <option value="all">Todos los tipos</option>
          <option value="analysis">Análisis</option>
          <option value="copy">Copy</option>
        </SelectField>
        <SelectField
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="sm:w-44"
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos los estados</option>
          <option value="completed">Completado</option>
          <option value="draft">Borrador</option>
        </SelectField>
      </div>

      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        {filtered.length} de {analyses.length} registros
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={analyses.length === 0 ? "El historial está vacío" : "Ningún registro coincide"}
          description={
            analyses.length === 0
              ? "Los análisis de anuncios y los copys generados aparecerán aquí automáticamente."
              : "Prueba con otro término o cambia los filtros."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {item.productName} · {typeLabels[item.type]} · {item.createdAt}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill status={item.status} />
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === item.id ? null : item.id)}
                    className="text-sm text-violet-600 hover:underline"
                  >
                    {openId === item.id ? "Cerrar" : "Abrir"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(item)}
                    disabled={isPending}
                    className="text-sm text-slate-500 hover:underline disabled:opacity-50 dark:text-slate-400"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={isPending}
                    className="text-sm text-rose-500 hover:underline disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              {openId === item.id ? (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 dark:bg-slate-950">
                  <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{item.summary}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
