import { redirect } from "next/navigation";
import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { FlowCanvas } from "@/components/flow/flow-canvas";
import { FlowList } from "@/components/flow/flow-list";
import { listFlows, listOutputs, listRuns } from "@/lib/data/flows";
import { listVideoReferences } from "@/lib/data/video-references";
import { listAvatars } from "@/lib/data/avatars";
import { readProductImages } from "@/lib/image-store";
import { listSwipeCopies } from "@/lib/data/swipe";
import { readAngles } from "@/lib/copy-store";
import { listOwnProducts } from "@/lib/store";
import { listVoices } from "@/lib/video/providers";
import { listCliModels } from "@/lib/higgsfield-cli";
import { currentProfile } from "@/lib/data/profiles";
import { can } from "@/lib/roles";

/**
 * Los flujos: montar un anuncio como un grafo y ejecutarlo.
 *
 * Aparte del estudio porque son dos formas de trabajar distintas. El estudio es
 * una mesa: se genera una pieza, se mira, se descarta. Esto es una cadena: se
 * dibuja una vez y se ejecuta veinte, cambiando lo que varía.
 */

export const dynamic = "force-dynamic";

export default async function FlujosPage(props: {
  searchParams: Promise<{ f?: string }>;
}) {
  const me = await currentProfile().catch(() => null);
  if (!me || !can(me.role, "estudio")) redirect("/cuenta");

  const { f } = await props.searchParams;

  const [flows, products, avatars, voices, cliModels, references] = await Promise.all([
    listFlows().catch(() => []),
    listOwnProducts(),
    listAvatars().catch(() => []),
    // Las voces de la cuenta, para elegirlas en el nodo. Un fallo aquí deja el
    // desplegable vacío, no la página caída: lo demás del lienzo sigue sirviendo.
    listVoices().catch(() => []),
    /*
      Para poder crear una cara desde el propio lienzo.

      Se guarda **el motivo** del fallo, no solo la lista vacía. Tragárselo
      dejaba el desplegable de modelos sin una sola opción y sin nada que leer:
      en pantalla se veía como «no salen modelos disponibles», que es cierto
      pero no dice si falta la sesión del CLI, si no está instalado o si
      Higgsfield está caído. Con el motivo delante se arregla en un minuto.
    */
    listCliModels("image").then(
      (models) => ({ models, error: "" }),
      (error: unknown) => ({
        models: [],
        error: error instanceof Error ? error.message : "no se pudo listar",
      }),
    ),
    // Los anuncios ya analizados: se clona su construcción, no su vídeo.
    listVideoReferences().catch(() => []),
  ]);

  const current = flows.find((flow) => flow.id === f) ?? flows[0] ?? null;

  /*
   * Los resultados de la **última** ejecución, para pintarlos en cada caja.
   *
   * Es lo que convierte el lienzo en algo que se puede depurar: ver el fallo en
   * el nodo que lo tuvo, en vez de leer un resumen al final que dice que algo
   * falló.
   */
  /*
   * Las imágenes del producto, para poder elegirlas de referencia en el lienzo.
   *
   * Se prefiere la del CDN de Shopify: **no caduca**. La otra sí, y un flujo
   * guardado hoy que se ejecute la semana que viene se quedaría con una
   * referencia muerta — y el generador seguiría inventándose el envase.
   */
  const productImages = current?.productId
    ? await readProductImages(current.productId)
        .then((images) =>
          images
            .map((image) => ({
              url: image.shopifyUrl || image.url,
              name: image.name || "Imagen",
              primary: image.isPrimary,
            }))
            .filter((image) => image.url),
        )
        .catch(() => [])
    : [];

  /*
   * Los copys guardados y los ángulos investigados de ese producto.
   *
   * Se traen aquí y no con una acción aparte porque son dos lecturas cortas y
   * el lienzo ya carga con la página: una acción más sería otra ida y vuelta
   * para lo que cabe en la misma.
   */
  const copyReferences = current?.productId
    ? await Promise.all([
        listSwipeCopies(current.productId).catch(() => []),
        readAngles(current.productId).catch(() => []),
      ]).then(([copies, angles]) => [
        ...copies.map((copy) => ({
          id: copy.id,
          kind: "copy" as const,
          label: copy.title || copy.source || "Copy sin título",
          text: copy.body,
        })),
        ...angles.map((angle) => ({
          id: angle.id,
          kind: "angulo" as const,
          label: angle.name,
          text: [angle.desire, `Para ${angle.targetAudience}.`, angle.problemMechanism]
            .filter(Boolean)
            .join(" "),
        })),
      ])
    : [];

  const runs = current ? await listRuns(current.id).catch(() => []) : [];
  const outputs = runs[0] ? await listOutputs(runs[0].id).catch(() => []) : [];

  const results = Object.fromEntries(
    outputs.map((output) => [
      output.nodeId,
      { url: output.url, kind: output.kind, error: output.error },
    ]),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Flujos</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Monta el anuncio como una cadena —producto, guion, imágenes, vídeo— y ejecútala. El
          mismo flujo con otra cara son otros tantos anuncios.
        </p>
      </header>

      <SectionCard
        title="Tus flujos"
        description="Un flujo es el plano, no el resultado: se ejecuta las veces que haga falta y cada vuelta produce lo suyo."
      >
        <FlowList
          flows={flows.map((flow) => ({
            id: flow.id,
            name: flow.name,
            productId: flow.productId,
            nodes: flow.graph.nodes.length,
          }))}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
          currentId={current?.id ?? ""}
        />
      </SectionCard>

      {current ? (
        <SectionCard
          title={current.name}
          description={
            current.productId
              ? "Los nodos de producto tiran de este producto: su nombre, su investigación y la foto del envase."
              : "Este flujo no tiene producto. Elígelo arriba o los nodos de producto fallarán al ejecutar."
          }
        >
          <FlowCanvas
            flowId={current.id}
            graph={current.graph}
            results={results}
            avatars={avatars.map((avatar) => ({
              id: avatar.id,
              name: avatar.name,
              url: avatar.url,
            }))}
            voices={voices.map((voice) => ({ id: voice.id, name: voice.name }))}
            cliModels={cliModels.models.map((model) => ({ slug: model.slug, name: model.title }))}
            cliModelsError={cliModels.error}
            productImages={productImages}
            copyReferences={copyReferences}
            productId={current.productId || undefined}
            references={references.map((item) => ({
              id: item.id,
              name: item.name,
              seconds: item.durationSeconds,
              beats: item.analysis.beats.length,
              hadAudio: item.hadAudio,
              frames: item.frames.length,
            }))}
          />

          {runs.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium">Últimas ejecuciones</p>

              <ul className="mt-1 space-y-1 text-xs">
                {runs.slice(0, 6).map((run) => (
                  <li key={run.id} className="flex flex-wrap gap-2">
                    <span
                      className={
                        run.status === "hecho"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : run.status === "error"
                            ? "text-rose-700 dark:text-rose-400"
                            : "text-slate-500"
                      }
                    >
                      {run.status}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {new Date(run.createdAt).toLocaleString("es-ES")}
                    </span>
                    {run.note ? (
                      <span className="text-slate-600 dark:text-slate-300">{run.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay ningún flujo. Crea uno arriba, o mira el{" "}
          <Link href="/estudio" className="underline underline-offset-4">
            estudio
          </Link>{" "}
          si prefieres ir generando pieza a pieza.
        </p>
      )}
    </div>
  );
}
