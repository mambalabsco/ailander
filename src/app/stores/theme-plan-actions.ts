"use server";

import { findStore } from "@/lib/store-registry";
import { listThemeFiles, listThemes, writeThemeFiles } from "@/lib/shopify-store";
import {
  orderFor,
  parseTemplate,
  planChanges,
  reorderTemplate,
  roleOf,
  summarize,
  type ThemeChange,
} from "@/lib/theme-structure";
import { listBlueprints } from "@/lib/data/blueprints";
import { findProductAnywhere } from "@/lib/products";
import { readProductResearch } from "@/lib/research-store";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { generateStructured } from "@/lib/generators";
import { runInBackground } from "@/lib/background";
import { SECTION_CODE_SCHEMA } from "@/lib/generation-schemas";
import { buildSectionCodePrompt } from "@/lib/section-code-prompt";
import {
  buildTemplateEntry,
  orderAfterRecreate,
  planRecreate,
  writeTemplate,
  type TemplateEntry,
} from "@/lib/theme-sections";
import {
  blockSettingsOf,
  coerceSettings,
  reviewSection,
  sectionFilename,
  sectionType,
} from "@/lib/theme-liquid";
import type { LaunchResult } from "@/types/jobs";
import {
  PAGE_KINDS,
  TEMPLATE_FOR,
  sectionsOf,
  type PageKind,
} from "@/lib/store-blueprint";
import {
  applySettings,
  planColorChanges,
  planFontChanges,
  readSettings,
  type SettingsChange,
} from "@/lib/theme-settings";

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

function readPage(value: unknown): PageKind {
  const page = readText(value);
  return PAGE_KINDS.includes(page as PageKind) ? (page as PageKind) : "producto";
}

