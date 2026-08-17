"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { EmptyState, Field, SelectField, TextAreaField, TextField } from "@/components/ui";
import { ReferenceAds, type ReferenceAd } from "@/components/video/reference-ads";
import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_META,
  buildAdsetName,
  buildCampaignName,
  formatsForStage,
} from "@/types/campaign";
import type { AdDestinationType, FunnelStage, Prelanding } from "@/types/campaign";
import { DEFAULT_BATCH_SIZE } from "@/lib/short-ad-prompts";
import { NIVELES } from "@/lib/nivel-de-copia";
import type { NivelDeCopia } from "@/lib/nivel-de-copia";
import type { AlcanceDeTanda } from "@/lib/alcance-de-tanda";
import type { Anatomia } from "@/lib/anatomia";
import type { Product } from "@/types";
import type { MarketingAngle } from "@/types/copy";
import { GenerateButton } from "@/components/generate-button";
import {
  generateAdsAutoAction,
  generateShortAdsAction,
} from "@/app/products/[id]/generate-actions";
import {
  generateAdsFromNewMaterialAction,
  saveAnatomiaAction,
} from "@/app/products/[id]/material-actions";

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
  anatomias,
  videoReferences,
  desires,
  nextNumbers,
  hasApiKey,
  hasResearch,
}: {
  product: Product;
  prelandings: Prelanding[];
  angles: MarketingAngle[];
  /** Anuncios que ya funcionaron, analizados en la pestaña de Ángulos. */
  anatomias: { id: string; title: string; summary: string; anatomia: Anatomia }[];
  /** Vídeos ya analizados: de ahí sale su análisis, no el vídeo. */
  videoReferences: ReferenceAd[];
  /** Deseos validados del documento 6, para cuando no se elige ángulo. */
  desires: string[];
  nextNumbers: { adset: number; ad: number };
  hasApiKey: boolean;
  hasResearch: boolean;
}) {
  /*
   * Embudo entero o una sola etapa.
   *
   * Hasta el 16 de agosto solo existía lo primero, y la pantalla no lo decía: el
   * desplegable se llamaba «Etapa del embudo» como si la tanda entera fuera de
   * esa etapa, cuando era solo por dónde entraba.
   */
  const router = useRouter();
  const [guardandoDuenio, setGuardandoDuenio] = useState(false);
  const [alcance, setAlcance] = useState<AlcanceDeTanda>("embudo");
  /*
   * Lo que ninguna investigación puede saber, y por eso se pregunta.
   *
   * Cuánto regala el bono esta semana, qué hay en la escalera de premios y quién
   * ganó de verdad. Sin estos datos el modelo **se los inventa**, y aquí lo
   * inventado es un nombre propio con su comuna y una cifra de premio: eso no es
   * una licencia creativa, es un testimonio falso con nombre y apellido.
   */
  const [casino, setCasino] = useState({
    bono: "",
    premios: "",
    ganadores: "",
    tienda: "Google Play",
    jerga: "",
    notas: "",
  });
  const embudoCompleto = alcance === "embudo";
  const [fuente, setFuente] = useState<"angulo" | "material" | "nuevo" | "libre">("angulo");
  const [copyNuevo, setCopyNuevo] = useState("");
  const [propio, setPropio] = useState(false);
  const [videosElegidos, setVideosElegidos] = useState<string[]>([]);
  const imagenesRef = useRef<HTMLInputElement>(null);
  const [anatomiaId, setAnatomiaId] = useState(anatomias[0]?.id ?? "");
  /*
   * «Parecido, con más ideas» por defecto y no «mismo enfoque».
   *
   * Es el que aporta algo sin alejarse. El pegado sirve para escalar un ganador,
   * pero como valor inicial haría que la primera tanda de cualquiera fuese la
   * más parecida a lo que ya tiene, que es la menos útil.
   */
  const [nivel, setNivel] = useState<NivelDeCopia>("ampliado");
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
  const selectedAnatomia = anatomias.find((item) => item.id === anatomiaId);
  const desdeMaterial = fuente === "material" && Boolean(selectedAnatomia);
  const copyCorto = copyNuevo.trim().length < 200;
  const esCasino = product.vertical === "casino";
  const deCero = fuente === "libre";

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
  /*
   * Desde material, el enfoque sale del deseo que explota el anuncio.
   *
   * Sin esto la campaña se llamaría «General» y dos tandas de dos materiales
   * distintos quedarían con el mismo nombre, que es como se pierde de vista qué
   * se probó ya.
   */
  const derivedFocus = deCero
    ? /*
       * De cero el enfoque lo pone el modelo, porque es lo único que lo sabe:
       * la campaña se nombra con lo que él acabe inventando. Vacío no rompe el
       * nombre — `joinName` se salta las piezas que no hay.
       */
      ""
    : desdeMaterial
      ? selectedAnatomia!.anatomia.deseo || selectedAnatomia!.anatomia.promesa || "Material"
      : selectedAngle?.name || desire || "General";

  const theme = overrideNames && customTheme ? customTheme : derivedTheme;
  const focus = overrideNames && customFocus ? customFocus : derivedFocus;

  // La audiencia sale del ángulo o, desde material, de a quién le hablaba él.
  const derivedAudience = desdeMaterial
    ? selectedAnatomia!.anatomia.publico ||
      product.targetAudience ||
      "Público objetivo del producto"
    : selectedAngle?.targetAudience || product.targetAudience || "Público objetivo del producto";

  /*
   * Los nombres se calculan en vivo para que se vean antes de generar.
   *
   * La campaña ya no lleva la etapa: dentro conviven conjuntos de frío, templado
   * y caliente. La etapa que eliges aquí es la del **primer** conjunto, y el
   * modelo añade los demás según lo que pida el producto.
   */
  const campaignName = buildCampaignName({ countryCode, theme, focus });
  const adsetName = buildAdsetName({ number: nextNumbers.adset, stage, focus });

  const stageFormats = formatsForStage(stage, product.vertical);

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
          {/*
            De dónde sale la idea. Lo demás —destino, cuántos, numeración— es
            común a las dos: un anuncio nacido de un material se numera y se sube
            igual que cualquier otro.
          */}
          <div>
            <span className="mb-2 block text-sm font-medium">Cómo se arma</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["embudo", "Embudo completo"],
                  ["etapa", "Una sola etapa"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAlcance(value)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    alcance === value
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {embudoCompleto
                ? "De dos a cuatro conjuntos, mezclando etapas. La que elijas abajo es por dónde entra."
                : "Un solo conjunto de la etapa que elijas. Para cuando el embudo ya está montado y solo quieres más de una."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["angulo", "Desde un ángulo"],
                ["material", "Desde un anuncio ya analizado"],
                ["nuevo", "Pegar un anuncio"],
                // De cero solo en casino: es donde hay país, bono y app de los
                // que tirar sin molde. En e-commerce los formatos hacen falta.
                ...(esCasino ? ([["libre", "De cero, sin formatos"]] as const) : []),
              ] as const
            ).map(([value, label]) => {
              const disabled = value === "material" && anatomias.length === 0;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => !disabled && setFuente(value)}
                  disabled={disabled}
                  title={
                    disabled
                      ? "Analiza un anuncio en la pestaña Ángulos para tener material"
                      : undefined
                  }
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    fuente === value
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {deCero ? (
            <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Sin ángulo, sin material y{" "}
              <span className="font-medium">sin la lista de formatos</span>: solo la investigación
              del país y lo que rellenes abajo. Cada pieza la inventa entera —de qué entra, cómo se
              ve, cómo se llama— y se le exige variedad medible: tres emociones distintas, tres
              tipos de imagen, una sin nadie celebrando y una que no hable de dinero. Se le pasan
              los conjuntos ya generados para que no vuelva sobre ellos. El enfoque de la campaña lo
              pone él.
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={embudoCompleto ? "Por dónde entra el embudo" : "La etapa de la tanda"}>
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

            {fuente === "nuevo" || deCero ? null : fuente === "material" ? (
              <Field label="Qué anuncio copiar">
                <SelectField
                  value={anatomiaId}
                  onChange={(event) => setAnatomiaId(event.target.value)}
                >
                  {anatomias.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.summary || item.title}
                    </option>
                  ))}
                </SelectField>
              </Field>
            ) : angles.length > 0 ? (
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

          {fuente === "nuevo" ? (
            <div className="space-y-3">
              <Field label="El copy que funcionó, entero">
                <TextAreaField
                  rows={10}
                  value={copyNuevo}
                  onChange={(event) => setCopyNuevo(event.target.value)}
                  placeholder="Pega el anuncio completo, tal y como se publicó."
                />
              </Field>

              {/*
                De quién es no es una etiqueta: decide qué se puede reutilizar.
                De lo ajeno solo se hereda la construcción, porque una cifra de
                otro anuncio es algo que dijo otro sobre otro producto.
              */}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={propio}
                  onChange={(event) => setPropio(event.target.checked)}
                  className="mt-1 size-4 accent-violet-600"
                />
                <span>
                  <span className="font-medium">Es mío y ya lo lancé</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    De lo tuyo se puede reutilizar una promesa concreta y sus cifras, que están
                    comprobadas. De lo ajeno, solo cómo está construido.
                  </span>
                </span>
              </label>

              <Field label="Imágenes del anuncio (opcional)">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={imagenesRef}
                  className="text-sm"
                />
              </Field>

              {videoReferences.length > 0 ? (
                <Field label="Vídeos ya analizados que se lanzaron con este copy">
                  <div className="space-y-1">
                    {videoReferences.map((item) => (
                      <label key={item.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={videosElegidos.includes(item.id)}
                          onChange={(event) =>
                            setVideosElegidos((current) =>
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                          className="size-4 accent-violet-600"
                        />
                        {item.name}
                      </label>
                    ))}
                  </div>
                </Field>
              ) : null}

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Primero se escribe la anatomía del anuncio y de ahí salen los tuyos. La anatomía
                queda guardada en la pestaña de Ángulos: la puedes corregir, y la siguiente tanda
                desde este mismo material ya no la paga.
              </p>
            </div>
          ) : null}

          {fuente !== "angulo" ? (
            <div>
              <span className="mb-2 block text-sm font-medium">Con qué cercanía</span>
              <div className="space-y-2">
                {NIVELES.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2 rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-800"
                  >
                    <input
                      type="radio"
                      name="nivel"
                      checked={nivel === item.id}
                      onChange={() => setNivel(item.id)}
                      className="mt-1 size-4 accent-violet-600"
                    />
                    <span>
                      {item.nombre}
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {item.explicacion}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {/*
                De quién es, visible y cambiable desde aquí.

                Las anatomías escritas antes de que existiera el campo se leen
                como ajenas, y nadie lo eligió: se veía en el resultado y no en la
                pantalla. Cambiarlo aquí lo guarda en la anatomía, así que la
                siguiente tanda ya sale bien sin volver a analizar el material.
              */}
              {fuente === "material" && selectedAnatomia ? (
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedAnatomia.anatomia.ownership === "propio"}
                    disabled={guardandoDuenio}
                    onChange={(event) => {
                      const ownership = event.target.checked ? "propio" : "ajeno";
                      setGuardandoDuenio(true);
                      void saveAnatomiaAction(selectedAnatomia.id, product.id, {
                        ...selectedAnatomia.anatomia,
                        ownership,
                      }).finally(() => {
                        setGuardandoDuenio(false);
                        router.refresh();
                      });
                    }}
                    className="mt-1 size-4 accent-violet-600"
                  />
                  <span>
                    <span className="font-medium">Este anuncio es mío y ya lo lancé</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {selectedAnatomia.anatomia.ownership === "propio"
                        ? "Sus cifras están comprobadas y se pueden repetir tal cual."
                        : "De otra marca: se hereda su idea entera, pero ninguna de sus cifras se dirá como nuestra."}
                    </span>
                  </span>
                </label>
              ) : null}

              {fuente === "nuevo" && !propio ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  De otra marca: se hereda su idea —el tema, el deseo, el reencuadre— pero ninguna
                  de sus cifras se va a decir como nuestra.
                </p>
              ) : null}
            </div>
          ) : null}

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
              {desdeMaterial ? (
                <div className="sm:col-span-2">
                  <dt className="inline text-slate-500 dark:text-slate-400">Por qué funciona: </dt>
                  <dd className="inline">{selectedAnatomia!.anatomia.porQueFunciona}</dd>
                </div>
              ) : selectedAngle ? (
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
              <p className="break-all">{campaignName}</p>
              <p className="pl-4">└── {adsetName}</p>
              <p className="pl-8 text-slate-500 dark:text-slate-400">
                ├── Ad{nextNumbers.ad} … Ad{nextNumbers.ad + count - 1}
              </p>
            </div>

            {/*
              Lo que la vista previa **no** puede saber, dicho aquí.
              Antes dibujaba un conjunto y salían tres, y el nombre que enseñaba
              no era el que se guardaba. El nombre de la campaña ya es exacto; el
              reparto en conjuntos lo decide el modelo y no se puede prometer.
            */}
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {embudoCompleto ? (
                <>
                  El nombre de la campaña es el definitivo. Dentro saldrán de{" "}
                  <span className="font-medium">dos a cuatro conjuntos</span> —este es el de
                  entrada— y sus nombres los pone el modelo según las etapas que decida.
                </>
              ) : (
                <>
                  El nombre de la campaña y el del conjunto son los definitivos. Un solo conjunto,
                  con los {count} anuncios dentro.
                </>
              )}
            </p>
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
              {deCero
                ? `Ninguno sale de un formato: son ${count} ideas distintas, y cuantas más pidas más difícil le resulta que no se repitan entre sí.`
                : `Se reparten entre los ${stageFormats.length} formatos que rinden en ${stage}: ${stageFormats
                    .map((meta) => meta.name)
                    .join(", ")}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <GenerateButton
              action={() => {
                if (fuente === "nuevo") {
                  const payload = new FormData();
                  payload.set("productId", product.id);
                  payload.set("copy", copyNuevo);
                  payload.set("ownership", propio ? "propio" : "ajeno");
                  payload.set("nivel", nivel);
                  payload.set("cuantos", String(count));
                  payload.set("stage", stage);
                  payload.set("alcance", alcance);
                  payload.set("destination", destinationType);
                  payload.set("prelandingId", prelandingId);
                  for (const id of videosElegidos) payload.append("videoReferenceIds", id);
                  for (const file of imagenesRef.current?.files ?? []) {
                    payload.append("imagenes", file);
                  }

                  return generateAdsFromNewMaterialAction(payload);
                }

                return generateShortAdsAction({
                  productId: product.id,
                  count,
                  stage,
                  alcance,
                  // Uno de los dos, nunca los dos: el material sustituye al
                  // ángulo en el encargo, no se suma. Y de cero, ninguno.
                  angleId: desdeMaterial || deCero ? "" : angleId,
                  ...(desdeMaterial ? { anatomiaId, nivel } : {}),
                  ...(deCero ? { libre: true } : {}),
                  theme,
                  focus,
                  audience: derivedAudience,
                  destination: destinationType,
                  prelandingId,
                  ...(esCasino ? { ...casino, notasCasino: casino.notas } : {}),
                });
              }}
              label={
                fuente === "nuevo"
                  ? `Analizar y generar ${count} anuncios`
                  : deCero
                    ? `Inventar ${count} anuncios de cero`
                    : `Generar ${count} anuncios y armar la campaña`
              }
              disabled={!hasApiKey || (fuente === "nuevo" && copyCorto)}
              disabledReason={
                fuente === "nuevo" && copyCorto
                  ? "Pega el copy entero: con un fragmento no hay anatomía que sacar"
                  : "Configura tu clave de API en Configuración"
              }
              hint={
                fuente === "nuevo"
                  ? `Dos llamadas: la anatomía y los ${count} anuncios. Aparecerán dos trabajos en el panel.`
                  : `Crea la campaña, el conjunto y los ${count} anuncios numerados. Entre 0,20 y 0,60 USD.`
              }
            />
            {!hasApiKey ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Sin clave de API configurada no se genera nada.
              </p>
            ) : null}
          </div>

          {esCasino ? (
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-medium">Los datos de la promoción</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Nada de esto sale de la investigación: cambia cada semana. Si lo dejas vacío, el
                modelo se lo inventa — y aquí lo inventado es un nombre propio con su comuna y una
                cifra de premio.
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Lo que se regala">
                  <TextField
                    value={casino.bono}
                    onChange={(event) => setCasino({ ...casino, bono: event.target.value })}
                    placeholder="$100.000 para jugar · +150 lucas"
                  />
                </Field>
                <Field label="Cómo se llama al dinero ahí">
                  <TextField
                    value={casino.jerga}
                    onChange={(event) => setCasino({ ...casino, jerga: event.target.value })}
                    placeholder="lucas, soles, zł"
                  />
                </Field>
                <Field label="Dónde se descarga">
                  <TextField
                    value={casino.tienda}
                    onChange={(event) => setCasino({ ...casino, tienda: event.target.value })}
                    placeholder="Google Play"
                  />
                </Field>
                <Field label="La escalera de premios">
                  <TextField
                    value={casino.premios}
                    onChange={(event) => setCasino({ ...casino, premios: event.target.value })}
                    placeholder="1 casa, 1 SUV, sueldo mensual, 1 viaje"
                  />
                </Field>
              </div>

              <div className="mt-3 space-y-3">
                <Field label="Ganadores reales (uno por línea: nombre, comuna, monto)">
                  <TextAreaField
                    rows={3}
                    value={casino.ganadores}
                    onChange={(event) => setCasino({ ...casino, ganadores: event.target.value })}
                    placeholder={"Evaristo Castillo, Maipú, $42.640.550"}
                  />
                </Field>
                <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Solo los de verdad. Sin ninguno, el encargo prohíbe el formato nominal y escribe el
                  testimonio sin identificar a nadie.
                </p>

                <Field label="Cualquier otra cosa que haga falta">
                  <TextAreaField
                    rows={3}
                    value={casino.notas}
                    onChange={(event) => setCasino({ ...casino, notas: event.target.value })}
                    placeholder="Fechas de sorteo, condiciones del bono, lo que sea. Entra tal cual en el encargo."
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {/*
            El que no pregunta nada.
            Va al final y con otro aspecto: es un atajo, no la forma normal de
            trabajar, y ponerlo arriba invitaría a no mirar nunca lo de encima.
          */}
          <div className="rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <p className="text-sm font-medium">O que decida él</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Mira la investigación, los ángulos y el material analizado, elige con qué vale la pena
              tirar y arma la tanda. El resumen dice qué eligió y por qué.
            </p>
            <div className="mt-3">
              <GenerateButton
                action={() => generateAdsAutoAction({ productId: product.id })}
                label="Generar y ya"
                variant="secondary"
                disabled={!hasApiKey || (angles.length === 0 && anatomias.length === 0)}
                disabledReason={
                  angles.length === 0 && anatomias.length === 0
                    ? "No hay ángulos ni material con los que pueda decidir"
                    : "Configura tu clave de API en Configuración"
                }
                hint="Dos llamadas: una corta para elegir y la normal para escribir. Entre 0,20 y 0,60 USD."
              />
            </div>
          </div>

          {fuente === "nuevo" ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
              <p className="text-sm font-medium">¿El anuncio llevaba un vídeo sin analizar?</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Analízalo aquí abajo: son minutos, y la tanda de arriba{" "}
                <span className="font-medium">no lo va a esperar</span>. Cuando termine aparecerá en
                la lista de vídeos y entrará en la siguiente.
              </p>
              <div className="mt-3">
                <ReferenceAds productId={product.id} references={videoReferences} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
