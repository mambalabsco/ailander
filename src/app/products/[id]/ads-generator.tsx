"use client";

import { useState } from "react";
import { SectionCard } from "@/components/section-card";
import { EmptyState, Field, SelectField, TextField } from "@/components/ui";
import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_META,
  buildAdsetName,
  buildCampaignName,
  formatsForStage,
} from "@/types/campaign";
import type { AdDestinationType, FunnelStage, Prelanding } from "@/types/campaign";
import { DEFAULT_BATCH_SIZE } from "@/lib/short-ad-prompts";
import type { Product } from "@/types";
import type { MarketingAngle } from "@/types/copy";
import { GenerateButton } from "@/components/generate-button";
import { generateShortAdsAction } from "@/app/products/[id]/generate-actions";

/**
 * De dónde sale una tanda de anuncios.
 *
 * Vive aparte de `tab-ads.tsx` porque la pestaña además enseña la estructura de
 * campaña, las prelandings, las creatividades subidas y los formatos: con las
 * fuentes aquí dentro, ese archivo pasaba del tamaño en el que se puede leer de
 * una vez.
 */
export function AdsGenerator({
  product,
  prelandings,
  angles,
  desires,
  nextNumbers,
  hasApiKey,
  hasResearch,
}: {
  product: Product;
  prelandings: Prelanding[];
  angles: MarketingAngle[];
  /** Deseos validados del documento 6, para cuando no se elige ángulo. */
  desires: string[];
  nextNumbers: { adset: number; ad: number };
  hasApiKey: boolean;
  hasResearch: boolean;
}) {
  const [stage, setStage] = useState<FunnelStage>("BOFU");
  const [count, setCount] = useState(DEFAULT_BATCH_SIZE);
  const [destinationType, setDestinationType] = useState<AdDestinationType>("producto");
  const [prelandingId, setPrelandingId] = useState(prelandings[0]?.id ?? "");
  const [plannedNote, setPlannedNote] = useState("");
  const [angleId, setAngleId] = useState(angles[0]?.id ?? "");
  const [desire, setDesire] = useState(desires[0] ?? "");
  const [overrideNames, setOverrideNames] = useState(false);
  const [customTheme, setCustomTheme] = useState("");
  const [customFocus, setCustomFocus] = useState("");

  const countryCode = product.country.slice(0, 2).toUpperCase();
  const selectedAngle = angles.find((angle) => angle.id === angleId);

  /**
   * El tema y el enfoque no se piden: se deducen.
   *
   * El tema sale del nicho del producto, que ya está en la ficha. El enfoque
   * sale del ángulo elegido — o del deseo, si no hay ángulo — porque es lo que
   * de verdad distingue una campaña de otra. Pedirlos a mano obligaba a
   * reescribir en cada tanda algo que la investigación ya sabe, y abría la
   * puerta a que dos campañas del mismo ángulo acabaran con nombres distintos.
   */
  const derivedTheme = product.researchInputs?.niche || product.category;
  const derivedFocus = selectedAngle?.name || desire || "General";

  const theme = overrideNames && customTheme ? customTheme : derivedTheme;
  const focus = overrideNames && customFocus ? customFocus : derivedFocus;

  // La audiencia también sale del ángulo: es su público objetivo.
  const derivedAudience =
    selectedAngle?.targetAudience || product.targetAudience || "Público objetivo del producto";

  /*
   * Los nombres se calculan en vivo para que se vean antes de generar.
   *
   * La campaña ya no lleva la etapa: dentro conviven conjuntos de frío, templado
   * y caliente. La etapa que eliges aquí es la del **primer** conjunto, y el
   * modelo añade los demás según lo que pida el producto.
   */
  const campaignName = buildCampaignName({ countryCode, theme, focus });
  const adsetName = buildAdsetName({ number: nextNumbers.adset, stage, focus });

  const stageFormats = formatsForStage(stage);

  return (
    <SectionCard
      title="Generar tanda de anuncios"
      description="Cada tanda arma su estructura de campaña completa. Los nombres siguen la convención y la numeración es correlativa por producto."
    >
      {!hasResearch ? (
        <EmptyState
          title="Necesitas la investigación antes de generar anuncios"
          description="El texto de los anuncios sale de los deseos, los ángulos y el lenguaje del cliente."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Etapa del embudo">
              <SelectField
                value={stage}
                onChange={(event) => setStage(event.target.value as FunnelStage)}
              >
                {FUNNEL_STAGES.map((item) => (
                  <option key={item} value={item}>
                    {FUNNEL_STAGE_META[item].label}
                  </option>
                ))}
              </SelectField>
            </Field>

            {angles.length > 0 ? (
              <Field label="Ángulo">
                <SelectField value={angleId} onChange={(event) => setAngleId(event.target.value)}>
                  {angles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
            ) : (
              <Field label="Deseo masivo">
                <SelectField value={desire} onChange={(event) => setDesire(event.target.value)}>
                  {desires.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </SelectField>
              </Field>
            )}
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            {FUNNEL_STAGE_META[stage].approach}
          </p>

          {/* Todo lo demás sale de la investigación; solo se muestra. */}
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Deducido de la investigación
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline text-slate-500 dark:text-slate-400">Tema: </dt>
                <dd className="inline font-medium">{derivedTheme}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500 dark:text-slate-400">Enfoque: </dt>
                <dd className="inline font-medium">{derivedFocus}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-slate-500 dark:text-slate-400">Audiencia: </dt>
                <dd className="inline">{derivedAudience}</dd>
              </div>
              {selectedAngle ? (
                <div className="sm:col-span-2">
                  <dt className="inline text-slate-500 dark:text-slate-400">Mecanismo: </dt>
                  <dd className="inline">{selectedAngle.problemMechanism}</dd>
                </div>
              ) : null}
            </dl>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overrideNames}
                onChange={(event) => setOverrideNames(event.target.checked)}
                className="h-4 w-4 accent-violet-600"
              />
              Ajustar el nombre a mano
            </label>

            {overrideNames ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField
                  value={customTheme}
                  onChange={(event) => setCustomTheme(event.target.value)}
                  placeholder={derivedTheme}
                  aria-label="Tema personalizado"
                />
                <TextField
                  value={customFocus}
                  onChange={(event) => setCustomFocus(event.target.value)}
                  placeholder={derivedFocus}
                  aria-label="Enfoque personalizado"
                />
              </div>
            ) : null}
          </div>

          {/* Vista previa de los nombres antes de generar nada. */}
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Así quedará la estructura
            </p>
            <div className="mt-2 space-y-1 font-mono text-sm">
              <p>{campaignName}</p>
              <p className="pl-4">└── {adsetName}</p>
              <p className="pl-8 text-slate-500 dark:text-slate-400">
                ├── Ad{nextNumbers.ad} … Ad{nextNumbers.ad + count - 1}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="mb-2 block text-sm font-medium">Destino de todos los anuncios</span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["producto", "Página de producto"],
                    ["prelanding", "Prelanding creada"],
                    ["prelanding-pendiente", "Prelanding por crear"],
                  ] as const
                ).map(([value, label]) => {
                  const disabled = value === "prelanding" && prelandings.length === 0;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => !disabled && setDestinationType(value)}
                      disabled={disabled}
                      title={disabled ? "Todavía no hay prelandings creadas" : undefined}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        destinationType === value
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {destinationType === "prelanding" ? (
                <div className="mt-3">
                  <SelectField
                    value={prelandingId}
                    onChange={(event) => setPrelandingId(event.target.value)}
                    aria-label="Elegir prelanding"
                  >
                    {prelandings.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
              ) : null}

              {destinationType === "prelanding-pendiente" ? (
                <div className="mt-3">
                  <TextField
                    value={plannedNote}
                    onChange={(event) => setPlannedNote(event.target.value)}
                    placeholder="Qué prelanding debería ser (opcional)"
                  />
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    La estructura queda anotada como PRELANDING. Podrás asignar cuál cuando la
                    crees, sin rehacer la campaña.
                  </p>
                </div>
              ) : null}

              {destinationType === "producto" ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {product.landingUrl || "Este producto no tiene URL de landing configurada."}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-950">
              <p className="font-medium">Qué hereda cada anuncio del conjunto</p>
              <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                <li>• Destino y URL</li>
                <li>• Audiencia y objetivo</li>
                <li>• Oferta anclada, si la etapa es BOFU</li>
                <li>• Los elementos que siempre van en el copy</li>
              </ul>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Se fijan a nivel de conjunto, igual que en tus campañas reales.
              </p>
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium">Cuántos anuncios ({count})</span>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 10, 15, 20].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCount(value)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    count === value
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Se reparten entre los {stageFormats.length} formatos que rinden en {stage}:{" "}
              {stageFormats.map((meta) => meta.name).join(", ")}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <GenerateButton
              action={() =>
                generateShortAdsAction({
                  productId: product.id,
                  count,
                  stage,
                  angleId,
                  theme,
                  focus,
                  audience: derivedAudience,
                  destination: destinationType,
                  prelandingId,
                })
              }
              label={`Generar ${count} anuncios y armar la campaña`}
              disabled={!hasApiKey}
              disabledReason="Configura tu clave de API en Configuración"
              hint={`Crea la campaña, el conjunto y los ${count} anuncios numerados. Entre 0,20 y 0,60 USD.`}
            />
            {!hasApiKey ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Sin clave de API configurada no se genera nada.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
