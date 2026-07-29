import { promises as fs } from "fs";
import path from "path";
import type { GeneratedCopy, MarketingAngle } from "@/types/copy";
import { anglesFixture, copiesFixture } from "@/lib/copy-fixture";
import { isDemoResearchProduct } from "@/lib/research-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as db from "@/lib/data/copy";

/** Persistencia de ángulos y textos generados, con el mismo patrón que la investigación. */

const dataRoot = path.join(process.cwd(), "data");
const anglesPath = path.join(dataRoot, "angles.json");
const copiesPath = path.join(dataRoot, "copies.json");

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function readAngles(productId: string): Promise<MarketingAngle[]> {
  if (isSupabaseConfigured()) return db.readAngles(productId);

  const stored = await readJson<MarketingAngle[]>(anglesPath, []);
  const own = stored.filter((angle) => angle.productId === productId);
  if (own.length > 0) return own;
  if (isDemoResearchProduct(productId)) return anglesFixture;
  return [];
}

export async function saveAngles(productId: string, angles: MarketingAngle[]) {
  if (isSupabaseConfigured()) {
    // Los copys ya escritos apuntan a sus ángulos con clave foránea, así que
    // solo se insertan los nuevos en vez de reemplazar la lista.
    const nuevos = angles.filter((angle) => !angle.id || angle.id.length < 32);
    return db.addAngles(productId, nuevos);
  }

  const stored = await readJson<MarketingAngle[]>(anglesPath, []);
  const others = stored.filter((angle) => angle.productId !== productId);
  await writeJson(anglesPath, [...others, ...angles]);
  return angles;
}

export async function readCopies(productId: string): Promise<GeneratedCopy[]> {
  if (isSupabaseConfigured()) return db.readCopies(productId);

  const stored = await readJson<GeneratedCopy[]>(copiesPath, []);
  const own = stored.filter((copy) => copy.productId === productId);
  if (own.length > 0) return own;
  if (isDemoResearchProduct(productId)) return copiesFixture;
  return [];
}

export async function saveCopies(productId: string, copies: GeneratedCopy[]) {
  if (isSupabaseConfigured()) {
    const nuevos = copies.filter((copy) => !copy.id || copy.id.length < 32);
    return db.addCopies(productId, nuevos);
  }

  const stored = await readJson<GeneratedCopy[]>(copiesPath, []);
  const others = stored.filter((copy) => copy.productId !== productId);
  await writeJson(copiesPath, [...others, ...copies]);
  return copies;
}

export async function updateCopyStatus(
  productId: string,
  copyId: string,
  status: GeneratedCopy["status"],
): Promise<GeneratedCopy | null> {
  if (isSupabaseConfigured()) return db.updateCopyStatus(copyId, status);

  const current = await readCopies(productId);
  const next = current.map((copy) => (copy.id === copyId ? { ...copy, status } : copy));
  await saveCopies(productId, next);
  return next.find((copy) => copy.id === copyId) ?? null;
}
