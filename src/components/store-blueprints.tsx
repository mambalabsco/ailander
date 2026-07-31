"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { analyzeStoreAction, deleteBlueprintAction } from "@/app/stores/blueprint-actions";
import { EXTRACTED, NOT_EXTRACTED, imagesNeeded, tierDiscounts } from "@/lib/store-blueprint";
import type { SavedBlueprint } from "@/lib/data/blueprints";

/**
 * Analizar una tienda y leer su plano.
 *
 * ## Las dos listas van juntas
 *
 * Lo que el análisis extrae y lo que no, una al lado de la otra. Enseñar solo lo
 * segundo hace parecer que la herramienta no sirve; enseñar solo lo primero deja
 * a alguien esperando imágenes que nunca van a llegar y montando su plan encima.
 *
 * ## Los pixeles se marcan en rojo y con su motivo
 *
 * No es un aviso legal. Un pixel lleva dentro el identificador de la cuenta de
 * otro: copiarlo mandaría los eventos de tus clientes a su panel de anuncios, y
 * de paso le diría qué vendes y cuánto. Eso hay que poder leerlo de un vistazo.
 */

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
};

export function StoreBlueprints({ blueprints }: { blueprints: SavedBlueprint[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Dirección de la tienda
          </span>
          <TextField
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://tienda-de-la-competencia.com"
          />
        </label>

        <GenerateButton
          variant="primary"
          action={() => analyzeStoreAction({ url })}
          label="Analizar"
          disabled={!url.trim()}
          hint="Lee la portada, el catálogo y una ficha de producto. Unos 0,05 USD."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-medium">Qué saca</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
            {EXTRACTED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-medium">Qué no, y por qué</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
            {NOT_EXTRACTED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {blueprints.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no has analizado ninguna tienda. El plano que sale de aquí se usa para construir
          tu página con tu copy y tus imágenes.
        </p>
      ) : (
        blueprints.map((blueprint) => (
          <article
            key={blueprint.id}
            className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{blueprint.storeName}</p>
                <a
                  href={blueprint.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky-700 hover:underline dark:text-sky-400"
                >
                  {blueprint.url} ↗
                </a>
              </div>

              <Button
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteBlueprintAction(blueprint.id);
                    router.refresh();
                  })
                }
              >
                Borrar
              </Button>
            </div>

            {/* La estructura: lo que se reproduce con tu contenido. */}
            {blueprint.sections.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm font-medium">
                  Estructura
                  <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                    {blueprint.sections.length} secciones · {imagesNeeded(blueprint.sections)}{" "}
                    imágenes que generar
                  </span>
                </p>
                <ol className="mt-2 space-y-1.5">
                  {blueprint.sections.map((section, index) => (
                    <li key={index} className="flex gap-2 text-sm">
                      <span className="w-6 shrink-0 tabular-nums text-slate-400">{index + 1}</span>
                      <span>
                        <span className="font-medium">{section.kind}</span>
                        {section.images > 0 ? (
                          <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                            ({section.images} img)
                          </span>
                        ) : null}
                        <span className="text-slate-600 dark:text-slate-300"> — {section.purpose}</span>
                        {section.angle ? (
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            ángulo: {section.angle}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {/* La oferta, con el descuento real. Casi nunca es el anunciado. */}
            {blueprint.offers.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm font-medium">Oferta</p>
                <table className="mt-2 text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 dark:text-slate-400">
                      <th className="pr-4 text-left font-medium">Cantidad</th>
                      <th className="pr-4 text-right font-medium">Precio</th>
                      <th className="pr-4 text-right font-medium">Por unidad</th>
                      <th className="text-right font-medium">Descuento real</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierDiscounts(blueprint.offers).map((row) => {
                      const offer = blueprint.offers.find(
                        (item) => item.quantity === row.quantity,
                      );

                      return (
                        <tr key={row.quantity}>
                          <td className="pr-4">
                            {row.quantity}
                            {offer?.highlighted ? (
                              <span className="ml-1 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-slate-900">
                                el que empujan
                              </span>
                            ) : null}
                          </td>
                          <td className="pr-4 text-right tabular-nums">
                            {money(offer?.price ?? 0, blueprint.currency || "USD")}
                          </td>
                          <td className="pr-4 text-right tabular-nums text-slate-500 dark:text-slate-400">
                            {money(row.perUnit, blueprint.currency || "USD")}
                          </td>
                          <td className="text-right tabular-nums font-medium">
                            {row.discount === null ? "—" : `${row.discount}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {blueprint.guarantee ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Garantía: {blueprint.guarantee}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Los scripts, con los pixeles marcados. */}
            {blueprint.scripts.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm font-medium">Scripts y apps</p>
                <ul className="mt-2 space-y-1">
                  {blueprint.scripts.map((script) => (
                    <li key={script.name} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          script.importable
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        }`}
                      >
                        {script.importable ? "puedes usarlo" : "no se importa"}
                      </span>
                      <span className="font-medium">{script.name}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {script.note}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {blueprint.notes ? (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{blueprint.notes}</p>
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}
