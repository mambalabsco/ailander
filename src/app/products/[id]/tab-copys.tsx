"use client";

import { useMemo, useState } from "react";
import { SectionCard } from "@/components/section-card";
import { Button, EmptyState, SelectField, Tag } from "@/components/ui";
import { AWARENESS_LABELS, AWARENESS_LEVELS } from "@/types/research";
import type { AwarenessLevel } from "@/types/research";
import {
  COPY_FORMAT_LABELS,
  FACEBOOK_LIMITS,
  findCopyMethod,
  methodsForFormat,
} from "@/types/copy";
import type { CopyDriver, CopyFormat, GeneratedCopy, MarketingAngle } from "@/types/copy";
import type { ProductHook } from "@/types/research";
import type { AdVisualPrompt, ProductImage } from "@/types/visuals";
import type { CopyCombination } from "@/lib/copy-coverage";
import { combinationKey } from "@/lib/copy-coverage";
import { AdVisuals } from "@/app/products/[id]/ad-visuals";
import { generateLandingAction } from "@/app/products/[id]/landing-actions";
import { SwipeFile } from "@/components/swipe-file";
import { AdaptCopy } from "@/components/adapt-copy";
import type { SwipeCopy } from "@/types/swipe";
import { Copyable, CopyableBlock } from "@/components/copyable";
import { PerformanceControl } from "@/components/performance-control";
import type { PerformanceRecord } from "@/types/performance";
import { GenerateButton } from "@/components/generate-button";
import { generateCopyAction } from "@/app/products/[id]/generate-actions";

interface CopysTabProps {
  copies: GeneratedCopy[];
  angles: MarketingAngle[];
  hooks: ProductHook[];
  desires: string[];
  hasApiKey: boolean;
  hasResearch: boolean;
  coverage: CopyCombination[];
  pending: CopyCombination[];
  /** Creatividades ya calculadas por copy, en el servidor. */
  visualsByCopy: Record<string, AdVisualPrompt[]>;
  primaryImage: ProductImage | null;
  /** Todas las del producto; aquí se agrupan por el copy que las originó. */
  images: ProductImage[];
  /** Copys ya probados, que alimentan las próximas generaciones. */
  swipeCopies: SwipeCopy[];
  productId: string;
  performance: Map<string, PerformanceRecord>;
  hasHiggsfieldKey: boolean;
}

/**
 * Creación de textos.
 *
 * El generador de long copy es uno solo con origen intercambiable, porque los
 * prompts 8 y 10 del documento comparten cuerpo literal: el 8 arranca del deseo
 * (la pieza de control) y el 10 de un ángulo (cada variante).
 */
