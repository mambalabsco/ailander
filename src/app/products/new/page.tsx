import { SectionCard } from "@/components/section-card";
import { RESEARCH_DOCUMENT_IDS, RESEARCH_DOCUMENT_META } from "@/types/research";
import { NewProductForm } from "@/app/products/new/new-product-form";
import { listStores } from "@/lib/store-registry";

// El listado de tiendas vive en disco.
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const stores = await listStores();

  const documents = [...RESEARCH_DOCUMENT_IDS].sort(
    (a, b) => RESEARCH_DOCUMENT_META[a].order - RESEARCH_DOCUMENT_META[b].order,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <SectionCard
        title="Agregar producto"
        description="Guarda la ficha y los datos que necesitan los prompts de investigación"
      >
        <NewProductForm stores={stores} />
      </SectionCard>

      <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-medium">Qué se podrá generar después</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Seis documentos de investigación que se convierten en la base de datos del producto.
        </p>
        <ol className="mt-4 space-y-3">
          {documents.map((id) => {
            const meta = RESEARCH_DOCUMENT_META[id];
            return (
              <li key={id} className="text-sm">
                <p className="font-medium">
                  {meta.order}. {meta.title}
                </p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">{meta.description}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          De ahí salen los ganchos, y de los ganchos el copy.
        </p>
      </aside>
    </div>
  );
}
