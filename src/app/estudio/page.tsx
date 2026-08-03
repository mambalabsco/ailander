import { redirect } from "next/navigation";
import { listOwnProducts } from "@/lib/store";
import { listProjects, listAssets } from "@/lib/data/studio";
import { listJobsByKind } from "@/lib/data/jobs";
import { listCliModels, cliStatus } from "@/lib/higgsfield-cli";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { currentProfile } from "@/lib/data/profiles";
import { can } from "@/lib/roles";
import { StudioBoard } from "@/components/studio-board";
import { JobsPanel } from "@/components/jobs-panel";

export const dynamic = "force-dynamic";

export default async function EstudioPage(props: {
  searchParams: Promise<{ p?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/settings");

  const me = await currentProfile();

  /*
   * Sin permiso de estudio no se entra.
   *
   * Es cortesía: lo que protege de verdad son las comprobaciones de cada acción.
   * Pero enseñar una pantalla llena de botones que van a fallar es peor que no
   * enseñarla.
   */
  if (!me || !can(me.role, "estudio")) redirect("/cuenta");

  const { p } = await props.searchParams;

  const [projects, products, jobs, higgs, cliModels] = await Promise.all([
    listProjects().catch(() => []),
    listOwnProducts(),
    listJobsByKind("imagenes", 6).catch(() => []),
    cliStatus().catch(() => ({ authenticated: false })),
    listCliModels().catch(() => []),
  ]);

  const current = projects.find((project) => project.id === p) ?? projects[0];
  const assets = current ? await listAssets(current.id).catch(() => []) : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Estudio</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Imagen, vídeo, voz y música en una mesa. Se genera, se descarta lo que no sirve, y el
          vídeo sale de ordenar lo que queda.
        </p>
      </header>

      {jobs.length > 0 ? <JobsPanel productId="" jobs={jobs} storeLevel /> : null}

      <StudioBoard
        projects={projects}
        current={current ?? null}
        assets={assets}
        products={products.map((product) => ({ id: product.id, name: product.name }))}
        cliModels={cliModels
          // Solo los de imagen: los de vídeo van por el otro proveedor, que es
          // el que cobra por segundo y sabe la duración.
          .filter((model) => !model.jobType.includes("video"))
          .map((model) => ({ slug: model.slug, name: model.title }))}
        hasHiggsfield={higgs.authenticated === true}
      />
    </div>
  );
}
