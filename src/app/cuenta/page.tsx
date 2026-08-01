import { redirect } from "next/navigation";
import { currentProfile, spentThisMonth } from "@/lib/data/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, capabilitiesOf, CAPABILITY_LABELS, CAPABILITIES, can } from "@/lib/roles";
import { AccountPanel } from "@/components/account-panel";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  if (!isSupabaseConfigured()) redirect("/settings");

  const me = await currentProfile();
  if (!me) redirect("/auth/login");

  const spent = await spentThisMonth(me.id).catch(() => 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tu cuenta</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Qué puedes hacer y cuánto llevas gastado este mes.
        </p>
      </header>

      <AccountPanel name={me.name} email={me.email} />

      <SectionCard
        title={`Tu papel: ${ROLE_LABELS[me.role]}`}
        description={ROLE_DESCRIPTIONS[me.role]}
      >
        {/*
          Se enseñan también los permisos que NO se tienen.
          
          Una lista de lo que sí puedes deja preguntándote si lo que falta es que
          no puedes o que no lo has encontrado. Con las dos columnas, se sabe.
        */}
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {CAPABILITIES.map((capability) => {
            const allowed = can(me.role, capability);

            return (
              <li
                key={capability}
                className={allowed ? "" : "text-slate-400 line-through dark:text-slate-600"}
              >
                {allowed ? "✓" : "✗"} {CAPABILITY_LABELS[capability]}
              </li>
            );
          })}
        </ul>

        {capabilitiesOf(me.role).length === 0 ? (
          <p className="mt-3 rounded-xl bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            Todavía no tienes permisos. Pídele a un administrador que te asigne un papel.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Tu gasto este mes"
        description="Cuenta lo que costaron tus generaciones. Se pone a cero el día uno."
      >
        <p className="text-2xl font-semibold tabular-nums">${spent.toFixed(2)}</p>

        {me.monthlyLimitUsd === null ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Sin tope. Aun así, cada botón que genera dice antes lo que cuesta.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              De un tope de ${me.monthlyLimitUsd.toFixed(2)} al mes.
            </p>
            <div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={`h-full ${spent >= me.monthlyLimitUsd ? "bg-rose-500" : "bg-violet-600"}`}
                style={{
                  width: `${Math.min(100, (spent / Math.max(me.monthlyLimitUsd, 0.01)) * 100)}%`,
                }}
              />
            </div>
            {spent >= me.monthlyLimitUsd ? (
              <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                Has llegado al tope: hasta el mes que viene no puedes lanzar generaciones. Pídele a
                un administrador que lo suba.
              </p>
            ) : null}
          </>
        )}
      </SectionCard>
    </div>
  );
}
