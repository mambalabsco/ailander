"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Tag } from "@/components/ui";
import { CampaignBatch } from "@/app/products/[id]/campaign-batch";
import {
  archiveCampaignAction,
  moveCampaignAction,
} from "@/app/products/[id]/folder-actions";
import type { CampaignFolder } from "@/types/campaign";
import { Copyable, CopyableBlock } from "@/components/copyable";
import { PerformanceControl } from "@/components/performance-control";
import type { PerformanceRecord } from "@/types/performance";
import { PERFORMANCE_META } from "@/types/performance";
import {
  FUNNEL_STAGE_META,
  formatMeta,
  destinationLabel,
} from "@/types/campaign";
import type { AdUnit, CampaignTree, FunnelStage, Prelanding, ShortAd } from "@/types/campaign";
import type { ProductImage } from "@/types/visuals";
import { AdVisualSender } from "@/components/ad-visual-sender";
import { ImageDownloads } from "@/components/image-downloads";

interface CampaignStructureProps {
  /** Todas las del producto; aquí se agrupan por el anuncio que las originó. */
  images: ProductImage[];
  /** Las descartadas al rehacer, para el pie de cada rejilla. */
  discardedImages: ProductImage[];
  productId: string;
  trees: CampaignTree[];
  /** Para el desplegable de «mover a». */
  folders: CampaignFolder[];
  /** `null` es todas; si no, solo las de esa carpeta. */
  onlyFolder: string | null;
  prelandings: Prelanding[];
  /** Rendimiento marcado, indexado por `short-ad::id`. */
  performance: Map<string, PerformanceRecord>;
}

