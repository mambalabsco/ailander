"use server";

import { revalidatePath } from "next/cache";
import { deleteAnalysis, duplicateAnalysis, saveAnalysis } from "@/lib/store";
import type { AnalysisResult } from "@/types";

export async function deleteAnalysisAction(id: string): Promise<boolean> {
  const removed = await deleteAnalysis(id);
  revalidatePath("/history");
  revalidatePath("/");
  return removed;
}

export async function duplicateAnalysisAction(id: string): Promise<AnalysisResult | null> {
  const copy = await duplicateAnalysis(id);
  revalidatePath("/history");
  revalidatePath("/");
  return copy;
}

export async function recordAnalysis(entry: {
  title: string;
  type: "analysis" | "copy";
  productId: string;
  productName: string;
  summary: string;
}): Promise<AnalysisResult> {
  const analysis: AnalysisResult = {
    id: `${entry.type}-${Date.now().toString(36)}`,
    title: entry.title,
    type: entry.type,
    productId: entry.productId,
    productName: entry.productName,
    status: "completed",
    createdAt: new Date().toISOString().slice(0, 10),
    summary: entry.summary,
  };

  await saveAnalysis(analysis);

  revalidatePath("/history");
  revalidatePath("/");

  return analysis;
}
