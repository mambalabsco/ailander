"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button, Field, SelectField, TextAreaField, TextField } from "@/components/ui";
import { createProductFromForm, importProductFromUrlAction } from "@/app/products/actions";
import { marketLabel, productUrlFor, type Store } from "@/types/store";

const GENDER_OPTIONS = ["Mujeres", "Hombres", "No binario"];

const initialState = {
  name: "",
  brand: "",
  category: "",
  description: "",
  niche: "",
  country: "España",
  language: "Español",
  targetAudience: "",
  price: 0,
  landingUrl: "",
  tone: "Claro",
  competitorUrls: "",
  amazonUrl: "",
  targetAgeRange: "",
  targetGenders: [] as string[],
  vertical: "ecommerce" as "ecommerce" | "casino",
  storeId: "",
  marketId: "",
  handle: "",
  importedImageUrls: [] as string[],
};

/**
 * Los campos están agrupados por para qué sirven: la ficha comercial por un
 * lado y, por otro, lo que los 6 prompts de investigación exigen y que no se
 * puede inventar (URLs de competidor y de Amazon, edad y géneros objetivo).
 */
export function NewProductForm({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const firstStore = stores[0];
  const [form, setForm] = useState({
    ...initialState,
    storeId: firstStore?.id ?? "",
    marketId:
      (firstStore?.markets.find((market) => market.isPrimary) ?? firstStore?.markets[0])?.id ?? "",
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  const store = stores.find((item) => item.id === form.storeId) ?? firstStore;
  const market = store?.markets.find((item) => item.id === form.marketId) ?? store?.markets[0];

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /** Cambiar de tienda arrastra el mercado, el país y el idioma. */
  const selectStore = (storeId: string) => {
    const next = stores.find((item) => item.id === storeId);
    const nextMarket = next?.markets.find((item) => item.isPrimary) ?? next?.markets[0];
    setForm((current) => ({
      ...current,
      storeId,
      marketId: nextMarket?.id ?? "",
      country: nextMarket?.countryName ?? current.country,
      language: nextMarket?.languageName ?? current.language,
      brand: next && !current.brand ? next.brand : current.brand,
    }));
  };

  const selectMarket = (marketId: string) => {
    const nextMarket = store?.markets.find((item) => item.id === marketId);
    setForm((current) => ({
      ...current,
      marketId,
      country: nextMarket?.countryName ?? current.country,
      language: nextMarket?.languageName ?? current.language,
    }));
  };

  /**
   * Trae la ficha de la tienda y rellena el formulario.
   *
   * Lo que llega se puede editar antes de guardar: la importación ahorra
   * teclear, no sustituye la revisión.
   */
  const handleImport = () => {
    setError(null);
    setImportNote(null);
    setImporting(true);

    startTransition(async () => {
      try {
        const result = await importProductFromUrlAction(importUrl);
        if (!result.ok || !result.product) {
          setError(result.reason ?? "No se pudo leer la ficha.");
          return;
        }

        const imported = result.product;
        setForm((current) => ({
          ...current,
          name: imported.title,
          brand: imported.vendor || current.brand,
          category: imported.productType || current.category,
          description: imported.description || current.description,
          price: imported.price || current.price,
          handle: imported.handle,
          landingUrl: imported.sourceUrl,
          importedImageUrls: imported.images,
        }));

        setImportNote(
          imported.images.length > 0
            ? `Ficha leída. Se importarán ${imported.images.length} imagen(es); la primera quedará como principal.`
            : "Ficha leída. La tienda no publica imágenes en el JSON, tendrás que subirlas.",
        );
      } catch (importError) {
        setError(
          importError instanceof Error ? importError.message : "No se pudo leer la ficha.",
        );
      } finally {
        setImporting(false);
      }
    });
  };

  const toggleGender = (gender: string) =>
    setForm((current) => ({
      ...current,
      targetGenders: current.targetGenders.includes(gender)
        ? current.targetGenders.filter((item) => item !== gender)
        : [...current.targetGenders, gender],
    }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        /*
         * En casino la tienda se manda vacía a propósito.
         *
         * El estado arranca con la primera tienda de la lista para el caso
         * normal, y mandarla aquí colgaría el casino de una tienda que no es
         * suya. Eso no falla: mete su mercado en el encargo del copy, y el texto
         * de Chile saldría hablando del mercado de México.
         */
        const result = await createProductFromForm(
          form.vertical === "casino" ? { ...form, storeId: "", marketId: "", handle: "" } : form,
        );
        router.push(`/products/${result.product.id}?tab=documentos`);
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "No se pudo crear el producto.");
      }
    });
  };

  const esCasino = form.vertical === "casino";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold">En qué negocio está</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["ecommerce", "Producto de e-commerce"],
              ["casino", "Casino online"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => update("vertical", value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                form.vertical === value
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {esCasino ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            En casino el producto es el <strong>país</strong>, no la app: su investigación es la de
            quién juega allí, y las apps van dentro. No tiene precio, ni envío, ni tienda.
          </p>
        ) : null}
      </section>

      {esCasino ? null : (
      <section className="rounded-3xl border border-sky-200 bg-sky-50/60 p-5 dark:border-sky-900 dark:bg-sky-950/20">
        <h3 className="text-sm font-semibold">Importar desde la tienda</h3>
        <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-300">
          Pega la URL de la ficha y se rellena todo lo que la tienda ya publica: nombre, descripción, precio,
          identificador e imágenes. No consume tokens — el JSON lo sirve la propia tienda.
        </p>

        <div className="flex flex-wrap gap-3">
          <TextField
            type="url"
            value={importUrl}
            onChange={(event) => setImportUrl(event.target.value)}
            placeholder="https://mitienda.com/products/revital-serum"
            className="min-w-64 flex-1"
          />
          <Button type="button" onClick={handleImport} disabled={importing || !importUrl.trim()}>
            {importing ? "Leyendo..." : "Traer datos"}
          </Button>
        </div>

        {importNote ? (
          <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            {importNote}
          </p>
        ) : null}

        {form.importedImageUrls.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {form.importedImageUrls.slice(0, 8).map((url, index) => (
              <figure key={url} className="w-24">
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800">
                  <Image src={url} alt="" fill unoptimized className="object-contain" sizes="96px" />
                </div>
                <figcaption className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                  {index === 0 ? "Principal" : `#${index + 1}`}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </section>
      )}

      {esCasino ? (
        <section>
          <h3 className="text-sm font-semibold">El país</h3>
          <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
            Un casino no tiene tienda, ni precio, ni envío: el producto <strong>es</strong> el país,
            y de él cuelgan las apps. Esto es todo lo que hace falta.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Cómo lo llamas">
              <TextField
                required
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Casino online Chile"
              />
            </Field>
            <Field label="País donde se juega">
              <TextField
                value={form.country}
                onChange={(event) => update("country", event.target.value)}
                placeholder="Chile"
              />
            </Field>
            <Field label="Idioma y forma de hablar">
              <TextField
                value={form.language}
                onChange={(event) => update("language", event.target.value)}
                placeholder="Español de Chile"
              />
            </Field>
            <Field label="Edad del jugador (opcional)">
              <TextField
                value={form.targetAgeRange}
                onChange={(event) => update("targetAgeRange", event.target.value)}
                placeholder="25-45"
              />
            </Field>
          </div>

          <div className="mt-4 space-y-4">
            <Field label="Quién juega ahí (opcional)">
              <TextField
                value={form.targetAudience}
                onChange={(event) => update("targetAudience", event.target.value)}
                placeholder="Solo si ya lo sabes. Si no, lo averigua la investigación."
              />
            </Field>

            {/*
              Los competidores son casinos, no marcas de suplementos: es lo que
              alimenta el documento de panorama, así que la etiqueta lo dice.
            */}
            <Field label="Casinos que ya operan ahí (una URL por línea, opcional)">
              <TextAreaField
                rows={3}
                value={form.competitorUrls}
                onChange={(event) => update("competitorUrls", event.target.value)}
                placeholder={"https://…\nhttps://…"}
              />
            </Field>
          </div>

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Lo demás lo averigua la investigación: quién juega, qué teme, cómo paga y contra quién
            compites. Las apps se dan de alta después, en su pestaña, pegando su dirección.
          </p>
        </section>
      ) : (
      <section>
        <h3 className="text-sm font-semibold">Dónde se vende</h3>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          El mercado fija país, idioma, moneda y la URL de la ficha. El mismo producto en otro país se crea
          duplicando este, no rellenando el formulario otra vez.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tienda">
            <SelectField value={form.storeId} onChange={(event) => selectStore(event.target.value)}>
              {stores.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Mercado">
            <SelectField value={form.marketId} onChange={(event) => selectMarket(event.target.value)}>
              {(store?.markets ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {marketLabel(item)} · {item.currency}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>

        {store && market ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {store.mentionBrandInCopy
              ? `Los textos podrán nombrar «${store.brand}».`
              : "Los textos hablarán solo del producto; la marca queda fuera del cuerpo."}{" "}
            {form.handle ? (
              <>
                URL en este mercado:{" "}
                <code className="font-mono text-xs">{productUrlFor(store, market, form.handle)}</code>
              </>
            ) : null}
          </p>
        ) : (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            No hay ninguna tienda todavía. Crea una en Tiendas y mercados antes de dar de alta el producto.
          </p>
        )}
      </section>
      )}

      {esCasino ? null : (
      <section>
        <h3 className="text-sm font-semibold">Ficha del producto</h3>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          Los datos comerciales básicos.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre del producto">
            <TextField
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Ej. Revital Serum"
            />
          </Field>
          <Field label="Marca">
            <TextField
              required
              value={form.brand}
              onChange={(event) => update("brand", event.target.value)}
              placeholder="Ej. Lumen Lab"
            />
          </Field>
          <Field label="Categoría">
            <TextField
              required
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
              placeholder="Ej. Skincare"
            />
          </Field>
          <Field label={`Precio${market ? ` (${market.currency})` : ""}`}>
            <TextField
              type="number"
              min={0}
              step="0.01"
              required
              value={form.price}
              onChange={(event) => update("price", Number(event.target.value))}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Descripción">
            <TextAreaField
              required
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              className="min-h-24"
              placeholder="Qué es el producto y qué resuelve."
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Landing page">
            <TextField
              type="url"
              value={form.landingUrl}
              onChange={(event) => update("landingUrl", event.target.value)}
              placeholder="https://..."
            />
          </Field>
          <Field label="Tono">
            <TextField required value={form.tone} onChange={(event) => update("tone", event.target.value)} />
          </Field>
        </div>
      </section>

      )}

      {esCasino ? null : (
      <section className="rounded-3xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
        <h3 className="text-sm font-semibold">Datos para la investigación</h3>
        <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-300">
          Solo hacen falta el nicho, el país y la URL de Amazon: sin ellos el documento 1 no sabe de qué
          mercado hablar y el 5 no puede extraer las actuaciones del producto. Lo demás es opcional.
        </p>

        <p className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <span className="font-medium">La edad, el género y el público objetivo los calcula la
          investigación</span>, no tú. El documento 1 estima el reparto por edad y género del mercado, y el
          documento 3 lo usa para saber a quién escuchar. Rellénalos solo si quieres acotar a propósito una
          franja concreta; si lo haces, la investigación te dirá si el mercado real está en otra.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nicho">
            <TextField
              required
              value={form.niche}
              onChange={(event) => update("niche", event.target.value)}
              placeholder="Ej. cuidado facial premium"
            />
          </Field>
          <Field label="País objetivo">
            <TextField
              required
              value={form.country}
              onChange={(event) => update("country", event.target.value)}
            />
          </Field>
          <Field label="Idioma">
            <TextField
              required
              value={form.language}
              onChange={(event) => update("language", event.target.value)}
            />
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
          <Field label="URL de competidores (una por línea, opcional)">
            <TextAreaField
              value={form.competitorUrls}
              onChange={(event) => update("competitorUrls", event.target.value)}
              className="min-h-20 font-mono text-xs"
              placeholder={"https://competidor-principal.com\nhttps://otro-competidor.com"}
            />
          </Field>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Si lo dejas vacío, la plataforma busca marcas DTC del nicho y el país y te las presenta para que
            las confirmes antes de arrancar la investigación de competencia.
          </p>
        </div>

        <div className="mt-4">
          <Field label="URL de Amazon del producto o uno similar">
            <TextField
              type="url"
              required
              value={form.amazonUrl}
              onChange={(event) => update("amazonUrl", event.target.value)}
              placeholder="https://www.amazon.es/dp/..."
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Público objetivo (opcional)">
            <TextField
              value={form.targetAudience}
              onChange={(event) => update("targetAudience", event.target.value)}
              placeholder="Solo si ya sabes a quién te diriges"
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
      )}

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Creando..." : "Crear producto"}
        </Button>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Crear el producto no consume tokens. La investigación se lanza después, desde su pestaña Documentos.
        </p>
      </div>
    </form>
  );
}
