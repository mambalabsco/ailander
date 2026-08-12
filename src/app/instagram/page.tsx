import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { InstagramQueue } from "@/components/instagram-queue";
import { AgentChat } from "@/components/agent-chat";
import { getCombinedProducts } from "@/lib/products";
import { listPosts } from "@/lib/data/instagram";

export const metadata = { title: "Instagram" };
export const dynamic = "force-dynamic";

export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>;
}) {
  const { producto } = await searchParams;

  const products = await getCombinedProducts().catch(() => []);
  const actual = products.find((one) => one.id === producto) ?? products[0];

  const posts = actual ? await listPosts(actual.id).catch(() => []) : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Instagram</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Se escriben las publicaciones del producto, se revisan y se programan. Nada sale sin que
          alguien lo haya leído: en negrita se ve lo que Instagram enseña antes del «más», que es lo
          único que lee casi todo el mundo.
        </p>
      </header>

      {/*
        El producto se elige con enlaces y no con un desplegable: así cada
        producto tiene su dirección y se puede volver a ella, que es lo que se
        hace cuando se revisa una cola cada mañana.
      */}
      <div className="flex flex-wrap gap-2">
        {products.map((one) => (
          <Link
            key={one.id}
            href={`/instagram?producto=${encodeURIComponent(one.id)}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              one.id === actual?.id
                ? "border-violet-500 text-violet-600 dark:text-violet-400"
                : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300"
            }`}
          >
            {one.name}
          </Link>
        ))}
      </div>

      {actual ? (
        <SectionCard
          title="Hablar con el agente"
          description="Dile qué quieres en tus palabras. Mira la cola antes de escribir, y deja todo en borrador."
        >
          <AgentChat productId={actual.id} />
        </SectionCard>
      ) : null}

      {actual ? (
        <SectionCard
          title={actual.name}
          description={`${posts.length} en la cola · ${posts.filter((one) => one.status === "aprobado").length} aprobadas`}
        >
          <InstagramQueue productId={actual.id} posts={posts} />
        </SectionCard>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Crea un producto primero.
        </p>
      )}
    </div>
  );
}
