import { SectionCard } from "@/components/section-card";
import { TeamBoard } from "@/components/team-board";
import { activeWorkspace, exclusionsOf, membersOf, myWorkspaces } from "@/lib/data/workspace";
import { getCombinedProducts } from "@/lib/products";

export const metadata = { title: "Equipo" };
export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const spaces = await myWorkspaces().catch(() => []);
  const space = await activeWorkspace().catch(() => null);

  if (!space) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Equipo</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no perteneces a ningún espacio de trabajo.
        </p>
      </div>
    );
  }

  const [members, products, exclusions] = await Promise.all([
    membersOf(space.id),
    getCombinedProducts().then((list) => list.map((one) => ({ id: one.id, name: one.name }))),
    exclusionsOf(space.id),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Equipo</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Todo el equipo ve todo. Lo que se marca aquí son las excepciones: de qué producto se saca
          a cada persona. Así, olvidarse de repartir algo tiene la consecuencia benigna —se ve— y la
          lista queda corta, que es lo que hace que se revise.
        </p>
      </header>

      <SectionCard
        title={space.name}
        description={`${members.length} persona(s) · ${products.length} producto(s)`}
      >
        <TeamBoard
          spaces={spaces}
          workspaceId={space.id}
          members={members}
          products={products}
          exclusions={exclusions}
        />
      </SectionCard>
    </div>
  );
}
