import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/*
 * Los campos, sobre el mismo fondo que la tarjeta y con el borde de luz.
 *
 * En oscuro estaban en `slate-950` dentro de una tarjeta `slate-900`: un hueco
 * más oscuro que lo que lo rodea, que es como se dibuja un agujero y no un
 * campo. Ahora el campo es una capa **por encima**, que es lo que es.
 */
const fieldClasses =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-400";

export function TextField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClasses} ${className}`} />;
}

export function TextAreaField({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClasses} ${className}`} />;
}

export function SelectField({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClasses} ${className}`} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-violet-600 text-white hover:bg-violet-500 disabled:hover:bg-violet-600",
  secondary:
    "border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-white/12 dark:text-slate-200 dark:hover:bg-white/[0.06]",
  danger:
    "border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
    />
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:text-slate-300">
      {children}
    </span>
  );
}

/**
 * Un hueco vacío, con la salida puesta.
 *
 * `action` no es decorativo: un estado vacío que solo dice «no hay nada» es un
 * callejón sin salida, y obliga a buscar por la interfaz cuál era el botón que
 * llenaba esto. Con el siguiente paso dentro, el hueco deja de ser un problema y
 * pasa a ser el sitio por donde se empieza.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(10, value));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-semibold">{clamped}/10</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${clamped * 10}%` }} />
      </div>
    </div>
  );
}
