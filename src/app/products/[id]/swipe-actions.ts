"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { requireCapability } from "@/lib/permissions";
import { judgeImport, readPageUrl } from "@/lib/landing-import";
import { htmlToText, pageTitle } from "@/lib/html-text";
import {
  deleteSwipeCopy,
  listAllSwipeCopies,
  listSwipeCopies,
  saveSwipeCopy,
  setSwipeStatus,
} from "@/lib/data/swipe";
import type { SwipeCopy, SwipeStatus } from "@/types/swipe";

/** Guardar y clasificar copys que ya se probaron, para escribir mejores. */

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

/**
 * Los copys guardados.
 *
 * Con producto devuelve los suyos y los que no son de ninguno; sin producto,
 * todos. Lo segundo es lo que necesita la pantalla de «adaptar un copy a este
 * producto», donde traerse uno de otro es justo la intención.
 */
export async function listSwipeCopiesAction(productId?: unknown): Promise<SwipeCopy[]> {
  if (!isSupabaseConfigured()) return [];

  const id = readText(productId);

  try {
    return id ? await listSwipeCopies(id) : await listAllSwipeCopies();
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

/**
 * Trae una landing de otra marca por su enlace y la guarda como referencia.
 *
 * ## Qué se guarda
 *
 * El **texto**, no el código. El CSS de una página está atado al armazón de su
 * tema —sus variables, sus clases, su retícula— y pegarlo en otro sitio da un
 * diseño roto, no uno idéntico. Lo que sirve de una landing ajena es en qué
 * orden cuenta las cosas y con qué palabras.
 *
 * Queda como un copy más de formato `landing`, así que aparece en el mismo
 * desplegable de «página de referencia» y sirve igual para calcarla.
 *
 * ## Y por qué se juzga lo que llega
 *
 * Una página moderna devuelve un 200 con casi nada dentro: el contenido lo pinta
 * el navegador después. Guardar eso sería guardar un cascarón y generar una
 * landing a partir del menú y el pie, sin que nada avise.
 */
export async function importLandingAction(
  url: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const { url: target, problem } = readPageUrl(readText(url));
  if (problem) return { ok: false, message: problem };

  try {
    await requireCapability("gastar");

    const response = await fetch(target, {
      headers: {
        // Sin esto muchas tiendas devuelven una página de bloqueo en vez de la
        // suya, y el texto que llega es el del bloqueo.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `Esa página respondió ${response.status}. Si es un bloqueo, ábrela, selecciona todo y pega el texto a mano.`,
      };
    }

    const html = await response.text();

    const judged = judgeImport({
      title: pageTitle(html),
      text: htmlToText(html),
      host: new URL(target).hostname,
    });

    if (judged.problem) return { ok: false, message: judged.problem };

    await saveSwipeCopy({
      productId: readText(productId) || undefined,
      title: judged.title,
      body: judged.text,
      // Sin probar: es de otro y no sabemos si le funcionó.
      status: "sin-probar",
      source: new URL(target).hostname,
      format: "landing",
      note: target,
    });

    revalidatePath(`/products/${readText(productId)}`);

    return {
      ok: true,
      message: `Traída: ${judged.words} palabras de ${new URL(target).hostname}. ${judged.note} Ya sale en «página de referencia».`,
    };
  } catch (error) {
    const why = error instanceof Error ? error.message : "no se pudo descargar";

    return {
      ok: false,
      message: `No se pudo traer: ${why}. Ábrela, selecciona todo y pega el texto a mano con «Añadir copy».`,
    };
  }
}
