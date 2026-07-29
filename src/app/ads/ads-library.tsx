"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { Button, EmptyState, Field, SelectField, Tag, TextField } from "@/components/ui";
import { createAdFromForm, deleteAdAction } from "@/app/ads/actions";
import type { AdCampaign, Product } from "@/types";

interface AdsLibraryProps {
  ads: AdCampaign[];
  products: Product[];
}

export function AdsLibrary({ ads, products }: AdsLibraryProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const platforms = useMemo(
    () => Array.from(new Set(ads.map((ad) => ad.platform))).filter(Boolean).sort(),
    [ads],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ads.filter((ad) => {
      const matchesQuery =
        !needle ||
        ad.name.toLowerCase().includes(needle) ||
        ad.brand.toLowerCase().includes(needle) ||
        ad.tags.some((tag) => tag.toLowerCase().includes(needle));
      const matchesType = type === "all" || ad.type === type;
      const matchesPlatform = platform === "all" || ad.platform === platform;
      return matchesQuery && matchesType && matchesPlatform;
    });
  }, [ads, query, type, platform]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        await createAdFromForm(formData);
        formRef.current?.reset();
        setPreview(null);
        setShowForm(false);
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "No se pudo subir el anuncio.");
      }
    });
  };

  const handleDelete = (ad: AdCampaign) => {
    if (!window.confirm(`¿Eliminar el anuncio "${ad.name}"?`)) return;
    startTransition(async () => {
      await deleteAdAction(ad.id);
      router.refresh();
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, marca o etiqueta"
            className="sm:w-64"
            aria-label="Buscar anuncio"
          />
          <SelectField
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="sm:w-40"
            aria-label="Filtrar por tipo"
          >
            <option value="all">Propios y competencia</option>
            <option value="own">Propios</option>
            <option value="competitor">Competencia</option>
          </SelectField>
          <SelectField
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            className="sm:w-44"
            aria-label="Filtrar por plataforma"
          >
            <option value="all">Todas las plataformas</option>
            {platforms.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="flex gap-2">
          <div className="flex rounded-full border border-slate-200 p-1 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`rounded-full px-3 py-1.5 text-sm transition ${view === "grid" ? "bg-violet-600 text-white" : "text-slate-600 dark:text-slate-300"}`}
            >
              Cuadrícula
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded-full px-3 py-1.5 text-sm transition ${view === "list" ? "bg-violet-600 text-white" : "text-slate-600 dark:text-slate-300"}`}
            >
              Lista
            </button>
          </div>
          <Button variant="primary" onClick={() => setShowForm((current) => !current)}>
            {showForm ? "Cancelar" : "+ Subir anuncio"}
          </Button>
        </div>
      </div>

      {showForm ? (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="mb-6 grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:grid-cols-[1fr_260px] dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre del anuncio">
                <TextField name="name" required placeholder="Ej. Anuncio serum nocturno" />
              </Field>
              <Field label="Marca">
                <TextField name="brand" placeholder="Ej. Lumen Lab" />
              </Field>
              <Field label="Producto relacionado">
                <SelectField name="relatedProductId" defaultValue="">
                  <option value="">Sin asignar</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Tipo">
                <SelectField name="type" defaultValue="own">
                  <option value="own">Propio</option>
                  <option value="competitor">Competencia</option>
                </SelectField>
              </Field>
              <Field label="Plataforma">
                <SelectField name="platform" defaultValue="Meta Ads">
                  <option>Meta Ads</option>
                  <option>Instagram</option>
                  <option>TikTok</option>
                  <option>Google Ads</option>
                  <option>YouTube</option>
                </SelectField>
              </Field>
              <Field label="País">
                <TextField name="country" defaultValue="España" />
              </Field>
            </div>
            <Field label="Etiquetas (separadas por comas)">
              <TextField name="tags" placeholder="skincare, serum, premium" />
            </Field>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Subiendo..." : "Guardar anuncio"}
            </Button>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium">Imagen del anuncio</span>
            <label className="flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500 transition hover:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              {preview ? (
                // Vista previa local (blob), fuera del optimizador de Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Vista previa del anuncio" className="h-full w-full object-cover" />
              ) : (
                <span className="px-4">Haz clic para seleccionar una imagen</span>
              )}
              <input
                type="file"
                name="image"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              PNG, JPG, WEBP, GIF o SVG. Máximo 5 MB.
            </p>
          </div>
        </form>
      ) : null}

      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        {filtered.length} de {ads.length} anuncios
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={ads.length === 0 ? "La biblioteca está vacía" : "Ningún anuncio coincide con el filtro"}
          description={
            ads.length === 0
              ? "Sube tu primer anuncio para analizarlo y extraer sus ganchos y promesas."
              : "Prueba con otro término o cambia los filtros."
          }
        />
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ad) => (
            <article
              key={ad.id}
              className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800"
            >
              <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-950">
                <Image src={ad.image} alt={ad.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{ad.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {ad.brand} · {ad.platform}
                    </p>
                  </div>
                  <StatusPill status={ad.status} />
                </div>
                {ad.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ad.tags.map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 flex gap-3 text-sm">
                  <Link href={`/analyzer?ad=${ad.id}`} className="text-violet-600 hover:underline">
                    Analizar
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(ad)}
                    disabled={isPending}
                    className="text-rose-500 hover:underline disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ad) => (
            <div
              key={ad.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between dark:border-slate-800"
            >
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-950">
                  <Image src={ad.image} alt={ad.name} fill sizes="80px" className="object-cover" />
                </div>
                <div>
                  <p className="font-medium">{ad.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {ad.platform} · {ad.country} · {ad.date}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={ad.status} />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {ad.type === "own" ? "Propio" : "Competencia"}
                </span>
                <Link href={`/analyzer?ad=${ad.id}`} className="text-sm text-violet-600 hover:underline">
                  Analizar
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(ad)}
                  disabled={isPending}
                  className="text-sm text-rose-500 hover:underline disabled:opacity-50"
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
