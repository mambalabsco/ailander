"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { NavSpinner } from "@/components/nav-spinner";
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
  { href: "/estudio", label: "Estudio", icon: "◈", needs: "estudio" },
  { href: "/flujos", label: "Flujos de anuncios", icon: "⛓", needs: "estudio" },
  { href: "/imagenes", label: "Adaptador de imágenes", icon: "▦", needs: "gastar" },
  { href: "/avatares", label: "Avatares con producto", icon: "☺", needs: "gastar" },
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
 * Cómo se llama la pantalla en la que se está.
 *
 * La cabecera decía siempre «Plataforma de análisis publicitario», que es el
 * nombre del producto y no dice dónde estás. Con dieciséis pantallas, el sitio
 * donde mirar para saber dónde estás es el título.
 */
function titleOf(pathname: string): string {
  const match = navigation
    .filter((item) => item.href !== "/")
    .find((item) => pathname.startsWith(item.href));

  return match?.label ?? "Dashboard";
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
  /*
   * Las pantallas de acceso y las legales no llevan el armazón.
   *
   * Las legales las abre casi siempre alguien **sin sesión** —el revisor de Meta,
   * o quien pulsa el enlace del diálogo de inicio de sesión—, y un menú lateral
   * con quince pantallas que no puede abrir solo estorba.
   */
  if (pathname.startsWith("/auth") || pathname.startsWith("/privacidad")) {
    return (
      <div
        className={`min-h-screen bg-white text-slate-900 transition-colors dark:bg-[#0a0a0c] dark:text-slate-100 ${
          pathname.startsWith("/auth") ? "flex items-center justify-center p-4" : ""
        }`}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-[#0a0a0c] dark:text-slate-100">
      <div className="flex min-h-screen flex-col lg:flex-row">
        {/*
          La barra lateral, más estrecha y más callada.

          Antes cada entrada era un botón grande con sombra y el activo pintaba
          un bloque violeta de lado a lado. Con dieciséis pantallas eso es una
          columna de botones que compite con el contenido. Ahora el activo se
          marca con un relleno suave y una barra fina a la izquierda: se ve de
          reojo y no grita.
        */}
        <aside
          className={`shrink-0 border-b border-slate-200 bg-white/70 px-3 py-4 backdrop-blur-xl lg:min-h-screen lg:border-b-0 lg:border-r dark:border-white/8 dark:bg-white/[0.02] ${collapsed ? "lg:w-20" : "lg:w-64"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-sm font-semibold tracking-tight text-white">
                LL
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">Lumen Lab</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-500">
                    Marketing IA
                  </p>
                </div>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
              className="hidden size-7 shrink-0 items-center justify-center rounded-lg text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:inline-flex dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              {collapsed ? "→" : "←"}
            </button>
          </div>

          <nav className="mt-6 space-y-0.5">
            {visible.map((item) => {
              const active = isActiveRoute(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-violet-50 text-violet-700 dark:bg-violet-500/12 dark:text-violet-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
                  }`}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-violet-600 dark:bg-violet-400"
                    />
                  ) : null}

                  <span className="w-4 shrink-0 text-center text-sm opacity-80">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}

                  {/*
                    El circulito, en el enlace al que se va y no en una barra
                    arriba: con dieciséis entradas, saber **qué** se está
                    abriendo importa tanto como saber que algo se abre.
                  */}
                  <NavSpinner />
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/70 px-4 py-2.5 backdrop-blur-xl md:px-6 dark:border-white/8 dark:bg-[#0a0a0c]/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="truncate text-[15px] font-semibold tracking-tight">
                {titleOf(pathname)}
              </h1>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={darkMode ? "Tema claro" : "Tema oscuro"}
                  className="flex size-8 items-center justify-center rounded-full border border-slate-200 text-xs transition hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
                >
                  {darkMode ? "☀" : "☾"}
                </button>

                {demoMode ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    Sin Supabase
                  </span>
                ) : null}

                {userEmail ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="max-w-36 truncate rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 dark:border-white/10 dark:text-slate-300"
                      title={userEmail}
                    >
                      {userEmail}
                    </span>

                    <form action={signOut}>
                      <button
                        type="submit"
                        className="rounded-full border border-slate-200 px-2.5 py-1 text-xs transition hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
                      >
                        Salir
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          {/*
            La clave hace que React remonte al cambiar de ruta, que es lo que
            dispara el desvanecido. Sin ella, el contenido nuevo aparece de golpe
            encima del anterior y el cambio se lee como un corte.
          */}
          {/*
            Sin `key={pathname}` ni animación de entrada propia.

            Antes esto forzaba a remontar el contenido en cada navegación y le
            aplicaba un fundido de entrada. Animaba solo la mitad: la página
            vieja desaparecía de golpe y la nueva entraba sola, así que entre las
            dos había un parpadeo en blanco.

            Ahora lo hace `<ViewTransition>` en el layout raíz, que sí tiene las
            dos a la vez y puede fundirlas. Dejar las dos cosas encendidas hacía
            que se pisaran.
          */}
          <main className="min-w-0 flex-1 p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
