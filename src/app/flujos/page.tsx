import { redirect } from "next/navigation";
import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { FlowCanvas } from "@/components/flow/flow-canvas";
import { FlowList } from "@/components/flow/flow-list";
import { listFlows, listOutputs, listRuns } from "@/lib/data/flows";
import { listAvatars } from "@/lib/data/avatars";
import { listOwnProducts } from "@/lib/store";
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

  const [flows, products, avatars] = await Promise.all([
    listFlows().catch(() => []),
    listOwnProducts(),
    listAvatars().catch(() => []),
  ]);

  const current = flows.find((flow) => flow.id === f) ?? flows[0] ?? null;

  /*
   * Los resultados de la **última** ejecución, para pintarlos en cada caja.
   *
   * Es lo que convierte el lienzo en algo que se puede depurar: ver el fallo en
   * el nodo que lo tuvo, en vez de leer un resumen al final que dice que algo
   * falló.
   */
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
            avatars={avatars.map((avatar) => ({ id: avatar.id, name: avatar.name }))}
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
