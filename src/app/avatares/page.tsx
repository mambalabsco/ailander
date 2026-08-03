import { redirect } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { AvatarBoard } from "@/components/avatar-board";
import { listAvatars, listShots } from "@/lib/data/avatars";
import { listOwnProducts } from "@/lib/store";
import { listCliModels, cliStatus } from "@/lib/higgsfield-cli";
import { currentProfile } from "@/lib/data/profiles";
import { can } from "@/lib/roles";
import { CONTEXTS, PEOPLE } from "@/lib/avatar-shots";

/**
 * Caras que salen usando el producto.
 *
 * Aparte del adaptador de imágenes porque el trabajo es otro: aquel cambia el
 * producto dentro de una imagen que ya existe; esto parte de una cara y produce
 * las fotos desde cero. Mezclarlos daría una pantalla con dos formularios que no
 * se parecen en nada.
 */

export const dynamic = "force-dynamic";

export default async function AvataresPage(props: {
  searchParams: Promise<{ producto?: string }>;
}) {
  const me = await currentProfile().catch(() => null);
  if (!me || !can(me.role, "gastar")) redirect("/cuenta");

  const { producto } = await props.searchParams;

  const [avatars, products, higgs, cliModels] = await Promise.all([
    listAvatars().catch(() => []),
    listOwnProducts(),
    cliStatus().catch((error) => ({
      installed: false,
      authenticated: false,
      reason: error instanceof Error ? error.message : "No se pudo ejecutar el CLI.",
    })),
    listCliModels("image").then(
      (models) => ({ models, error: "" }),
      (error: unknown) => ({
        models: [],
        error: error instanceof Error ? error.message : "no se pudo listar",
      }),
    ),
  ]);

  const current = products.find((product) => product.id === producto) ?? products[0] ?? null;
  const shots = current ? await listShots(current.id).catch(() => []) : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Avatares con producto</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Sube o genera caras una vez y salen usando cualquiera de tus productos, en varios
          contextos. Las caras se reutilizan: no se pagan otra vez en cada tanda.
        </p>
      </header>

      <SectionCard
        title="Las caras"
        description="Súbelas en tanda desde tu carpeta, o genera personas nuevas describiéndolas. Descríbelas siempre: el generador usa esa descripción para no reinventarlas al ponerles el producto."
      >
        <AvatarBoard
          avatars={avatars}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
          current={current ? { id: current.id, name: current.name } : null}
          shots={shots}
          contexts={CONTEXTS.map((context) => ({
            id: context.id,
            label: context.label,
            note: context.note,
          }))}
          people={PEOPLE}
          /*
           * Solo los del CLI: Soul, que es el que hace personas que parecen
           * personas, no está en la API de plataforma.
           */
          cliModels={cliModels.models.map((model) => ({ slug: model.slug, name: model.title }))}
          higgsfield={{
            ok: higgs.authenticated === true,
            reason: ("reason" in higgs ? (higgs.reason ?? "") : "") || cliModels.error,
          }}
        />
      </SectionCard>
    </div>
  );
}
