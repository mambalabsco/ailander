"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as offersDb from "@/lib/data/products";
import * as notesDb from "@/lib/data/notes";
import type { ProductOffers } from "@/types/offer";

/**
 * Oferta y notas del producto.
 *
 * Las dos viven solo en Supabase: son funcionalidad nueva y no había un archivo
 * JSON equivalente que mantener. Sin credenciales configuradas, las acciones
 * avisan en lugar de fingir que guardaron algo.
 */

function requireDatabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Esto se guarda en Supabase y todavía no está configurado. Añade las claves en .env.local.",
    );
  }
}

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => readText(item)).filter(Boolean);
}

/** La oferta llega del cliente, así que se reconstruye campo a campo. */
function normalizeOffers(input: unknown): ProductOffers {
  const raw = (input ?? {}) as Record<string, unknown>;
  const tiers = Array.isArray(raw.tiers) ? raw.tiers : [];

  // Solo un pack puede ser el destacado: si llegan dos, gana el primero.
  let highlightSeen = false;

  return {
    tiers: tiers.map((item) => {
      const tier = (item ?? {}) as Record<string, unknown>;
      const isHighlighted = Boolean(tier.isHighlighted) && !highlightSeen;
      if (isHighlighted) highlightSeen = true;

      const compareAt = tier.compareAtPrice;

      return {
        id: readText(tier.id) || crypto.randomUUID(),
        label: readText(tier.label) || "Pack",
        quantity: Math.max(1, Math.round(readNumber(tier.quantity, 1))),
        totalPrice: Math.max(0, readNumber(tier.totalPrice)),
        compareAtPrice:
          compareAt === undefined || compareAt === null || compareAt === ""
            ? undefined
            : Math.max(0, readNumber(compareAt)),
        freeShipping: Boolean(tier.freeShipping),
        gifts: readList(tier.gifts),
        isHighlighted,
        note: readText(tier.note) || undefined,
      };
    }),
    subscription: (() => {
      const subscription = (raw.subscription ?? {}) as Record<string, unknown>;
      return {
        enabled: Boolean(subscription.enabled),
        discountPercent: Math.min(100, Math.max(0, readNumber(subscription.discountPercent))),
        frequency: readText(subscription.frequency),
        perks: readList(subscription.perks),
        cancellationPolicy: readText(subscription.cancellationPolicy),
      };
    })(),
    guarantee: readText(raw.guarantee),
    freeShippingThreshold:
      raw.freeShippingThreshold === undefined ||
      raw.freeShippingThreshold === null ||
      raw.freeShippingThreshold === ""
        ? undefined
        : Math.max(0, readNumber(raw.freeShippingThreshold)),
    source: readText(raw.source) === "importada" ? "importada" : "manual",
    updatedAt: new Date().toISOString(),
  };
}

export async function saveOffersAction(productId: string, input: unknown) {
  requireDatabase();

  const id = readText(productId);
  if (!id) throw new Error("Falta el producto.");

  const saved = await offersDb.saveOffers(id, normalizeOffers(input));

  revalidatePath(`/products/${id}`);
  return saved;
}

export async function createNoteAction(productId: string, input: unknown) {
  requireDatabase();

  const id = readText(productId);
  if (!id) throw new Error("Falta el producto.");

  const raw = (input ?? {}) as Record<string, unknown>;
  const body = readText(raw.body);
  if (!body) throw new Error("La nota está vacía.");
  if (body.length > 20000) throw new Error("La nota es demasiado larga.");

  const note = await notesDb.createNote({
    productId: id,
    title: readText(raw.title).slice(0, 200),
    body,
    includeInPrompts: raw.includeInPrompts === undefined ? true : Boolean(raw.includeInPrompts),
  });

  revalidatePath(`/products/${id}`);
  return note;
}

export async function toggleNoteAction(productId: string, noteId: string, include: boolean) {
  requireDatabase();

  const id = readText(noteId);
  if (!id) throw new Error("Falta la nota.");

  await notesDb.updateNote(id, { includeInPrompts: Boolean(include) });

  revalidatePath(`/products/${readText(productId)}`);
  return true;
}

export async function deleteNoteAction(productId: string, noteId: string) {
  requireDatabase();

  const id = readText(noteId);
  if (!id) throw new Error("Falta la nota.");

  const removed = await notesDb.deleteNote(id);

  revalidatePath(`/products/${readText(productId)}`);
  return removed;
}
