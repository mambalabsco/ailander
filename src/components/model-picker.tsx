"use client";

import { useEffect, useState } from "react";
import { SelectField } from "@/components/ui";
import { listHiggsfieldModelsAction } from "@/app/products/[id]/image-generate-actions";
import type { CatalogModel } from "@/types/higgsfield-catalog";

/**
 * El selector de modelos de Higgsfield, compartido por los dos generadores.
 *
 * **El catálogo se pide al servidor, no está escrito a mano.** Los modelos
 * dependen del plan y de si el CLI tiene sesión: una lista fija ofrecería
 * opciones que devuelven 404 y escondería las que sí están.
 *
 * Enseña de qué vía viene cada uno y si acepta la foto del producto como
 * referencia, porque eso decide si la imagen saldrá con tu envase o con uno
 * inventado — y conviene saberlo antes de gastar créditos, no después.
 */

export function useHiggsfieldModels() {
  const [models, setModels] = useState<CatalogModel[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [slug, setSlug] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listHiggsfieldModelsAction()
      .then((catalog) => {
        if (cancelled) return;
        setModels(catalog.models);
        setWarnings(catalog.warnings);
        // El primero es Nano Banana Pro si está: es el que acepta referencias.
        setSlug((current) => current || catalog.models[0]?.slug || "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "No se pudo leer el catálogo.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    models,
    warnings,
    slug,
    setSlug,
    loadError,
    selected: models?.find((model) => model.slug === slug) ?? null,
  };
}

export function ModelPicker({
  models,
  warnings,
  slug,
  onChange,
  selected,
  count,
  label = "Modelo de Higgsfield",
}: {
  models: CatalogModel[] | null;
  warnings: string[];
  slug: string;
  onChange: (slug: string) => void;
  selected: CatalogModel | null;
  /** Cuántas imágenes se van a generar, para estimar el coste. */
  count: number;
  label?: string;
}) {
  if (!models) return null;

  return (
    <div className="mb-3 max-w-md">
      <label className="mb-1 block text-sm font-medium">{label}</label>

      <SelectField value={slug} onChange={(event) => onChange(event.target.value)}>
        {models.map((model) => (
          <option key={`${model.source}:${model.slug}`} value={model.slug}>
            {model.title}
            {model.credits !== null ? ` — ${model.credits.toFixed(1)} créditos` : ""}
            {model.acceptsReferences === true ? " · usa tu foto" : ""}
          </option>
        ))}
      </SelectField>

      {selected ? (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {selected.credits !== null
            ? `${count} imagen(es) · unos ${(selected.credits * count).toFixed(1)} créditos en total.`
            : `${count} imagen(es). El CLI no adelanta el coste.`}{" "}
          {/* Los tres casos son distintos y se dicen distintos. «No se sabe» no
              es «no admite»: dar por hecho lo segundo escondería la función. */}
          {selected.acceptsReferences === true
            ? "Se enviará la foto principal del producto como referencia."
            : selected.acceptsReferences === null
              ? "Se comprobará al generar si admite tu foto como referencia."
              : "Este modelo no admite referencias: el envase será inventado."}
        </p>
      ) : null}

      {/* Si falta una de las dos vías se dice, en vez de enseñar media lista
          como si fuera entera. */}
      {warnings.map((warning) => (
        <p key={warning} className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          {warning}
        </p>
      ))}
    </div>
  );
}
