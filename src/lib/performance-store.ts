import { promises as fs } from "fs";
import path from "path";
import type {
  AnglePerformance,
  PerformanceRating,
  PerformanceRecord,
  PerformanceTargetType,
} from "@/types/performance";
import { PERFORMANCE_META, PERFORMANCE_RATINGS, angleVerdict } from "@/types/performance";
import type { GeneratedCopy, MarketingAngle } from "@/types/copy";
import type { ShortAd } from "@/types/campaign";
import { formatMeta } from "@/types/campaign";
import { performanceFixture } from "@/lib/performance-fixture";
import { isDemoResearchProduct } from "@/lib/research-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as db from "@/lib/data/performance";

const dataRoot = path.join(process.cwd(), "data");
const performancePath = path.join(dataRoot, "performance.json");

async function readAll(): Promise<PerformanceRecord[]> {
  try {
    return JSON.parse(await fs.readFile(performancePath, "utf8")) as PerformanceRecord[];
  } catch {
    return [];
  }
}

export async function readPerformance(productId: string): Promise<PerformanceRecord[]> {
  if (isSupabaseConfigured()) return db.readPerformance(productId);

  const all = await readAll();
  const own = all.filter((record) => record.productId === productId);
  if (own.length > 0) return own;
  if (isDemoResearchProduct(productId)) return performanceFixture;
  return [];
}

export async function setPerformance(input: {
  productId: string;
  targetType: PerformanceTargetType;
  targetId: string;
  rating: PerformanceRating;
  note?: string;
  metrics?: PerformanceRecord["metrics"];
}): Promise<PerformanceRecord> {
  if (isSupabaseConfigured()) {
    return db.setPerformance({
      productId: input.productId,
      targetType: input.targetType,
      targetId: input.targetId,
      rating: input.rating,
      note: input.note ?? "",
      metrics: input.metrics ?? {},
    });
  }

  const all = await readAll();
  const existing = all.find(
    (record) =>
      record.productId === input.productId &&
      record.targetType === input.targetType &&
      record.targetId === input.targetId,
  );

  const record: PerformanceRecord = {
    id: existing?.id ?? `perf-${Date.now().toString(36)}`,
    productId: input.productId,
    targetType: input.targetType,
    targetId: input.targetId,
    rating: input.rating,
    note: input.note ?? existing?.note ?? "",
    metrics: input.metrics ?? existing?.metrics ?? {},
    updatedAt: new Date().toISOString(),
  };

  const next = existing
    ? all.map((item) => (item.id === existing.id ? record : item))
    : [...all, record];

  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(performancePath, JSON.stringify(next, null, 2), "utf8");

  return record;
}

/** Índice rápido `tipo::id → registro`. */
export function performanceIndex(
  records: PerformanceRecord[],
): Map<string, PerformanceRecord> {
  return new Map(records.map((record) => [`${record.targetType}::${record.targetId}`, record]));
}

function emptyCounts(): Record<PerformanceRating, number> {
  return PERFORMANCE_RATINGS.reduce(
    (acc, rating) => ({ ...acc, [rating]: 0 }),
    {} as Record<PerformanceRating, number>,
  );
}

/**
 * Agrega el rendimiento por ángulo.
 *
 * Un copy apunta a su ángulo directamente. Un anuncio corto no guarda el
 * ángulo, así que se atribuye por el conjunto al que pertenece — de ahí que
 * `adsetAngles` mapee conjunto a ángulo.
 */
export function rollUpByAngle(options: {
  angles: MarketingAngle[];
  copies: GeneratedCopy[];
  shortAds: ShortAd[];
  adsetAngles: Map<string, string>;
  records: PerformanceRecord[];
}): AnglePerformance[] {
  const { angles, copies, shortAds, adsetAngles, records } = options;
  const index = performanceIndex(records);

  return angles
    .map((angle) => {
      const counts = emptyCounts();
      const winningFormats = new Set<string>();
      const winningNotes: string[] = [];
      const losingNotes: string[] = [];
      let score = 0;
      let tested = 0;

      const collect = (
        record: PerformanceRecord | undefined,
        formatLabel?: string,
      ) => {
        const rating = record?.rating ?? "sin-probar";
        counts[rating] += 1;
        score += PERFORMANCE_META[rating].weight;
        if (rating !== "sin-probar") tested += 1;

        if (rating === "ganador") {
          if (formatLabel) winningFormats.add(formatLabel);
          if (record?.note) winningNotes.push(record.note);
        }
        if (rating === "perdedor" && record?.note) losingNotes.push(record.note);
      };

      for (const copy of copies.filter((item) => item.angleId === angle.id)) {
        collect(index.get(`copy::${copy.id}`));
      }

      for (const ad of shortAds.filter((item) => adsetAngles.get(item.adsetId) === angle.id)) {
        collect(index.get(`short-ad::${ad.id}`), formatMeta(ad.format).name);
      }

      return {
        angleId: angle.id,
        angleName: angle.name,
        desire: angle.desire,
        counts,
        score,
        tested,
        verdict: angleVerdict(score, tested),
        winningFormats: [...winningFormats],
        winningNotes,
        losingNotes,
      } satisfies AnglePerformance;
    })
    .sort((a, b) => b.score - a.score || b.tested - a.tested);
}
