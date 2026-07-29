import { listAds, listProducts } from "@/lib/store";
import { AnalyzerWorkspace } from "@/app/analyzer/analyzer-workspace";

export const dynamic = "force-dynamic";

interface AnalyzerPageProps {
  searchParams: Promise<{ ad?: string }>;
}

export default async function AnalyzerPage({ searchParams }: AnalyzerPageProps) {
  const [{ ad }, products, ads] = await Promise.all([searchParams, listProducts(), listAds()]);

  return <AnalyzerWorkspace products={products} ads={ads} initialAdId={ad} />;
}
