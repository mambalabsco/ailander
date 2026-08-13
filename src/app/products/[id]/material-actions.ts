"use server";

import { revalidatePath } from "next/cache";
import { runInBackground } from "@/lib/background";
import { findProductAnywhere } from "@/lib/products";
import { findStore } from "@/lib/store-registry";
import { readProductResearch } from "@/lib/research-store";
import { generateStructured } from "@/lib/generators";
import { marketContextFor } from "@/lib/market-context";
import { listVideoReferences } from "@/lib/data/video-references";
import { ANATOMIA_SCHEMA, buildAnatomiaPrompt, describeVideoAnalyses } from "@/lib/anatomia";
import { saveAnatomia } from "@/lib/data/anatomias";
import type { Anatomia } from "@/lib/anatomia";
import type { LaunchResult } from "@/types/jobs";

/**
 * Analizar un anuncio que funcionó, para sacarle ángulos después.
 *
 * Los vídeos **ya vienen analizados**: se suben y se analizan por el camino que
 * ya existe —`analyzeVideoAction`, con sus fotogramas y su transcripción— y aquí
 * solo entran sus análisis. Repetir ese trabajo desde aquí sería tener dos
 * caminos que hacen lo mismo, y los dos se desincronizan.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function analyzeMaterialAction(form: FormData): Promise<LaunchResult> {
  const productId = readText(form.get("productId"));
  const swipeId = readText(form.get("swipeId"));
  const copy = readText(form.get("copy"));
  const ownership = readText(form.get("ownership")) === "propio" ? "propio" : "ajeno";
  const videoIds = form
    .getAll("videoReferenceIds")
    .map((item) => readText(item))
    .filter(Boolean);

  if (!productId) throw new Error("Falta el producto.");
  if (!copy) throw new Error("Pega el copy que quieres analizar.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const imagenes = form.getAll("imagenes").filter((item): item is File => item instanceof File);

  return runInBackground({
    productId,
    kind: "material",
    label: `Anatomía de «${copy.slice(0, 40)}…»`,
    work: async (report) => {
      await report("Reuniendo los vídeos ya analizados");

      const referencias = await listVideoReferences();
      const analyses = referencias
        .filter((item) => videoIds.includes(item.id))
        .map((item) => item.analysis);

      await report("Leyendo el material");

      const store = product.storeId ? await findStore(product.storeId) : null;
      const research = await readProductResearch(productId);
      const marketContext = await marketContextFor(product);
      const { buildProductContext } = await import("@/lib/copy-prompts");

      /*
       * Seis imágenes como mucho.
       *
       * Cada una viaja entera en la petición y se paga; con el anuncio completo
       * delante, la séptima no cambia la lectura y sí el recibo.
       */
      const images = await Promise.all(
        imagenes.slice(0, 6).map(async (file) => ({
          mediaType: file.type,
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      );

      const outcome = await generateStructured<Omit<Anatomia, "swipeId">>({
        /*
         * El contexto del producto va aparte y no pegado dentro del prompt: se
         * reutiliza igual al sacar los ángulos, y es el prefijo que la caché
         * reaprovecha. Dentro del prompt se pagaría la ficha y la investigación
         * enteras dos veces.
         */
        context: buildProductContext(product, research, store, marketContext),
        prompt: buildAnatomiaPrompt({
          copy,
          ownership,
          videos: describeVideoAnalyses(analyses),
        }),
        schema: ANATOMIA_SCHEMA,
        role: "copy",
        images,
        maxTokens: 8_000,
      });

      await report("Guardando la anatomía");

      await saveAnatomia({
        productId,
        title: `Anatomía · ${copy.slice(0, 60)}`,
        anatomia: { ...outcome.data, swipeId },
      });

      revalidatePath(`/products/${productId}`);

      return {
        summary: `Anatomía escrita con ${analyses.length} vídeo(s) y ${images.length} imagen(es). Revísala antes de sacar ángulos: corregirla ahora cuesta un minuto.`,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      };
    },
  });
}

/**
 * Guarda las correcciones de una anatomía.
 *
 * Corregir aquí es la mitad del valor de haber partido esto en dos pasadas: lo
 * que se arregle antes de sacar ángulos se arregla una vez; después, cinco.
 */
export async function saveAnatomiaAction(
  id: unknown,
  productId: unknown,
  anatomia: unknown,
): Promise<{ ok: boolean; message: string }> {
  const anatomiaId = readText(id);
  const product = readText(productId);
  if (!anatomiaId || !product) return { ok: false, message: "Falta la anatomía o el producto." };

  const data = anatomia as Anatomia;
  if (!data?.promesa) {
    return { ok: false, message: "La anatomía necesita al menos su promesa." };
  }

  await saveAnatomia({
    id: anatomiaId,
    productId: product,
    title: `Anatomía · ${data.promesa.slice(0, 60)}`,
    anatomia: data,
  });

  revalidatePath(`/products/${product}`);

  return { ok: true, message: "Guardada. Los ángulos saldrán con lo corregido." };
}
