interface StatusPillProps {
  status: string;
}

const styles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  analyzed: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
  pending: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
};

const labels: Record<string, string> = {
  active: "Activo",
  draft: "Borrador",
  analyzed: "Analizado",
  pending: "Pendiente",
  completed: "Completado",
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${styles[status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
