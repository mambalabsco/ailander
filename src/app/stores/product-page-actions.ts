"use server";

import { revalidatePath } from "next/cache";
import { findStore } from "@/lib/store-registry";
import { listThemeFiles, writeThemeFilesLenient } from "@/lib/shopify-store";
import { findProductAnywhere } from "@/lib/products";
import { readProductResearch } from "@/lib/research-store";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { generateStructured } from "@/lib/generators";
import { runInBackground } from "@/lib/background";
import { TEMPLATE_COPY_SCHEMA } from "@/lib/generation-schemas";
import {
  applyCopy,
  buildTemplateCopyPrompt,
  collectCopy,
  readTemplateCopy,
  type ProductTemplate,
} from "@/lib/shopify/product-template";

const readText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Las plantillas de producto de un tema, para elegir cuál sirve de modelo. */
export async function listProductTemplatesAction(
  storeId: unknown,
  themeId: unknown,
): Promise<{ ok: boolean; message: string; files?: string[] }> {
  const theme = readText(themeId);
  if (!theme) return { ok: false, message: "Falta el tema." };

  try {
    const store = await findStore(readText(storeId));
    if (!store) return { ok: false, message: "No se encontró la tienda." };

    const files = (await listThemeFiles(store, theme))
      .map((file) => file.filename)
      .filter((name) => /^templates\/product\..*\.json$/.test(name))
      .sort();

    if (files.length === 0) {
      return {
        ok: false,
        message:
          "Ese tema no tiene ninguna plantilla de producto guardada aparte. Crea una en Shopify («Crear plantilla» desde la página de producto) y vuelve.",
      };
    }

    return { ok: true, message: `${files.length} plantilla(s).`, files };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudieron leer las plantillas.",
    };
  }
}

/**
 * Una página de producto nueva, calcada de una que ya funciona.
 *
 * ## Qué se copia y qué no
 *
 * Se copia **el diseño entero, tal cual**: colores, tamaños, iconos, el orden
 * de los bloques, los widgets con su HTML. Se reescribe **solo el texto**. Es
 * lo contrario de generar una página desde cero, y a propósito: una maqueta que
 * ya vende es el activo, y lo único que la ata al producto viejo son las
 * palabras.
 *
 * ## Por qué en segundo plano
 *
 * Porque una plantilla real trae entre treinta y cien textos y el modelo tarda.
 * Un botón que espera dejaría la pestaña colgada varios minutos, y quien la
 * cierre pierde el trabajo ya pagado.
 *
 * ## Y por qué se escribe en una plantilla nueva
 *
 * Nunca sobre el modelo. Si se pisara, un solo intento fallido se llevaría por
 * delante la página que sí funciona — y esa no se recupera desde aquí.
 */
export async function generateProductPageAction(input: unknown): Promise<
  { started: false; message: string } | { started: true; jobId: string; label: string }
> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const storeId = readText(raw.storeId);
  const themeId = readText(raw.themeId);
  const model = readText(raw.templateFile);
  const productId = readText(raw.productId);

  if (!themeId || !model) return { started: false, message: "Falta la plantilla modelo." };
  if (!productId) return { started: false, message: "Falta el producto." };

  if (!(await hasActiveProviderKey())) {
    return { started: false, message: "No hay clave de API configurada. Añádela en Configuración." };
  }

  const store = await findStore(storeId);
  if (!store) return { started: false, message: "No se encontró la tienda." };

  const product = await findProductAnywhere(productId);
  if (!product) return { started: false, message: "Ese producto ya no existe." };

  /*
   * El nombre de la plantilla nueva sale del producto, no de la fecha.
   *
   * Shopify empareja producto y plantilla por el sufijo, y ese sufijo se elige
   * a mano en la ficha del producto. Con una marca de tiempo dentro saldría
   * `producto-1785782677`, que en el desplegable no dice nada.
   */
  const suffix = product.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  if (!suffix) return { started: false, message: "El producto no tiene un nombre usable." };

  const destino = `templates/product.${suffix}.json`;

  if (destino === model) {
    return {
      started: false,
      message: "Esa es la plantilla modelo. Elige otra o cambia el nombre del producto.",
    };
  }

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Página de producto · ${product.name}`,
    work: async (report) => {
      await report("Leyendo la plantilla modelo");

      const [file] = await listThemeFiles(store, themeId, [model]);
      if (!file?.body) throw new Error(`No se pudo leer ${model} de ese tema.`);

      let template: ProductTemplate;

      try {
        template = JSON.parse(file.body) as ProductTemplate;
      } catch {
        throw new Error(
          `${model} no es un JSON válido. Las plantillas hechas con Liquid (.liquid) no sirven de modelo: solo las de bloques (.json).`,
        );
      }

      const fields = collectCopy(template);

      if (fields.length === 0) {
        throw new Error(
          "Esa plantilla no tiene ningún texto que reescribir. ¿Es la correcta? Una plantilla vacía solo trae la maqueta, sin contenido.",
        );
      }

      await report(`Reescribiendo ${fields.length} textos para ${product.name}`);

      /*
       * El maestro de la investigación, si lo hay.
       *
       * Es el documento que reúne público, deseos y objeciones. Sin él la
       * página sale correcta y genérica: los textos que más venden de una
       * plantilla son los que nombran algo concreto del cliente.
       */
      const research = await readProductResearch(productId).catch(() => null);

      const context = [
        product.description ? `Producto: ${product.description}` : "",
        product.benefits.length > 0 ? `Beneficios: ${product.benefits.join(", ")}` : "",
        ...(research?.master
          ? [
              `Cliente: ${research.master.demographicDescription}`,
              `Le duele: ${research.master.psychographics.painPoints.join("; ")}`,
              `Quiere: ${research.master.psychographics.hopesAndDreams.join("; ")}`,
              `Habla así: ${research.master.psychographics.languageToUse.join("; ")}`,
              `Nunca digas: ${research.master.psychographics.languageToAvoid.join("; ")}`,
              `Objeciones: ${research.master.objections.map((one) => one.objection).join("; ")}`,
            ]
          : []),
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 6_000);

      const written = await generateStructured<{ fields: { path: string; text: string }[] }>({
        prompt: buildTemplateCopyPrompt({
          fields,
          productName: product.name,
          audience: product.targetAudience || "el público objetivo",
          country: product.country || "México",
          context: context || undefined,
        }),
        schema: TEMPLATE_COPY_SCHEMA,
        role: "copy",
        maxTokens: 16_000,
      });

      const changes = readTemplateCopy(fields, written.data.fields ?? []);

      if (Object.keys(changes).length === 0) {
        throw new Error("El modelo no devolvió ningún texto reconocible. Vuelve a intentarlo.");
      }

      await report("Publicando la plantilla en el tema");

      const next = applyCopy(template, changes);

      await writeThemeFilesLenient(store, themeId, [
        { filename: destino, content: JSON.stringify(next, null, 2) },
      ]);

      revalidatePath("/stores");

      /*
       * Se dice cuántos **no** se reescribieron.
       *
       * Un modelo que devuelve treinta de cuarenta textos produce una página
       * medio traducida que desde fuera parece terminada: los diez que quedan
       * hablan del producto viejo y solo se ven leyéndola entera.
       */
      const faltan = fields.length - Object.keys(changes).length;

      return {
        summary: [
          `Plantilla creada: ${destino}.`,
          `${Object.keys(changes).length} de ${fields.length} textos reescritos${
            faltan > 0 ? ` — quedan ${faltan} con el texto del modelo` : ""
          }.`,
          `Asígnala al producto en Shopify: ficha del producto → Plantilla de tema → ${suffix}.`,
        ].join(" "),
        inputTokens: written.inputTokens,
        outputTokens: written.outputTokens,
      };
    },
  });
}
