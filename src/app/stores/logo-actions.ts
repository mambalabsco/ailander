"use server";

import { revalidatePath } from "next/cache";
import { runInBackground } from "@/lib/background";
import { findStore } from "@/lib/store-registry";
import { updateStore } from "@/lib/data/stores";
import { keyframe } from "@/lib/video/providers";
import { videoProvidersReady } from "@/lib/video/providers";
import type { LaunchResult } from "@/types/jobs";

/**
 * El logo de la tienda.
 *
 * ## Por qué vive en la tienda y no en cada landing
 *
 * Se generaba dentro de cada publirreportaje, así que dos páginas de la misma
 * tienda salían con **dos logos distintos** — exactamente lo contrario de lo que
 * hace un logo. Además cada generación se pagaba, y hacerlo por página
 * multiplicaba el gasto por algo que debería ser idéntico.
 *
 * Ahora se genera una vez y lo usan las landings, las creatividades y los
 * vídeos. El del medio editorial de un publirreportaje sigue siendo otra cosa
 * —ahí el logo es del «medio» que publica, no de la marca— y se mantiene aparte.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Construye el prompt del logo a partir de la marca y de su mercado.
 *
 * El país entra porque un logo para México y otro para Alemania no se dibujan
 * igual: cambian las convenciones tipográficas y lo que se lee como confiable.
 * Y se pide **sin texto generado** salvo el nombre exacto, porque los modelos
 * escriben letras inventadas en cuanto se les deja.
 */
function buildLogoPrompt(options: {
  brand: string;
  niche: string;
  countryName: string;
}): string {
  return [
    `Logo de marca para «${options.brand}», ${options.niche}, mercado de ${options.countryName}.`,
    "Wordmark limpio y legible: el nombre de la marca escrito EXACTAMENTE así, sin ninguna otra palabra.",
    "Un solo símbolo simple junto al texto, o ninguno.",
    "Fondo transparente o blanco puro, para poder colocarlo sobre cualquier cosa.",
    "Vectorial, plano, dos colores como mucho. Nada de degradados, sombras, brillos ni relieve.",
    "Que funcione a 40 píxeles de alto: si a ese tamaño no se lee, no sirve.",
    "NO: texto inventado, letras deformes, marcas de agua, lorem ipsum, varios logos en la misma imagen, encuadre fotográfico.",
  ].join(" ");
}

export async function generateStoreLogoAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const storeId = readText(raw.storeId);
  if (!storeId) throw new Error("Falta la tienda.");

  if (!videoProvidersReady().images) {
    return {
      started: false,
      message: "Falta KIE_API_KEY en el servidor: es la que genera las imágenes.",
    };
  }

  const store = await findStore(storeId);
  if (!store) throw new Error("No se encontró la tienda.");

  const custom = readText(raw.prompt);
  const niche = readText(raw.niche) || "suplementos de salud";

  const prompt =
    custom ||
    buildLogoPrompt({
      brand: store.brand || store.name,
      niche,
      // El mercado principal manda: es donde la marca se lee de verdad.
      countryName: store.markets.find((market) => market.isPrimary)?.countryName
        ?? store.markets[0]?.countryName
        ?? "México",
    });

  return runInBackground({
    kind: "imagenes",
    label: `Logo · ${store.name}`,
    revalidate: "/stores",
    work: async () => {
      const url = await keyframe({ prompt });

      /*
       * Se guarda la URL del proveedor, no una copia en el bucket.
       *
       * Es una decisión con fecha de caducidad y conviene saberlo: si el
       * proveedor deja de servir esa URL, el logo desaparece de las landings. Se
       * acepta porque el logo se vuelve a generar en un clic y el prompt queda
       * guardado, así que rehacerlo es barato — pero si algún día el logo se
       * imprime en algo, hay que bajarlo al bucket antes.
       */
      await updateStore(storeId, { logoUrl: url, logoPrompt: prompt });

      return { summary: `Logo generado para ${store.name}.` };
    },
  });
}

/** Poner un logo propio, sin generarlo. */
export async function setStoreLogoAction(
  storeId: unknown,
  url: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(storeId);
  const logo = readText(url);
  if (!id) return { ok: false, message: "Falta la tienda." };

  if (logo && !/^https?:\/\//i.test(logo)) {
    return { ok: false, message: "Pega una dirección completa, que empiece por https://" };
  }

  await updateStore(id, { logoUrl: logo });
  revalidatePath("/stores");

  return { ok: true, message: logo ? "Logo guardado." : "Logo quitado." };
}

/**
 * Subir el logo desde el ordenador.
 *
 * ## Por qué hacía falta además de pegar una dirección
 *
 * Porque un logo casi nunca está ya en internet. Está en el ordenador de quien
 * lo encargó, y pegar una dirección obligaba a subirlo antes a otro sitio —o a
 * generar uno nuevo teniendo el bueno delante—.
 *
 * Y las direcciones ajenas caducan. Un logo enlazado a un Drive o a un enlace de
 * mensajería deja de cargar un mes después, y entonces las landings y las
 * creatividades salen sin él sin que nada falle.
 *
 * ## PNG antes que JPEG
 *
 * Un logo se pone sobre fondos de todos los colores, así que necesita
 * transparencia — y JPEG no la tiene: lo que era transparente sale blanco, y se
 * ve como un rectángulo blanco encima de una página oscura. Se acepta igual,
 * porque a veces es lo único que hay, pero se dice.
 */
export async function uploadStoreLogoAction(
  form: FormData,
): Promise<{ ok: boolean; message: string; url?: string }> {
  try {
    const id = readText(form.get("storeId"));
    if (!id) return { ok: false, message: "Falta la tienda." };

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "No llegó ningún archivo." };
    }

    const allowed = ["image/png", "image/webp", "image/svg+xml", "image/jpeg"];

    if (!allowed.includes(file.type)) {
      return {
        ok: false,
        message: `«${file.type || "sin tipo"}» no vale. Sube un PNG, un WebP, un SVG o un JPG.`,
      };
    }

    // Un logo que pesa más de cinco megas no es un logo, es una foto.
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false, message: "Pesa más de 5 MB: eso no es un logo, es una foto." };
    }

    const { requireContext } = await import("@/lib/supabase/session");
    const { supabase, userId } = await requireContext();

    const extension = file.type === "image/svg+xml" ? "svg" : (file.type.split("/")[1] ?? "png");
    const path = `${userId}/logos/${id}-${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from("studio")
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });

    if (error) return { ok: false, message: `No se pudo subir: ${error.message}` };

    const url = supabase.storage.from("studio").getPublicUrl(path).data.publicUrl;

    await updateStore(id, { logoUrl: url });
    revalidatePath("/stores");

    return {
      ok: true,
      url,
      message:
        file.type === "image/jpeg"
          ? "Subido. Ojo: un JPG no tiene transparencia, así que sobre fondo oscuro se verá su recuadro blanco."
          : "Subido y guardado.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo subir." };
  }
}
