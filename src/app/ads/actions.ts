"use server";

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { deleteAd, saveAd } from "@/lib/store";
import type { AdCampaign } from "@/types";

const uploadsDir = path.join(process.cwd(), "public", "uploads");

const allowedTypes: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const MAX_BYTES = 5 * 1024 * 1024;

function readText(value: FormDataEntryValue | null, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

/**
 * Guarda la imagen del anuncio en `public/uploads` y devuelve su ruta pública.
 * Solo se aceptan tipos de imagen conocidos y la extensión la decide el
 * servidor, nunca el nombre que envía el cliente.
 */
async function storeImage(file: File | null): Promise<string> {
  if (!file || file.size === 0) return "/placeholder-1.svg";

  const extension = allowedTypes[file.type];
  if (!extension) {
    throw new Error("Formato de imagen no admitido. Usa PNG, JPG, WEBP, GIF o SVG.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("La imagen supera el máximo de 5 MB.");
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const fileName = `${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadsDir, fileName), buffer);

  return `/uploads/${fileName}`;
}

export async function createAdFromForm(formData: FormData): Promise<AdCampaign> {
  const name = readText(formData.get("name"));
  if (!name) {
    throw new Error("El nombre del anuncio es obligatorio.");
  }

  const rawType = readText(formData.get("type"));
  const fileEntry = formData.get("image");
  const image = await storeImage(fileEntry instanceof File ? fileEntry : null);

  const ad: AdCampaign = {
    id: `ad-${Date.now().toString(36)}`,
    name,
    brand: readText(formData.get("brand"), "Sin marca"),
    relatedProductId: readText(formData.get("relatedProductId")),
    type: rawType === "competitor" ? "competitor" : "own",
    platform: readText(formData.get("platform"), "Meta Ads"),
    country: readText(formData.get("country"), "España"),
    date: new Date().toISOString().slice(0, 10),
    tags: readText(formData.get("tags"))
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    status: "pending",
    image,
  };

  await saveAd(ad);

  revalidatePath("/ads");
  revalidatePath("/");

  return ad;
}

export async function deleteAdAction(id: string): Promise<boolean> {
  const removed = await deleteAd(id);
  revalidatePath("/ads");
  revalidatePath("/");
  return removed;
}
