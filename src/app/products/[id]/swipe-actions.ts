"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  deleteSwipeCopy,
  listSwipeCopies,
  saveSwipeCopy,
  setSwipeStatus,
} from "@/lib/data/swipe";
import type { SwipeCopy, SwipeStatus } from "@/types/swipe";

/** Guardar y clasificar copys que ya se probaron, para escribir mejores. */

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function listSwipeCopiesAction(): Promise<SwipeCopy[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await listSwipeCopies();
  } catch {
    return [];
  }
}

export async function saveSwipeCopyAction(input: unknown): Promise<SwipeCopy> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const title = readText(raw.title);
  const body = readText(raw.body);

  if (!title) throw new Error("Ponle un nombre para poder reconocerlo después.");
  if (body.length < 40) {
    throw new Error("El texto es demasiado corto para servir de referencia.");
  }

  const status = readText(raw.status, "sin-probar");

  const saved = await saveSwipeCopy({
    productId: readText(raw.productId) || undefined,
    title,
    body,
    status: (["funciona", "malo", "sin-probar"].includes(status)
      ? status
      : "sin-probar") as SwipeStatus,
    source: readText(raw.source) || undefined,
    format: readText(raw.format) || undefined,
    note: readText(raw.note) || undefined,
  });

  const productId = readText(raw.productId);
  if (productId) revalidatePath(`/products/${productId}`);
  return saved;
}

export async function setSwipeStatusAction(
  id: unknown,
  status: unknown,
  productId: unknown,
): Promise<void> {
  const value = readText(status);
  if (!["funciona", "malo", "sin-probar"].includes(value)) return;

  await setSwipeStatus(readText(id), value as SwipeStatus);

  const product = readText(productId);
  if (product) revalidatePath(`/products/${product}`);
}

export async function deleteSwipeCopyAction(id: unknown, productId: unknown): Promise<void> {
  await deleteSwipeCopy(readText(id));
  const product = readText(productId);
  if (product) revalidatePath(`/products/${product}`);
}
