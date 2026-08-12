"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, SelectField, TextAreaField, TextField } from "@/components/ui";
import { updateProductFromForm } from "@/app/products/actions";
import type { Product } from "@/types";
import type { Store } from "@/types/store";
import { marketLabel } from "@/types/store";

const GENDER_OPTIONS = ["Mujeres", "Hombres", "No binario"];

interface EditProductFormProps {
  product: Product;
  /** Moneda del mercado en el que vive, para no rotular euros en México. */
  currency: string;
  /** Para poder cambiar de tienda o de mercado sin recrear el producto. */
  stores: Store[];
}

export function EditProductForm({ product, currency, stores }: EditProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    targetAudience: product.targetAudience,
    country: product.country,
    language: product.language,
    tone: product.tone,
    landingUrl: product.landingUrl,
    price: product.price,
    // La del producto si la tiene; si no, la del mercado o la del país.
    currency: product.currency ?? currency,
    status: product.status,
    benefits: product.benefits.join("\n"),
    features: product.features.join("\n"),
    problemsSolved: product.problemsSolved.join("\n"),
    objections: product.objections.join("\n"),
    // Datos de investigación: hasta ahora no había forma de corregirlos.
    niche: product.researchInputs?.niche ?? "",
    competitorUrls: (product.researchInputs?.competitorUrls ?? []).join("\n"),
    amazonUrl: product.researchInputs?.amazonUrl ?? "",
    targetAgeRange: product.researchInputs?.targetAgeRange ?? "",
    targetGenders: product.researchInputs?.targetGenders ?? [],
    storeId: product.storeId ?? "",
    marketId: product.marketId ?? "",
    researchShared: product.researchShared,
  });

  const selectedStore = stores.find((item) => item.id === form.storeId);

  /*
   * Cambiar de tienda reinicia el mercado.
   *
   * Los mercados son de cada tienda, así que conservar el elegido al cambiar
   * dejaría el producto apuntando a un mercado de otra: la moneda y el dominio
   * saldrían de un sitio y el producto de otro, sin que nada avisara.
   */
  const selectStore = (storeId: string) => {
    const next = stores.find((item) => item.id === storeId);
    setForm((current) => ({
      ...current,
      storeId,
      marketId: next?.markets.find((market) => market.isPrimary)?.id ?? next?.markets[0]?.id ?? "",
    }));
  };

  const toggleGender = (gender: string) =>
    setForm((current) => ({
      ...current,
      targetGenders: current.targetGenders.includes(gender)
        ? current.targetGenders.filter((item) => item !== gender)
        : [...current.targetGenders, gender],
    }));

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await updateProductFromForm(product.id, form);
        router.push(`/products/${product.id}`);
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "No se pudo guardar el producto.",
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre del producto">
          <TextField required value={form.name} onChange={(event) => update("name", event.target.value)} />
        </Field>
        <Field label="Marca">
          <TextField required value={form.brand} onChange={(event) => update("brand", event.target.value)} />
        </Field>
        <Field label="Categoría">
          <TextField
            required
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
          />
        </Field>
        <Field label="Estado">
          <SelectField
            value={form.status}
            onChange={(event) => update("status", event.target.value as Product["status"])}
          >
            <option value="active">Activo</option>
            <option value="draft">Borrador</option>
          </SelectField>
        </Field>
      </div>

      {/*
        Tienda y mercado, que hasta ahora solo se podían elegir al crear el
        producto. De ellos salen la moneda de los precios, el dominio de los
        enlaces y a qué tienda se publica la página, así que no poder cambiarlos
        obligaba a rehacer el producto entero por un clic mal dado.
      */}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tienda">
          <SelectField value={form.storeId} onChange={(event) => selectStore(event.target.value)}>
            <option value="">Sin tienda</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </SelectField>
        </Field>

        <Field label="Mercado">
          <SelectField
            value={form.marketId}
            onChange={(event) => update("marketId", event.target.value)}
            disabled={!selectedStore}
          >
            {selectedStore ? (
              selectedStore.markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {marketLabel(market)} · {market.currency}
                </option>
              ))
            ) : (
              <option value="">Elige una tienda primero</option>
            )}
          </SelectField>
        </Field>
      </div>

      {/*
        El interruptor de la investigación.
        Apagado —el valor inicial— cada mercado tiene la suya: el público de
        Chile y el de México no son el mismo, y ese era el motivo original de
        duplicar productos en vez de tener uno solo.
      */}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={form.researchShared}
          onChange={(event) => update("researchShared", event.target.checked)}
          className="mt-1 size-4 accent-violet-600"
        />
        <span className="text-sm">
          <span className="font-medium">La investigación vale para todos los mercados</span>
          <span className="block text-slate-500 dark:text-slate-400">
            Apagado, cada mercado tiene la suya y hay que generarla país por país. Encendido, se
            escribe una vez y el modo general también puede usarla.
          </span>
        </span>
      </label>

      {form.storeId && !form.marketId ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Esta tienda no tiene mercados. Créale uno en Tiendas y mercados: de ahí salen la moneda y
          el dominio de los enlaces.
        </p>
      ) : null}

      <Field label="Descripción">
        <TextAreaField
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
          className="min-h-24"
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Público objetivo">
          <TextField
            value={form.targetAudience}
            onChange={(event) => update("targetAudience", event.target.value)}
          />
        </Field>
        <Field label="Precio">
          <TextField
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(event) => update("price", Number(event.target.value))}
          />
        </Field>
        {/* La moneda solo se pregunta cuando no hay tienda de la que deducirla:
            es el caso de los productos de la competencia, que antes caían a
            euros y falseaban la comparación de precios. */}
        <Field label="Moneda del precio">
          <TextField
            value={form.currency}
            onChange={(event) => update("currency", event.target.value.toUpperCase())}
            placeholder="USD, EUR, MXN..."
          />
        </Field>
        <Field label="País">
          <TextField value={form.country} onChange={(event) => update("country", event.target.value)} />
        </Field>
        <Field label="Idioma">
          <TextField value={form.language} onChange={(event) => update("language", event.target.value)} />
        </Field>
        <Field label="Tono">
          <TextField value={form.tone} onChange={(event) => update("tone", event.target.value)} />
        </Field>
        <Field label="Landing page">
          <TextField
            type="url"
            value={form.landingUrl}
            onChange={(event) => update("landingUrl", event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Beneficios (uno por línea)">
          <TextAreaField
            value={form.benefits}
            onChange={(event) => update("benefits", event.target.value)}
            className="min-h-28"
          />
        </Field>
        <Field label="Características (una por línea)">
          <TextAreaField
            value={form.features}
            onChange={(event) => update("features", event.target.value)}
            className="min-h-28"
          />
        </Field>
        <Field label="Problemas que resuelve (uno por línea)">
          <TextAreaField
            value={form.problemsSolved}
            onChange={(event) => update("problemsSolved", event.target.value)}
            className="min-h-28"
          />
        </Field>
        <Field label="Objeciones (una por línea)">
          <TextAreaField
            value={form.objections}
            onChange={(event) => update("objections", event.target.value)}
            className="min-h-28"
          />
        </Field>
      </div>

      <section className="rounded-3xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
        <h3 className="text-sm font-semibold">Datos para la investigación</h3>
        <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-300">
          El nicho y la URL de Amazon son los que hacen falta. La edad y el género los calcula el documento
          1; déjalos vacíos salvo que quieras acotar a propósito.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nicho">
            <TextField value={form.niche} onChange={(event) => update("niche", event.target.value)} />
          </Field>
          <Field label="Rango de edad objetivo (opcional)">
            <TextField
              value={form.targetAgeRange}
              onChange={(event) => update("targetAgeRange", event.target.value)}
              placeholder="Déjalo vacío y lo calcula el documento 1"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="URL de Amazon del producto o uno similar">
            <TextField
              type="url"
              value={form.amazonUrl}
              onChange={(event) => update("amazonUrl", event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="URL de competidores (una por línea)">
            <TextAreaField
              value={form.competitorUrls}
              onChange={(event) => update("competitorUrls", event.target.value)}
              className="min-h-20 font-mono text-xs"
            />
          </Field>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 block text-sm font-medium">Géneros objetivo (opcional)</legend>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((gender) => {
              const selected = form.targetGenders.includes(gender);
              return (
                <label
                  key={gender}
                  className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition ${
                    selected
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleGender(gender)}
                    className="sr-only"
                  />
                  {gender}
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
