import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LayoutShell } from "@/components/layout-shell";
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
        <LayoutShell userEmail={user?.email ?? null} demoMode={!configured}>
          {children}
        </LayoutShell>
      </body>
    </html>
  );
}
