"use server";

import { runInBackground } from "@/lib/background";
import { generateStructured } from "@/lib/generators";
import { STORY_BEATS_SCHEMA } from "@/lib/generation-schemas";
import { findProductAnywhere } from "@/lib/products";
import { readCopies, saveStoryBeats } from "@/lib/data/copy";
import { readAngles } from "@/lib/copy-store";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  INTENSITIES,
  buildBeatExtractionPrompt,
  quoteIsReal,
  type Intensity,
  type StoryBeat,
} from "@/lib/story-beats";
import type { LaunchResult } from "@/types/jobs";

/**
 * Sacar las escenas visuales de dentro de un copy.
 *
 * En un archivo propio y no dentro de `image-generate-actions.ts` porque son dos
 * trabajos distintos: aquí se **lee la historia**, allí se generan las imágenes.
 * Y porque en un archivo `"use server"` cada exportación es una acción, así que
 * mantenerlos separados deja claro qué se puede llamar desde el navegador.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function extractStoryBeatsAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const copyId = readText(raw.copyId);
  if (!productId || !copyId) throw new Error("Falta el copy.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const rawIntensity = readText(raw.intensity);
  const intensity: Intensity = (INTENSITIES as readonly string[]).includes(rawIntensity)
    ? (rawIntensity as Intensity)
    : "crudo";

  const count = Math.min(Math.max(Number(raw.count) || 6, 3), 7);

  const [product, copies, angles] = await Promise.all([
    findProductAnywhere(productId),
    readCopies(productId),
    readAngles(productId),
  ]);

  if (!product) throw new Error("No se encontró el producto.");

  const copy = copies.find((item) => item.id === copyId);
  if (!copy) throw new Error("Ese copy ya no existe.");

  const body = copy.content.primaryText;
  if (body.length < 300) {
    return {
      started: false,
      message:
        "Este copy es demasiado corto para sacarle escenas. El motor busca los momentos de una historia, y en un anuncio corto no los hay: usa las creatividades de plantilla.",
    };
  }

  const angle = angles.find((item) => item.id === copy.angleId);

  const prompt = buildBeatExtractionPrompt({
    productName: product.name,
    audience: angle?.targetAudience || product.targetAudience || "el público objetivo",
    body,
    headline: copy.content.headline,
    problemMechanism: angle?.problemMechanism,
    count,
    intensity,
  });

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Escenas · ${copy.driverLabel}`,
    work: async () => {
      const { data, inputTokens, outputTokens } = await generateStructured<{
        beats: StoryBeat[];
      }>({ prompt, schema: STORY_BEATS_SCHEMA, role: "copy", maxTokens: 16_000 });

      /*
       * Se descartan las escenas cuya cita no está en el texto.
       *
       * Es la comprobación que hace honesto todo el motor: cuando el modelo no
       * encuentra material en la historia, rellena con escenas genéricas de
       * suplemento y les pone una cita plausible que nunca escribió nadie. Sin
       * este filtro las creatividades vuelven a ser las de siempre, pero con la
       * apariencia de venir del copy.
       */
      const all = data.beats ?? [];
      const real = all.filter((beat) => quoteIsReal(beat.quote, body));
      const invented = all.length - real.length;

      if (real.length === 0) {
        throw new Error(
          "Ninguna de las escenas propuestas cita el texto de verdad. Suele pasar cuando el copy es más argumento que historia: prueba con uno narrativo, o usa las creatividades de plantilla.",
        );
      }

      await saveStoryBeats(copyId, real, intensity);

      return {
        summary:
          invented > 0
            ? `${real.length} escenas sacadas del texto. Se descartaron ${invented} que no citaban nada del copy.`
            : `${real.length} escenas sacadas del texto.`,
        inputTokens,
        outputTokens,
      };
    },
  });
}
