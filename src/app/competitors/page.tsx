import { SectionCard } from "@/components/section-card";
import { listCompetitorProducts } from "@/lib/store";
import { CompetitorsPanel } from "@/app/competitors/competitors-panel";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const competitors = await listCompetitorProducts();

  return (
    <div className="space-y-6">
      <SectionCard title="Competidores" description="Monitorea productos y mensajes de la competencia">
        <CompetitorsPanel competitors={competitors} />
      </SectionCard>
    </div>
  );
}
