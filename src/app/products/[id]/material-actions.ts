"use server";

import { revalidatePath } from "next/cache";
import { runInBackground } from "@/lib/background";
import { findProductAnywhere } from "@/lib/products";
import { findStore } from "@/lib/store-registry";
import { readProductResearch } from "@/lib/research-store";
import { generateStructured } from "@/lib/generators";
import { marketContextFor } from "@/lib/market-context";
import { listVideoReferences } from "@/lib/data/video-references";
import {
  ANATOMIA_SCHEMA,
  ANGULOS_SCHEMA,
  buildAnatomiaPrompt,
  buildAngulosPrompt,
  describeVideoAnalyses,
  normalizeAnatomia,
} from "@/lib/anatomia";
import { matchByPosition } from "@/lib/angulos-vuelta";
import { stampFor } from "@/lib/market-selection";
import { readAnatomia, saveAnatomia } from "@/lib/data/anatomias";
import type { Anatomia, AnguloDevuelto } from "@/lib/anatomia";
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

      const outcome = await generateStructured<Omit<Anatomia, "swipeId" | "ownership">>({
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
        // `ownership` lo dice quien sube el material, no el modelo: por eso no
        // está en `ANATOMIA_SCHEMA` y se pega aquí.
        anatomia: { ...outcome.data, swipeId, ownership },
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

  /*
   * Normalizada y no casteada a pelo.
   *
   * Lo que llega es lo que tenga el navegador en estado, y si por lo que sea
   * viniera sin `ownership`, un cast lo dejaría `undefined`: la anatomía se
   * guardaría sin él y la siguiente tanda la trataría como ajena. Un material
   * propio degradado a ajeno al corregirle una coma no da ningún error, solo
   * anuncios más flojos de lo que podían ser.
   */
  const data = normalizeAnatomia(anatomia);
  if (!data.promesa) {
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

/**
 * Saca ángulos de una anatomía ya escrita —y corregida, si hizo falta—.
 *
 * Se guarda lo que **se casó**, y el resumen dice eso y no lo que devolvió el
 * modelo. Un trabajo que acaba bien sin haber guardado nada es indistinguible de
 * uno que no arrancó, y eso ya costó una noche.
 */
export async function generateAnglesFromMaterialAction(input: {
  anatomiaId: unknown;
  productId: unknown;
  cuantos?: unknown;
}): Promise<LaunchResult> {
  const anatomiaId = readText(input.anatomiaId);
  const productId = readText(input.productId);
  const cuantos = Math.min(Math.max(Number(input.cuantos) || 4, 3), 5);

  if (!anatomiaId || !productId) throw new Error("Falta la anatomía o el producto.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const anatomia = await readAnatomia(anatomiaId);
  if (!anatomia) throw new Error("Esa anatomía ya no existe.");

  return runInBackground({
    productId,
    kind: "angulos",
    label: `${cuantos} ángulos desde la anatomía`,
    work: async (report) => {
      await report("Escribiendo los ángulos");

      const store = product.storeId ? await findStore(product.storeId) : null;
      const research = await readProductResearch(productId);
      const marketContext = await marketContextFor(product);
      const { buildProductContext } = await import("@/lib/copy-prompts");

      const outcome = await generateStructured<{ angulos: AnguloDevuelto[] }>({
        // El mismo contexto que usó la anatomía: prefijo idéntico, caché que
        // acierta.
        context: buildProductContext(product, research, store, marketContext),
        prompt: buildAngulosPrompt({ anatomia, cuantos }),
        schema: ANGULOS_SCHEMA,
        role: "copy",
        maxTokens: 16_000,
      });

      const vuelta = outcome.data.angulos ?? [];
      const { casados, sobran } = matchByPosition(Array.from({ length: cuantos }), vuelta);

      if (casados === 0) {
        throw new Error(
          "El modelo no devolvió ningún ángulo. Vuelve a intentarlo: no se ha guardado nada.",
        );
      }

      const { addAngles } = await import("@/lib/data/copy");

      const guardados = await addAngles(
        productId,
        vuelta.slice(0, casados).map((item) => ({
          // Si el modelo no nombra el deseo, se hereda el de la anatomía: es el
          // que ancla el ángulo, y sin él la lista sale con huecos.
          desire: item.deseo || anatomia.deseo,
          name: item.nombre,
          targetAudience: item.publico,
          storyArc: {
            start: item.arco.inicio,
            crisis: item.arco.crisis,
            discovery: item.arco.descubrimiento,
            resolution: item.arco.resolucion,
          },
          problemMechanism: item.mecanismoProblema,
          solutionMechanism: item.mecanismoSolucion,
          emotionalMoment: item.momentoEmocional,
          promiseToValidate: item.promesaPorValidar || undefined,
        })),
        stampFor(marketContext.selection),
        anatomiaId,
      );

      revalidatePath(`/products/${productId}`);

      const porValidar = guardados.filter((angle) => angle.promiseToValidate).length;

      return {
        summary: `${guardados.length} ángulos guardados${sobran > 0 ? ` (faltaron ${sobran} de los ${cuantos} pedidos)` : ""}${porValidar > 0 ? `, ${porValidar} con una promesa por comprobar` : ""}. Ya se pueden usar en copys y en vídeos.`,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      };
    },
  });
}
