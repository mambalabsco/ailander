"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, EmptyState, Field, SelectField, TextAreaField } from "@/components/ui";
import { copyFormats, generateCopy, type CopyFormat, type GeneratedCopy } from "@/lib/ad-analysis";
import { recordAnalysis } from "@/app/history/actions";
import type { Product } from "@/types";

const tones = ["Premium", "Claro", "Emocional", "Directo", "Cercano"];

interface CopyWorkspaceProps {
  ownProducts: Product[];
  competitorProducts: Product[];
}

export function CopyWorkspace({ ownProducts, competitorProducts }: CopyWorkspaceProps) {
  const router = useRouter();
  const [sourceText, setSourceText] = useState(
    "Nuestro producto combina hidratación, luminosidad y sensaciones premium para un ritual diario.",
  );
  const [productId, setProductId] = useState(ownProducts[0]?.id ?? "");
  const [competitorId, setCompetitorId] = useState("");
  const [format, setFormat] = useState<CopyFormat>("Facebook Ads");
  const [tone, setTone] = useState(tones[0]);
  const [result, setResult] = useState<GeneratedCopy | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const product = useMemo(
    () => ownProducts.find((item) => item.id === productId) ?? null,
    [ownProducts, productId],
  );
  const competitor = useMemo(
    () => competitorProducts.find((item) => item.id === competitorId) ?? null,
    [competitorProducts, competitorId],
  );

  const handleGenerate = () => {
    if (!product) return;
    setResult(generateCopy({ sourceText, product, competitor, format, tone }));
    setNotice(null);
  };

  const handleCopy = async () => {
    if (!result) return;
    const text = `${result.headline}\n\n${result.body}\n\n${result.cta}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copiado al portapapeles.");
    } catch {
      setNotice("El navegador bloqueó el acceso al portapapeles.");
    }
  };

  const handleSave = () => {
    if (!result || !product) return;
    startTransition(async () => {
      await recordAnalysis({
        title: `${format} · ${product.name}`,
        type: "copy",
        productId: product.id,
        productName: product.name,
        summary: `${result.headline}\n\n${result.body}`,
      });
      setNotice("Guardado en el historial.");
      router.refresh();
    });
  };

  if (ownProducts.length === 0) {
    return (
      <SectionCard title="Generador de copy" description="Necesitas al menos un producto propio">
        <EmptyState
          title="No hay productos propios"
          description="Crea un producto para poder adaptar textos largos a su público, tono y beneficios."
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Generador de copy"
        description="Adapta un texto largo al producto, formato y tono que elijas"
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4">
            <Field label="Texto original largo">
              <TextAreaField
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                className="min-h-32"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Producto">
                <SelectField value={productId} onChange={(event) => setProductId(event.target.value)}>
                  {ownProducts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Competidor de referencia">
                <SelectField value={competitorId} onChange={(event) => setCompetitorId(event.target.value)}>
                  <option value="">Ninguno</option>
                  {competitorProducts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Tipo de contenido">
                <SelectField
                  value={format}
                  onChange={(event) => setFormat(event.target.value as CopyFormat)}
                >
                  {copyFormats.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Tono">
                <SelectField value={tone} onChange={(event) => setTone(event.target.value)}>
                  {tones.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </SelectField>
              </Field>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-medium">Acciones</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleGenerate}>
                  {result ? "Regenerar" : "Generar"}
                </Button>
                <Button variant="secondary" onClick={handleCopy} disabled={!result}>
                  Copiar
                </Button>
                <Button variant="secondary" onClick={handleSave} disabled={!result || isPending}>
                  {isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
              {notice ? (
                <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
            {result ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {format} · {tone}
                  {competitor ? ` · frente a ${competitor.name}` : ""}
                </p>
                <h3 className="text-xl font-semibold">{result.headline}</h3>
                <p className="whitespace-pre-wrap text-sm leading-6">{result.body}</p>
                <p className="inline-flex rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white">
                  {result.cta}
                </p>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-medium">Variantes de titular</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    {result.variants.map((variant) => (
                      <li key={variant}>• {variant}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-slate-400">
                  Contenido simulado con fines de demostración. Al conectar un proveedor de IA se
                  sustituye por la generación real.
                </p>
              </div>
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
                Aún no se ha generado un texto. El resultado aparecerá aquí.
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