export function CopysTab({
  copies,
  angles,
  hooks,
  desires,
  hasApiKey,
  hasResearch,
  coverage,
  pending,
  visualsByCopy,
  primaryImage,
  images,
  swipeCopies,
  productId,
  performance,
  hasHiggsfieldKey,
}: CopysTabProps) {
  const [format, setFormat] = useState<CopyFormat>("long-copy");
  const [methodId, setMethodId] = useState<string>("long-copy-discovery");
  const [driver, setDriver] = useState<CopyDriver>(angles.length > 0 ? "angle" : "desire");
  const [desire, setDesire] = useState(desires[0] ?? "");
  const [angleId, setAngleId] = useState(angles[0]?.id ?? "");
  const [hookId, setHookId] = useState("");
  const [commentStyle, setCommentStyle] = useState<"facebook" | "testimonios">("facebook");
  const [landingReferenceId, setLandingReferenceId] = useState("");
  const [landingFidelity, setLandingFidelity] = useState<"calcado" | "inspirado">("calcado");

  /*
   * Las creatividades ya generadas, por copy.
   *
   * Antes caían todas en la galería del producto sin saber de qué anuncio
   * salieron, así que había que abrirlas una por una para reconocerlas.
   */
  const imagesByCopy = useMemo(() => {
    const map: Record<string, ProductImage[]> = {};
    for (const image of images) {
      if (!image.copyId) continue;
      (map[image.copyId] ??= []).push(image);
    }
    return map;
  }, [images]);

  const [level, setLevel] = useState<AwarenessLevel>("problem-aware");

  /*
   * Solo los ganchos de esta combinación.
   *
   * **Un gancho se escribe para un nivel de conciencia y un deseo concretos.**
   * La lista salía entera, así que se podía abrir un anuncio de fondo de embudo
   * con un gancho escrito para alguien que no sabe que tiene el problema — el
   * error más caro posible, porque el anuncio parece correcto y no convierte.
   *
   * Con ángulo, el deseo es el del ángulo: un ángulo cuenta una historia sobre
   * un deseo masivo concreto y sus ganchos son los de ese deseo.
   */
  const targetDesire = driver === "angle" ? (angles.find((item) => item.id === angleId)?.desire ?? "") : desire;

  const matchingHooks = useMemo(
    () =>
      hooks.filter(
        (hook) => hook.awarenessLevel === level && (!targetDesire || hook.desire === targetDesire),
      ),
    [hooks, level, targetDesire],
  );
  const [openCopyId, setOpenCopyId] = useState<string | null>(null);
  const [filterFormat, setFilterFormat] = useState<string>("all");

  const methods = useMemo(() => methodsForFormat(format), [format]);
  const method = findCopyMethod(methodId) ?? methods[0];

  const coverageByKey = useMemo(
    () => new Map(coverage.map((item) => [item.key, item])),
    [coverage],
  );

  /** Estado de la combinación que hay seleccionada ahora mismo. */
  const currentCombination = useMemo(() => {
    const driverKey = driver === "angle" ? angleId : desire;
    if (!driverKey) return undefined;
    return coverageByKey.get(combinationKey(driver, driverKey, level));
  }, [coverageByKey, driver, angleId, desire, level]);

  /** Marca para una opción del selector: ya escrita o pendiente con su prioridad. */
  const optionMark = (optionDriver: CopyDriver, driverKey: string) => {
    const combination = coverageByKey.get(combinationKey(optionDriver, driverKey, level));
    if (!combination) return "";
    return combination.used
      ? `  ✓ ya escrito (${combination.usedBy.length})`
      : `  · pendiente, prioridad ${combination.priority}`;
  };

  const handleFormatChange = (next: CopyFormat) => {
    setFormat(next);
    const first = methodsForFormat(next)[0];
    if (first) setMethodId(first.id);
  };

  const filteredCopies = useMemo(
    () => (filterFormat === "all" ? copies : copies.filter((copy) => copy.format === filterFormat)),
    [copies, filterFormat],
  );

  const canGenerate =
    hasApiKey && hasResearch && (driver === "desire" ? Boolean(desire) : Boolean(angleId));

  return (
    <div className="space-y-6">
      <SwipeFile productId={productId} copies={swipeCopies} />
      <AdaptCopy productId={productId} hasApiKey={hasApiKey} swipeCopies={swipeCopies} />

      <SectionCard
        title="Crear texto"
        description="Long copy y publirreportajes para Facebook. Cada pieza sale con texto principal, título y descripción."
      >
        {!hasResearch ? (
          <EmptyState
            title="Necesitas la investigación antes de escribir"
            description="Los textos se construyen sobre los deseos masivos y los ángulos, que salen de los 6 documentos."
          />
        ) : (
          <div className="space-y-5">
            {/* Formato */}
            <div>
              <span className="mb-2 block text-sm font-medium">Formato</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(COPY_FORMAT_LABELS) as CopyFormat[]).map((item) => {
                  const active = format === item;
                  const disabled = item === "short-ad";
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => !disabled && handleFormatChange(item)}
                      disabled={disabled}
                      title={disabled ? "Pendiente del prompt de anuncios cortos" : undefined}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        active
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      }`}
                    >
                      {COPY_FORMAT_LABELS[item]}
                      {disabled ? " · pendiente" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Método */}
            <div>
              <span className="mb-2 block text-sm font-medium">Marco de escritura</span>
              <div className="grid gap-3 md:grid-cols-2">
                {methods.map((item) => {
                  const active = method?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMethodId(item.id)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        active
                          ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30"
                          : "border-slate-200 hover:border-violet-400 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{item.name}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.origin === "documento"
                              ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                          }`}
                        >
                          {item.origin === "documento" ? item.sourcePrompt ?? "Documento" : "Añadido"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.summary}</p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {item.narrator} · {item.wordRange[0]}-{item.wordRange[1]} palabras ·{" "}
                        {item.readingLevel}
                      </p>
                      <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">
                        {item.whenToUse}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Origen */}
            <div>
              <span className="mb-2 block text-sm font-medium">De qué parte la historia</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDriver("desire")}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    driver === "desire"
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  Del deseo masivo
                </button>
                <button
                  type="button"
                  onClick={() => setDriver("angle")}
                  disabled={angles.length === 0}
                  title={angles.length === 0 ? "Genera ángulos primero" : undefined}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    driver === "angle"
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  De un ángulo
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {driver === "desire"
                  ? "Del deseo sale la pieza de control: sirve para saber si el deseo convierte antes de invertir en ángulos."
                  : "Del ángulo salen las variantes. Es el mismo motor de escritura, alimentado con una historia concreta."}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {driver === "desire" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Deseo masivo</span>
                  <SelectField value={desire} onChange={(event) => setDesire(event.target.value)}>
                    {desires.map((item) => (
                      <option key={item} value={item}>
                        {item}
                        {optionMark("desire", item)}
                      </option>
                    ))}
                  </SelectField>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Ángulo</span>
                  <SelectField value={angleId} onChange={(event) => setAngleId(event.target.value)}>
                    {angles.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {optionMark("angle", item.id)}
                      </option>
                    ))}
                  </SelectField>
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Nivel de conciencia</span>
                <SelectField
                  value={level}
                  onChange={(event) => setLevel(event.target.value as AwarenessLevel)}
                >
                  {AWARENESS_LEVELS.map((item) => {
                    const driverKey = driver === "angle" ? angleId : desire;
                    const combination = driverKey
                      ? coverageByKey.get(combinationKey(driver, driverKey, item))
                      : undefined;
                    return (
                      <option key={item} value={item}>
                        {AWARENESS_LABELS[item]}
                        {combination
                          ? combination.used
                            ? "  ✓ ya escrito"
                            : `  · pendiente, prioridad ${combination.priority}`
                          : ""}
                      </option>
                    );
                  })}
                </SelectField>
              </label>

              {format === "long-copy" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Gancho de apertura</span>
                  <SelectField value={hookId} onChange={(event) => setHookId(event.target.value)}>
                    <option value="">Que lo escriba el modelo</option>

                    {/* Separados en dos grupos en vez de coloreados: el color de
                        un <option> no se pinta igual en todos los navegadores y
                        el orden sí se ve siempre. */}
                    {matchingHooks.some((hook) => !hook.isUsed) ? (
                      <optgroup label="Sin usar">
                        {matchingHooks
                          .filter((hook) => !hook.isUsed)
                          .map((hook) => (
                            <option key={hook.id} value={hook.id}>
                              {hook.title}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}

                    {matchingHooks.some((hook) => hook.isUsed) ? (
                      <optgroup label="Ya usados">
                        {matchingHooks
                          .filter((hook) => hook.isUsed)
                          .map((hook) => (
                            <option key={hook.id} value={hook.id}>
                              ✓ {hook.title}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}
                  </SelectField>

                  {/* Un desplegable con solo «que lo escriba el modelo» parece
                      roto. Se explica por qué está vacío y qué hacer. */}
                  {matchingHooks.length === 0 ? (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      No hay ganchos para {AWARENESS_LABELS[level]}
                      {targetDesire ? ` · ${targetDesire}` : ""}. Genéralos en la pestaña de Ganchos
                      o deja que lo escriba el modelo.
                    </p>
                  ) : null}
                </label>
              ) : null}
            </div>

            {currentCombination?.used ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                Ya hay {currentCombination.usedBy.length}{" "}
                {currentCombination.usedBy.length === 1 ? "texto escrito" : "textos escritos"} para esta
                combinación. Puedes generar otra variante, pero mira antes las pendientes: rinden más.
              </p>
            ) : null}

            {/* La página completa, además del texto suelto. */}
            {format === "advertorial" ? (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/20">
                <p className="text-sm font-medium">O genera la página completa</p>
                <p className="mt-1 mb-3 text-sm text-slate-600 dark:text-slate-300">
                  Sale maquetada, con sus huecos de imagen y sus comentarios: lista para pegar en
                  Shopify.
                </p>

                {/* Partir de una landing o un copy guardado, para los casos en
                    que lo que quieres es calcar uno que ya funciona. */}
                {swipeCopies.length > 0 ? (
                  <div className="mb-3 grid gap-2 md:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block">Partir de una referencia</span>
                      <SelectField
                        value={landingReferenceId}
                        onChange={(event) => setLandingReferenceId(event.target.value)}
                      >
                        <option value="">Sin referencia — solo la investigación</option>
                        {swipeCopies.map((copy) => (
                          <option key={copy.id} value={copy.id}>
                            {copy.title}
                            {copy.source ? ` — ${copy.source}` : ""}
                          </option>
                        ))}
                      </SelectField>
                    </label>

                    {landingReferenceId ? (
                      <label className="text-sm">
                        <span className="mb-1 block">Cuánto seguirla</span>
                        <SelectField
                          value={landingFidelity}
                          onChange={(event) =>
                            setLandingFidelity(event.target.value as "calcado" | "inspirado")
                          }
                        >
                          <option value="calcado">Calcada — misma estructura</option>
                          <option value="inspirado">Inspirada — página nueva</option>
                        </SelectField>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  Comentarios:
                  <SelectField
                    value={commentStyle}
                    onChange={(event) =>
                      setCommentStyle(event.target.value as "facebook" | "testimonios")
                    }
                  >
                    <option value="facebook">Estilo Facebook, tono local de móvil</option>
                    <option value="testimonios">Testimonios con nombre y edad</option>
                  </SelectField>
                </label>

                <GenerateButton
                  variant="secondary"
                  action={() =>
                    generateLandingAction({
                      productId,
                      methodId,
                      angleId: driver === "angle" ? angleId : "",
                      commentStyle,
                      referenceId: landingReferenceId,
                      fidelity: landingFidelity,
                    })
                  }
                  label="Generar la página completa"
                  disabled={!canGenerate}
                  disabledReason={
                    !hasApiKey ? "Configura tu clave de API en Configuración" : undefined
                  }
                  hint="Unos 0,20 USD."
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <GenerateButton
                action={() =>
                  generateCopyAction({
                    productId,
                    format,
                    methodId,
                    awarenessLevel: level,
                    driver,
                    desire,
                    angleId,
                    hookId,
                  })
                }
                label={`Generar ${method ? method.name.toLowerCase() : "texto"}`}
                disabled={!canGenerate}
                disabledReason={
                  !hasApiKey
                    ? "Configura tu clave de API en Configuración"
                    : "Elige el origen del texto antes de generar."
                }
                hint="Entre 1.000 y 1.500 palabras con su título y descripción. Alrededor de 0,10 USD."
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

      {pending.length > 0 ? (
        <SectionCard
          title="Combinaciones pendientes"
          description="Ordenadas por prioridad: cuota de mercado del nivel de conciencia por la posición del deseo en el ranking."
        >
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Prioridad</th>
                  <th className="px-4 py-3 text-left font-medium">Origen</th>
                  <th className="px-4 py-3 text-left font-medium">Nivel de conciencia</th>
                  <th className="px-4 py-3 text-right font-medium">Ir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pending.map((item) => (
                  <tr key={item.key}>
                    <td className="px-4 py-3">
                      <span className="inline-flex min-w-9 justify-center rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold tabular-nums text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.driverLabel}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.driver === "angle" ? "Ángulo" : "Deseo masivo"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {item.awarenessLabel}
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.priorityReason}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setDriver(item.driver);
                          if (item.driver === "angle") setAngleId(item.driverKey);
                          else setDesire(item.driverKey);
                          setLevel(item.awarenessLevel);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="text-sm text-violet-600 hover:underline"
                      >
                        Seleccionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Textos generados"
        description="Cada pieza guarda los tres campos que pide el gestor de anuncios de Meta."
        action={
          copies.length > 0 ? (
            <SelectField
              value={filterFormat}
              onChange={(event) => setFilterFormat(event.target.value)}
              className="w-48"
              aria-label="Filtrar por formato"
            >
              <option value="all">Todos los formatos</option>
              {(Object.keys(COPY_FORMAT_LABELS) as CopyFormat[]).map((item) => (
                <option key={item} value={item}>
                  {COPY_FORMAT_LABELS[item]}
                </option>
              ))}
            </SelectField>
          ) : undefined
        }
      >
        {filteredCopies.length === 0 ? (
          <EmptyState
            title="Aún no hay textos para este producto"
            description="Elige formato, marco y origen, y el texto aparecerá aquí listo para copiar."
          />
        ) : (
          <div className="space-y-4">
            {filteredCopies.map((copy) => {
              const copyMethod = findCopyMethod(copy.methodId);
              const open = openCopyId === copy.id;
              const headlineOver = copy.content.headline.length > FACEBOOK_LIMITS.headline;
              const descriptionOver = copy.content.description.length > FACEBOOK_LIMITS.description;

              return (
                <article
                  key={copy.id}
                  className="rounded-3xl border border-slate-200 p-5 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Copyable value={copy.content.headline} label="titular">
                        <p className="font-medium">{copy.content.headline}</p>
                      </Copyable>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {copyMethod?.name ?? copy.methodId} ·{" "}
                        {copy.driver === "angle" ? "ángulo" : "deseo"}: {copy.driverLabel}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Tag>{COPY_FORMAT_LABELS[copy.format]}</Tag>
                      <Tag>{AWARENESS_LABELS[copy.awarenessLevel]}</Tag>
                      <Tag>{copy.wordCount} palabras</Tag>
                    </div>
                  </div>

                  {/* Los tres campos, cada uno con su propio botón de copiar. */}
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <CopyableBlock
                      value={copy.content.headline}
                      label={`Título · ${copy.content.headline.length}/${FACEBOOK_LIMITS.headline}${headlineOver ? " — se pasa" : ""}`}
                      maxHeightClass="max-h-24"
                      className={headlineOver ? "border-rose-400" : ""}
                    >
                      <p className="text-sm">{copy.content.headline}</p>
                    </CopyableBlock>
                    <CopyableBlock
                      value={copy.content.description}
                      label={`Descripción · ${copy.content.description.length}/${FACEBOOK_LIMITS.description}${descriptionOver ? " — se pasa" : ""}`}
                      maxHeightClass="max-h-24"
                      className={descriptionOver ? "border-rose-400" : ""}
                    >
                      <p className="text-sm">{copy.content.description}</p>
                    </CopyableBlock>
                  </div>

                  {open ? (
                    <div className="mt-3">
                      <CopyableBlock
                        value={copy.content.primaryText}
                        label="Texto principal"
                        maxHeightClass="max-h-[32rem]"
                      >
                        <p className="whitespace-pre-wrap text-sm leading-7">
                          {copy.content.primaryText}
                        </p>
                      </CopyableBlock>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <Button variant="secondary" onClick={() => setOpenCopyId(open ? null : copy.id)}>
                      {open ? "Ocultar texto" : "Ver texto completo"}
                    </Button>
                  </div>

                  <div className="mt-4">
                    <PerformanceControl
                      productId={productId}
                      targetType="copy"
                      targetId={copy.id}
                      record={performance.get(`copy::${copy.id}`)}
                    />
                  </div>

                  {visualsByCopy[copy.id]?.length ? (
                    <AdVisuals
                      productId={productId}
                      copyId={copy.id}
                      visuals={visualsByCopy[copy.id]}
                      primaryImage={primaryImage}
                      hasHiggsfieldKey={hasHiggsfieldKey}
                      generated={imagesByCopy[copy.id] ?? []}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
