"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/components/theme-script";
import { signOut } from "@/app/auth/actions";

import type { Capability } from "@/lib/roles";

/**
 * El menú, con el permiso que hace falta para cada sitio.
 *
 * Recortarlo es **cortesía, no protección**: un enlace escondido se puede
 * escribir en la barra de direcciones, y la acción de servidor sigue estando
 * ahí. Lo que protege son las comprobaciones pegadas al dato. Esto solo evita
 * enseñar puertas que se van a cerrar en la cara.
 */
const navigation: { href: string; label: string; icon: string; needs?: Capability }[] = [
  { href: "/", label: "Dashboard", icon: "◉" },
  { href: "/products", label: "Productos propios", icon: "◌" },
  { href: "/stores", label: "Tiendas y mercados", icon: "⌂" },
  { href: "/datos", label: "Datos y beneficio", icon: "◈", needs: "dinero" },
  { href: "/competitors", label: "Competidores", icon: "◎" },
  { href: "/ads", label: "Biblioteca de anuncios", icon: "⬢" },
  { href: "/imagenes", label: "Adaptador de imágenes", icon: "▦", needs: "gastar" },
  { href: "/analyzer", label: "Analizador", icon: "◍" },
  { href: "/copy", label: "Generador de copy", icon: "✦" },
  { href: "/comparisons", label: "Comparaciones", icon: "▣" },
  { href: "/history", label: "Historial", icon: "◫" },
  { href: "/cuenta", label: "Tu cuenta", icon: "◑" },
  { href: "/admin", label: "Administración", icon: "◭", needs: "personas" },
  { href: "/settings", label: "Configuración", icon: "⚙", needs: "ajustes" },
];

function isActiveRoute(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * El tema real vive en la clase del <html>, que ThemeScript aplica antes del
 * primer pintado. Lo leemos como estado externo en lugar de duplicarlo en
 * React, así el botón nunca se desincroniza del DOM.
 */
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getThemeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

interface LayoutShellProps {
  children: React.ReactNode;
  /** Correo de quien ha entrado. Vacío mientras no hay sesión. */
  userEmail?: string | null;
  /** Si Supabase todavía no está configurado, la plataforma va con datos locales. */
  demoMode?: boolean;
  /** Lo que puede quien está dentro, para no enseñarle puertas cerradas. */
  capabilities?: string[];
}

export function LayoutShell({ children, userEmail, demoMode, capabilities }: LayoutShellProps) {
  /*
   * Sin lista de permisos se enseña todo.
   *
   * Es el caso de la demo, sin Supabase configurado: ahí no hay perfiles y
   * esconder medio menú haría parecer que la plataforma no tiene esas pantallas.
   */
  const visible = capabilities
    ? navigation.filter((item) => !item.needs || capabilities.includes(item.needs))
    : navigation;

  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const darkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false);

  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // localStorage puede estar bloqueado; el tema sigue aplicándose en memoria.
    }
  }, []);

  /*
   * Las pantallas de acceso no llevan el armazón.
   *
   * Un menú lateral con enlaces a páginas que no se pueden abrir sin sesión
   * solo sirve para ofrecer callejones sin salida.
   */
  if (pathname.startsWith("/auth")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside
          className={`border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur lg:min-h-screen lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-900/80 ${collapsed ? "lg:w-24" : "lg:w-72"}`}
        >
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-lg font-semibold text-white">
                LL
              </div>
              {!collapsed && (
                <div>
                  <p className="text-sm font-semibold">Lumen Lab</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Marketing IA</p>
                </div>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
              className="hidden rounded-full border border-slate-200 p-2 text-sm transition hover:bg-slate-100 lg:inline-flex dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {collapsed ? "→" : "←"}
            </button>
          </div>

          <nav className="mt-8 space-y-2">
            {visible.map((item) => {
              const active = isActiveRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${active ? "bg-violet-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                >
                  <span className="text-base">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-xl font-semibold">Plataforma de análisis publicitario</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">IA para copywriting y anuncios</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {darkMode ? "☀️ Claro" : "🌙 Oscuro"}
                </button>
                {demoMode ? (
                  <div className="rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    Sin conectar a Supabase
                  </div>
                ) : null}
                {userEmail ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="max-w-40 truncate rounded-full bg-violet-100 px-4 py-2 text-sm font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-200"
                      title={userEmail}
                    >
                      {userEmail}
                    </span>
                    <form action={signOut}>
                      <button
                        type="submit"
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Salir
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main className="p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
