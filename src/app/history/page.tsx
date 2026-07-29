import { SectionCard } from "@/components/section-card";
import { listAnalyses } from "@/lib/store";
import { HistoryList } from "@/app/history/history-list";
import { SpendLog } from "@/components/spend-log";
import { listRuns, totalsOf, type RunRecord } from "@/lib/data/runs";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const analyses = await listAnalyses();

  /*
   * El gasto solo existe con Supabase configurado.
   *
   * Se lee aparte y sin tumbar la página: si fallara, el historial de análisis
   * —que es lo que la gente viene a ver— tiene que seguir apareciendo.
   */
  let runs: RunRecord[] = [];
  if (isSupabaseConfigured()) {
    try {
      runs = await listRuns();
    } catch {
      runs = [];
    }
  }

  return (
    <div className="space-y-6">
      <SpendLog runs={runs} totals={totalsOf(runs)} />

      <SectionCard title="Historial" description="Revisa todos los análisis y textos generados">
        <HistoryList analyses={analyses} />
      </SectionCard>
    </div>
  );
}
