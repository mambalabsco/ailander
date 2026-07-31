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
