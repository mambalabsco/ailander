"use server";

import { findStore } from "@/lib/store-registry";
import { listThemeFiles, listThemes, writeThemeFiles } from "@/lib/shopify-store";
import {
  parseTemplate,
  planChanges,
  reorderTemplate,
  roleOf,
  summarize,
  type ThemeChange,
} from "@/lib/theme-structure";
import { listBlueprints } from "@/lib/data/blueprints";

/**
 * Comparar el tema de tu tienda con el plano de otra.
 *
 * Es lo que convierte el análisis en algo accionable: en vez de «esta tienda
 * tiene una comparativa», dice «a tu página de producto le falta una comparativa
 * y debería ir en la posición tres».
 *
 * ## Lo que compara y lo que no
 *
 * Compara **papeles y orden**: qué hace cada sección y en qué punto de la página.
 * Una disposición —oferta arriba, comparativa en medio, preguntas al final— es
 * funcional y se reproduce con las secciones del tema propio.
 *
 * El contenido de cada sección no sale de aquí. Sale del producto, de la
 * investigación y de las imágenes generadas, que es lo que ya hace el resto de la
 * plataforma.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface ThemePlan {
  themeName: string;
  templateName: string;
  /** Las secciones de tu plantilla, en orden. */
  current: { id: string; type: string; role: string; position: number }[];
  changes: ThemeChange[];
  counts: Record<string, number>;
  blueprintName: string;
}

export async function buildThemePlanAction(
  storeId: unknown,
  blueprintId: unknown,
  template: unknown,
): Promise<{ ok: boolean; plan?: ThemePlan; message?: string }> {
  const id = readText(storeId);
  const planId = readText(blueprintId);

  // La de producto por defecto: es donde está la venta y donde el plano tiene
  // algo que decir. La portada se compara peor porque cada marca la usa distinto.
  const templateName = readText(template) || "templates/product.json";

  if (!id || !planId) return { ok: false, message: "Elige la tienda y el análisis." };

  try {
    const store = await findStore(id);
    if (!store) return { ok: false, message: "No se encontró la tienda." };

    const blueprint = (await listBlueprints()).find((item) => item.id === planId);
    if (!blueprint) return { ok: false, message: "Ese análisis ya no existe." };

    const themes = await listThemes(store);
    const main = themes.find((theme) => theme.role === "MAIN");
    if (!main) return { ok: false, message: "Esta tienda no tiene ningún tema publicado." };

    const files = await listThemeFiles(store, main.id, [templateName]);
    const file = files[0];

    if (!file?.body) {
      return {
        ok: false,
        message: `No se pudo leer ${templateName}. Los temas anteriores a Shopify 2.0 usan plantillas .liquid sin JSON, y ahí no hay estructura que comparar.`,
      };
    }

    const current = parseTemplate(file.body);

    if (current.length === 0) {
      return {
        ok: false,
        message: `${templateName} no declara secciones en el formato de Shopify 2.0. Comprueba que el tema sea de bloques.`,
      };
    }

    const changes = planChanges(current, blueprint.sections);

    return {
      ok: true,
      plan: {
        themeName: main.name,
        templateName,
        current: current.map((section) => ({
          id: section.id,
          type: section.type,
          role: roleOf(section.type),
          position: section.position + 1,
        })),
        changes,
        counts: summarize(changes),
        blueprintName: blueprint.storeName,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo comparar.",
    };
  }
}


/**
 * Aplica el orden a un tema.
 *
 * **Solo reordena.** Añadir una sección que falta no se automatiza: una sección
 * nueva necesita su contenido —textos, imágenes— y ese sale del producto, no del
 * plano. Insertarla vacía dejaría un hueco publicado.
 *
 * El tema se elige, y el publicado no viene por defecto. Reordenar la página que
 * están viendo los clientes es una decisión, no un efecto secundario de pulsar
 * un botón: lo normal es probarlo en una copia y publicarla cuando convence.
 */
export async function applyThemeOrderAction(
  storeId: unknown,
  themeId: unknown,
  orderedIds: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(storeId);
  const theme = readText(themeId);
  const order = Array.isArray(orderedIds) ? orderedIds.map((item) => readText(item)) : [];

  if (!id || !theme) return { ok: false, message: "Falta la tienda o el tema." };
  if (order.length === 0) return { ok: false, message: "No hay ningún orden que aplicar." };

  try {
    const store = await findStore(id);
    if (!store) return { ok: false, message: "No se encontró la tienda." };

    const [file] = await listThemeFiles(store, theme, ["templates/product.json"]);
    if (!file?.body) {
      return { ok: false, message: "No se pudo leer templates/product.json de ese tema." };
    }

    const next = reorderTemplate(file.body, order);
    if (!next) {
      return { ok: false, message: "La plantilla no tiene el formato esperado; no se ha tocado." };
    }

    // Si el reordenado no cambia nada, no se escribe: cada escritura queda en el
    // historial del tema y una sin cambios solo añade ruido.
    if (next.trim() === file.body.trim()) {
      return { ok: true, message: "Ya estaba en ese orden. No se ha escrito nada." };
    }

    await writeThemeFiles(store, theme, [
      { filename: "templates/product.json", content: next },
    ]);

    return { ok: true, message: "Orden aplicado. Míralo en la vista previa del tema antes de publicar." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo aplicar." };
  }
}

/** Los temas de una tienda, para elegir dónde aplicar. */
export async function themesForApplyAction(
  storeId: unknown,
): Promise<{ ok: boolean; themes?: { id: string; name: string; published: boolean }[]; message?: string }> {
  try {
    const store = await findStore(readText(storeId));
    if (!store) return { ok: false, message: "No se encontró la tienda." };

    const themes = await listThemes(store);
    return {
      ok: true,
      themes: themes.map((theme) => ({
        id: theme.id,
        name: theme.name,
        published: theme.role === "MAIN",
      })),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo consultar." };
  }
}
