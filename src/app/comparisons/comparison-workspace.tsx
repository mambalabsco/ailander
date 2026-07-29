"use client";

import { useMemo, useState } from "react";
import { SectionCard } from "@/components/section-card";
import { EmptyState, Field, SelectField, Tag } from "@/components/ui";
import type { Product } from "@/types";
import type { Store } from "@/types/store";
import { formatMoney, marketMoney } from "@/lib/money";

interface ComparisonWorkspaceProps {
  ownProducts: Product[];
  competitorProducts: Product[];
  stores: Store[];
}

/** Ventajas y brechas reales calculadas a partir de los datos de cada ficha. */
function buildOpportunities(own: Product, rivals: Product[]): string[] {
  const opportunities: string[] = [];

  const cheaperRivals = rivals.filter((rival) => rival.price > 0 && rival.price < own.price);
  const pricierRivals = rivals.filter((rival) => rival.price > own.price);

  if (cheaperRivals.length > 0) {
    opportunities.push(
      `${cheaperRivals.map((rival) => rival.name).join(", ")} ${cheaperRivals.length === 1 ? "cuesta" : "cuestan"} menos: justifica tu precio con una razón para creer explícita.`,
    );
  }
  if (pricierRivals.length > 0) {
    opportunities.push(
      `Estás por debajo de ${pricierRivals.map((rival) => rival.name).join(", ")}: puedes competir por valor percibido sin bajar margen.`,
    );
  }

  const rivalBenefits = new Set(rivals.flatMap((rival) => rival.benefits.map((item) => item.toLowerCase())));
  const uniqueBenefits = own.benefits.filter((benefit) => !rivalBenefits.has(benefit.toLowerCase()));
  if (uniqueBenefits.length > 0) {
    opportunities.push(`Beneficio que nadie más comunica: ${uniqueBenefits.join(", ")}. Llévalo al titular.`);
  }

  const ownBenefits = new Set(own.benefits.map((item) => item.toLowerCase()));
  const missingBenefits = [...rivalBenefits].filter((benefit) => !ownBenefits.has(benefit));
  if (missingBenefits.length > 0) {
    opportunities.push(`La competencia comunica y tú no: ${missingBenefits.slice(0, 3).join(", ")}.`);
  }

  const sharedObjections = own.objections.filter((objection) =>
    rivals.some((rival) => rival.objections.some((item) => item.toLowerCase() === objection.toLowerCase())),
  );
  if (sharedObjections.length > 0) {
    opportunities.push(
      `Objeción común en la categoría (${sharedObjections.join(", ")}): quien la resuelva primero en el anuncio gana.`,
    );
  }

  if (opportunities.length === 0) {
    opportunities.push("Completa beneficios y objeciones en las fichas para obtener una comparación más rica.");
  }

  return opportunities;
}

export function ComparisonWorkspace({
  ownProducts,
  competitorProducts,
  stores,
}: ComparisonWorkspaceProps) {
  // Cada producto puede vivir en un mercado distinto, así que cada uno lleva su moneda.
  const money = (product: Product) => formatMoney(product.price, marketMoney(product, stores));
  const [ownId, setOwnId] = useState(ownProducts[0]?.id ?? "");
  const [selectedRivals, setSelectedRivals] = useState<string[]>(
    competitorProducts.slice(0, 2).map((item) => item.id),
  );

  const own = useMemo(() => ownProducts.find((item) => item.id === ownId) ?? null, [ownProducts, ownId]);
  const rivals = useMemo(
    () => competitorProducts.filter((item) => selectedRivals.includes(item.id)),
    [competitorProducts, selectedRivals],
  );

  const toggleRival = (id: string) =>
    setSelectedRivals((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  if (ownProducts.length === 0 || competitorProducts.length === 0) {
    return (
      <SectionCard title="Comparaciones" description="Compara tu producto con la competencia">
        <EmptyState
          title="Faltan datos para comparar"
          description="Necesitas al menos un producto propio y un competidor registrado."
        />
      </SectionCard>
    );
  }

  const columns = own ? [own, ...rivals] : rivals;
  const opportunities = own ? buildOpportunities(own, rivals) : [];

  const rows: Array<{ label: string; render: (product: Product) => React.ReactNode }> = [
    { label: "Marca", render: (product) => product.brand },
    { label: "Categoría", render: (product) => product.category },
    { label: "Precio", render: (product) => money(product) },
    { label: "Público objetivo", render: (product) => product.targetAudience || "—" },
    { label: "Tono", render: (product) => product.tone },
    { label: "País", render: (product) => product.country },
    {
      label: "Beneficios",
      render: (product) =>
        product.benefits.length > 0 ? (
          <ul className="space-y-1">
            {product.benefits.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        ) : (
          "—"
        ),
    },
    {
      label: "Objeciones",
      render: (product) =>
        product.objections.length > 0 ? (
          <ul className="space-y-1">
            {product.objections.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Comparaciones"
        description="Compara tu producto con uno o varios competidores para detectar oportunidades"
      >
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <Field label="Producto propio">
              <SelectField value={ownId} onChange={(event) => setOwnId(event.target.value)}>
                {ownProducts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
            </Field>

            <div>
              <span className="mb-2 block text-sm font-medium">Competidores</span>
              <div className="space-y-2">
                {competitorProducts.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm transition hover:border-violet-500 dark:border-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRivals.includes(item.id)}
                      onChange={() => toggleRival(item.id)}
                      className="h-4 w-4 accent-violet-600"
                    />
                    <span>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-slate-500 dark:text-slate-400"> · {item.brand}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {rivals.length === 0 ? (
              <EmptyState
                title="Selecciona al menos un competidor"
                description="Marca uno o varios competidores para ver la comparación lado a lado."
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-950">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Atributo</th>
                      {columns.map((product) => (
                        <th key={product.id} className="px-4 py-3 text-left font-medium">
                          {product.name}
                          {product.owner === "own" ? (
                            <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                              Tuyo
                            </span>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rows.map((row) => (
                      <tr key={row.label} className="align-top">
                        <td className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{row.label}</td>
                        {columns.map((product) => (
                          <td key={product.id} className="px-4 py-3">
                            {row.render(product)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {own && rivals.length > 0 ? (
        <SectionCard
          title="Oportunidades detectadas"
          description={`Diferencias entre ${own.name} y ${rivals.length} competidor${rivals.length === 1 ? "" : "es"}`}
        >
          <ul className="space-y-3 text-sm">
            {opportunities.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-violet-200 bg-violet-50 p-4 leading-6 dark:border-violet-900 dark:bg-violet-950/40"
              >
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Tag>Tu precio: {money(own)}</Tag>
            {rivals.map((rival) => (
              <Tag key={rival.id}>
                {rival.name}: {money(rival)}
              </Tag>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
