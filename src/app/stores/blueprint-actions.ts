"use server";

import { revalidatePath } from "next/cache";
import { runInBackground } from "@/lib/background";
import { generateStructured } from "@/lib/generators";
import { BLUEPRINT_SCHEMA } from "@/lib/generation-schemas";
import { crawlStore } from "@/lib/store-crawler";
import { NOT_EXTRACTED, trimPageText } from "@/lib/store-blueprint";
import { requireContext } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { hasActiveProviderKey } from "@/lib/provider-config";
import type { LaunchResult } from "@/types/jobs";

/**
 * Analizar una tienda ajena y guardar su plano.
 *
 * Dos pasos con costes muy distintos: recorrer las páginas es gratis y tarda
 * unos segundos; leerlas con el modelo cuesta unos céntimos. Van juntos porque
 * el texto recorrido no sirve de nada sin analizar, pero el resumen distingue
 * cuál falló para no mandar a mirar donde no es.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function analyzeStoreAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const url = readText(raw.url);
  if (!url) throw new Error("Escribe la dirección de la tienda.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  return runInBackground({
    kind: "competidores",
    label: `Analizar ${url}`,
    revalidate: "/stores",
    work: async () => {
      const crawl = await crawlStore(url);

      const prompt = `Eres analista de comercio electrónico. Vas a describir **cómo está construida** una tienda, no a copiarla.

## Lo que se leyó

Tienda: ${crawl.storeName} (${crawl.origin})

${crawl.pages
  /*
   * Al prompt va recortado, no entero.
   *
   * Los primeros doce mil caracteres cubren la página hasta bien pasada la
   * oferta; lo que sigue suele ser el pie y el aviso legal, que no cambian el
   * plano y sí el coste. El texto completo se guarda igualmente, porque después
   * sirve de modelo para escribir la página propia.
   */
  .map((page) => `### ${page.kind} — ${page.url}\n\n${page.text.slice(0, 12_000)}`)
  .join("\n\n---\n\n")}

## Lo que tienes que devolver

**La estructura de cada página que se leyó**, no solo la de producto. Para cada sección: en qué página está (\`page\`: home, catalogo o producto), qué hace y **con qué ángulo** — el enfoque descrito, no sus frases.

Las tres páginas se describen por separado y **en el orden en que aparecen de arriba abajo**. La portada y el catálogo importan tanto como la ficha: son las que dan la primera impresión y las que se adaptan con las mismas secciones del tema propio.

Si de una página solo se leyó el principio, describe lo que haya y no inventes el resto.

Ejemplo de lo que quiero en \`angle\`: «promete resultado en treinta días apelando al cansancio de la mañana». Ejemplo de lo que **no** quiero: la frase literal que usa la página.

**La oferta completa**: cada tramo con su cantidad, su precio, su precio tachado si lo tiene, y cuál empuja la página. Si un tramo no tiene precio tachado, pon cero.

**La garantía**: cuántos días y cómo la formulan, en tus palabras.

**Cuántas imágenes** lleva cada sección, para saber cuántas hay que generar.

Y en \`notes\`, lo que te haya llamado la atención de cómo vende: el orden en que revela, dónde coloca la objeción, qué prueba usa.

## Lo que NO debes devolver

${NOT_EXTRACTED.map((item) => `- ${item}`).join("\n")}

Si un texto de la página te parece especialmente bueno, **describe por qué funciona** en \`notes\` en vez de transcribirlo. Es más útil: una frase copiada no sirve para otro producto, pero saber que abre con una objeción sí.`;

      const analysis = await generateStructured<{
        storeName: string;
        currency: string;
        guarantee: string;
        notes: string;
        sections: { page: string; kind: string; purpose: string; angle: string; images: number }[];
        offers: { quantity: number; price: number; compareAt: number; highlighted: boolean }[];
      }>({ prompt, schema: BLUEPRINT_SCHEMA, role: "copy", maxTokens: 16_000 });

      const { supabase, userId } = await requireContext();

      const { error } = await supabase.from("store_blueprints").insert({
        user_id: userId,
        url: crawl.origin,
        store_name: analysis.data.storeName || crawl.storeName,
        currency: analysis.data.currency,
        sections: analysis.data.sections,
        // El precio tachado llega como cero cuando no lo hay —el esquema no
        // admite nulos— y aquí se convierte para no enseñar «antes: 0 €».
        offers: analysis.data.offers.map((offer) => ({
          ...offer,
          compareAt: offer.compareAt > 0 ? offer.compareAt : null,
        })),
        guarantee: analysis.data.guarantee,
        scripts: crawl.scripts,
        identity: crawl.identity,
        images: crawl.images,
        /*
         * El texto se guarda, no solo la lista de direcciones.
         *
         * Antes se tiraba en cuanto el análisis terminaba, y con él la única
         * forma de decir «escríbeme una página con esta estructura»: sin el
         * texto delante, el generador solo tenía trece etiquetas de sección.
         * Volver a descargarla después tampoco sirve —la tienda cambia— así que
         * se conserva lo que se leyó el día del análisis.
         */
        pages: crawl.pages.map((page) => ({
          url: page.url,
          kind: page.kind,
          title: page.title,
          text: trimPageText(page.text),
        })),
        notes: analysis.data.notes,
      });

      if (error) throw new Error(`No se pudo guardar el plano: ${error.message}`);

      const pixels = crawl.scripts.filter((script) => !script.importable).length;

      return {
        summary: [
          `${analysis.data.sections.length} secciones en ${new Set(analysis.data.sections.map((section) => section.page)).size} página(s) y ${analysis.data.offers.length} tramos de oferta.`,
          crawl.identity.colors.length > 0
            ? ` Paleta de ${crawl.identity.colors.length} colores${crawl.identity.fonts.length > 0 ? ` y ${crawl.identity.fonts.length} tipografía(s)` : ""}.`
            : "",
          crawl.images.length > 0 ? ` ${crawl.images.length} imágenes para maquetar.` : "",
          `${crawl.scripts.length} script(s) detectados`,
          pixels > 0 ? `, ${pixels} de ellos pixeles que no se importan.` : ".",
          crawl.failed.length > 0 ? ` No se pudo abrir ${crawl.failed.length} página(s).` : "",
        ].join(""),
        inputTokens: analysis.inputTokens,
        outputTokens: analysis.outputTokens,
      };
    },
  });
}

export async function deleteBlueprintAction(id: unknown): Promise<void> {
  const blueprintId = readText(id);
  if (!blueprintId) return;

  const { supabase } = await requireContext();
  await supabase.from("store_blueprints").delete().eq("id", blueprintId);

  revalidatePath("/stores");
}
