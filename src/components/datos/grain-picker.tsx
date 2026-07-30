"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Grain } from "@/lib/profit";

/**
 * Diario, semanal o mensual.
 *
 * Va en la URL como todo lo demás, así que un informe mensual se puede compartir
 * tal cual. El valor por defecto lo elige el servidor según la longitud del
 * rango —un año en columnas diarias son 365 columnas ilegibles—, y este control
 * solo lo sobreescribe.
 */

const OPTIONS: { value: Grain; label: string }[] = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
];

export function GrainPicker({ grain }: { grain: Grain }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label="Agrupación"
      className={`inline-flex rounded-full border border-slate-200 p-1 dark:border-slate-700 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={grain === option.value}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.set("grano", option.value);
            startTransition(() => router.replace(`${pathname}?${next.toString()}`));
          }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            grain === option.value
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
