import { redirect } from "next/navigation";
import { listProfiles, spentThisMonth, currentProfile } from "@/lib/data/profiles";
import { listAuditLog } from "@/lib/data/audit";
import { pendingEmailChanges } from "@/lib/data/email-changes";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { can } from "@/lib/roles";
import { AdminPeople } from "@/components/admin-people";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isSupabaseConfigured()) redirect("/settings");

  const me = await currentProfile();

  /*
   * Sin permiso no se entra, y se manda a su propia cuenta.
   *
   * Redirigir en vez de enseñar «no puedes» evita una pantalla que solo sirve
   * para decir que no sirve. Además la protección de verdad está en cada acción:
   * esto es para no dibujar lo que no se va a poder usar.
   */
  if (!me || !can(me.role, "personas")) redirect("/cuenta");

  const people = await listProfiles();

  /*
   * Las propuestas de correo se leen de una vez y se reparten por persona. Una
   * consulta por fila multiplicaría por el número de personas algo que cabe en
   * una sola.
   */
  const propuestas = new Map(
    (await pendingEmailChanges().catch(() => [])).map((one) => [one.userId, one.nuevoEmail]),
  );

  const withSpend = await Promise.all(
    people.map(async (person) => ({
      id: person.id,
      email: person.email,
      name: person.name,
      role: person.role,
      monthlyLimitUsd: person.monthlyLimitUsd,
      disabled: person.disabled,
      spentThisMonth: await spentThisMonth(person.id).catch(() => 0),
      isMe: person.id === me.id,
      pendingEmail: propuestas.get(person.id) ?? null,
    })),
  );

  const log = await listAuditLog(30).catch(() => []);
  const total = withSpend.reduce((sum, person) => sum + person.spentThisMonth, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Administración</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Quién entra, qué puede hacer y cuánto puede gastar. El gasto del mes en total:{" "}
          <strong>${total.toFixed(2)}</strong>.
        </p>
      </header>

      <SectionCard
        title="Personas"
        description="El papel decide qué puede tocar cada uno; el tope, cuánto puede gastar al mes."
      >
        <AdminPeople people={withSpend} />
      </SectionCard>

      {/*
        Lo que no se deshace queda anotado. Cuando algo sale mal en la tienda,
        la pregunta es siempre la misma: quién y cuándo.
      */}
      <SectionCard
        title="Lo que se ha publicado"
        description="Escrituras en la tienda y cambios de permisos. No se puede borrar: un registro que se borra no sirve para lo que sirve un registro."
      >
        {log.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay nada anotado.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {log.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-2">
                <span className="w-36 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {new Date(entry.createdAt).toLocaleString("es-ES")}
                </span>
                <span className="font-medium">{entry.action}</span>
                <span className="text-slate-600 dark:text-slate-300">{entry.target}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{entry.who}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
