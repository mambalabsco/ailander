"use server";

import { findStore } from "@/lib/store-registry";
import {
  listThemeFiles,
  listThemes,
  writeThemeFiles,
  writeThemeFilesLenient,
} from "@/lib/shopify-store";
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
  readReferenceSections,
  takeForRole,
  type ReferenceSection,
} from "@/lib/reference-page";
import {
  clearSectionDrafts,
  forgetSectionDraft,
  readSectionDrafts,
  saveSectionDraft,
  type SectionDraft,
} from "@/lib/data/theme-drafts";
import {
  buildTemplateEntry,
  clearDemoImages,
  orderAfterRecreate,
  planRecreate,
  writeTemplate,
  type TemplateEntry,
} from "@/lib/theme-sections";
import {
  blockSettingsOf,
  coerceSettings,
  fillImageUrls,
  imageUrlSlots,
  reviewSection,
  sectionFilename,
  sectionType,
  stripBlankDefaults,
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

/**
 * Cuántas capturas se aceptan y de qué tamaño.
 *
 * Cuatro cubren una página larga entera. Van a **cada** llamada de sección, así
 * que cada una de más se paga once veces en una página de once secciones.
 */
const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 5 * 1024 * 1024;

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
export async function recreatePageAction(form: FormData): Promise<LaunchResult> {
  const storeId = readText(form.get("storeId"));
  const themeId = readText(form.get("themeId"));
  const blueprintId = readText(form.get("blueprintId"));
  const productId = readText(form.get("productId"));
  const page = readPage(form.get("page"));
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

  /*
   * Las capturas de la página de referencia, si las hay.
   *
   * Es lo que más acerca el resultado a «que se vea igual». Sin ellas, el modelo
   * escribe a ciegas: tiene una frase que describe la sección y una paleta, y con
   * eso no se deduce que el titular ocupa media columna ni que el botón lleva una
   * flecha en un cuadrado a la derecha. Viéndolo, sí.
   *
   * Lo que se reproduce es la disposición. El HTML y el CSS de detrás están
   * escritos contra el armazón de su tema —sus variables, sus clases, su
   * retícula— y pegados en otro tema dan un diseño roto, no uno idéntico.
   */
  const shots: { mediaType: string; base64: string }[] = [];

  for (const item of form.getAll("shots")) {
    if (!(item instanceof File) || item.size === 0) continue;
    if (!item.type.startsWith("image/")) continue;
    if (item.size > MAX_SHOT_BYTES) {
      throw new Error(`Una captura pesa más de ${MAX_SHOT_BYTES / 1024 / 1024} MB.`);
    }
    if (shots.length >= MAX_SHOTS) break;

    shots.push({
      mediaType: item.type,
      base64: Buffer.from(await item.arrayBuffer()).toString("base64"),
    });
  }

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
    /*
     * Con qué continuarlo desde el propio trabajo.
     *
     * Las capturas no van: son archivos y no caben aquí. No importa — la página
     * de referencia se lee sola, así que continuar sin ellas da el mismo
     * resultado salvo que se hubieran subido para algo muy concreto.
     */
    resume: { storeId, themeId, blueprintId, page, productId },
    work: async (report) => {
      const palette = paletteOf(blueprint.identity.colors);
      const vibe = describeVibe(blueprint.identity);

      /*
       * Las fotos son de la tienda de referencia y son provisionales.
       *
       * Se **enlazan**, no se copian: nada se descarga ni se sube a esta tienda,
       * así que quitarlas es borrar un texto. Hay que sustituirlas antes de
       * publicar — en un suplemento el envase es el producto.
       */
      const photos = blueprint.images.map((image) => image.url);
      const photoNote =
        photos.length === 0
          ? " Ese análisis no trae imágenes; vuelve a analizar la tienda si quieres maqueta."
          : "";

      // Lo escrito en un intento anterior no se vuelve a pagar.
      const drafts = await readSectionDrafts(blueprintId, page);

      await report("Leyendo la página de referencia");

      const referencePage =
        blueprint.pages.find((item) => item.kind === page)?.url ??
        blueprint.pages.find((item) => item.kind === "producto")?.url ??
        blueprint.url;

      const pool = await readReferenceSections(referencePage);

      let inputTokens = 0;
      let outputTokens = 0;
      let filledPhotos = 0;
      let matched = 0;
      let reused = 0;

      /**
       * Escribe una sección y la deja revisada.
       *
       * `problems` es lo que hay que corregir: puede venir de la revisión propia
       * o **del propio Shopify** cuando rechazó el archivo. Es el mismo camino
       * en los dos casos, y por eso se repara igual de bien un `{% for %}` sin
       * cerrar que una regla de esquema que aquí no se conocía.
       */
      const writeOne = async (
        job: SectionJob,
        problems: string[],
      ): Promise<{ file: string; entry: TemplateEntry; draft: SectionDraft } | null> => {
        const generated = await generateStructured<{
          liquid: string;
          settings: { id: string; value: string }[];
          blocks: { type: string; settings: { id: string; value: string }[] }[];
        }>({
          prompt: buildSectionCodePrompt({
            product,
            research,
            store,
            section: job.wanted,
            type: job.type,
            // La de la sección manda sobre la del tema: es lo que hace que un
            // héroe rosa salga rosa y no blanco.
            palette: job.model?.palette ?? palette,
            referenceImages: job.model?.images ?? 0,
            availableImages: photos.length,
            vibe,
            offers: job.wanted.kind === "oferta" ? blueprint.offers : undefined,
            guarantee: job.wanted.kind === "garantia" ? blueprint.guarantee : undefined,
            hasShots: shots.length > 0,
            reference: job.model
              ? { type: job.model.type, html: job.model.html, css: job.model.css }
              : undefined,
            problems,
          }),
          schema: SECTION_CODE_SCHEMA,
          role: "copy",
          maxTokens: 24_000,
          images: shots,
        });

        inputTokens += generated.inputTokens;
        outputTokens += generated.outputTokens;

        /*
         * Se arregla antes de revisar: Shopify rechaza el archivo entero si un
         * ajuste declara `default` vacío, y quitarlo es determinista.
         */
        const liquid = stripBlankDefaults(generated.data.liquid).source;
        const review = reviewSection(liquid);

        if (!review.ok || !review.schema) {
          job.problems = review.problems;
          return null;
        }

        const settings = coerceSettings(generated.data.settings, review.schema.settings ?? []);
        const withPhotos = fillImageUrls(
          settings,
          imageUrlSlots(review.schema),
          photos,
          filledPhotos,
        );
        filledPhotos += withPhotos.used;

        const draft: SectionDraft = {
          kind: job.wanted.kind,
          ordinal: job.ordinal,
          sectionType: job.type,
          liquid,
          settings: withPhotos.settings,
          blocks: generated.data.blocks.map((block) => ({
            type: block.type,
            settings: coerceSettings(block.settings, blockSettingsOf(review.schema!, block.type)),
          })),
        };

        return {
          file: liquid,
          draft,
          entry: buildTemplateEntry({
            kind: job.wanted.kind,
            type: job.type,
            index: job.index,
            settings: draft.settings,
            blocks: draft.blocks,
          }),
        };
      };

      /* ------------------------- Primera pasada -------------------------- */

      const jobs: SectionJob[] = plan.create.map((wanted, index) => ({
        wanted,
        index,
        ordinal: plan.create.slice(0, index).filter((other) => other.kind === wanted.kind).length,
        type: sectionType(wanted.kind, index),
        model: null,
        problems: [],
        file: null,
        entry: null,
      }));

      for (const job of jobs) {
        const saved = drafts.get(`${job.wanted.kind}:${job.ordinal}`);

        if (saved) {
          await report(`${job.wanted.kind} ya estaba escrita — ${job.index + 1} de ${jobs.length}`);

          // Lo guardado se repara al leerlo: lo escrito antes del arreglo del
          // `default` vacío lo lleva dentro, y sin esto la caché devolvería el
          // mismo rechazo para siempre.
          job.type = saved.sectionType;
          job.file = stripBlankDefaults(saved.liquid).source;
          job.entry = buildTemplateEntry({
            kind: job.wanted.kind,
            type: saved.sectionType,
            index: job.index,
            settings: saved.settings,
            blocks: saved.blocks,
          });
          reused += 1;
          continue;
        }

        await report(`Escribiendo ${job.wanted.kind} — ${job.index + 1} de ${jobs.length}`);

        // Se consume: dos secciones del mismo papel deben emparejarse con la
        // suya, y buscar desde el principio devolvería siempre la primera.
        job.model = takeForRole(pool, job.wanted.kind);

        for (let attempt = 0; attempt < 2 && !job.entry; attempt += 1) {
          if (attempt > 0) {
            await report(`Corrigiendo ${job.wanted.kind} — ${job.index + 1} de ${jobs.length}`);
          }

          const built = await writeOne(job, job.problems);
          if (!built) continue;

          if (job.model) matched += 1;
          await saveSectionDraft(blueprintId, page, built.draft);

          job.file = built.file;
          job.entry = built.entry;
        }
      }

      /* --------------- Escribir, y reparar lo que Shopify rechace -------- */

      /*
       * Hasta tres vueltas contra Shopify.
       *
       * Shopify valida cosas que aquí no se conocen —y su mensaje nombra el
       * ajuste, que es justo lo que hace falta para arreglarlo—. Así que su
       * error se le devuelve al modelo como un problema más y se vuelve a
       * escribir **solo esa sección**: las que ya entraron se quedan.
       *
       * Tres y no más: si a la tercera sigue sin entrar, no es un descuido y
       * otra vuelta solo gasta.
       */
      const rounds = 3;

      for (let round = 0; round < rounds; round += 1) {
        const pending = jobs.filter((job) => job.file && !job.written);
        if (pending.length === 0) break;

        await report(
          round === 0
            ? `Guardando ${pending.length} sección(es) en el tema`
            : `Reparando ${pending.length} que Shopify rechazó — vuelta ${round + 1}`,
        );

        const result = await writeThemeFilesLenient(
          store,
          themeId,
          pending.map((job) => ({ filename: sectionFilename(job.type), content: job.file! })),
        );

        const failed = new Map(
          result.failed.map((item) => [item.filename, item.reason] as const),
        );

        for (const job of pending) {
          const reason = failed.get(sectionFilename(job.type));

          if (!reason) {
            job.written = true;
            continue;
          }

          job.problems = [reason];
          job.rejectedBy = reason;

          /*
           * El borrador se tira antes de reintentar.
           *
           * Si no, una sección que Shopify rechaza queda guardada y el siguiente
           * intento la reutilizaría tal cual, repitiendo el mismo rechazo para
           * siempre — la caché, que está para ahorrar, dejaría la página
           * imposible de escribir.
           */
          await forgetSectionDraft(blueprintId, page, job.wanted.kind, job.ordinal);
        }

        const broken = pending.filter((job) => !job.written);
        if (broken.length === 0) break;

        // La última vuelta no regenera: no habría dónde volver a probarlo.
        if (round === rounds - 1) break;

        for (const job of broken) {
          const built = await writeOne(job, job.problems);
          if (!built) continue;

          await saveSectionDraft(blueprintId, page, built.draft);
          job.file = built.file;
          job.entry = built.entry;
        }
      }

      /* ------------------------- La plantilla ---------------------------- */

      const usable = jobs.filter((job) => job.written && job.entry).map((job) => job.entry!);

      if (usable.length === 0) {
        const first = jobs.find((job) => job.rejectedBy || job.problems.length > 0);
        throw new Error(
          `No entró ninguna sección. ${first?.rejectedBy ?? first?.problems[0] ?? "Vuelve a intentarlo."}`,
        );
      }

      const order = orderAfterRecreate(plan, usable, current);
      const nextTemplate = writeTemplate(file.body!, usable, order);
      if (!nextTemplate) throw new Error("La plantilla no tiene el formato esperado; no se ha tocado.");

      /*
       * La plantilla, al final y sola.
       *
       * Un archivo de sección que no usa nadie es inofensivo; una plantilla que
       * apunta a una sección que no se llegó a escribir es la página caída. Por
       * eso este orden y no el contrario.
       */
      await writeThemeFiles(store, themeId, [{ filename: templateName, content: nextTemplate }]);

      const lost = jobs.filter((job) => !job.written);

      return {
        summary: [
          `${usable.length} de ${jobs.length} secciones en ${templateName}`,
          plan.retire.length > 0 ? `, ${plan.retire.length} de las tuyas retiradas` : "",
          ".",
          reused > 0 ? ` ${reused} venían ya escritas y no se han vuelto a pagar.` : "",
          matched > 0 ? ` ${matched} escritas mirando su sección real.` : "",
          filledPhotos > 0
            ? ` ${filledPhotos} imagen(es) de ${blueprint.storeName} para maquetar: sustitúyelas antes de publicar.`
            : "",
          photoNote,
          lost.length > 0
            ? ` No entraron: ${lost
                .map(
                  (job) =>
                    `${job.wanted.kind} — ${job.rejectedBy ?? job.problems[0] ?? "no pasó la revisión"}`,
                )
                .join(" | ")}`
            : "",
          " Míralo en la vista previa antes de publicar.",
        ].join(""),
        inputTokens,
        outputTokens,
      };
    },
  });
}

