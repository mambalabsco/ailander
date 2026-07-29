"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { useJobResult } from "@/components/use-job-result";
import {
  analyzeProductSheetAction,
  applyProductAnalysisAction,
} from "@/app/products/[id]/generate-actions";
import type { ProductIngredient } from "@/types/ingredient";

/**
 * Completar la ficha del producto leyendo su web.
 *
 * **Nada se guarda solo.** El análisis propone y tú aceptas campo a campo:
 * sobrescribir con lo que dedujo un modelo lo que escribiste a mano sería la
 * peor forma de ayudar.
 *
 * Los ingredientes deducidos se marcan y **vienen desmarcados**. El producto se
 * ingiere: dar por bueno un ingrediente que nadie leyó en la etiqueta acaba en
 * un anuncio que afirma lo que el bote no contiene.
 */

interface Analysis {
  ingredients: ProductIngredient[];
  description: string;
  targetAudience: string;
  benefits: string[];
  features: string[];
  problemsSolved: string[];
  objections: string[];
  notes: string[];
}

/** Los campos de texto y lista que se pueden aceptar por separado. */
const FIELDS = [
  { key: "description", label: "Descripción" },
  { key: "targetAudience", label: "Público objetivo" },
  { key: "benefits", label: "Beneficios" },
  { key: "features", label: "Características" },
  { key: "problemsSolved", label: "Problemas que resuelve" },
  { key: "objections", label: "Objeciones" },
] as const;

export function ProductSheetAnalysis({
  productId,
  hasApiKey,
}: {
  productId: string;
  hasApiKey: boolean;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [allowInference, setAllowInference] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  const { job, isRunning } = useJobResult(jobId, 4000, { productId, kind: "ficha" });

  const [loadedJobId, setLoadedJobId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [acceptedIngredients, setAcceptedIngredients] = useState<Set<string>>(new Set());
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());

  // Ajuste en el render, no en un efecto: evita pintar primero la lista vacía.
  if (job?.status === "done" && job.id !== loadedJobId) {
    const result = job.result as Analysis | null;
    setLoadedJobId(job.id);
    setAnalysis(result);

    // Los leídos en la web vienen marcados; los deducidos, no.
    setAcceptedIngredients(
      new Set((result?.ingredients ?? []).filter((i) => i.source === "web").map((i) => i.name)),
    );
    setAcceptedFields(new Set(FIELDS.map((f) => f.key).filter((key) => {
      const value = result?.[key as keyof Analysis];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    })));
  }

  const toggle = (set: Set<string>, setter: (next: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const apply = () => {
    if (!analysis) return;
    setSaved(null);

    startTransition(async () => {
      const ingredients = analysis.ingredients.filter((i) => acceptedIngredients.has(i.name));

      const patch: Record<string, unknown> = {};
      if (ingredients.length > 0) {
        patch.ingredientDetails = ingredients;
        // Los nombres sueltos se mantienen sincronizados: hay pantallas que
        // todavía leen ese campo.
        patch.ingredients = ingredients.map((i) => i.name);
      }
      for (const field of FIELDS) {
        if (acceptedFields.has(field.key)) patch[field.key] = analysis[field.key];
      }

      await applyProductAnalysisAction({ productId, patch });
      setSaved(`Guardado: ${Object.keys(patch).length} campo(s).`);
      router.refresh();
    });
  };

  return (
    <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="font-medium">Completar la ficha desde la web</p>
      <p className="mt-1 mb-3 text-sm text-slate-600 dark:text-slate-300">
        Lee la página del producto y extrae los ingredientes con lo que hace cada uno. Es lo que
        permite que el copy explique por qué esta fórmula y no otra con los mismos nombres.
      </p>

      <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowInference}
          onChange={(event) => setAllowInference(event.target.checked)}
          className="size-4 accent-violet-600"
        />
        Proponer también lo que no encuentre en la web (marcado como deducido)
      </label>

      <GenerateButton
        action={() => analyzeProductSheetAction(productId, allowInference)}
        onStarted={setJobId}
        label="Analizar la ficha"
        disabled={!hasApiKey}
        disabledReason="Configura tu clave de API en Configuración"
        hint="Busca en la web. Unos 0,20 USD."
      />

      {isRunning ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Leyendo la ficha... Puedes cerrar la pestaña y volver.
        </p>
      ) : null}

      {analysis ? (
        <div className="mt-4 space-y-4">
          {analysis.ingredients.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium">Ingredientes</p>
              <ul className="space-y-2">
                {analysis.ingredients.map((item) => (
                  <li key={item.name} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={acceptedIngredients.has(item.name)}
                      onChange={() =>
                        toggle(acceptedIngredients, setAcceptedIngredients, item.name)
                      }
                      className="mt-1 size-4 shrink-0 accent-violet-600"
                    />
                    <span>
                      <span className="font-medium">{item.name}</span>
                      {item.form ? (
                        <span className="text-slate-500 dark:text-slate-400"> ({item.form})</span>
                      ) : null}
                      {item.dose ? (
                        <span className="text-slate-500 dark:text-slate-400"> · {item.dose}</span>
                      ) : null}
                      {item.source === "inferido" ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          deducido, sin confirmar
                        </span>
                      ) : null}
                      <span className="block text-slate-600 dark:text-slate-300">{item.role}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium">Otros campos</p>
            <ul className="space-y-1">
              {FIELDS.map((field) => {
                const value = analysis[field.key];
                const text = Array.isArray(value) ? value.join(" · ") : value;
                if (!text) return null;

                return (
                  <li key={field.key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={acceptedFields.has(field.key)}
                      onChange={() => toggle(acceptedFields, setAcceptedFields, field.key)}
                      className="mt-1 size-4 shrink-0 accent-violet-600"
                    />
                    <span>
                      <span className="font-medium">{field.label}: </span>
                      <span className="text-slate-600 dark:text-slate-300">{text}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Lo que no encontró se enseña: un hueco explicado vale más que un
              hueco silencioso, porque dice dónde hay que mirar a mano. */}
          {analysis.notes.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-medium text-amber-900 dark:text-amber-300">Lo que no encontró</p>
              <ul className="mt-1 space-y-1 text-amber-900/90 dark:text-amber-200/90">
                {analysis.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={apply} disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar lo marcado"}
            </Button>
            {saved ? (
              <span className="text-sm text-emerald-700 dark:text-emerald-400">{saved}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
