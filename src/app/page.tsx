import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import { EmptyState } from "@/components/ui";
import { listAds, listAnalyses, listCompetitorProducts } from "@/lib/store";
import { getCombinedProducts } from "@/lib/products";
import { listStores } from "@/lib/store-registry";
import { formatMoney, marketMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

const quickLinks = [
  { href: "/analyzer", label: "Analizar anuncio", description: "Sube un anuncio y extrae sus insights" },
  { href: "/copy", label: "Generar copy", description: "Adapta textos largos a cada producto" },
  { href: "/comparisons", label: "Comparar marcas", description: "Revisa diferencias frente a la competencia" },
  { href: "/products/new", label: "Crear producto", description: "Genera su paquete de investigación" },
];

export default async function HomePage() {
  const [ownProducts, competitors, ads, analyses, stores] = await Promise.all([
    getCombinedProducts(),
    listCompetitorProducts(),
    listAds(),
    listAnalyses(),
    listStores(),
  ]);

  const stats = [
    { label: "Productos propios", value: ownProducts.length, hint: "En tu catálogo", href: "/products" },
    { label: "Competidores", value: competitors.length, hint: "En seguimiento", href: "/competitors" },
    {
      label: "Anuncios analizados",
      value: ads.filter((ad) => ad.status === "analyzed").length,
      hint: `${ads.length} en la biblioteca`,
      href: "/ads",
    },
    {
      label: "Textos generados",
      value: analyses.filter((item) => item.type === "copy").length,
      hint: `${analyses.length} registros en total`,
      href: "/history",
    },
  ];

  const recent = analyses.slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-500 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold">{stat.value}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{stat.hint}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <SectionCard title="Análisis recientes" description="Últimos resultados generados en la plataforma">
          {recent.length === 0 ? (
            <EmptyState
              title="Todavía no hay análisis"
              description="Analiza un anuncio o genera un copy y aparecerá aquí."
            />
          ) : (
            <div className="space-y-3">
              {recent.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{item.title}</p>
                    <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.summary}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={item.status} />
                    <span className="text-sm text-slate-500 dark:text-slate-400">{item.createdAt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Accesos rápidos" description="Tareas frecuentes del equipo">
          <div className="space-y-3">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-2xl border border-slate-200 p-4 transition hover:border-violet-500 dark:border-slate-800"
              >
                <p className="font-medium">{item.label}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Biblioteca de anuncios" description="Últimos anuncios cargados">
          {ads.length === 0 ? (
            <EmptyState title="Sin anuncios" description="Sube el primero desde la biblioteca." />
          ) : (
            <div className="space-y-3">
              {ads.slice(0, 3).map((ad) => (
                <div
                  key={ad.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{ad.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {ad.brand} · {ad.platform}
                    </p>
                  </div>
                  <StatusPill status={ad.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Productos destacados" description="Vista rápida del catálogo principal">
          {ownProducts.length === 0 ? (
            <EmptyState title="Sin productos" description="Crea el primero para empezar." />
          ) : (
            <div className="space-y-3">
              {ownProducts.slice(0, 3).map((product) => (
                <Link
                  key={product.id}
                  href={`/products/${product.id}`}
                  className="block rounded-2xl border border-slate-200 p-4 transition hover:border-violet-500 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {product.category} · {formatMoney(product.price, marketMoney(product, stores))}
                      </p>
                    </div>
                    <StatusPill status={product.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
