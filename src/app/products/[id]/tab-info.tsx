import Link from "next/link";
import type { MarketContext } from "@/lib/market-selection";
import { SectionCard } from "@/components/section-card";
import { ProductSheetAnalysis } from "@/components/product-sheet-analysis";
import { Tag } from "@/components/ui";
import { DuplicateProduct } from "@/app/products/[id]/duplicate-product";
import { marketLabel, type Store } from "@/types/store";
import { formatMoney, marketMoney } from "@/lib/money";
import type { Product } from "@/types";

interface InfoTabProps {
  product: Product;
  stores: Store[];
  hasApiKey: boolean;
  /** El mercado que se está mirando. En general no hay precio que enseñar. */
  marketContext: MarketContext;
}

/** Ficha editable del producto. Es la información que alimenta los 6 prompts. */
export function InfoTab({ product, stores, hasApiKey, marketContext }: InfoTabProps) {
  const store = stores.find((item) => item.id === product.storeId);
  const market = store?.markets.find((item) => item.id === product.marketId);
  const money = marketMoney(product, stores);

  const lists: { label: string; items: string[] }[] = [
    { label: "Beneficios", items: product.benefits },
    { label: "Características", items: product.features },
    { label: "Problemas que resuelve", items: product.problemsSolved },
    { label: "Objeciones", items: product.objections },
  ];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Datos del producto"
        description="Esta ficha es lo que se envía como contexto a cada uno de los 6 prompts de investigación."
        action={
          <Link
            href={`/products/${product.id}/edit`}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Editar
          </Link>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-sm text-slate-500 dark:text-slate-400">Descripción</p>
              <p className="mt-2 text-sm leading-6">{product.description || "Sin descripción todavía."}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {lists.map((list) => (
                <div key={list.label} className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">{list.label}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {list.items.length === 0 ? (
                      <li className="text-slate-400">Sin datos.</li>
                    ) : (
                      list.items.map((item) => <li key={item}>• {item}</li>)
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Datos clave</p>
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  <span className="font-medium">Marca:</span> {product.brand}
                </p>
                <p>
                  <span className="font-medium">Categoría:</span> {product.category}
                </p>
                {/*
                  En general no se enseña un precio vacío ni a cero: se dice por
                  qué no hay. Un hueco sin explicar se lee como un dato que falta
                  y alguien va y lo rellena con el de un país.
                */}
                {marketContext.price ? (
                  <p>
                    <span className="font-medium">Precio:</span>{" "}
                    {formatMoney(marketContext.price.amount, money)}
                    {marketContext.price.source === "convertido" ? (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        convertido · confírmalo antes de publicar
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">
                    Sin precio: en general no hay uno solo. Elige un mercado para verlo.
                  </p>
                )}
                <p>
                  <span className="font-medium">País:</span>{" "}
                  {marketContext.market?.countryName || "varios"}
                </p>
                <p>
                  <span className="font-medium">Idioma:</span> {product.language}
                </p>
                <p>
                  <span className="font-medium">Tono:</span> {product.tone}
                </p>
                <p>
                  <span className="font-medium">Tienda:</span>{" "}
                  {store ? store.name : "Sin asignar"}
                </p>
                <p>
                  <span className="font-medium">Mercado:</span>{" "}
                  {market ? `${marketLabel(market)} · ${market.currency}` : "Sin asignar"}
                </p>
                {store ? (
                  <p className="text-slate-500 dark:text-slate-400">
                    {store.mentionBrandInCopy
                      ? `Los textos pueden nombrar «${store.brand}».`
                      : "Los textos hablan solo del producto; la marca queda fuera del cuerpo."}
                  </p>
                ) : null}
                <p>
                  <span className="font-medium">Creado:</span> {product.createdAt}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Público objetivo</p>
              <p className="mt-2 text-sm leading-6">{product.targetAudience || "Sin definir."}</p>
            </div>

            {product.landingUrl ? (
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">Landing page</p>
                <a
                  href={product.landingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block truncate text-sm text-violet-600 hover:underline"
                >
                  {product.landingUrl}
                </a>
              </div>
            ) : null}

            {product.ingredients.length > 0 ? (
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">Composición</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.ingredients.map((item) => (
                    <Tag key={item}>{item}</Tag>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {/* Al final de la ficha: primero se ve lo que hay, después se ofrece
            completarlo. */}
        <div className="mt-6">
          <ProductSheetAnalysis productId={product.id} hasApiKey={hasApiKey} />
        </div>
      </SectionCard>

      <DuplicateProduct product={product} stores={stores} />
    </div>
  );
}