/** Una sección en curso: lo que hace falta para escribirla y para repararla. */
interface SectionJob {
  wanted: { kind: string; purpose: string; angle: string };
  index: number;
  /** Su posición entre las de su mismo papel, para acertar con su borrador. */
  ordinal: number;
  type: string;
  /** La sección equivalente en la tienda de referencia, si se encontró. */
  model: ReferenceSection | null;
  /** Lo que hay que corregir: de la revisión propia o del propio Shopify. */
  problems: string[];
  file: string | null;
  entry: TemplateEntry | null;
  written?: boolean;
  rejectedBy?: string;
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

/**
 * Quita las imágenes de maqueta de una plantilla.
 *
 * Existe porque son de otra tienda y están puestas para poder juzgar la
 * disposición, no para publicarlas. Quitarlas es borrar el texto de la dirección
 * en cada sección creada: como nunca se descargó ni se subió nada, no queda
 * ningún archivo que limpiar después.
 *
 * Solo toca las secciones que empiezan por `lp-` —las creadas desde aquí— y solo
 * los ajustes acabados en `_url`. Una imagen que hayas elegido tú con el selector
 * del editor vive en otro ajuste y no se toca.
 */
export async function clearDemoImagesAction(
  storeId: unknown,
  themeId: unknown,
  pageKind: unknown,
): Promise<{ ok: boolean; message: string }> {
  const theme = readText(themeId);
  const page = readPage(pageKind);
  const templateName = TEMPLATE_FOR[page];

  if (!theme) return { ok: false, message: "Falta el tema." };

  try {
    const store = await findStore(readText(storeId));
    if (!store) return { ok: false, message: "No se encontró la tienda." };

    const [file] = await listThemeFiles(store, theme, [templateName]);
    if (!file?.body) return { ok: false, message: `No se pudo leer ${templateName} de ese tema.` };

    const { cleared, json } = clearDemoImages(file.body);

    if (cleared === 0) {
      return { ok: true, message: "No había ninguna imagen de maqueta. No se ha escrito nada." };
    }
    if (!json) {
      return { ok: false, message: "La plantilla no tiene el formato esperado; no se ha tocado." };
    }

    await writeThemeFiles(store, theme, [{ filename: templateName, content: json }]);

    return {
      ok: true,
      message: `${cleared} imagen(es) de maqueta quitadas. Los huecos vuelven a estar vacíos: elige las tuyas en el editor.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo quitar." };
  }
}

/**
 * Tira lo escrito de una página para volver a hacerla desde cero.
 *
 * Existe porque la reutilización es lo correcto por defecto —no pagar dos veces
 * lo mismo— pero no siempre: si una sección salió fea, volver a lanzarlo la
 * devolvería idéntica. Esto es lo que dice «esta vez sí, escríbelas otra vez».
 */
export async function clearSectionDraftsAction(
  blueprintId: unknown,
  pageKind: unknown,
): Promise<{ ok: boolean; message: string }> {
  const planId = readText(blueprintId);
  if (!planId) return { ok: false, message: "Falta el análisis." };

  try {
    const cleared = await clearSectionDrafts(planId, readPage(pageKind));

    return {
      ok: true,
      message:
        cleared === 0
          ? "No había nada guardado: la próxima vez se escribe todo de nuevo igualmente."
          : `${cleared} sección(es) olvidadas. La próxima vez se escriben otra vez, y se vuelven a pagar.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo vaciar." };
  }
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
