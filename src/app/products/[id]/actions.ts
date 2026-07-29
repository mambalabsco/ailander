"use server";

import { revalidatePath } from "next/cache";
import { toggleHookUsed } from "@/lib/research-store";
import type { ProductHook } from "@/types/research";

/** Alterna el estado usado/nuevo de un gancho desde la pestaña de hooks. */
export async function markHookUsage(productId: string, hookId: string): Promise<ProductHook | null> {
  const updated = await toggleHookUsed(productId, hookId);
  revalidatePath(`/products/${productId}`);
  return updated;
}
