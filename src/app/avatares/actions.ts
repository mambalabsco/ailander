"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/permissions";
import { runInBackground } from "@/lib/background";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { findProductAnywhere } from "@/lib/products";
import { readPrimaryImage } from "@/lib/image-store";
import { generateWithCli, modelMediaParams } from "@/lib/higgsfield-cli";
import { keyframe } from "@/lib/video/providers";
import {
  addAvatar,
  addShot,
  deleteAvatar,
  deleteShot,
  listAvatars,
  updateAvatar,
  uploadAvatarImage,
} from "@/lib/data/avatars";
import {
  buildPersonPrompt,
  buildShotPrompt,
  contextsFor,
  tally,
} from "@/lib/avatar-shots";
import type { LaunchResult } from "@/types/jobs";

/**
 * El generador de avatares con producto.
 *
 * ## Qué produce y por qué en dos pasos
 *
 * Una **cara** se sube o se genera, y se guarda suelta. Después, esa misma cara
 * sale con el producto en la mano en varios contextos. Los dos pasos están
 * separados porque la cara se reutiliza: sirve para todos los productos y para
 * todas las tandas, y generarla otra vez en cada foto sería pagarla veinte
 * veces por nada.
 *
 * ## Y por qué las tomas van al fondo
 *
 * Multiplican. Seis caras por cinco fotos son treinta generaciones, y eso son
 * varios minutos: con la pestaña abierta se cortaría a la mitad y quedaría una
 * tanda incompleta sin saber cuál falta.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function guard() {
  await requireCapability("gastar");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
}

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Baja una imagen para dársela al CLI, que quiere archivos y no direcciones.
 *
 * Se comprueba la respuesta en vez de mandar los bytes que vengan: una
 * dirección caducada devuelve una página de error con código 200 en algunos
 * almacenamientos, y eso llegaría al generador como una imagen ilegible con un
 * mensaje que no dice nada.
 */
async function download(url: string, filename: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`no se pudo descargar ${filename} (${response.status})`);

  return { filename, bytes: new Uint8Array(await response.arrayBuffer()) };
}

/* --------------------------- Subir caras en tanda -------------------------- */

/**
 * Sube varias fotos de cara de una vez.
 *
 * En tanda porque es como llegan: quien tiene un banco de caras las tiene en
 * una carpeta, y subirlas de una en una son veinte vueltas para la misma tarea.
 */
export async function uploadAvatarsAction(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    await guard();

    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (files.length === 0) return { ok: false, message: "No llegó ningún archivo." };

    const description = readText(form.get("description"));
    const rejected: string[] = [];
    let added = 0;

    for (const file of files) {
      if (!TYPES.has(file.type)) {
        rejected.push(`${file.name} (${file.type || "tipo desconocido"})`);
        continue;
      }

      if (file.size > 15 * 1024 * 1024) {
        rejected.push(`${file.name} (pesa más de 15 MB)`);
        continue;
      }

      const url = await uploadAvatarImage({
        data: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
      });

      await addAvatar({
        // El nombre del archivo sin extensión: es lo que quien las subió ya
        // reconoce, mejor que «Avatar 7».
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 60),
        url,
        description,
        source: "subido",
      });

      added += 1;
    }

    revalidatePath("/avatares");

    return {
      ok: added > 0,
      message: [
        added > 0 ? `${added} cara(s) añadidas.` : "No se añadió ninguna.",
        rejected.length > 0 ? ` Fuera: ${rejected.join("; ")}` : "",
        added > 0 && !description
          ? " Descríbelas para que el generador no las reinvente al ponerles el producto."
          : "",
      ].join(""),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo subir." };
  }
}

export async function updateAvatarAction(
  id: unknown,
  name: unknown,
  description: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    await guard();
    await updateAvatar(readText(id), {
      name: readText(name),
      description: readText(description),
    });

    revalidatePath("/avatares");
    return { ok: true, message: "Guardado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar." };
  }
}

export async function deleteAvatarAction(id: unknown): Promise<void> {
  await guard();
  await deleteAvatar(readText(id));
  revalidatePath("/avatares");
}

export async function deleteShotAction(id: unknown): Promise<void> {
  await guard();
  await deleteShot(readText(id));
  revalidatePath("/avatares");
}

