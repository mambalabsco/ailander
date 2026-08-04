interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * La tarjeta de una sección.
 *
 * En oscuro va sobre el fondo casi negro con un borde de luz muy tenue en vez
 * de un gris más claro: dos grises encajados uno dentro de otro se leen como dos
 * capas de interfaz, y lo que se quiere es que el contenido flote sobre el
 * fondo. El borde hace el trabajo que hacía el relleno, y con menos ruido.
 */
export function SectionCard({ title, description, children, action }: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/8 dark:bg-white/[0.02]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
