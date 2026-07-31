"use client";

import { useState, useTransition } from "react";
import { Button, SelectField, TextField } from "@/components/ui";
import {
  deleteShopProductAction,
  listShopProductsAction,
  listThemesAction,
  saveShopProductAction,
} from "@/app/stores/product-actions";
import type { ListedProduct, ShopTheme } from "@/lib/shopify-store";

/**
 * Los productos de una tienda de Shopify, desde la plataforma.
 *
 * ## No se cargan solos
 *
 * Hay que pulsar. Cargar el catálogo al abrir la pantalla haría una llamada a
 * Shopify por cada visita a Tiendas —también cuando alguien entra a cambiar un
 * dominio— y el cupo de la Admin API se cuenta por coste de consulta.
 *
 * ## Lo que se puede borrar, se confirma con el nombre a la vista
 *
 * Borrar un producto en Shopify no tiene papelera. El aviso lleva el título
 * dentro para que no se confunda con el de al lado.
 */

export function ShopProducts({
  stores,
}: {
  stores: { id: string; name: string; connected: boolean }[];
}) {
  const [storeId, setStoreId] = useState(stores.find((store) => store.connected)?.id ?? "");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<ListedProduct[] | null>(null);
  const [themes, setThemes] = useState<ShopTheme[] | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const store = stores.find((item) => item.id === storeId);

  const load = () =>
    startTransition(async () => {
      setMessage("");
      const result = await listShopProductsAction(storeId, search);

      if (result.ok) setProducts(result.products ?? []);
      else {
        setProducts(null);
        setMessage(result.message ?? "No se pudo consultar.");
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tienda</span>
          <SelectField
            value={storeId}
            onChange={(event) => {
              setStoreId(event.target.value);
              // El catálogo de la anterior no vale para la nueva: se limpia en
              // vez de dejarlo ahí pareciendo que es de esta.
              setProducts(null);
              setThemes(null);
            }}
            className="min-w-48"
          >
            {stores.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.connected}>
                {item.name}
                {item.connected ? "" : " · sin conectar"}
              </option>
            ))}
          </SelectField>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Buscar</span>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="título, sku, etiqueta"
          />
        </label>

        <Button variant="primary" disabled={isPending || !store?.connected} onClick={load}>
          {isPending ? "Cargando…" : "Ver productos"}
        </Button>

        <Button
          disabled={isPending || !store?.connected}
          onClick={() =>
            startTransition(async () => {
              const result = await listThemesAction(storeId);
              if (result.ok) setThemes(result.themes ?? []);
              else setMessage(result.message ?? "No se pudieron leer los temas.");
            })
          }
        >
          Ver temas
        </Button>
      </div>

      {message ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {message}
        </p>
      ) : null}

      {themes ? (
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-medium">Temas</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {themes.map((theme) => (
              <li key={theme.id}>
                {theme.name}
                {theme.role === "MAIN" ? (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    publicado
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                    {theme.role.toLowerCase()}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/*
            Shopify responde con un error de acceso que no dice cuál es el
            permiso que falta, y el de código de tema va en su propia fila.
          */}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Para editar el código del tema hace falta <code>write_theme_code</code>, que va en su
            propia fila del panel de la app —«Theme Code»— y viene desmarcado.
          </p>
        </div>
      ) : null}

      {products === null ? null : products.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Esta tienda no tiene productos que coincidan.
        </p>
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <ProductRow
              key={product.id}
              storeId={storeId}
              product={product}
              onDone={load}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductRow({
  storeId,
  product,
  onDone,
}: {
  storeId: string;
  product: ListedProduct;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(product.title);
  const [status, setStatus] = useState(product.status);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <li className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{product.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {product.variants.length} variante(s) · {product.images.length} imagen(es) ·{" "}
            {product.status.toLowerCase()}
            {product.variants[0] ? ` · desde ${product.variants[0].price}` : ""}
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => setEditing((current) => !current)}>
            {editing ? "Cancelar" : "Editar"}
          </Button>
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                // Con el título dentro: borrar en Shopify no tiene papelera, y
                // un aviso genérico se confunde con el producto de al lado.
                if (!window.confirm(`¿Borrar «${product.title}» de Shopify? No se puede deshacer.`)) {
                  return;
                }
                const result = await deleteShopProductAction(storeId, product.id);
                if (result.ok) onDone();
                else setMessage(result.message ?? "No se pudo borrar.");
              })
            }
          >
            Borrar
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Título</span>
            <TextField value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Estado</span>
            <SelectField value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ACTIVE">Activo</option>
              <option value="DRAFT">Borrador</option>
            </SelectField>
          </label>

          <Button
            variant="primary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                /*
                 * No se mandan las variantes: `productSet` reemplaza la lista
                 * entera, así que omitirlas es lo que las deja intactas.
                 * Mandarlas a medias las borraría.
                 */
                const result = await saveShopProductAction(storeId, {
                  id: product.id,
                  title,
                  status,
                });

                if (result.ok) {
                  setEditing(false);
                  onDone();
                } else {
                  setMessage(result.message ?? "No se pudo guardar.");
                }
              })
            }
          >
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      ) : null}

      {message ? (
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{message}</p>
      ) : null}
    </li>
  );
}
