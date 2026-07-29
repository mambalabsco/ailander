"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, TextField } from "@/components/ui";
import { Copyable } from "@/components/copyable";
import {
  readAbReportAction,
  saveLandingSettingsAction,
  type AbReport,
} from "@/app/products/[id]/landing-actions";
import { buildAdUrl } from "@/lib/utm";
import type { LandingPage } from "@/types/landing";

/**
 * Ajustes de la página y resultados de la prueba.
 *
 * Los enlaces etiquetados se generan aquí porque es donde se sabe la URL
 * publicada: pedirlos a mano en cada anuncio garantiza que tarde o temprano
 * alguno salga sin etiquetar, y ese no se puede medir.
 */
export function LandingAb({ productId, page }: { productId: string; page: LandingPage }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [hideChrome, setHideChrome] = useState(page.hideThemeChrome);
  const [campaign, setCampaign] = useState(page.utmCampaign ?? page.slug);
  const [ads, setAds] = useState("ad1\nad2\nad3");

  const [report, setReport] = useState<AbReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adNames = ads
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  const save = () =>
    startTransition(async () => {
      await saveLandingSettingsAction({
        id: page.id,
        productId,
        hideThemeChrome: hideChrome,
        utmCampaign: campaign,
      });
      router.refresh();
    });

  const load = () =>
    startTransition(async () => {
      setError(null);
      try {
        setReport(await readAbReportAction({ productId, days: 30 }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudieron leer los pedidos.");
      }
    });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <p className="mb-2 text-sm font-medium">Ajustes de la página</p>

        <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideChrome}
            onChange={(event) => setHideChrome(event.target.checked)}
            className="mt-1 size-4 accent-violet-600"
          />
          <span>
            Ocultar la cabecera y el pie de la tienda
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Un publirreportaje con el menú de la tienda encima se lee como una landing de producto.
              Se aplica al publicar, no en la vista previa.
            </span>
          </span>
        </label>

        <Field label="Campaña (para separar experimentos)">
          <TextField value={campaign} onChange={(event) => setCampaign(event.target.value)} />
        </Field>

        <div className="mt-3">
          <Button variant="secondary" onClick={save} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar ajustes"}
          </Button>
        </div>
      </div>

      {page.shopifyUrl ? (
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="mb-1 text-sm font-medium">Enlaces para los anuncios</p>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            Un anuncio por línea. Cada uno lleva su etiqueta, y sin ella el pedido llega a los
            informes como «sin anuncio» y no se puede comparar.
          </p>

          <textarea
            rows={4}
            value={ads}
            onChange={(event) => setAds(event.target.value)}
            className="mb-3 w-full rounded-2xl border border-slate-200 bg-white p-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
          />

          <ul className="space-y-2">
            {adNames.map((ad) => (
              <li key={ad} className="text-sm">
                <span className="mb-1 block font-medium">{ad}</span>
                <Copyable value={buildAdUrl({ pageUrl: page.shopifyUrl!, campaign, ad })}>
                  <code className="block truncate rounded-xl bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                    {buildAdUrl({ pageUrl: page.shopifyUrl!, campaign, ad })}
                  </code>
                </Copyable>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Publica la página para poder generar sus enlaces etiquetados.
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium">Resultados</p>
          <Button variant="secondary" onClick={load} disabled={isPending}>
            {isPending ? "Leyendo..." : "Leer de Shopify"}
          </Button>
        </div>

        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

        {report ? (
          <div className="space-y-3">
            {/* El veredicto va primero: es lo que hay que leer antes de mirar
                ninguna cifra, porque decide si las cifras significan algo. */}
            <p
              className={`rounded-2xl p-3 text-sm ${
                report.verdict.decided
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
              }`}
            >
              {report.verdict.message}
            </p>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {report.totalOrders} pedidos en {report.days} días; abajo solo los que entraron por una
              página.
            </p>

            {report.landings.map((landing) => (
              <div
                key={landing.key}
                className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{landing.key}</span>
                  <span className="text-sm tabular-nums">
                    {landing.orders} pedidos ·{" "}
                    {landing.revenue.toLocaleString("es-ES", {
                      style: "currency",
                      currency: landing.currency,
                    })}
                  </span>
                </div>

                <ul className="mt-2 space-y-1">
                  {(report.byAd[landing.key] ?? []).map((ad) => (
                    <li
                      key={ad.key}
                      className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300"
                    >
                      <span>{ad.key}</span>
                      <span className="tabular-nums">{ad.orders}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
