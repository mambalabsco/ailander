import { SectionCard } from "@/components/section-card";
import { brandSettings } from "@/lib/mock-data";
import { ProviderPanel } from "@/app/settings/provider-panel";
import { MetaAppsPanel } from "@/components/settings/meta-apps-panel";
import { listMetaApps } from "@/lib/data/meta-apps";
import { daysLeft, isConfigured } from "@/lib/meta-oauth";
import { listMetaLogins } from "@/lib/data/meta-logins";
import { MetaLoginsPanel } from "@/components/settings/meta-logins-panel";

export default async function SettingsPage(props: {
  searchParams: Promise<{ meta?: string; detalle?: string }>;
}) {
  const params = await props.searchParams;
  // Sin secretos ni tokens: solo lo que hace falta para elegir y para avisar.
  const [metaApps, metaLogins] = await Promise.all([
    listMetaApps().catch(() => []),
    listMetaLogins().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <ProviderPanel />

      <SectionCard
        title="Sesiones de Facebook"
        description="Se inicia sesión una vez y vale para todas las tiendas: el permiso es del perfil, no de la tienda. Aquí se ve cuántos días le quedan, que es lo que evita que un martes cualquiera el gasto aparezca a cero."
      >
        <MetaLoginsPanel
          logins={metaLogins.map((login) => ({
            id: login.id,
            name: login.name,
            daysLeft: daysLeft(login.expiresAt),
            isDefault: login.isDefault,
          }))}
          canConnect={metaApps.length > 0 || isConfigured()}
          justConnected={params.meta === "sesion" ? (params.detalle ?? "") : undefined}
        />
      </SectionCard>

      <SectionCard
        title="Apps de Meta"
        description="Con una basta para todos tus Business Manager: lo que decide qué cuentas se ven es el perfil de Facebook con el que inicias sesión. Añade una segunda solo si entra un perfil que no puede tener rol en la primera."
      >
        <MetaAppsPanel apps={metaApps} envConfigured={isConfigured()} />
      </SectionCard>

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