/* --------------------------- Generar caras nuevas -------------------------- */

/**
 * Genera caras a partir de una descripción, con el CLI de Higgsfield.
 *
 * Por el CLI y no por la API porque ahí está Soul, que es el que hace personas
 * que parecen personas. La API de plataforma tiene siete modelos y ninguno es
 * ese.
 *
 * **Personas sintéticas, nunca alguien real.** Partir de la foto de un perfil
 * de verdad para que salga creíble es justo lo que no se puede hacer: la cara de
 * alguien identificable junto a un anuncio implica un aval que esa persona nunca
 * dio. Se describe bien y se genera, que da el mismo resultado sin ese problema.
 */
export async function generateAvatarsAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const description = readText(raw.description);
  const model = readText(raw.model);
  const country = readText(raw.country);
  const count = Math.min(10, Math.max(1, Number(raw.count) || 1));

  if (!description) throw new Error("Describe cómo es la persona.");
  if (!model) throw new Error("Elige con qué modelo generarla.");

  await guard();

  return runInBackground({
    kind: "imagenes",
    label: `Caras · ${description.slice(0, 40)}`,
    revalidate: "/avatares",
    resume: { description, model, country, count },
    work: async (report) => {
      const prompt = buildPersonPrompt({ description, countryName: country || undefined });
      let added = 0;
      const failed: string[] = [];

      for (let index = 0; index < count; index += 1) {
        await report(`Cara ${index + 1} de ${count}`);

        try {
          /*
           * Una llamada por cara, no una con `count`.
           *
           * Pidiendo varias de golpe salen variaciones de la misma foto —el
           * mismo encuadre, el mismo gesto— y lo que hace falta son personas
           * distintas. Además, así una que falle no tira las demás.
           */
          const result = await generateWithCli({ model, prompt, aspectRatio: "1:1" });
          const url = result.imageUrls[0];

          if (!url) {
            failed.push(`la ${index + 1} volvió sin imagen`);
            continue;
          }

          // Se descarga y se guarda en el bucket: la dirección del proveedor
          // caduca, y una cara que se usa de referencia tiene que seguir ahí
          // dentro de un mes.
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) {
            failed.push(`la ${index + 1} no se pudo descargar`);
            continue;
          }

          const stored = await uploadAvatarImage({
            data: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get("content-type") ?? "image/png",
          });

          await addAvatar({
            name: `${description.slice(0, 40)} ${index + 1}`,
            url: stored,
            description,
            source: model,
          });

          added += 1;
        } catch (error) {
          failed.push(`la ${index + 1}: ${error instanceof Error ? error.message : "falló"}`);
        }
      }

      if (added === 0) throw new Error(`No salió ninguna cara. ${failed.join("; ")}`);

      return {
        summary: [
          `${added} cara(s) nuevas con ${model}.`,
          failed.length > 0 ? ` No salieron: ${failed.join("; ")}.` : "",
          " Míralas antes de ponerles el producto.",
        ].join(""),
      };
    },
  });
}

/* ------------------------- Las tomas con el producto ----------------------- */

/**
 * Pone el producto en manos de cada cara elegida.
 *
 * ## Dos vías, y la elige quien genera
 *
 * **kie**, con el nano banana normal: dos céntimos la imagen. Es el que sale por
 * defecto porque son treinta generaciones y la diferencia no compensa treinta
 * veces el precio en fotos que imitan a propósito una foto de móvil.
 *
 * **Higgsfield, por su CLI**, que también mezcla una cara y un producto a partir
 * de dos referencias y con mejores modelos. Cuesta más y lo que cobre lo dice su
 * cuenta, así que se ofrece y no se impone.
 *
 * Las dos reciben las mismas dos imágenes **en el mismo orden** —primero la
 * cara, después el envase—, que es el orden al que se refiere el encargo. Lo que
 * cambia es cómo viajan: kie quiere direcciones y las descarga él; el CLI quiere
 * archivos.
 */
