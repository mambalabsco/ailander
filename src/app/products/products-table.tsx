"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { Button, EmptyState, SelectField, TextField } from "@/components/ui";
import { deleteProductAction } from "@/app/products/actions";
import type { Product } from "@/types";

/** Resumen por producto que acompaña a cada fila. */
export interface ProductRowMeta {
  imageUrl: string | null;
  /** Precio ya formateado en la moneda de su mercado. */
  price: string;
  documentsReady: number;
  hooks: number;
  copies: number;
  ads: number;
}

interface ProductsTableProps {
  products: Product[];
  meta: Record<string, ProductRowMeta>;
}

export function ProductsTable({ products, meta }: ProductsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"tarjetas" | "tabla">("tarjetas");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).filter(Boolean).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !needle ||
        product.name.toLowerCase().includes(needle) ||
        product.brand.toLowerCase().includes(needle) ||
        product.category.toLowerCase().includes(needle);
      const matchesStatus = status === "all" || product.status === status;
      const matchesCategory = category === "all" || product.category === category;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [products, query, status, category]);

  const handleDelete = (product: Product) => {
    if (!window.confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
    setPendingId(product.id);
    startTransition(async () => {
      try {
        await deleteProductAction(product.id);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "productos.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar producto o marca"
            className="sm:w-64"
            aria-label="Buscar producto o marca"
          />
          <SelectField
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="sm:w-40"
            aria-label="Filtrar por estado"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activo</option>
            <option value="draft">Borrador</option>
          </SelectField>
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-slate-200 p-1 dark:border-slate-700">
            {(["tarjetas", "tabla"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                className={`rounded-full px-3 py-1.5 text-sm capitalize transition ${
                  view === item ? "bg-violet-600 text-white" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={handleExport} disabled={filtered.length === 0}>
            Exportar
          </Button>
          <Link
            href="/products/new"
            className="inline-flex items-center rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
          >
            + Crear producto
          </Link>
        </div>
      </div>

      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {filtered.length} de {products.length} productos
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={products.length === 0 ? "Aún no hay productos" : "Ningún producto coincide con el filtro"}
          description={
            products.length === 0
              ? "Crea tu primer producto para generar su investigación, sus ángulos y sus anuncios."
              : "Prueba con otro término de búsqueda o limpia los filtros."
          }
        />
      ) : view === "tarjetas" ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const info = meta[product.id];
            return (
              <article
                key={product.id}
                className="group overflow-hidden rounded-3xl border border-slate-200 bg-white transition hover:border-violet-400 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
              >
                <Link href={`/products/${product.id}`} className="block">
                  <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-950">
                    {info?.imageUrl ? (
                      <Image
                        unoptimized
                        src={info.imageUrl}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        className="object-contain p-4 transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <PlaceholderArt name={product.name} />
                    )}
                    <span className="absolute right-3 top-3">
                      <StatusPill status={product.status} />
                    </span>
                  </div>
                </Link>

                <div className="p-5">
                  <Link href={`/products/${product.id}`} className="block">
                    <h3 className="truncate font-semibold transition group-hover:text-violet-600">
                      {product.name}
                    </h3>
                    <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                      {product.brand} · {product.category}
                    </p>
                  </Link>

                  <p className="mt-3 text-2xl font-semibold tabular-nums">{info?.price}</p>

                  {/* Qué tiene ya construido este producto, de un vistazo. */}
                  <div className="mt-4 grid grid-cols-4 gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Stat label="Docs" value={info?.documentsReady ?? 0} total={6} />
                    <Stat label="Hooks" value={info?.hooks ?? 0} />
                    <Stat label="Copys" value={info?.copies ?? 0} />
                    <Stat label="Ads" value={info?.ads ?? 0} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    <Link href={`/products/${product.id}`} className="text-violet-600 hover:underline">
                      Abrir
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
                      disabled={isPending && pendingId === product.id}
                      className="text-rose-500 hover:underline disabled:opacity-50"
                    >
                      {isPending && pendingId === product.id ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Producto</th>
                <th className="px-4 py-3 text-left font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Precio</th>
                <th className="px-4 py-3 text-left font-medium">Contenido</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map((product) => {
                const info = meta[product.id];
                return (
                  <tr key={product.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-950">
                          {info?.imageUrl ? (
                            <Image
                              unoptimized
                              src={info.imageUrl}
                              alt={product.name}
                              fill
                              sizes="48px"
                              className="object-contain p-1"
                            />
                          ) : (
                            <PlaceholderArt name={product.name} small />
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/products/${product.id}`}
                            className="block truncate font-medium hover:text-violet-600"
                          >
                            {product.name}
                          </Link>
                          <p className="truncate text-slate-500 dark:text-slate-400">{product.brand}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{product.category}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{info?.price}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 text-xs">
                        <Chip label="docs" value={`${info?.documentsReady ?? 0}/6`} />
                        <Chip label="hooks" value={info?.hooks ?? 0} />
                        <Chip label="copys" value={info?.copies ?? 0} />
                        <Chip label="ads" value={info?.ads ?? 0} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={product.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3 whitespace-nowrap">
                        <Link href={`/products/${product.id}`} className="text-violet-600 hover:underline">
                          Abrir
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
                          disabled={isPending && pendingId === product.id}
                          className="text-rose-500 hover:underline disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-semibold tabular-nums ${value === 0 ? "text-slate-300 dark:text-slate-600" : ""}`}>
        {value}
        {total ? <span className="text-xs text-slate-400">/{total}</span> : null}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {value} {label}
    </span>
  );
}

/**
 * Marca de posición cuando el producto no tiene imagen.
 *
 * Se genera a partir del nombre, así que cada producto tiene su propio color
 * estable en vez de un gris idéntico para todos.
 */
function PlaceholderArt({ name, small = false }: { name: string; small?: boolean }) {
  const hue = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return (
    <span
      aria-hidden
      className="flex h-full w-full items-center justify-center"
      style={{
        background: `linear-gradient(135deg, oklch(0.92 0.05 ${hue}), oklch(0.85 0.08 ${hue + 30}))`,
      }}
    >
      <span
        className={`font-semibold ${small ? "text-xs" : "text-2xl"}`}
        style={{ color: `oklch(0.42 0.12 ${hue})` }}
      >
        {initials}
      </span>
    </span>
  );
}
