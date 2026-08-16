"use server";

import { revalidatePath } from "next/cache";
import {
  deleteCampaignFolder,
  saveCampaignFolder,
  setCampaignArchived,
  setCampaignFolder,
} from "@/lib/campaign-store";

/**
 * Carpetas de campañas, mover y archivar.
 *
 * Son formularios normales y no generaciones: no cuestan dinero y no pasan por
 * `runInBackground`.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function saveFolderAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const name = readText(raw.name);

  if (!productId) return { ok: false, message: "Falta el producto." };
  if (!name) return { ok: false, message: "La carpeta necesita un nombre." };

  const folder = await saveCampaignFolder({
    id: readText(raw.id) || undefined,
    productId,
    name,
    position: Number(raw.position) || 0,
  });

  revalidatePath(`/products/${productId}`);

  return { ok: true, message: `«${folder.name}» guardada.` };
}

export async function deleteFolderAction(
  id: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const folderId = readText(id);
  const product = readText(productId);

  if (!folderId || !product) return { ok: false, message: "Falta la carpeta." };

  await deleteCampaignFolder(folderId);
  revalidatePath(`/products/${product}`);

  // Se dice lo que sobrevive, porque no es obvio: sin esto parece que borrar la
  // carpeta se lleva las campañas que había dentro.
  return {
    ok: true,
    message: "Carpeta borrada. Las campañas que tenía siguen ahí, sin carpeta.",
  };
}

export async function moveCampaignAction(
  campaignId: unknown,
  folderId: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const campaign = readText(campaignId);
  const product = readText(productId);

  if (!campaign || !product) return { ok: false, message: "Falta la campaña." };

  // Vacío es «sin carpeta», no «no cambiar»: es lo que devuelve el desplegable
  // cuando se elige la primera opción.
  const destino = readText(folderId);
  await setCampaignFolder(campaign, destino || null);
  revalidatePath(`/products/${product}`);

  return { ok: true, message: destino ? "Movida." : "Ahora está sin carpeta." };
}

export async function archiveCampaignAction(
  campaignId: unknown,
  archived: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const campaign = readText(campaignId);
  const product = readText(productId);

  if (!campaign || !product) return { ok: false, message: "Falta la campaña." };

  await setCampaignArchived(campaign, archived === true);
  revalidatePath(`/products/${product}`);

  return {
    ok: true,
    message: archived === true ? "Archivada." : "Devuelta a su carpeta.",
  };
}
