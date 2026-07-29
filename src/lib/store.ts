import { promises as fs } from "fs";
import path from "path";
import type { AdCampaign, AnalysisResult, Product } from "@/types";
import { adsLibrary, competitorProducts, ownProducts, recentAnalyses } from "@/lib/mock-data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as db from "@/lib/data/products";
import * as library from "@/lib/data/library";

/**
 * Acceso a productos, anuncios y análisis.
 *
 * **Con Supabase configurado, esto delega en la base de datos** y los archivos
 * de `data/` no se tocan. Sin configurar, sigue funcionando sobre disco con
 * `mock-data.ts` como semilla, para poder abrir la plataforma y mirarla antes
 * de tener proyecto.
 *
 * La decisión se toma aquí y no en cada página: así el cambio de un modo a otro
 * no obliga a tocar la interfaz, que es exactamente lo que se pedía al conectar
 * las páginas de forma progresiva.
 */

const dataRoot = path.join(process.cwd(), "data");

type Collection = "products" | "ads" | "analyses";

const seeds: {
  products: Product[];
  ads: AdCampaign[];
  analyses: AnalysisResult[];
} = {
  products: [...ownProducts, ...competitorProducts],
  ads: adsLibrary,
  analyses: recentAnalyses,
};

async function readCollection<T>(collection: Collection): Promise<T[]> {
  const filePath = path.join(dataRoot, `${collection}.json`);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
  } catch {
    // Sin archivo todavía (o corrupto): sembramos desde mock-data.
  }

  const seed = seeds[collection] as unknown as T[];
  await writeCollection(collection, seed);
  return seed;
}

async function writeCollection<T>(collection: Collection, items: T[]): Promise<T[]> {
  await fs.mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, `${collection}.json`);
  await fs.writeFile(filePath, JSON.stringify(items, null, 2), "utf8");
  return items;
}

/* ---------------------------------- Productos --------------------------------- */

export async function listProducts(): Promise<Product[]> {
  if (isSupabaseConfigured()) return db.listProducts();
  return readCollection<Product>("products");
}

export async function listOwnProducts(): Promise<Product[]> {
  if (isSupabaseConfigured()) return db.listProducts("own");
  const products = await readCollection<Product>("products");
  return products.filter((product) => product.owner === "own");
}

export async function listCompetitorProducts(): Promise<Product[]> {
  if (isSupabaseConfigured()) return db.listProducts("competitor");
  const products = await readCollection<Product>("products");
  return products.filter((product) => product.owner === "competitor");
}

export async function findProduct(id: string): Promise<Product | null> {
  if (isSupabaseConfigured()) return db.findProduct(id);
  const products = await readCollection<Product>("products");
  return products.find((product) => product.id === id) ?? null;
}

export async function saveProduct(product: Product): Promise<Product> {
  if (isSupabaseConfigured()) {
    // En Postgres el id lo genera la base de datos, así que un producto sin id
    // previo es un alta y uno con id es una actualización.
    const existing = product.id ? await db.findProduct(product.id) : null;
    return existing ? ((await db.updateProduct(product.id, product)) ?? product) : db.createProduct(product);
  }

  const products = await readCollection<Product>("products");
  const index = products.findIndex((item) => item.id === product.id);

  if (index >= 0) {
    products[index] = product;
  } else {
    products.push(product);
  }

  await writeCollection("products", products);
  return product;
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product | null> {
  if (isSupabaseConfigured()) return db.updateProduct(id, patch);

  const products = await readCollection<Product>("products");
  const index = products.findIndex((item) => item.id === id);
  if (index < 0) return null;

  // `id` y `owner` no son editables desde el formulario, y un `undefined`
  // significa "no tocar este campo": ambos se descartan antes de mezclar.
  const immutableKeys = new Set(["id", "owner"]);
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => !immutableKeys.has(key) && value !== undefined),
  ) as Partial<Product>;

  const updated: Product = { ...products[index], ...definedPatch };
  products[index] = updated;

  await writeCollection("products", products);
  return updated;
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) return db.deleteProduct(id);

  const products = await readCollection<Product>("products");
  const remaining = products.filter((product) => product.id !== id);
  if (remaining.length === products.length) return false;

  await writeCollection("products", remaining);
  return true;
}

/* ---------------------------------- Anuncios ---------------------------------- */

export async function listAds(): Promise<AdCampaign[]> {
  if (isSupabaseConfigured()) return library.listAds();
  return readCollection<AdCampaign>("ads");
}

export async function saveAd(ad: AdCampaign): Promise<AdCampaign> {
  if (isSupabaseConfigured()) {
    return library.saveAd({
      id: ad.id && ad.id.length >= 32 ? ad.id : undefined,
      name: ad.name,
      brand: ad.brand,
      relatedProductId: ad.relatedProductId,
      type: ad.type,
      platform: ad.platform,
      country: ad.country,
      tags: ad.tags,
      status: ad.status,
    });
  }

  const ads = await listAds();
  const index = ads.findIndex((item) => item.id === ad.id);

  if (index >= 0) {
    ads[index] = ad;
  } else {
    ads.push(ad);
  }

  await writeCollection("ads", ads);
  return ad;
}

export async function deleteAd(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) return library.deleteAd(id);

  const ads = await listAds();
  const remaining = ads.filter((ad) => ad.id !== id);
  if (remaining.length === ads.length) return false;

  await writeCollection("ads", remaining);
  return true;
}

/* --------------------------------- Historial ---------------------------------- */

export async function listAnalyses(): Promise<AnalysisResult[]> {
  if (isSupabaseConfigured()) return library.listAnalyses();
  return readCollection<AnalysisResult>("analyses");
}

export async function saveAnalysis(analysis: AnalysisResult): Promise<AnalysisResult> {
  if (isSupabaseConfigured()) {
    return library.saveAnalysis({
      id: analysis.id && analysis.id.length >= 32 ? analysis.id : undefined,
      title: analysis.title,
      type: analysis.type,
      productId: analysis.productId,
      status: analysis.status,
      summary: analysis.summary,
    });
  }

  const analyses = await listAnalyses();
  const index = analyses.findIndex((item) => item.id === analysis.id);

  if (index >= 0) {
    analyses[index] = analysis;
  } else {
    analyses.unshift(analysis);
  }

  await writeCollection("analyses", analyses);
  return analysis;
}

export async function deleteAnalysis(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) return library.deleteAnalysis(id);

  const analyses = await listAnalyses();
  const remaining = analyses.filter((analysis) => analysis.id !== id);
  if (remaining.length === analyses.length) return false;

  await writeCollection("analyses", remaining);
  return true;
}

export async function duplicateAnalysis(id: string): Promise<AnalysisResult | null> {
  const analyses = await listAnalyses();
  const original = analyses.find((analysis) => analysis.id === id);
  if (!original) return null;

  const copy: AnalysisResult = {
    ...original,
    id: `${original.id}-copia-${analyses.length + 1}`,
    title: `${original.title} (copia)`,
    status: "draft",
    createdAt: new Date().toISOString().slice(0, 10),
  };

  analyses.unshift(copy);
  await writeCollection("analyses", analyses);
  return copy;
}