const STAGE_COLORS: Record<FunnelStage, string> = {
  TOFU: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  MOFU: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  BOFU: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

/** El destino se colorea distinto según esté resuelto o solo planificado. */
function destinationStyle(type: string) {
  if (type === "producto") return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300";
  if (type === "prelanding") return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
  return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

/**
 * Estructura de campaña.
 *
 * Dos vistas del mismo dato: el árbol, que enseña de un vistazo cómo cuelga
 * cada anuncio de su conjunto y a dónde apunta; y la tabla, que permite leer
 * todas las filas seguidas y copiarlas al gestor de anuncios.
 */
export function CampaignStructure({
  productId,
  trees,
  folders,
  onlyFolder,
  prelandings,
  performance,
  images,
  discardedImages,
}: CampaignStructureProps) {
  // Las creatividades ya generadas, por anuncio.
  const imagesByAd = useMemo(() => {
    const map: Record<string, ProductImage[]> = {};
    for (const image of images) {
      if (!image.adId) continue;
      (map[image.adId] ??= []).push(image);
    }
    return map;
  }, [images]);

  // Las descartadas de cada anuncio, para el pie de su rejilla.
  const discardedByAd = useMemo(() => {
    const map: Record<string, ProductImage[]> = {};
    for (const image of discardedImages) {
      if (!image.adId) continue;
      (map[image.adId] ??= []).push(image);
    }
    return map;
  }, [discardedImages]);

  const [view, setView] = useState<"arbol" | "tabla">("arbol");
  const [openAdId, setOpenAdId] = useState<string | null>(null);

  // El filtro por carpeta se aplica aquí: la barra ya tenía todas delante para
  // poder contarlas.
  const visibles = useMemo(
    () =>
      onlyFolder === null
        ? trees
        : trees.filter((tree) => (tree.campaign.folderId ?? "") === onlyFolder),
    [trees, onlyFolder],
  );

  const totals = useMemo(() => {
    const adsets = visibles.reduce((sum, tree) => sum + tree.adsets.length, 0);
    const ads = visibles.reduce(
      (sum, tree) => sum + tree.adsets.reduce((inner, node) => inner + node.units.length, 0),
      0,
    );
    return { campaigns: visibles.length, adsets, ads };
  }, [visibles]);

  if (visibles.length === 0) {
    // Con filtro puesto el vacío significa otra cosa, y decir «todavía no hay
    // estructura» dentro de una carpeta vacía manda a generar lo que ya existe.
    return onlyFolder === null ? (
      <EmptyState
        title="Todavía no hay estructura de campaña"
        description="Al generar una tanda de anuncios se arma la campaña, su conjunto y los anuncios numerados de forma correlativa."
      />
    ) : (
      <EmptyState
        title="Esta carpeta está vacía"
        description="Mueve campañas a ella desde el desplegable «Carpeta» de cada una, en la pestaña Todas."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Tag>{totals.campaigns} campañas</Tag>
          <Tag>{totals.adsets} conjuntos</Tag>
          <Tag>{totals.ads} anuncios</Tag>
        </div>
        <div className="flex rounded-full border border-slate-200 p-1 dark:border-slate-700">
          {(["arbol", "tabla"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                view === item ? "bg-violet-600 text-white" : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {item === "arbol" ? "Árbol" : "Tabla"}
            </button>
          ))}
        </div>
      </div>

      {view === "arbol" ? (
        <div className="space-y-6">
          {visibles.map((tree) => {
            const adsDeLaCampana = tree.adsets.flatMap((node) => node.ads);
            const totalUnidades = tree.adsets.reduce((sum, node) => sum + node.units.length, 0);
            const conImagen = adsDeLaCampana.filter(
              (ad) => (imagesByAd[ad.id] ?? []).length > 0,
            ).length;

            return (
            /*
              Cerrada de entrada, y el plegado en el DOM.

              Con `useState` habría que reponerlo en cada `router.refresh()`, que
              es lo que dispara cada generación: se te cerraría la campaña que
              estabas mirando justo al lanzar sus imágenes.
            */
            <details
              key={tree.campaign.id}
              className="group rounded-3xl border border-slate-200 p-5 dark:border-slate-800"
            >
              {/* Campaña */}
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 marker:content-none">
                <span className="text-violet-600 group-open:hidden">▸</span>
                <span className="hidden text-violet-600 group-open:inline">▾</span>
                <code className="font-mono text-sm">{tree.campaign.name}</code>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STAGE_COLORS[tree.campaign.stage]}`}
                >
                  {FUNNEL_STAGE_META[tree.campaign.stage].label}
                </span>
                {/* Lo justo para decidir si hace falta abrirla. */}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {tree.adsets.length} conjuntos · {totalUnidades} anuncios · {conImagen}/
                  {adsDeLaCampana.length} con imagen
                </span>
              </summary>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Copyable value={tree.campaign.name} label="nombre de campaña">
                  <code className="font-mono text-xs">{tree.campaign.name}</code>
                </Copyable>
                <CampaignBatch
                  productId={productId}
                  ads={adsDeLaCampana}
                  images={images}
                  label="esta campaña"
                />
                <CampaignRowActions
                  productId={productId}
                  campaignId={tree.campaign.id}
                  folderId={tree.campaign.folderId}
                  folders={folders}
                />
              </div>

              {/* Conjuntos, colgando de la campaña con una guía vertical. */}
              <div className="mt-4 space-y-5 border-l-2 border-slate-200 pl-5 dark:border-slate-700">
                {tree.adsets.map((node) => (
                  <div key={node.adset.id} className="relative">
                    {/* Conector horizontal hacia la guía de la campaña. */}
                    <span
                      aria-hidden
                      className="absolute -left-5 top-4 h-0.5 w-4 bg-slate-200 dark:bg-slate-700"
                    />

                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Conjunto
                        </span>
                        <Copyable value={node.adset.name} label="nombre del conjunto">
                          <code className="font-mono text-sm">{node.adset.name}</code>
                        </Copyable>
                        <span aria-hidden className="text-slate-400">
                          →
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${destinationStyle(node.adset.destination.type)}`}
                        >
                          {destinationLabel(node.adset.destination, prelandings)}
                        </span>
                        {node.adset.destination.type === "prelanding-pendiente" ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            (por crear)
                          </span>
                        ) : null}
                      </div>

                      <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                        <div>
                          <dt className="inline font-medium">Audiencia: </dt>
                          <dd className="inline">{node.adset.audience}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">Objetivo: </dt>
                          <dd className="inline">{node.adset.objective}</dd>
                        </div>
                      </dl>

                      {/* El conjunto es la unidad real de trabajo —mismo
                          destino, misma audiencia—, así que lleva su propio
                          botón además del de la campaña. */}
                      <div className="mt-3">
                        <CampaignBatch
                          productId={productId}
                          ads={node.ads}
                          images={images}
                          label="este conjunto"
                        />
                      </div>

                      {node.adset.offerStack.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Oferta anclada en todos los anuncios
                          </p>
                          <ul className="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                            {node.adset.offerStack.map((item) => (
                              <li key={item}>├── {item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {/* Anuncios, colgando del conjunto. */}
                      <div className="mt-4 space-y-2 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                        {node.units.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Sin anuncios todavía.
                          </p>
                        ) : (
                          node.units.map((unit) => {
                            const key = unit.kind === "corto" ? unit.ad.id : unit.copyId;
                            return unit.kind === "corto" ? (
                              <AdRow
                                key={key}
                                productId={productId}
                                ad={unit.ad}
                                images={imagesByAd[unit.ad.id] ?? []}
                                discarded={discardedByAd[unit.ad.id] ?? []}
                                record={performance.get(`short-ad::${unit.ad.id}`)}
                                open={openAdId === key}
                                onToggle={() => setOpenAdId(openAdId === key ? null : key)}
                              />
                            ) : (
                              <LongRow
                                key={key}
                                productId={productId}
                                unit={unit}
                                record={performance.get(`copy::${unit.copyId}`)}
                                open={openAdId === key}
                                onToggle={() => setOpenAdId(openAdId === key ? null : key)}
                              />
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Campaña</th>
                <th className="px-4 py-3 text-left font-medium">Conjunto</th>
                <th className="px-4 py-3 text-left font-medium">Destino</th>
                <th className="px-4 py-3 text-left font-medium">Anuncio</th>
                <th className="px-4 py-3 text-left font-medium">Formato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {visibles.flatMap((tree) =>
                tree.adsets.flatMap((node) =>
                  (node.units.length > 0 ? node.units : [null]).map((unit, adIndex) => (
                    <tr key={(unit ? (unit.kind === "corto" ? unit.ad.id : unit.copyId) : `${node.adset.id}-vacio`)}>
                      {/* Solo se repite el nombre en la primera fila del grupo. */}
                      <td className="px-4 py-3 align-top">
                        {adIndex === 0 ? (
                          <Copyable value={tree.campaign.name} label="nombre de campaña">
                            <code className="font-mono text-xs">{tree.campaign.name}</code>
                          </Copyable>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">│</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {adIndex === 0 ? (
                          <Copyable value={node.adset.name} label="nombre del conjunto">
                            <code className="font-mono text-xs">{node.adset.name}</code>
                          </Copyable>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">│</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {adIndex === 0 ? (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${destinationStyle(node.adset.destination.type)}`}
                          >
                            {destinationLabel(node.adset.destination, prelandings)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {unit ? (
                          <Copyable
                            value={unit.kind === "corto" ? unit.ad.name : unit.name}
                            label="nombre del anuncio"
                          >
                            <code className="font-mono text-xs">
                              {unit.kind === "corto" ? unit.ad.name : unit.name}
                            </code>
                          </Copyable>
                        ) : (
                          <span className="text-slate-400">sin anuncios</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                        {unit
                          ? unit.kind === "corto"
                            ? formatMeta(unit.ad.format).name
                            : unit.format
                          : "—"}
                      </td>
                    </tr>
                  )),
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdRow({
  productId,
  ad,
  record,
  images,
  discarded,
  open,
  onToggle,
}: {
  productId: string;
  ad: ShortAd;
  record?: PerformanceRecord;
  /** Las creatividades ya generadas para este anuncio. */
  images: ProductImage[];
  /** Las que se descartaron al rehacerlas, para el pie de la rejilla. */
  discarded: ProductImage[];
  open: boolean;
  onToggle: () => void;
}) {
  const meta = formatMeta(ad.format);

  return (
    <div className="relative">
      <span aria-hidden className="absolute -left-4 top-3 h-0.5 w-3 bg-slate-200 dark:bg-slate-700" />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="rounded-lg px-1 text-violet-600 transition hover:bg-white dark:hover:bg-slate-900"
        >
          {open ? "▾" : "▸"}
        </button>
        <Copyable value={ad.name} label="nombre del anuncio">
          <code className="font-mono text-xs">{ad.name}</code>
        </Copyable>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {meta.name}
        </span>
        {record && record.rating !== "sin-probar" ? <PerformanceBadgeInline rating={record.rating} /> : null}
      </div>

      {open ? (
        <div className="mt-2 space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">{meta.role}</p>

          <CopyableBlock value={ad.imagePrompt} label="Prompt de imagen" maxHeightClass="max-h-64">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-5">{ad.imagePrompt}</pre>
          </CopyableBlock>

          {/* El prompt estaba, pero no había forma de ejecutarlo desde aquí:
              había que copiarlo e irse a otra pantalla. */}
          <AdVisualSender
            productId={productId}
            adId={ad.id}
            visuals={[
              {
                title: ad.name,
                prompt: ad.imagePrompt,
                aspectRatio: "1:1",
                concept: ad.format,
                origin: ad.name,
              },
            ]}
          />

          {/* Y las que ya se generaron, aquí mismo. `productId` es lo que hace
              aparecer «Rehacer» sobre cada una. */}
          <ImageDownloads
            images={images}
            discarded={discarded}
            productId={productId}
            title="Imágenes de este anuncio"
          />

          <div className="grid gap-3 md:grid-cols-2">
            <CopyableBlock value={ad.content.headline} label="Titular" maxHeightClass="max-h-24">
              <p className="text-sm">{ad.content.headline}</p>
            </CopyableBlock>
            <CopyableBlock value={ad.content.description} label="Descripción" maxHeightClass="max-h-24">
              <p className="text-sm">{ad.content.description}</p>
            </CopyableBlock>
          </div>

          <CopyableBlock value={ad.content.primaryText} label="Texto" maxHeightClass="max-h-72">
            <p className="whitespace-pre-wrap text-sm leading-6">{ad.content.primaryText}</p>
          </CopyableBlock>

          <PerformanceControl
            productId={productId}
            targetType="short-ad"
            targetId={ad.id}
            record={record}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Fila de una pieza larga: long copy o publirreportaje dentro del conjunto. */
function LongRow({
  productId,
  unit,
  record,
  open,
  onToggle,
}: {
  productId: string;
  unit: Extract<AdUnit, { kind: "largo" }>;
  record?: PerformanceRecord;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <span aria-hidden className="absolute -left-4 top-3 h-0.5 w-3 bg-slate-200 dark:bg-slate-700" />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="rounded-lg px-1 text-violet-600 transition hover:bg-white dark:hover:bg-slate-900"
        >
          {open ? "▾" : "▸"}
        </button>
        <Copyable value={unit.name} label="nombre del anuncio">
          <code className="font-mono text-xs">{unit.name}</code>
        </Copyable>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          {unit.format}
        </span>
        {record && record.rating !== "sin-probar" ? (
          <PerformanceBadgeInline rating={record.rating} />
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-2">
            <CopyableBlock value={unit.headline} label="Titular" maxHeightClass="max-h-24">
              <p className="text-sm">{unit.headline}</p>
            </CopyableBlock>
            <CopyableBlock value={unit.description} label="Descripción" maxHeightClass="max-h-24">
              <p className="text-sm">{unit.description}</p>
            </CopyableBlock>
          </div>

          <CopyableBlock value={unit.primaryText} label="Texto principal" maxHeightClass="max-h-72">
            <p className="whitespace-pre-wrap text-sm leading-6">{unit.primaryText}</p>
          </CopyableBlock>

          <PerformanceControl
            productId={productId}
            targetType="copy"
            targetId={unit.copyId}
            record={record}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Mover de carpeta y archivar, en la cabecera de la campaña.
 *
 * Un desplegable y no arrastrar y soltar: con veinte campañas en una lista
 * larga, arrastrar falla más de lo que acierta y hay que deshacerlo.
 */
function CampaignRowActions({
  productId,
  campaignId,
  folderId,
  folders,
}: {
  productId: string;
  campaignId: string;
  folderId?: string;
  folders: CampaignFolder[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        value={folderId ?? ""}
        disabled={isPending}
        onChange={(event) =>
          startTransition(async () => {
            await moveCampaignAction(campaignId, event.target.value, productId);
            router.refresh();
          })
        }
        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
      >
        <option value="">Sin carpeta</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await archiveCampaignAction(campaignId, true, productId);
            router.refresh();
          })
        }
        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Archivar
      </button>
    </span>
  );
}

/** Distintivo compacto para la fila del árbol. */
function PerformanceBadgeInline({ rating }: { rating: PerformanceRecord["rating"] }) {
  const meta = PERFORMANCE_META[rating];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
