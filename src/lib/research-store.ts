import { promises as fs } from "fs";
import type { Selection } from "@/lib/market-price";
import path from "path";
import type { ProductHook, ProductResearch } from "@/types/research";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as db from "@/lib/data/research";
import { emptyProductResearch } from "@/types/research";
import { DEMO_RESEARCH_PRODUCT_IDS, hooksFixture, researchFixture } from "@/lib/research-fixture";

/**
 * Persistencia de la investigación y los ganchos por producto.
 *
 * Mientras no haya proveedor de IA configurado no se escribe nada aquí: los
 * productos de demostración leen el fixture y el resto devuelve el estado
 * vacío, que es lo que la interfaz usa para mostrar el aviso de "configura tu
 * API key".
 */

const dataRoot = path.join(process.cwd(), "data");
const researchPath = path.join(dataRoot, "research.json");
const hooksPath = path.join(dataRoot, "hooks.json");

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function isDemoResearchProduct(productId: string) {
  return DEMO_RESEARCH_PRODUCT_IDS.includes(productId);
}

export async function readProductResearch(productId: string): Promise<ProductResearch> {
  if (isSupabaseConfigured()) return db.readProductResearch(productId);

  const stored = await readJson<Record<string, ProductResearch>>(researchPath, {});
  if (stored[productId]) return stored[productId];
  if (isDemoResearchProduct(productId)) return researchFixture;
  return emptyProductResearch();
}

export async function saveProductResearch(productId: string, research: ProductResearch) {
  if (isSupabaseConfigured()) {
    await db.saveProductResearch(productId, research);
    return research;
  }

  const stored = await readJson<Record<string, ProductResearch>>(researchPath, {});
  stored[productId] = research;
  await writeJson(researchPath, stored);
  return research;
}

export async function readProductHooks(productId: string, selection?: Selection): Promise<ProductHook[]> {
  if (isSupabaseConfigured()) return db.readProductHooks(productId, selection);

  const stored = await readJson<ProductHook[]>(hooksPath, []);
  const own = stored.filter((hook) => hook.productId === productId);
  if (own.length > 0) return own;
  if (isDemoResearchProduct(productId)) return hooksFixture;
  return [];
}

export async function saveProductHooks(productId: string, hooks: ProductHook[], marketId?: string | null) {
  if (isSupabaseConfigured()) {
    // En Postgres los ganchos se **añaden**: los ya marcados como usados son
    // justo lo que evita repetir el mismo gancho, y reemplazar la lista los
    // perdería. Solo entran los que todavía no tienen id de base de datos.
    const nuevos = hooks.filter((hook) => !hook.id || hook.id.length < 32);
    return db.addProductHooks(productId, nuevos, marketId);
  }

  const stored = await readJson<ProductHook[]>(hooksPath, []);
  const others = stored.filter((hook) => hook.productId !== productId);
  await writeJson(hooksPath, [...others, ...hooks]);
  return hooks;
}

/**
 * Alterna el estado usado/pendiente de un gancho.
 *
 * Los ganchos de demostración viven en el fixture (solo lectura), así que la
 * primera vez que se marca uno se vuelca el conjunto completo al store y a
 * partir de ahí se trabaja sobre disco.
 */
export async function toggleHookUsed(productId: string, hookId: string): Promise<ProductHook | null> {
  if (isSupabaseConfigured()) return db.toggleHookUsed(hookId);

  const current = await readProductHooks(productId);
  const next = current.map((hook) =>
    hook.id === hookId
      ? {
          ...hook,
          isUsed: !hook.isUsed,
          usedAt: hook.isUsed ? undefined : new Date().toISOString(),
        }
      : hook,
  );

  await saveProductHooks(productId, next);
  return next.find((hook) => hook.id === hookId) ?? null;
}
