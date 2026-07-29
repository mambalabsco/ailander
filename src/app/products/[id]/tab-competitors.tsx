"use client";

import { SectionCard } from "@/components/section-card";
import {EmptyState, Tag } from "@/components/ui";
import { Copyable } from "@/components/copyable";
import { formatMoney } from "@/lib/money";
import { CompetitorSearch } from "@/components/competitor-search";
import { AWARENESS_LABELS } from "@/types/research";
import { readTierPrice } from "@/types/research";
import type { CompetitorResearch } from "@/types/research";
import type { Product } from "@/types";

interface CompetitorsTabProps {
  product: Product;
  research: CompetitorResearch | null;
  hasApiKey: boolean;
}

/**
 * Competidores del producto.
 *
 * Estaban dentro del documento 2 y no había forma de verlos sin abrir el
 * informe entero. Aquí quedan como ficha por competidor: mensaje, embudos,
 * precios, lo que gusta y lo que no, y las brechas aprovechables — que es lo
 * que de verdad se consulta al escribir.
 */
export function CompetitorsTab({ product, research, hasApiKey }: CompetitorsTabProps) {
  const declaredUrls = product.researchInputs?.competitorUrls ?? [];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Competidores"
        description="Salen del documento 2. Son propios de este producto y de su país."
        action={null}
      >
        <div className="mb-5">
          <CompetitorSearch
            productId={product.id}
            hasApiKey={hasApiKey}
            label={research ? "Buscar más competidores" : "Buscar competidores con IA"}
          />
        </div>

        {declaredUrls.length > 0 ? (
          <div className="mb-4">
            <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
              URLs que indicaste al crear el producto
            </p>
            <div className="flex flex-wrap gap-2">
              {declaredUrls.map((url) => (
                <Copyable key={url} value={url} label="URL de competidor">
                  <code className="font-mono text-xs">{url}</code>
                </Copyable>
              ))}
            </div>
          </div>
        ) : (
          <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            No indicaste ninguna URL de competidor. La plataforma puede buscarlos con IA — marcas DTC de tu
            nicho y país — y presentártelos para que confirmes cuáles entran.
          </p>
        )}

        {!research || research.competitors.length === 0 ? (
          <EmptyState
            title="Todavía no hay investigación de competencia"
            description="El documento 2 analiza cada competidor: a quién se dirige, cómo capta, qué mensaje usa, a qué precio vende y dónde deja hueco."
          />
        ) : (
          <div className="space-y-4">
            {research.competitors.map((competitor) => (
              <article
                key={competitor.name}
                className="rounded-3xl border border-slate-200 p-5 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold">{competitor.name}</h4>
                    <a
                      href={competitor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-sm text-violet-600 hover:underline"
                    >
                      {competitor.url}
                    </a>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {competitor.awarenessLevelsTargeted.map((level) => (
                      <Tag key={level}>{AWARENESS_LABELS[level]}</Tag>
                    ))}
                  </div>
                </div>

                <p className="mt-3 text-sm">
                  <span className="font-medium">Mensaje principal:</span> {competitor.mainMessage}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium">Público:</span> {competitor.targetGroup}
                </p>

                {competitor.pricing.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Precios
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {competitor.pricing.map((tier) => (
                        <span
                          key={tier.tier}
                          className="rounded-2xl border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800"
                        >
                          <span className="font-medium tabular-nums">
                            {(() => {
                              const money = readTierPrice(tier);
                              // El total y, si el escalón trae varias unidades,
                              // el precio por unidad: es lo único comparable.
                              return money.units > 1
                                ? `${formatMoney(money.price, { currency: money.currency })} · ${formatMoney(money.unitPrice, { currency: money.currency })}/u`
                                : formatMoney(money.price, { currency: money.currency });
                            })()}
                          </span>{" "}
                          <span className="text-slate-500 dark:text-slate-400">{tier.tier}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                    <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                      Lo que les gusta a sus clientes
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {competitor.customerLikes.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-3 dark:bg-rose-950/30">
                    <p className="text-xs font-medium text-rose-800 dark:text-rose-300">
                      Lo que no les gusta
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {competitor.customerDislikes.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {competitor.recurringHooks.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Ganchos que repiten
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {competitor.recurringHooks.map((hook) => (
                        <li key={hook}>• {hook}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {competitor.gaps.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/40">
                    <p className="text-xs font-medium text-violet-800 dark:text-violet-300">
                      Dónde dejan hueco
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {competitor.gaps.map((gap) => (
                        <li key={gap}>• {gap}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {competitor.estimatedRevenue ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Facturación estimada: {competitor.estimatedRevenue.business} · producto estrella{" "}
                    {competitor.estimatedRevenue.heroProduct}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      {research && research.opportunities.length > 0 ? (
        <SectionCard
          title="Oportunidades detectadas"
          description="Huecos del mercado que ningún competidor está ocupando."
        >
          <ul className="space-y-3">
            {research.opportunities.map((opportunity) => (
              <li
                key={opportunity}
                className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 dark:border-violet-900 dark:bg-violet-950/40"
              >
                {opportunity}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
