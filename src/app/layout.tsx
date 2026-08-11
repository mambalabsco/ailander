import { ViewTransition } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LayoutShell } from "@/components/layout-shell";
import { capabilitiesNow } from "@/lib/permissions";
import { ThemeScript } from "@/components/theme-script";
import { getUser } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lumen Lab IA | Plataforma publicitaria",
  description: "Plataforma SaaS de análisis publicitario y copywriting con IA",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const configured = isSupabaseConfigured();
  const user = configured ? await getUser() : null;

  /*
   * Los permisos, para recortar el menú.
   *
   * `undefined` cuando no hay sesión o no hay Supabase: entonces se enseña todo,
   * porque esconder medio menú en la demo haría parecer que faltan pantallas.
   */
  const capabilities = user
    ? /*
       * El menú también con las excepciones aplicadas.
       *
       * Enseñando lo que da el papel a secas, alguien vería en el menú una
       * pantalla que al abrirla le rechaza — y al revés, una excepción que le
       * concede algo quedaría escondida detrás de un menú que no la lista.
       */
      await capabilitiesNow().catch(() => [])
    : undefined;

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <LayoutShell
          userEmail={user?.email ?? null}
          demoMode={!configured}
          capabilities={capabilities}
        >
          {/*
            La transición envuelve **solo el contenido**, no el chasis.

            La barra lateral y la cabecera no cambian al navegar: animarlas las
            haría parpadear en cada clic, que es justo lo contrario de lo que se
            busca. Lo que cambia es lo de dentro, y es lo único que se funde.

            `name` fijo y no uno por ruta: no se quiere que Next intente
            emparejar elementos entre páginas distintas —eso es para cuando una
            miniatura se convierte en la foto grande— sino un fundido simple
            entre lo que había y lo que llega.
          */}
          <ViewTransition name="contenido">{children}</ViewTransition>
        </LayoutShell>
      </body>
    </html>
  );
}
