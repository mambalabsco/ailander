"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, Field, SelectField, Tag, TextField } from "@/components/ui";
import { Copyable } from "@/components/copyable";
import {
  STORE_PLATFORM_LABELS,
  marketLabel,
  productUrlFor,
  type Store,
} from "@/types/store";
import {
  addMarketAction,
  createStoreAction,
  deleteStoreAction,
  saveStoreAppAction,
  removeMarketAction,
  updateStoreAction,
} from "@/app/stores/actions";

interface StoresManagerProps {
  stores: Store[];
  /** Cuántos productos vive en cada mercado, para avisar antes de borrar. */
  productsByMarket: Record<string, number>;
}

const emptyMarket = {
  countryName: "",
  countryCode: "",
  languageName: "",
  languageCode: "",
  currency: "EUR",
  pathPrefix: "",
  domain: "",
};

const emptyStore = {
  name: "",
  brand: "",
  domain: "",
  platform: "shopify",
  countryName: "España",
  countryCode: "ES",
  languageName: "Español",
  languageCode: "es",
  currency: "EUR",
  mentionBrandInCopy: true,
};

export function StoresManager({ stores, productsByMarket }: StoresManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newStore, setNewStore] = useState(emptyStore);
  const [marketDrafts, setMarketDrafts] = useState<Record<string, typeof emptyMarket>>({});
  const [openMarketForm, setOpenMarketForm] = useState<string | null>(null);
  // Borradores por tienda: lo guardado nunca vuelve del servidor.
  const [appDrafts, setAppDrafts] = useState<Record<string, { key?: string; secret?: string }>>({});
  const [shopDrafts, setShopDrafts] = useState<Record<string, string>>({});

  const run = (task: () => Promise<unknown>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await task();
        onDone?.();
        router.refresh();
      } catch (taskError) {
        setError(taskError instanceof Error ? taskError.message : "No se pudo completar la acción.");
      }
    });
  };

  const draftFor = (storeId: string) => marketDrafts[storeId] ?? emptyMarket;

  const updateDraft = (storeId: string, patch: Partial<typeof emptyMarket>) =>
    setMarketDrafts((current) => ({
      ...current,
      [storeId]: { ...draftFor(storeId), ...patch },
    }));

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <SectionCard
        title="Tiendas"
        description="Una tienda no es un país. La misma tienda puede vender en varios países e idiomas, y cada producto vive en uno de esos mercados."
        action={
          <Button variant="primary" onClick={() => setCreating((value) => !value)}>
            {creating ? "Cancelar" : "Nueva tienda"}
          </Button>
        }
      >
        {creating ? (
          <form
            className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () => createStoreAction(newStore),
                () => {
                  setNewStore(emptyStore);
                  setCreating(false);
                },
              );
            }}
          >
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              La tienda nace con su mercado principal. Los demás países e idiomas se añaden después,
              dentro de la propia tienda.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre de la tienda">
                <TextField
                  required
                  value={newStore.name}
                  onChange={(event) => setNewStore({ ...newStore, name: event.target.value })}
                  placeholder="Ej. Lumen Lab ES"
                />
              </Field>
              <Field label="Marca (como se nombra en los textos)">
                <TextField
                  value={newStore.brand}
                  onChange={(event) => setNewStore({ ...newStore, brand: event.target.value })}
                  placeholder="Ej. Lumen Lab"
                />
              </Field>
              <Field label="Dominio">
                <TextField
                  required
                  value={newStore.domain}
                  onChange={(event) => setNewStore({ ...newStore, domain: event.target.value })}
                  placeholder="lumenlab.com"
                />
              </Field>
              <Field label="Plataforma">
                <SelectField
                  value={newStore.platform}
                  onChange={(event) => setNewStore({ ...newStore, platform: event.target.value })}
                >
                  {Object.entries(STORE_PLATFORM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </Field>
            </div>

            <p className="mt-5 text-sm font-medium">Mercado principal</p>
            <div className="mt-2 grid gap-4 md:grid-cols-4">
              <Field label="País">
                <TextField
                  required
                  value={newStore.countryName}
                  onChange={(event) => setNewStore({ ...newStore, countryName: event.target.value })}
                />
              </Field>
              <Field label="Código">
                <TextField
                  required
                  maxLength={2}
                  value={newStore.countryCode}
                  onChange={(event) => setNewStore({ ...newStore, countryCode: event.target.value })}
                />
              </Field>
              <Field label="Idioma">
                <TextField
                  required
                  value={newStore.languageName}
                  onChange={(event) => setNewStore({ ...newStore, languageName: event.target.value })}
                />
              </Field>
              <Field label="Moneda">
                <TextField
                  required
                  maxLength={3}
                  value={newStore.currency}
                  onChange={(event) => setNewStore({ ...newStore, currency: event.target.value })}
                />
              </Field>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <input
                type="checkbox"
                checked={newStore.mentionBrandInCopy}
                onChange={(event) =>
                  setNewStore({ ...newStore, mentionBrandInCopy: event.target.checked })
                }
                className="mt-0.5 size-4 accent-violet-600"
              />
              <span className="text-sm">
                <span className="font-medium">Nombrar la marca en los textos</span>
                <span className="block text-slate-500 dark:text-slate-400">
                  Desactívalo si prefieres que el copy hable solo del producto. El enlace siempre lleva al
                  dominio de la tienda.
                </span>
              </span>
            </label>

            <div className="mt-5">
              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? "Creando..." : "Crear tienda"}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="space-y-5">
          {stores.map((store) => {
            const draft = draftFor(store.id);
            const productsInStore = store.markets.reduce(
              (total, market) => total + (productsByMarket[market.id] ?? 0),
              0,
            );

            return (
              <article
                key={store.id}
                className="rounded-3xl border border-slate-200 dark:border-slate-800"
              >
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{store.name}</h3>
                      <Tag>{STORE_PLATFORM_LABELS[store.platform]}</Tag>
                      <Tag>
                        {store.markets.length}{" "}
                        {store.markets.length === 1 ? "mercado" : "mercados"}
                      </Tag>
                      <Tag>
                        {productsInStore} {productsInStore === 1 ? "producto" : "productos"}
                      </Tag>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Marca en los textos: {store.brand} · {store.domain}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      onClick={() => setOpenMarketForm(openMarketForm === store.id ? null : store.id)}
                    >
                      {openMarketForm === store.id ? "Cerrar" : "Añadir mercado"}
                    </Button>
                    <Button
                      onClick={() => {
                        if (!window.confirm(`¿Borrar la tienda «${store.name}»?`)) return;
                        run(() => deleteStoreAction(store.id));
                      }}
                      disabled={isPending || stores.length <= 1}
                      title={stores.length <= 1 ? "Es la única tienda que queda" : undefined}
                    >
                      Borrar
                    </Button>
                  </div>
                </header>

                <div className="p-5">
                  {/* El token es de esta tienda: cada una es una app distinta.
                      Nunca se lee de vuelta, solo se sabe si está puesto. */}
                  <div className="mb-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">Publicar páginas en esta tienda</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${store.shopifyAdminToken ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
                      >
                        {store.shopifyAdminToken ? "Con token" : "Sin token"}
                      </span>
                    </div>
                    <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                      Crea una app en el Dev Dashboard de Shopify, pega aquí su clave y su secreto, y
                      pulsa Conectar. El token lo consigue la plataforma sola.
                    </p>

                    <div className="mb-2 grid gap-2 md:grid-cols-2">
                      <TextField
                        value={appDrafts[store.id]?.key ?? ""}
                        onChange={(event) =>
                          setAppDrafts({
                            ...appDrafts,
                            [store.id]: { ...(appDrafts[store.id] ?? {}), key: event.target.value },
                          })
                        }
                        placeholder={store.shopifyApiKey ? "Guardada — escribe otra" : "Client ID"}
                      />
                      <TextField
                        type="password"
                        value={appDrafts[store.id]?.secret ?? ""}
                        onChange={(event) =>
                          setAppDrafts({
                            ...appDrafts,
                            [store.id]: {
                              ...(appDrafts[store.id] ?? {}),
                              secret: event.target.value,
                            },
                          })
                        }
                        placeholder={store.shopifyApiSecret ? "Guardado" : "Client secret"}
                      />
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      <Button
                        disabled={
                          isPending ||
                          !appDrafts[store.id]?.key ||
                          !appDrafts[store.id]?.secret
                        }
                        onClick={() =>
                          run(
                            () =>
                              saveStoreAppAction(
                                store.id,
                                appDrafts[store.id]?.key ?? "",
                                appDrafts[store.id]?.secret ?? "",
                              ),
                            () => setAppDrafts({ ...appDrafts, [store.id]: {} }),
                          )
                        }
                      >
                        Guardar credenciales
                      </Button>
                    </div>

                    {/* El dominio .myshopify.com, no el propio: OAuth solo
                        reconoce el primero. */}
                    {store.shopifyApiKey ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-sm">
                          <span className="mb-1 block text-slate-500 dark:text-slate-400">
                            Dominio .myshopify.com
                          </span>
                          <TextField
                            value={shopDrafts[store.id] ?? ""}
                            onChange={(event) =>
                              setShopDrafts({ ...shopDrafts, [store.id]: event.target.value })
                            }
                            placeholder="mitienda.myshopify.com"
                          />
                        </label>
                        <a
                          href={`/api/shopify/instalar?tienda=${store.id}&shop=${encodeURIComponent(shopDrafts[store.id] ?? "")}`}
                          className={`rounded-full px-4 py-2 text-sm font-medium ${shopDrafts[store.id] ? "bg-violet-600 text-white" : "pointer-events-none bg-slate-200 text-slate-400 dark:bg-slate-800"}`}
                        >
                          Conectar con Shopify
                        </a>
                      </div>
                    ) : null}
                  </div>

                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={store.mentionBrandInCopy}
                      onChange={(event) =>
                        run(() =>
                          updateStoreAction(store.id, {
                            mentionBrandInCopy: event.target.checked,
                          }),
                        )
                      }
                      disabled={isPending}
                      className="mt-0.5 size-4 accent-violet-600"
                    />
                    <span className="text-sm">
                      <span className="font-medium">Nombrar la marca en los textos</span>
                      <span className="block text-slate-500 dark:text-slate-400">
                        {store.mentionBrandInCopy
                          ? `Los copys pueden decir «${store.brand}».`
                          : "Los copys hablan solo del producto. El enlace sigue llevando al dominio."}
                      </span>
                    </span>
                  </label>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="py-2 pr-4 font-medium">Mercado</th>
                          <th className="py-2 pr-4 font-medium">Moneda</th>
                          <th className="py-2 pr-4 font-medium">URL de un producto</th>
                          <th className="py-2 pr-4 font-medium">Productos</th>
                          <th className="py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {store.markets.map((market) => {
                          const count = productsByMarket[market.id] ?? 0;
                          return (
                            <tr
                              key={market.id}
                              className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                            >
                              <td className="py-3 pr-4">
                                <span className="font-medium">{marketLabel(market)}</span>
                                {market.isPrimary ? (
                                  <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                                    principal
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-3 pr-4 tabular-nums">{market.currency}</td>
                              <td className="py-3 pr-4">
                                <Copyable
                                  value={productUrlFor(store, market, "mi-producto")}
                                  label="URL de ejemplo"
                                >
                                  <code className="font-mono text-xs">
                                    {productUrlFor(store, market, "mi-producto")}
                                  </code>
                                </Copyable>
                              </td>
                              <td className="py-3 pr-4 tabular-nums">{count}</td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (count > 0) {
                                      setError(
                                        `«${marketLabel(market)}» tiene ${count} producto(s). Muévelos o bórralos antes.`,
                                      );
                                      return;
                                    }
                                    run(() => removeMarketAction(store.id, market.id));
                                  }}
                                  disabled={isPending || store.markets.length <= 1}
                                  className="text-xs text-slate-500 underline-offset-2 hover:underline disabled:opacity-40 dark:text-slate-400"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {openMarketForm === store.id ? (
                    <form
                      className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(
                          () => addMarketAction(store.id, draft),
                          () => {
                            updateDraft(store.id, emptyMarket);
                            setOpenMarketForm(null);
                          },
                        );
                      }}
                    >
                      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
                        Un mercado es país + idioma. Si la tienda los sirve en una subcarpeta, indícala en el
                        prefijo (<code className="font-mono text-xs">/es-mx</code>); si tiene dominio propio,
                        ponlo y prevalece sobre el de la tienda.
                      </p>
                      <div className="grid gap-4 md:grid-cols-4">
                        <Field label="País">
                          <TextField
                            required
                            value={draft.countryName}
                            onChange={(event) =>
                              updateDraft(store.id, { countryName: event.target.value })
                            }
                            placeholder="México"
                          />
                        </Field>
                        <Field label="Código">
                          <TextField
                            required
                            maxLength={2}
                            value={draft.countryCode}
                            onChange={(event) =>
                              updateDraft(store.id, { countryCode: event.target.value })
                            }
                            placeholder="MX"
                          />
                        </Field>
                        <Field label="Idioma">
                          <TextField
                            required
                            value={draft.languageName}
                            onChange={(event) =>
                              updateDraft(store.id, { languageName: event.target.value })
                            }
                            placeholder="Español"
                          />
                        </Field>
                        <Field label="Moneda">
                          <TextField
                            required
                            maxLength={3}
                            value={draft.currency}
                            onChange={(event) => updateDraft(store.id, { currency: event.target.value })}
                            placeholder="MXN"
                          />
                        </Field>
                        <Field label="Prefijo de ruta (opcional)">
                          <TextField
                            value={draft.pathPrefix}
                            onChange={(event) =>
                              updateDraft(store.id, { pathPrefix: event.target.value })
                            }
                            placeholder="/es-mx"
                          />
                        </Field>
                        <Field label="Dominio propio (opcional)">
                          <TextField
                            value={draft.domain}
                            onChange={(event) => updateDraft(store.id, { domain: event.target.value })}
                            placeholder="lumenlab.mx"
                          />
                        </Field>
                      </div>
                      <div className="mt-4">
                        <Button type="submit" variant="primary" disabled={isPending}>
                          {isPending ? "Añadiendo..." : "Añadir mercado"}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
