import { SectionCard } from "@/components/section-card";
import { HelpBook } from "@/components/help-book";

export const metadata = { title: "Ayuda" };

export default function AyudaPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Ayuda</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Cómo se hace cada cosa y dónde está. Busca con las palabras del problema —«sale vacía»,
          «sin voz», «no se publica»—, no con las del menú.
        </p>
      </header>

      <SectionCard
        title="Manual"
        description="Cada ficha dice qué hace, en qué pantalla vive y qué se rompe si falta algo."
      >
        <HelpBook />
      </SectionCard>
    </div>
  );
}
