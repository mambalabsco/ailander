"use client";

import { useState, useTransition } from "react";
import { Button, SelectField } from "@/components/ui";
import {
  applyLookAction,
  applyThemeOrderAction,
  buildLookPlanAction,
  buildThemePlanAction,
  themesForApplyAction,
  type LookPlan,
  type ThemePlan,
} from "@/app/stores/theme-plan-actions";
import { PLAN_LIMITS } from "@/lib/theme-structure";
import { PAGE_KINDS, type PageKind } from "@/lib/store-blueprint";

/**
 * Adaptar tu tema al de otra tienda: aspecto y estructura.
 *
 * ## Las dos mitades, y por qué en este orden
 *
 * **El aspecto va primero.** Es lo que hace que dos tiendas se parezcan: la
 * paleta, la letra. Dos páginas con la misma estructura y distinta paleta no se
 * parecen en nada, y al revés sí. Además se aplica de una vez y afecta a toda la
 * tienda, mientras que la estructura hay que hacerla plantilla por plantilla.
 *
 * **La estructura, después y por página.** Portada, catálogo y ficha son tres
 * plantillas distintas del tema y se comparan por separado: mezclarlas diría que
 * a tu ficha de producto le sobra media página porque la comparó con la portada
 * del competidor.
 *
 * Se enseña **tu estructura al lado de los cambios**, no solo la lista de
 * cambios: sin ver la actual, «mueve la comparativa a la posición tres» no dice
 * nada, porque hay que poder contar dónde está ahora.
 *
 * Y los límites van escritos donde se lee, no solo en el código: la diferencia
 * entre reproducir una disposición y copiar una página es justo lo que separa
 * esto de un problema, así que tiene que estar a la vista de quien lo use.
 */

const KIND_STYLE: Record<string, string> = {
  añadir: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  mover: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  quitar: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  mantener: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const PAGE_LABEL: Record<PageKind, string> = {
  home: "Portada",
  catalogo: "Catálogo",
  producto: "Ficha de producto",
};

/** Un color, para poder juzgarlo mirándolo en vez de leyendo su número. */
function Swatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block size-4 shrink-0 rounded border border-slate-300 align-middle dark:border-slate-600"
      style={{ backgroundColor: hex }}
    />
  );
}

