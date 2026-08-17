"use server";

import { revalidatePath } from "next/cache";
import { deleteApp, saveApp } from "@/lib/data/apps";
import type { CasinoApp } from "@/types/app";

/**
 * Alta, edición y baja de las apps de un producto de casino.
 *
 * Son formularios normales y no generaciones: no cuestan dinero y no pasan por
 * `runInBackground`.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function saveAppAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const name = readText(raw.name);

  if (!productId) return { ok: false, message: "Falta el producto." };
  if (!name) return { ok: false, message: "La app necesita un nombre." };

  const app: CasinoApp = await saveApp({
    id: readText(raw.id) || undefined,
    productId,
    name,
    focus: readText(raw.focus),
    downloadUrl: readText(raw.downloadUrl),
    position: Number(raw.position) || 0,
  });

  revalidatePath(`/products/${productId}`);

  return { ok: true, message: `«${app.name}» guardada.` };
}

export async function deleteAppAction(
  id: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const appId = readText(id);
  const product = readText(productId);

  if (!appId || !product) return { ok: false, message: "Falta la app." };

  await deleteApp(appId);
  revalidatePath(`/products/${product}`);

  // Se dice lo que sobrevive, porque no es obvio: sin esto parece que borrar una
  // app se lleva los textos que se escribieron con ella.
  return {
    ok: true,
    message: "App borrada. Los copys y las imágenes que la citaban siguen ahí, sin app asignada.",
  };
}

/**
 * Acota un ángulo a una app, o lo deja general.
 *
 * Vacío es general y es el estado inicial de todos: un ángulo general vale para
 * cualquier app del país, y acotarlo es lo excepcional. Al revés —cada ángulo de
 * una app— duplicaría el trabajo por app desde el primer día.
 */
export async function assignAngleToAppAction(
  angleId: unknown,
  appId: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const angle = readText(angleId);
  const product = readText(productId);
  if (!angle || !product) return { ok: false, message: "Falta el ángulo." };

  const { assignAngleToApp } = await import("@/lib/data/copy");
  await assignAngleToApp(angle, readText(appId));

  revalidatePath(`/products/${product}`);

  return {
    ok: true,
    message: readText(appId) ? "Acotado a esa app." : "Ahora es general: vale para todas las apps.",
  };
}

/**
 * Da de alta una app a partir de su dirección.
 *
 * De la PWA salen gratis el nombre, la descripción y el icono —están en su
 * `manifest.json`— y la **captura móvil** se hace renderizando la página con un
 * navegador sin cabeza, que es la única forma: una PWA se pinta con JavaScript,
 * así que pedir el HTML devuelve un armazón vacío.
 *
 * La captura se guarda con el patrón `captura-app`, que es el que
 * `readReferenceBytes` busca: es lo que hace que el teléfono de una creatividad
 * enseñe **esta** app y no una parecida.
 */
export async function importAppFromUrlAction(
  url: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const direccion = readText(url);
  const product = readText(productId);

  if (!product) return { ok: false, message: "Falta el producto." };
  if (!/^https?:\/\//i.test(direccion)) {
    return { ok: false, message: "Pega la dirección completa, con https://" };
  }

  const { imagesFrom, manifestUrlFrom, readAppManifest } = await import("@/lib/app-manifest");

  /*
   * El manifiesto primero, y si falla se sigue.
   *
   * Sin él se pierden el nombre y el icono, pero la captura —que es lo que se
   * vino a buscar— se puede hacer igual. Abortar aquí dejaría sin nada a quien
   * tiene una app que no declara manifiesto.
   */
  let datos = { name: "", description: "", iconUrl: "", themeColor: "" };
  let pantallas: string[] = [];
  try {
    const pagina = await fetch(direccion, { redirect: "follow" });
    const html = await pagina.text();

    /*
     * Las pantallas promocionales, de la propia página.
     *
     * Comprobado en `dreamsenmonticell.bar`: la ficha lleva dentro las imágenes
     * de la tienda —el bono, los juegos y los **métodos de pago locales**, que
     * según el documento de pagos son la primera objeción—. Son mejor referencia
     * que ninguna otra cosa, y no cuestan una llamada aparte.
     */
    pantallas = imagesFrom(html, direccion).slice(0, 6);

    const manifiesto = await fetch(manifestUrlFrom(html, direccion));
    datos = readAppManifest(await manifiesto.json());
  } catch {
    // Se sigue sin él: lo dice el resumen del final.
  }

  const app = await saveApp({
    productId: product,
    name: datos.name || new URL(direccion).hostname,
    focus: datos.description,
    downloadUrl: direccion,
  });

  const { uploadGeneratedImage } = await import("@/lib/data/images");
  const avisos: string[] = [];

  if (datos.iconUrl) {
    try {
      await uploadGeneratedImage({
        productId: product,
        appId: app.id,
        sourceUrl: datos.iconUrl,
        name: `Icono · ${app.name}`,
        pattern: "subida",
        source: "subida",
      });
    } catch (error) {
      avisos.push(`el icono no se pudo guardar (${error instanceof Error ? error.message : "?"})`);
    }
  } else {
    avisos.push("no declara icono en su manifiesto");
  }

  /*
   * Las pantallas van con el patrón `captura-app`, igual que la captura.
   *
   * Son lo que viaja de referencia, y las promocionales suelen servir mejor que
   * la captura de la ficha: enseñan la app, no la página que lleva a ella.
   */
  let guardadas = 0;
  for (const [indice, url] of pantallas.entries()) {
    try {
      await uploadGeneratedImage({
        productId: product,
        appId: app.id,
        sourceUrl: url,
        name: `Pantalla ${indice + 1} · ${app.name}`,
        pattern: "captura-app",
        source: "subida",
      });
      guardadas += 1;
    } catch {
      // Una imagen que no se pueda bajar no tumba las demás.
    }
  }

  let capturaOk = false;
  try {
    const { captureMobile } = await import("@/lib/app-screenshot");
    const { uploadProductImages } = await import("@/lib/data/images");
    const bytes = await captureMobile(direccion);

    const resultado = await uploadProductImages({
      productId: product,
      files: [new File([new Uint8Array(bytes)], "captura.png", { type: "image/png" })],
      names: [`Pantalla · ${app.name}`],
      makeFirstPrimary: false,
      appId: app.id,
      pattern: "captura-app",
    });

    capturaOk = resultado.uploaded.length > 0;
    if (!capturaOk) avisos.push(resultado.errors.join("; ") || "la captura no se pudo guardar");
  } catch (error) {
    avisos.push(`sin captura: ${error instanceof Error ? error.message : "?"}`);
  }

  revalidatePath(`/products/${product}`);

  return {
    ok: true,
    // Se dice lo que **no** salió, y no en letra pequeña: un alta que parece
    // completa y llega sin captura deja las creatividades enseñando otra app.
    message: `«${app.name}» dada de alta${
      guardadas > 0 ? ` con ${guardadas} pantalla(s) de la app` : ""
    }${capturaOk ? " y su captura móvil" : ""}.${
      avisos.length > 0 ? ` Ojo: ${avisos.join("; ")}.` : ""
    }`,
  };
}
