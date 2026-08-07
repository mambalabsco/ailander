"use client";

import { useState, useTransition } from "react";
import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { themesForApplyAction } from "@/app/stores/theme-plan-actions";
import {
  generateProductPageAction,
  listProductTemplatesAction,
} from "@/app/stores/product-page-actions";

/**
 * Hacer una página de producto calcando una que ya funciona.
 *
 * ## Por qué se elige el tema a mano y no se coge el publicado
 *
 * Porque esto **escribe en el tema**. Sobre el publicado, un intento a medias
 * se ve en la tienda mientras se arregla. Eligiendo, lo normal es trabajar en
 * una copia y publicar cuando está — y quien quiera ir directo, puede.
 */
export function ProductPageMaker({
  stores,
  products,
}: {
  stores: { id: string; name: string; connected: boolean }[];
  products: { id: string; name: string }[];
}) {
  const usable = stores.filter((store) => store.connected);

  const [storeId, setStoreId] = useState(usable[0]?.id ?? "");
  const [themes, setThemes] = useState<{ id: string; name: string; published: boolean }[]>([]);
  const [themeId, setThemeId] = useState("");
  const [templates, setTemplates] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [loading, startLoading] = useTransition();

  const loadThemes = async (id: string) => {
    const list = await themesForApplyAction(id);

    setThemes(list.ok ? (list.themes ?? []) : []);
    setNote(list.ok ? "" : (list.message ?? "No se pudieron leer los temas."));
  };

  if (usable.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Conecta una tienda de Shopify para poder usar esto.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {themes.length === 0 ? (
        <div>
          <Button
            variant="secondary"
            disabled={!storeId || loading}
            onClick={() => startLoading(() => loadThemes(storeId))}
          >
            {loading ? "Leyendo…" : "Ver los temas de la tienda"}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Tienda</span>
          <SelectField
            value={storeId}
            onChange={(event) => {
              setStoreId(event.target.value);
              setThemeId("");
              setThemes([]);
              setTemplates([]);
              setModel("");
              startLoading(() => loadThemes(event.target.value));
            }}
          >
            {usable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Tema</span>
          <SelectField
            value={themeId}
            onChange={(event) => {
              setThemeId(event.target.value);
              setTemplates([]);
              setModel("");
            }}
          >
            <option value="">Elige un tema</option>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {/*
                  Que se vea cuál es el publicado: escribir ahí sale en la
                  tienda al momento, y es lo único irreversible de aquí.
                */}
                {theme.name}
                {theme.published ? " · publicado" : ""}
              </option>
            ))}
          </SelectField>
        </label>
      </div>

      <div>
        <Button
          variant="secondary"
          disabled={!themeId || loading}
          onClick={() =>
            startLoading(async () => {
              const result = await listProductTemplatesAction(storeId, themeId);

              setTemplates(result.files ?? []);
              setModel(result.files?.[0] ?? "");
              setNote(result.ok ? "" : result.message);
            })
          }
        >
          {loading ? "Buscando…" : "Buscar plantillas de producto"}
        </Button>
      </div>

      {templates.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Plantilla modelo</span>
            <SelectField value={model} onChange={(event) => setModel(event.target.value)}>
              {templates.map((file) => (
                <option key={file} value={file}>
                  {/* El prefijo es igual en todas y ocupa media línea. */}
                  {file.replace("templates/product.", "").replace(".json", "")}
                </option>
              ))}
            </SelectField>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Producto</span>
            <SelectField value={productId} onChange={(event) => setProductId(event.target.value)}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </SelectField>
          </label>
        </div>
      ) : null}

      {note ? <p className="text-sm text-amber-700 dark:text-amber-400">{note}</p> : null}

      {model && productId ? (
        <div>
          <GenerateButton
            action={() =>
              generateProductPageAction({ storeId, themeId, templateFile: model, productId })
            }
            label="Crear la página"
            hint="Copia el diseño entero tal cual y reescribe solo los textos para este producto. Crea una plantilla nueva: la modelo no se toca."
          />
        </div>
      ) : null}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Al terminar, asigna la plantilla al producto en Shopify: ficha del producto → Plantilla de
        tema.
      </p>
    </div>
  );
}
