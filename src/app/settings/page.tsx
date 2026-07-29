import { SectionCard } from "@/components/section-card";
import { brandSettings } from "@/lib/mock-data";
import { ProviderPanel } from "@/app/settings/provider-panel";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <ProviderPanel />

      <SectionCard title="Configuración de marca" description="Ajusta la voz, colores y reglas de copy para mantener coherencia">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Nombre de marca</p>
              <p className="mt-2 font-semibold">{brandSettings.brandName}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Voz de marca</p>
              <p className="mt-2 text-sm">{brandSettings.voice}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Colores</p>
              <div className="mt-3 flex gap-3">
                <div className="h-10 w-10 rounded-full" style={{ backgroundColor: brandSettings.colors.primary }} />
                <div className="h-10 w-10 rounded-full" style={{ backgroundColor: brandSettings.colors.secondary }} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Palabras recomendadas</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {brandSettings.recommendedWords.map((word) => <span key={word} className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800">{word}</span>)}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Palabras prohibidas</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {brandSettings.prohibitedWords.map((word) => <span key={word} className="rounded-full bg-rose-100 px-3 py-1 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{word}</span>)}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Reglas de copywriting</p>
              <ul className="mt-2 space-y-1 text-sm">
                {brandSettings.copyRules.map((rule) => <li key={rule}>• {rule}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