export interface ThemePlan {
  themeName: string;
  page: PageKind;
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
  pageKind: unknown,
): Promise<{ ok: boolean; plan?: ThemePlan; message?: string }> {
  const id = readText(storeId);
  const planId = readText(blueprintId);

  const page = readPage(pageKind);
  const templateName = TEMPLATE_FOR[page];

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

    /*
     * Solo las secciones de **esta** página del plano.
     *
     * Sin filtrar, la portada del competidor se compararía contra la ficha de
     * producto propia y el plan diría que sobra media página.
     */
    const target = sectionsOf(blueprint.sections, page);

    if (target.length === 0) {
      return {
        ok: false,
        message: `Ese análisis no tiene secciones de ${page}. Si es anterior a esta versión solo miró la ficha de producto: vuelve a analizar la tienda.`,
      };
    }

    const changes = planChanges(current, target);

    return {
      ok: true,
      plan: {
        themeName: main.name,
        page,
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
  blueprintId: unknown,
  pageKind: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(storeId);
  const theme = readText(themeId);
  const planId = readText(blueprintId);
  const page = readPage(pageKind);
  const templateName = TEMPLATE_FOR[page];

  if (!id || !theme) return { ok: false, message: "Falta la tienda o el tema." };
  if (!planId) return { ok: false, message: "Falta el análisis con el que comparar." };

  try {
    const store = await findStore(id);
    if (!store) return { ok: false, message: "No se encontró la tienda." };

    const blueprint = (await listBlueprints()).find((item) => item.id === planId);
    if (!blueprint) return { ok: false, message: "Ese análisis ya no existe." };

    /*
     * El orden se calcula **aquí**, no en el navegador.
     *
     * Antes lo armaba el componente con un `find` por papel, y con dos secciones
     * del mismo papel devolvía la misma dos veces: Shopify rechazaba la
     * escritura entera con «order: can't contain duplicate values». Calcularlo en
     * el servidor con la plantilla recién leída también evita aplicar un orden
     * pensado para una versión del tema que ya cambió.
     */
    const [file] = await listThemeFiles(store, theme, [templateName]);
    if (!file?.body) {
      return { ok: false, message: `No se pudo leer ${templateName} de ese tema.` };
    }

    const order = orderFor(parseTemplate(file.body), sectionsOf(blueprint.sections, page));
    if (order.length === 0) {
      return { ok: false, message: "Esa plantilla no declara secciones legibles." };
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

    await writeThemeFiles(store, theme, [{ filename: templateName, content: next }]);

    return { ok: true, message: "Orden aplicado. Míralo en la vista previa del tema antes de publicar." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo aplicar." };
  }
}

/* ------------------------- Recrear la página entera ------------------------ */

/**
 * Crea en tu tema las secciones que le faltan y monta la página.
 *
 * Es lo que reordenar no podía hacer. Una plantilla solo puede nombrar secciones
 * que **existan** en el tema, así que si el tuyo no trae una comparativa no hay
 * forma de ponerla moviendo cosas: hay que escribirla. Se escriben secciones
 * propias, con su Liquid y su esquema, no código de nadie.
 *
 * El contenido se genera con **tu** investigación: a la referencia se le copia la
 * construcción —qué secciones, en qué orden, cómo enfoca cada una— y lo que dice
 * cada sección sale de este producto.
 *
 * Se escribe todo de una vez. Si algo falla, no queda una plantilla apuntando a
 * secciones que no se llegaron a escribir, que es una página rota en producción.
 */
export async function recreatePageAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const storeId = readText(raw.storeId);
  const themeId = readText(raw.themeId);
  const blueprintId = readText(raw.blueprintId);
  const productId = readText(raw.productId);
  const page = readPage(raw.page);
  const templateName = TEMPLATE_FOR[page];

  if (!storeId || !themeId) throw new Error("Falta la tienda o el tema.");
  if (!productId) throw new Error("Elige el producto del que sale el contenido.");

  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const store = await findStore(storeId);
  if (!store) throw new Error("No se encontró la tienda.");

  const blueprint = (await listBlueprints()).find((item) => item.id === blueprintId);
  if (!blueprint) throw new Error("Ese análisis ya no existe.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const research = await readProductResearch(productId);

  const [file] = await listThemeFiles(store, themeId, [templateName]);
  if (!file?.body) throw new Error(`No se pudo leer ${templateName} de ese tema.`);

  const current = parseTemplate(file.body);
  if (current.length === 0) {
    throw new Error(`${templateName} no declara secciones en el formato de Shopify 2.0.`);
  }

  const plan = planRecreate(current, sectionsOf(blueprint.sections, page));
  if (plan.create.length === 0) {
    throw new Error(
      "Ese análisis no tiene ninguna sección que se pueda crear para esta página. Vuelve a analizar la tienda si es anterior a esta versión.",
    );
  }

  return runInBackground({
    kind: "tema",
    label: `Recrear ${page} · ${blueprint.storeName}`,
    revalidate: "/stores",
    work: async () => {
      const palette = paletteOf(blueprint.identity.colors);
      const vibe = describeVibe(blueprint.identity);

      const created: TemplateEntry[] = [];
      const files: { filename: string; content: string }[] = [];
      const skipped: string[] = [];

      let inputTokens = 0;
      let outputTokens = 0;

      /*
       * Una llamada por sección, en serie.
       *
       * En paralelo iría más rápido, pero cada sección son unos miles de tokens
       * de salida y lanzarlas todas a la vez choca con el límite de la cuenta
       * justo cuando la página tiene muchas secciones — o sea, en el caso que
       * más importa. En serie tarda un minuto y termina siempre.
       */
      for (const [index, wanted] of plan.create.entries()) {
        const type = sectionType(wanted.kind, index);

        let problems: string[] = [];
        let built: { entry: TemplateEntry; file: string } | null = null;

        /*
         * Dos intentos, no más.
         *
         * El primero suele pasar; el segundo arregla lo que la revisión señaló,
         * que llega con el mensaje concreto. Si el segundo tampoco pasa, el
         * problema no es un descuido y otra vuelta solo gasta.
         */
        for (let attempt = 0; attempt < 2 && !built; attempt += 1) {
          const generated = await generateStructured<{
            liquid: string;
            settings: { id: string; value: string }[];
            blocks: { type: string; settings: { id: string; value: string }[] }[];
          }>({
            prompt: buildSectionCodePrompt({
              product,
              research,
              store,
              section: wanted,
              type,
              palette,
              vibe,
              offers: wanted.kind === "oferta" ? blueprint.offers : undefined,
              guarantee: wanted.kind === "garantia" ? blueprint.guarantee : undefined,
              problems,
            }),
            schema: SECTION_CODE_SCHEMA,
            role: "copy",
            maxTokens: 24_000,
          });

          inputTokens += generated.inputTokens;
          outputTokens += generated.outputTokens;

          const review = reviewSection(generated.data.liquid);

          if (!review.ok || !review.schema) {
            problems = review.problems;
            continue;
          }

          built = {
            file: generated.data.liquid,
            entry: buildTemplateEntry({
              kind: wanted.kind,
              type,
              index,
              settings: coerceSettings(generated.data.settings, review.schema.settings ?? []),
              blocks: generated.data.blocks.map((block) => ({
                type: block.type,
                settings: coerceSettings(block.settings, blockSettingsOf(review.schema!, block.type)),
              })),
            }),
          };
        }

        if (!built) {
          /*
           * Una sección que no pasa la revisión se salta y se dice cuál.
           *
           * La alternativa era escribir algo genérico en su lugar, y eso es
           * justo lo que había antes y lo que no servía: una página con una
           * sección menos se completa a mano; una llena de secciones que no se
           * parecen a nada hay que rehacerla entera.
           */
          skipped.push(`${wanted.kind} (${problems[0] ?? "no pasó la revisión"})`);
          continue;
        }

        created.push(built.entry);
        files.push({ filename: sectionFilename(type), content: built.file });
      }

      if (created.length === 0) {
        throw new Error(
          `No se pudo escribir ninguna sección. ${skipped[0] ?? "Vuelve a intentarlo."}`,
        );
      }

      const order = orderAfterRecreate(plan, created, current);
      const nextTemplate = writeTemplate(file.body!, created, order);
      if (!nextTemplate) throw new Error("La plantilla no tiene el formato esperado; no se ha tocado.");

      /*
       * Las secciones y la plantilla, en la misma escritura.
       *
       * Si fueran dos llamadas y fallara la segunda, quedarían archivos sueltos
       * que no usa nadie; si fallara al revés, una plantilla apuntando a
       * secciones que no existen — o sea, la página caída.
       */
      const written = await writeThemeFiles(store, themeId, [
        ...files,
        { filename: templateName, content: nextTemplate },
      ]);

      return {
        summary: [
          `${created.length} sección(es) creadas en ${templateName}`,
          plan.retire.length > 0 ? `, ${plan.retire.length} de las tuyas retiradas` : "",
          `. ${written} archivo(s) escritos.`,
          skipped.length > 0 ? ` No salieron: ${skipped.join("; ")}.` : "",
          " Míralo en la vista previa antes de publicar.",
        ].join(""),
        inputTokens,
        outputTokens,
      };
    },
  });
}

/**
 * El aire de la tienda de referencia, en una línea.
 *
 * Se le da al modelo junto a la paleta porque los colores solos no bastan: dos
 * tiendas con la misma paleta y distinta letra —una serif clásica contra una
 * sans geométrica— no se parecen en nada.
 */
function describeVibe(identity: {
  fonts: { family: string }[];
  buttonRadius: string | null;
}): string {
  const parts = [
    identity.fonts.length > 0
      ? `tipografías ${identity.fonts.map((font) => font.family).join(" y ")}`
      : "",
    identity.buttonRadius ? `botones con ${identity.buttonRadius} de radio` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "sin señas particulares leídas";
}

/**
 * La paleta que llevan las secciones creadas.
 *
 * Con lo leído de la referencia cuando está, y con blanco y negro cuando no.
 * Un color de acento que no se encontró vale más dejarlo neutro que inventarlo:
 * un acento equivocado se ve mal en toda la página.
 */
function paletteOf(colors: { hex: string; role: string }[]): {
  background: string;
  text: string;
  accent: string;
} {
  const byRole = (role: string) => colors.find((color) => color.role === role)?.hex;

  return {
    background: byRole("fondo") ?? "#ffffff",
    text: byRole("texto") ?? "#121212",
    accent: byRole("botón") ?? byRole("acento") ?? byRole("texto") ?? "#121212",
  };
}

/* ------------------------- El aspecto: color y letra ----------------------- */

const SETTINGS_FILE = "config/settings_data.json";

export interface LookPlan {
  themeName: string;
  changes: SettingsChange[];
  /** Las tipografías leídas que el tema no puede usar, para decirlo. */
  unusableFonts: string[];
  /** Si el tema estaba con un ajuste preestablecido sin tocar. */
  presetName: string | null;
}

/**
 * Qué habría que cambiar en tu tema para acercarlo al aspecto de la otra tienda.
 *
 * Esto es lo que de verdad hace que dos tiendas se parezcan. El orden de las
 * secciones cambia la estructura, pero con distinta paleta y distinta letra dos
 * páginas idénticas no se parecen en nada; al revés sí.
 *
 * Se lee del tema **publicado** para saber de dónde se parte, igual que el plan
 * de secciones, pero se aplica donde se elija — y por defecto, no ahí.
 */
export async function buildLookPlanAction(
  storeId: unknown,
  blueprintId: unknown,
): Promise<{ ok: boolean; plan?: LookPlan; message?: string }> {
  try {
    const store = await findStore(readText(storeId));
    if (!store) return { ok: false, message: "No se encontró la tienda." };

    const blueprint = (await listBlueprints()).find((item) => item.id === readText(blueprintId));
    if (!blueprint) return { ok: false, message: "Ese análisis ya no existe." };

    if (blueprint.identity.colors.length === 0 && blueprint.identity.fonts.length === 0) {
      return {
        ok: false,
        message:
          "Ese análisis no tiene colores ni tipografías. Si es anterior a esta versión no los leía: vuelve a analizar la tienda.",
      };
    }

    const themes = await listThemes(store);
    const main = themes.find((theme) => theme.role === "MAIN");
    if (!main) return { ok: false, message: "Esta tienda no tiene ningún tema publicado." };

    const [file] = await listThemeFiles(store, main.id, [SETTINGS_FILE]);
    const settings = file?.body ? readSettings(file.body) : null;

    if (!settings) {
      return {
        ok: false,
        message: `No se pudo leer ${SETTINGS_FILE}. Los temas anteriores a Shopify 2.0 no lo tienen y su paleta va en el código, que no se toca desde aquí.`,
      };
    }

    return {
      ok: true,
      plan: {
        themeName: main.name,
        changes: [
          ...planColorChanges(settings.values, blueprint.identity.colors),
          ...planFontChanges(settings.values, blueprint.identity.fonts),
        ],
        // Se nombran para que no parezca que se ignoraron sin más: Shopify no
        // las sirve, así que el tema no puede usarlas sin tocar su código.
        unusableFonts: blueprint.identity.fonts
          .filter((font) => !font.handle)
          .map((font) => font.family),
        presetName: settings.presetName,
      },
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo comparar." };
  }
}

/**
 * Aplica el color y la letra al tema elegido.
 *
 * Se recalcula contra el tema de destino en vez de escribir lo que decidió el
 * navegador: el tema donde se aplica **no** es el que se leyó para el plan, así
 * que sus ajustes pueden llamarse distinto o no existir. Escribir el plan a
 * ciegas dejaría claves que ese tema no lee.
 */
export async function applyLookAction(
  storeId: unknown,
  themeId: unknown,
  blueprintId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const theme = readText(themeId);
  if (!theme) return { ok: false, message: "Falta el tema." };

  try {
    const store = await findStore(readText(storeId));
    if (!store) return { ok: false, message: "No se encontró la tienda." };

    const blueprint = (await listBlueprints()).find((item) => item.id === readText(blueprintId));
    if (!blueprint) return { ok: false, message: "Ese análisis ya no existe." };

    const [file] = await listThemeFiles(store, theme, [SETTINGS_FILE]);
    const settings = file?.body ? readSettings(file.body) : null;

    if (!settings || !file?.body) {
      return { ok: false, message: `No se pudo leer ${SETTINGS_FILE} de ese tema.` };
    }

    const changes = [
      ...planColorChanges(settings.values, blueprint.identity.colors),
      ...planFontChanges(settings.values, blueprint.identity.fonts),
    ];

    if (changes.length === 0) {
      return { ok: true, message: "Ese tema ya tenía esos colores y esas letras. No se ha escrito nada." };
    }

    const next = applySettings(file.body, changes);
    if (!next) {
      return { ok: false, message: "No se pudo escribir la configuración; no se ha tocado nada." };
    }

    await writeThemeFiles(store, theme, [{ filename: SETTINGS_FILE, content: next }]);

    return {
      ok: true,
      message: `${changes.length} ajuste(s) aplicados. Míralo en la vista previa del tema antes de publicar.`,
    };
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
