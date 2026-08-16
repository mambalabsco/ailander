"use server";

import { revalidatePath } from "next/cache";
import { deleteApp, saveApp } from "@/lib/data/apps";
import type { CasinoApp } from "@/types/app";

/**
 * Alta, edición y baja de las apps de un producto de casino.
 *
 * Son formularios normales y no generaciones: no cuestan dinero y no pasan por
 * `runInBackground`.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function saveAppAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const name = readText(raw.name);

  if (!productId) return { ok: false, message: "Falta el producto." };
  if (!name) return { ok: false, message: "La app necesita un nombre." };

  const app: CasinoApp = await saveApp({
    id: readText(raw.id) || undefined,
    productId,
    name,
    focus: readText(raw.focus),
    downloadUrl: readText(raw.downloadUrl),
    position: Number(raw.position) || 0,
  });

  revalidatePath(`/products/${productId}`);

  return { ok: true, message: `«${app.name}» guardada.` };
}

export async function deleteAppAction(
  id: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const appId = readText(id);
  const product = readText(productId);

  if (!appId || !product) return { ok: false, message: "Falta la app." };

  await deleteApp(appId);
  revalidatePath(`/products/${product}`);

  // Se dice lo que sobrevive, porque no es obvio: sin esto parece que borrar una
  // app se lleva los textos que se escribieron con ella.
  return {
    ok: true,
    message: "App borrada. Los copys y las imágenes que la citaban siguen ahí, sin app asignada.",
  };
}
