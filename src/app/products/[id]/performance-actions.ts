"use server";

import { revalidatePath } from "next/cache";
import { setPerformance } from "@/lib/performance-store";
import { PERFORMANCE_RATINGS } from "@/types/performance";
import type { PerformanceRating, PerformanceTargetType } from "@/types/performance";

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Marca una pieza como ganadora, prometedora, perdedora o sin probar. */
export async function ratePiece(input: {
  productId: string;
  targetType: PerformanceTargetType;
  targetId: string;
  rating: string;
  note?: string;
  metrics?: Record<string, unknown>;
}) {
  const productId = readText(input.productId);
  const targetId = readText(input.targetId);
  if (!productId || !targetId) throw new Error("Falta el identificador de la pieza.");

  const rating = PERFORMANCE_RATINGS.includes(input.rating as PerformanceRating)
    ? (input.rating as PerformanceRating)
    : "sin-probar";

  const targetType: PerformanceTargetType =
    input.targetType === "short-ad" || input.targetType === "imagen"
      ? input.targetType
      : "copy";

  const record = await setPerformance({
    productId,
    targetType,
    targetId,
    rating,
    note: readText(input.note),
    metrics: {
      spend: readOptionalNumber(input.metrics?.spend),
      roas: readOptionalNumber(input.metrics?.roas),
      ctr: readOptionalNumber(input.metrics?.ctr),
      cpa: readOptionalNumber(input.metrics?.cpa),
    },
  });

  revalidatePath(`/products/${productId}`);
  return record;
}
