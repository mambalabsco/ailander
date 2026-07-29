"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, EmptyState, Field, ScoreBar, SelectField, Tag, TextAreaField } from "@/components/ui";
import { analyzeAd, type AdAnalysis } from "@/lib/ad-analysis";
import { recordAnalysis } from "@/app/history/actions";
import type { AdCampaign, Product } from "@/types";

interface AnalyzerWorkspaceProps {
  products: Product[];
  ads: AdCampaign[];
  initialAdId?: string;
}

export function AnalyzerWorkspace({ products, ads, initialAdId }: AnalyzerWorkspaceProps) {
  const router = useRouter();

  const initialAd = ads.find((ad) => ad.id === initialAdId);
  const [productId, setProductId] = useState(
    initialAd?.relatedProductId || products[0]?.id || "",
  );
  const [adId, setAdId] = useState(initialAd?.id ?? "");
  const [context, setContext] = useState("");
  const [preview, setPreview] = useState<string | null>(initialAd?.image ?? null);
  const [result, setResult] = useState<AdAnalysis | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const product = useMemo(
    () => products.find((item) => item.id === productId) ?? null,
    [products, productId],
  );

  const handleSelectAd = (value: string) => {
    setAdId(value);
    const ad = ads.find((item) => item.id === value);
    if (ad) {
      setPreview(ad.image);
      if (ad.relatedProductId) setProductId(ad.relatedProductId);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setAdId("");
  };

  const handleAnalyze = () => {
    if (!product) return;
    setResult(analyzeAd(product, context.trim()));
    setSaved(false);
  };

  const handleSave = () => {
    if (!result || !product) return;
    startTransition(async () => {
      await recordAnalysis({
        title: `Análisis de anuncio · ${product.name}`,
        type: "analysis",
        productId: product.id,
        productName: product.name,
        summary: result.summary,
      });
      setSaved(true);
      router.refresh();
    });
  };

  if (products.length === 0) {
    return (
      <SectionCard title="Analizador de anuncios" description="Necesitas al menos un producto para analizar">
        <EmptyState
          title="No hay productos registrados"
          description="Crea un producto propio o añade un competidor para poder analizar anuncios contra su contexto."
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Analizador de anuncios"
        description="Sube un anuncio o elige uno de tu biblioteca para extraer su gancho, promesa, público y ángulos"
      >
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div>
              <span className="mb-2 block text-sm font-medium">Imagen del anuncio</span>
              <label className="flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500 transition hover:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                {preview ? (
                  // Puede ser un blob local o una ruta subida; sin optimizador.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Anuncio a analizar" className="h-full w-full object-contain" />
                ) : (
                  <span className="px-4">Arrastra o selecciona una imagen</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {ads.length > 0 ? (
              <Field label="O elige uno de la biblioteca">
                <SelectField value={adId} onChange={(event) => handleSelectAd(event.target.value)}>
                  <option value="">Sin seleccionar</option>
                  {ads.map((ad) => (
                    <option key={ad.id} value={ad.id}>
                      {ad.name} · {ad.platform}
                    </option>
                  ))}
                </SelectField>
              </Field>
            ) : null}

            <Field label="Producto relacionado">
              <SelectField value={productId} onChange={(event) => setProductId(event.target.value)}>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.owner === "competitor" ? "(competencia)" : ""}
                  </option>
                ))}
              </SelectField>
            </Field>

            <Field label="Contexto adicional">
              <TextAreaField
                value={context}
                onChange={(event) => setContext(event.target.value)}
                className="min-h-24"
                placeholder="Ej. Se lanzó para el mercado premium y queremos probar una propuesta más emocional."
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={handleAnalyze} disabled={!product}>
                Analizar anuncio
              </Button>
              {result ? (
                <Button variant="secondary" onClick={handleSave} disabled={isPending || saved}>
                  {saved ? "Guardado en historial" : isPending ? "Guardando..." : "Guardar en historial"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
            {result ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Texto detectado</p>
                  <p className="mt-1 font-medium">{result.detectedText}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Resumen</p>
                  <p className="mt-1 text-sm leading-6">{result.summary}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(
                    [
                      ["Producto mostrado", result.productName],
                      ["Público objetivo", result.targetAudience],
                      ["Gancho principal", result.hook],
                      ["Promesa", result.promise],
                      ["Problema tratado", result.problem],
                      ["Emoción utilizada", result.emotion],
                      ["Nivel de conciencia", result.awarenessLevel],
                      ["Oferta", result.offer],
                      ["Llamado a la acción", result.cta],
                      ["Diseño visual", result.visualDesign],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                      <p className="mt-1 text-sm">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
                El resultado aparecerá aquí cuando analices el anuncio.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {result ? (
        <>
          <SectionCard title="Lectura estratégica" description="Fortalezas, debilidades y qué probar a continuación">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Fortalezas</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {result.strengths.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Debilidades</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {result.weaknesses.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/30">
                <p className="text-sm font-medium text-violet-800 dark:text-violet-300">Ideas de mejora</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {result.improvementIdeas.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">Ángulos derivados</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {result.derivedAngles.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.trustSignals.map((signal) => (
                    <Tag key={signal}>{signal}</Tag>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">Puntuación del anuncio</p>
                <div className="mt-3 space-y-3">
                  <ScoreBar label="Claridad" value={result.scores.clarity} />
                  <ScoreBar label="Carga emocional" value={result.scores.emotion} />
                  <ScoreBar label="Diferenciación" value={result.scores.differentiation} />
                  <ScoreBar label="Potencial de conversión" value={result.scores.conversion} />
                </div>
              </div>
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
