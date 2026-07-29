"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { Button, EmptyState, Field, SelectField, TextAreaField, TextField } from "@/components/ui";
import { createCompetitorProduct, deleteProductAction } from "@/app/products/actions";
import type { Product } from "@/types";
import { formatMoney } from "@/lib/money";

const emptyDraft = {
  name: "",
  brand: "",
  category: "",
  description: "",
  targetAudience: "",
  country: "España",
  language: "Español",
  tone: "Directo",
  price: 0,
  landingUrl: "",
  niche: "General",
};

interface CompetitorsPanelProps {
  competitors: Product[];
}

export function CompetitorsPanel({ competitors }: CompetitorsPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(
    () => Array.from(new Set(competitors.map((item) => item.category))).filter(Boolean).sort(),
    [competitors],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return competitors.filter((product) => {
      const matchesQuery =
        !needle ||
        product.name.toLowerCase().includes(needle) ||
        product.brand.toLowerCase().includes(needle) ||
        product.description.toLowerCase().includes(needle);
      const matchesCategory = category === "all" || product.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [competitors, query, category]);

  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await createCompetitorProduct(draft);
        setDraft(emptyDraft);
        setShowForm(false);
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "No se pudo añadir el competidor.",
        );
      }
    });
  };

  const handleDelete = (product: Product) => {
    if (!window.confirm(`¿Eliminar el competidor "${product.name}"?`)) return;

    startTransition(async () => {
      await deleteProductAction(product.id);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar competidor"
            className="sm:w-64"
            aria-label="Buscar competidor"
          />
          <SelectField
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="sm:w-48"
            aria-label="Filtrar por categoría"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
        </div>
        <Button variant="primary" onClick={() => setShowForm((current) => !current)}>
          {showForm ? "Cancelar" : "+ Añadir competidor"}
        </Button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre del producto">
              <TextField required value={draft.name} onChange={(event) => update("name", event.target.value)} />
            </Field>
            <Field label="Marca">
              <TextField required value={draft.brand} onChange={(event) => update("brand", event.target.value)} />
            </Field>
            <Field label="Categoría">
              <TextField
                required
                value={draft.category}
                onChange={(event) => update("category", event.target.value)}
              />
            </Field>
            <Field label="Precio (€)">
              <TextField
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(event) => update("price", Number(event.target.value))}
              />
            </Field>
            <Field label="Público objetivo">
              <TextField
                value={draft.targetAudience}
                onChange={(event) => update("targetAudience", event.target.value)}
              />
            </Field>
            <Field label="País">
              <TextField value={draft.country} onChange={(event) => update("country", event.target.value)} />
            </Field>
          </div>
          <Field label="Descripción">
            <TextAreaField
              value={draft.description}
              onChange={(event) => update("description", event.target.value)}
              className="min-h-20"
            />
          </Field>

          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar competidor"}
          </Button>
        </form>
      ) : null}

      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        {filtered.length} de {competitors.length} competidores
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={competitors.length === 0 ? "Aún no sigues a ningún competidor" : "Ningún competidor coincide"}
          description={
            competitors.length === 0
              ? "Añade un competidor para comparar mensajes, precios y ángulos publicitarios."
              : "Prueba con otro término de búsqueda."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((product) => (
            <div key={product.id} className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/products/${product.id}`} className="font-semibold hover:text-violet-600">
                    {product.name}
                  </Link>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{product.brand}</p>
                </div>
                <StatusPill status={product.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {product.description || "Sin descripción."}
              </p>
              <div className="mt-4 grid gap-2 text-sm text-slate-500 dark:text-slate-400">
                <p>
                  <span className="font-medium text-slate-700 dark:text-slate-200">Precio:</span>{" "}
                  {formatMoney(product.price, { currency: product.currency })}
                </p>
                <p>
                  <span className="font-medium text-slate-700 dark:text-slate-200">Promesa:</span>{" "}
                  {product.benefits[0] ?? "Sin registrar"}
                </p>
                <p>
                  <span className="font-medium text-slate-700 dark:text-slate-200">Público:</span>{" "}
                  {product.targetAudience || "Sin definir"}
                </p>
              </div>
              <div className="mt-4 flex gap-3 text-sm">
                <Link href={`/products/${product.id}`} className="text-violet-600 hover:underline">
                  Ver ficha
                </Link>
                <Link
                  href={`/products/${product.id}/edit`}
                  className="text-slate-500 hover:underline dark:text-slate-400"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(product)}
                  disabled={isPending}
                  className="text-rose-500 hover:underline disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