export function ThemePlanPanel({
  stores,
  blueprints,
}: {
  stores: { id: string; name: string; connected: boolean }[];
  blueprints: { id: string; storeName: string }[];
}) {
  const [storeId, setStoreId] = useState(stores.find((store) => store.connected)?.id ?? "");
  const [blueprintId, setBlueprintId] = useState(blueprints[0]?.id ?? "");
  const [page, setPage] = useState<PageKind>("producto");
  const [plan, setPlan] = useState<ThemePlan | null>(null);
  const [look, setLook] = useState<LookPlan | null>(null);
  const [message, setMessage] = useState("");
  const [themes, setThemes] = useState<{ id: string; name: string; published: boolean }[]>([]);
  const [targetTheme, setTargetTheme] = useState("");
  const [isPending, startTransition] = useTransition();

  if (blueprints.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Analiza una tienda arriba y después podrás adaptar tu tema al suyo.
      </p>
    );
  }

  /*
   * Los temas se piden al comparar y no al aplicar: así el desplegable ya está
   * lleno cuando se decide, sin otra espera de por medio.
   *
   * El publicado **no** viene elegido. Cambiar la página que están viendo los
   * clientes es una decisión, no el efecto secundario de pulsar un botón.
   */
  const loadThemes = async (id: string) => {
    const list = await themesForApplyAction(id);
    if (!list.ok) return;

    setThemes(list.themes ?? []);
    setTargetTheme((current) => current || (list.themes?.find((item) => !item.published)?.id ?? ""));
  };

  const reset = () => {
    setPlan(null);
    setLook(null);
    setMessage("");
  };

  /** El tema publicado pide confirmación aparte, siempre. */
  const confirmed = () => {
    const theme = themes.find((item) => item.id === targetTheme);
    if (!theme?.published) return true;

    return window.confirm(
      `«${theme.name}» es el tema PUBLICADO: el cambio lo verán tus clientes en cuanto se guarde.\n\n¿Seguro? Lo prudente es aplicarlo en una copia y publicarla después.`,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tu tienda</span>
          <SelectField
            value={storeId}
            onChange={(event) => {
              setStoreId(event.target.value);
              setTargetTheme("");
              reset();
            }}
            className="min-w-44"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id} disabled={!store.connected}>
                {store.name}
                {store.connected ? "" : " · sin conectar"}
              </option>
            ))}
          </SelectField>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Copiar el aspecto de
          </span>
          <SelectField
            value={blueprintId}
            onChange={(event) => {
              setBlueprintId(event.target.value);
              reset();
            }}
            className="min-w-44"
          >
            {blueprints.map((blueprint) => (
              <option key={blueprint.id} value={blueprint.id}>
                {blueprint.storeName}
              </option>
            ))}
          </SelectField>
        </label>
      </div>

      {message ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {message}
        </p>
      ) : null}

      {/* ---------------------- 1. El aspecto: color y letra ------------------- */}

      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">1 · Colores y tipografía</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Lo que más hace que dos tiendas se parezcan, y se aplica de una vez a toda la tienda.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={isPending || !storeId || !blueprintId}
            onClick={() =>
              startTransition(async () => {
                setMessage("");
                const result = await buildLookPlanAction(storeId, blueprintId);
                if (!result.ok) {
                  setLook(null);
                  setMessage(result.message ?? "No se pudo leer el aspecto.");
                  return;
                }

                setLook(result.plan ?? null);
                await loadThemes(storeId);
              })
            }
          >
            {isPending ? "Leyendo…" : "Ver qué cambia"}
          </Button>
        </div>

        {look ? (
          <div className="mt-3 space-y-2">
            {look.changes.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tu tema ya usa esos colores y esas letras. No hay nada que cambiar.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {look.changes.map((change) => (
                  <li key={change.path} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-32 font-medium">{change.label}</span>
                    {change.from.startsWith("#") ? <Swatch hex={change.from} /> : null}
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {change.from}
                    </span>
                    <span className="text-slate-400">→</span>
                    {change.to.startsWith("#") ? <Swatch hex={change.to} /> : null}
                    <span className="font-mono text-xs font-medium">{change.to}</span>
                  </li>
                ))}
              </ul>
            )}

            {look.presetName ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tu tema está sin tocar, con los ajustes «{look.presetName}». Al aplicar se copian a
                la configuración activa, que es lo que hace el propio editor de Shopify.
              </p>
            ) : null}

            {look.unusableFonts.length > 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {look.unusableFonts.join(", ")}: Shopify no las sirve, así que el tema no puede
                usarlas sin tocar su código. Se dejan fuera.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------- 2. La estructura, página por página --------------- */}

      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <p className="text-sm font-medium">2 · Estructura de cada página</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Portada, catálogo y ficha son tres plantillas distintas: se comparan y se aplican por
          separado.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Página</span>
            <SelectField
              value={page}
              onChange={(event) => {
                setPage(event.target.value as PageKind);
                setPlan(null);
              }}
              className="min-w-44"
            >
              {PAGE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {PAGE_LABEL[kind]}
                </option>
              ))}
            </SelectField>
          </label>

          <Button
            variant="primary"
            disabled={isPending || !storeId || !blueprintId}
            onClick={() =>
              startTransition(async () => {
                setMessage("");
                const result = await buildThemePlanAction(storeId, blueprintId, page);
                if (!result.ok) {
                  setPlan(null);
                  setMessage(result.message ?? "No se pudo comparar.");
                  return;
                }

                setPlan(result.plan ?? null);
                await loadThemes(storeId);
              })
            }
          >
            {isPending ? "Comparando…" : "Comparar"}
          </Button>
        </div>

        {plan ? (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {/* Tu estructura actual: sin verla, «muévelo a la 3» no dice nada. */}
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-sm font-medium">
                Tu {PAGE_LABEL[plan.page].toLowerCase()}
                <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                  {plan.themeName}
                </span>
              </p>
              <ol className="mt-2 space-y-0.5 text-sm">
                {plan.current.map((section) => (
                  <li key={`${section.position}-${section.type}`} className="flex gap-2">
                    <span className="w-5 shrink-0 tabular-nums text-slate-400">
                      {section.position}
                    </span>
                    <span className="font-mono text-xs">{section.type}</span>
                    <span className="text-xs text-slate-400">{section.role}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-sm font-medium">
                Qué cambiar
                <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                  {plan.counts.añadir} añadir · {plan.counts.mover} mover
                </span>
              </p>

              <ul className="mt-2 space-y-2">
                {plan.changes
                  // Lo que ya está bien va al final: lo que importa es lo que hay
                  // que tocar, y mezclarlo obliga a buscarlo.
                  .slice()
                  .sort((a, b) => (a.kind === "mantener" ? 1 : b.kind === "mantener" ? -1 : 0))
                  .map((change, index) => (
                    <li key={index} className="text-sm">
                      <span
                        className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[change.kind]}`}
                      >
                        {change.kind}
                      </span>
                      <span className="font-medium">{change.role}</span>
                      {change.sectionType ? (
                        <span className="ml-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {change.sectionType}
                        </span>
                      ) : null}
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {change.reason}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      {/* --------------------------- 3. Aplicarlo ----------------------------- */}

      {(plan || look) && themes.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-medium">3 · Aplicar</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Reordena las secciones que ya tienes. Las que faltan no se añaden solas: una sección
            nueva necesita su texto y sus imágenes, y eso sale de tu producto.
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                En qué tema
              </span>
              <SelectField
                value={targetTheme}
                onChange={(event) => setTargetTheme(event.target.value)}
                className="min-w-56"
              >
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                    {theme.published ? " · PUBLICADO" : ""}
                  </option>
                ))}
              </SelectField>
            </label>

            {look && look.changes.length > 0 ? (
              <Button
                variant="secondary"
                disabled={isPending || !targetTheme}
                onClick={() =>
                  startTransition(async () => {
                    if (!confirmed()) return;

                    const result = await applyLookAction(storeId, targetTheme, blueprintId);
                    setMessage(result.message);
                  })
                }
              >
                {isPending ? "Aplicando…" : "Aplicar colores y letra"}
              </Button>
            ) : null}

            {plan ? (
              <Button
                variant="primary"
                disabled={isPending || !targetTheme}
                onClick={() =>
                  startTransition(async () => {
                    if (!confirmed()) return;

                    /*
                     * Se manda el análisis y la página, no una lista de
                     * identificadores. Armarla en el navegador fue el fallo: con
                     * dos secciones del mismo papel salía la misma repetida y
                     * Shopify rechazaba la escritura entera. El servidor lo
                     * calcula contra la plantilla que acaba de leer.
                     */
                    const result = await applyThemeOrderAction(
                      storeId,
                      targetTheme,
                      blueprintId,
                      plan.page,
                    );

                    setMessage(result.message);
                  })
                }
              >
                {isPending ? "Aplicando…" : `Aplicar orden de ${PAGE_LABEL[plan.page].toLowerCase()}`}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <p className="text-sm font-medium">Qué hace este plan y qué no</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
          {PLAN_LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