export async function generateShotsAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const perAvatar = Math.min(10, Math.max(1, Number(raw.perAvatar) || 3));
  const holding = raw.holding !== false;
  const model = readText(raw.model);

  const avatarIds = (Array.isArray(raw.avatarIds) ? raw.avatarIds : [])
    .map((value) => readText(value))
    .filter(Boolean);

  const contextIds = (Array.isArray(raw.contexts) ? raw.contexts : [])
    .map((value) => readText(value))
    .filter(Boolean);

  if (!productId) throw new Error("Elige el producto.");
  if (avatarIds.length === 0) throw new Error("Elige al menos una cara.");

  await guard();

  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  /*
   * La foto del envase, y **se comprueba antes de empezar**.
   *
   * Sin ella el generador inventa un bote convincente y la tanda entera sale
   * con un producto que no existe. Descubrirlo son treinta imágenes pagadas.
   */
  const primary = await readPrimaryImage(productId);

  /*
   * Se prefiere la del CDN de Shopify cuando la hay: **no caduca**. La otra sí,
   * y una tanda de treinta imágenes tarda lo suficiente como para que la
   * referencia expire a la mitad.
   */
  const productImage = primary?.shopifyUrl || primary?.url || "";

  if (!productImage) {
    throw new Error(
      `«${product.name}» no tiene imagen principal. Sin la foto del envase saldría un bote inventado en las ${tally(avatarIds.length, perAvatar).images} fotos.`,
    );
  }

  const avatars = (await listAvatars()).filter((avatar) => avatarIds.includes(avatar.id));
  if (avatars.length === 0) throw new Error("Esas caras ya no existen.");

  const plan = tally(avatars.length, perAvatar);

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Avatares · ${product.name}`,
    revalidate: "/avatares",
    resume: { productId, avatarIds, perAvatar, contexts: contextIds, holding, model },
    work: async (report) => {
      const contexts = contextsFor(perAvatar, contextIds);
      let done = 0;
      const failed: string[] = [];

      /*
       * Con el CLI, la foto del envase se baja **una vez** para toda la tanda.
       *
       * Es la misma en las treinta imágenes: bajarla treinta veces son treinta
       * descargas del mismo archivo y otros tantos segundos por nada.
       */
      const cli = model.startsWith("hf:") ? model.slice(3) : "";
      const params = cli ? await modelMediaParams(cli) : [];

      if (cli && params.length === 0) {
        throw new Error(
          `${cli} no acepta imágenes de referencia, así que no puede mezclar una cara con un envase. Elige otro modelo.`,
        );
      }

      const productBytes = cli ? await download(productImage, "producto.png") : null;

      for (const avatar of avatars) {
        for (const [index, context] of contexts.entries()) {
          await report(
            `${avatar.name} · ${context.label} (${done + 1} de ${plan.images})`,
          );

          const prompt = buildShotPrompt({
            scene: context.scene,
            productName: product.name,
            person: avatar.description || undefined,
            holding,
          });

          try {
            /*
             * El orden de las dos imágenes es el del encargo: primero la cara,
             * después el envase. Cambiarlo sin cambiar el texto produce a la
             * persona convertida en envase.
             */
            let url: string;

            if (cli && productBytes) {
              const result = await generateWithCli({
                model: cli,
                prompt,
                references: [await download(avatar.url, "cara.png"), productBytes],
                referenceParam: params.includes("image_references")
                  ? "image_references"
                  : params[0],
                aspectRatio: "4:5",
              });

              url = result.imageUrls[0];
              if (!url) throw new Error("volvió sin imagen");
            } else {
              url = await keyframe({
                prompt,
                references: [avatar.url, productImage],
                aspectRatio: "4:5",
              });
            }

            await addShot({
              avatarId: avatar.id,
              productId,
              url,
              context: context.id,
              prompt,
            });

            done += 1;
          } catch (error) {
            failed.push(
              `${avatar.name} en ${context.label}: ${error instanceof Error ? error.message : "falló"}`,
            );
          }

          void index;
        }
      }

      if (done === 0) throw new Error(`No salió ninguna foto. ${failed.join("; ")}`);

      return {
        summary: [
          `${done} de ${plan.images} fotos con ${avatars.length} cara(s) en ${contexts.length} contexto(s).`,
          failed.length > 0 ? ` No salieron: ${failed.join("; ")}.` : "",
          cli
            ? ` Con ${cli}: lo que cobre lo verás en tu cuenta de Higgsfield.`
            : ` Unos ${(done * 0.02).toFixed(2)} USD.`,
        ].join(""),
      };
    },
  });
}
