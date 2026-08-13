"use server";

import { findStore } from "@/lib/store-registry";
import { applyTemplateTexts, collectTemplateTexts } from "@/lib/theme-texts";
import { marketContextFor } from "@/lib/market-context";
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
import { readAngles } from "@/lib/copy-store";
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
  SECTION_LIMIT,
  type TemplateEntry,
} from "@/lib/theme-sections";
import {
  blockSettingsOf,
  coerceBlockType,
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
  const marketContext = await marketContextFor(product);

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
    /*
     * Sin sitio no es lo mismo que sin secciones, y se dice distinto.
     *
     * «Vuelve a analizar la tienda» no arregla una plantilla con veinticinco
     * secciones tuyas: lo que hay que hacer es quitar alguna.
     */
    if (plan.overflow.length > 0) {
      throw new Error(
        `Tu plantilla ya tiene ${plan.keep.length} secciones y Shopify solo admite ${SECTION_LIMIT}. No queda sitio para ninguna nueva: quita alguna de ${templateName} en el editor y vuelve a intentarlo.`,
      );
    }

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
    work: async (report, cancelled) => {
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
      // Cuántos huecos se llenaron con la imagen que ocupa ese sitio en la
      // referencia, que es lo que de verdad hace que se parezca.
      let matchedPhotos = 0;
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
            marketContext,
            section: job.wanted,
            type: job.type,
            // La de la sección manda sobre la del tema: es lo que hace que un
            // héroe rosa salga rosa y no blanco.
            palette: job.model?.palette ?? palette,
            referenceFonts: job.model?.fonts ?? [],
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

        /*
         * Las imágenes **de esa sección**, en su orden, antes que el montón.
         *
         * Era el fallo que más se veía: los huecos se rellenaban de la bolsa de
         * todas las imágenes de la tienda, así que en el héroe caía un icono de
         * garantía y en la fila de iconos una foto de producto. La disposición
         * estaba bien y el resultado no se parecía a nada.
         *
         * Su héroe lleva exactamente dos imágenes y su fila de iconos cuatro;
         * cogidas en orden, cada una cae donde le toca. El montón general queda
         * de reserva para las secciones que no emparejaron con ninguna.
         */
        const own = job.model?.imageUrls ?? [];
        const slots = imageUrlSlots(review.schema);

        const withOwn = fillImageUrls(settings, slots, own);
        const withPhotos = fillImageUrls(withOwn.settings, slots, photos, filledPhotos);

        filledPhotos += withPhotos.used;
        matchedPhotos += withOwn.used;

        const draft: SectionDraft = {
          kind: job.wanted.kind,
          ordinal: job.ordinal,
          sectionType: job.type,
          liquid,
          settings: withPhotos.settings,
          /*
           * El tipo de cada bloque se ajusta al que declara el esquema.
           *
           * El modelo escribe el marcado y el contenido en la misma respuesta y
           * a veces los nombra distinto —declara `item` y devuelve `resena`—.
           * Shopify rechaza el archivo entero por eso, y el nombre del tipo no
           * cambia nada de lo que se ve: solo tiene que coincidir.
           */
          blocks: generated.data.blocks.flatMap((block) => {
            const type = coerceBlockType(
              review.schema!,
              block.type,
              block.settings.map((setting) => setting.id),
            );

            if (!type) return [];

            return [
              {
                type,
                settings: coerceSettings(block.settings, blockSettingsOf(review.schema!, type)),
              },
            ];
          }),
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

      let stopped = false;

      for (const job of jobs) {
        /*
         * Se mira antes de empezar cada sección, no en medio.
         *
         * La que esté a medias ya está pagada, así que se termina y se guarda.
         * Las que faltan ni se empiezan, y al continuar se reutiliza todo.
         */
        if (await cancelled()) {
          stopped = true;
          break;
        }

        const saved = drafts.get(`${job.wanted.kind}:${job.ordinal}`);

        if (saved) {
          await report(`${job.wanted.kind} ya estaba escrita — ${job.index + 1} de ${jobs.length}`);

          // Lo guardado se repara al leerlo: lo escrito antes del arreglo del
          // `default` vacío lo lleva dentro, y sin esto la caché devolvería el
          // mismo rechazo para siempre.
          job.type = saved.sectionType;
          job.file = stripBlankDefaults(saved.liquid).source;

          /*
           * Lo guardado se repara con su propio esquema.
           *
           * Los borradores anteriores a este arreglo llevan tipos de bloque que
           * Shopify rechaza. Sin repararlos, la caché —que está para no pagar dos
           * veces— devolvería el mismo rechazo para siempre.
           */
          const schema = reviewSection(job.file).schema;

          job.entry = buildTemplateEntry({
            kind: job.wanted.kind,
            type: saved.sectionType,
            index: job.index,
            settings: saved.settings,
            blocks: schema
              ? saved.blocks.flatMap((block) => {
                  const type = coerceBlockType(schema, block.type, Object.keys(block.settings));
                  return type ? [{ type, settings: block.settings }] : [];
                })
              : saved.blocks,
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

      if (usable.length === 0 && stopped) {
        return {
          summary:
            "Cancelado antes de escribir nada. Lo que se hubiera generado queda guardado: al continuar no se vuelve a pagar.",
          inputTokens,
          outputTokens,
        };
      }

      if (usable.length === 0) {
        const first = jobs.find((job) => job.rejectedBy || job.problems.length > 0);
        throw new Error(
          `No entró ninguna sección. ${first?.rejectedBy ?? first?.problems[0] ?? "Vuelve a intentarlo."}`,
        );
      }

      const order = orderAfterRecreate(plan, usable, current);
      const written = writeTemplate(file.body!, usable, order);
      if (!written) throw new Error("La plantilla no tiene el formato esperado; no se ha tocado.");

      const nextTemplate = written.json;

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
          stopped ? "Cancelado. " : "",
          `${usable.length} de ${jobs.length} secciones en ${templateName}`,
          plan.retire.length > 0 ? `, ${plan.retire.length} de las tuyas retiradas` : "",
          ".",
          reused > 0 ? ` ${reused} venían ya escritas y no se han vuelto a pagar.` : "",
          matched > 0 ? ` ${matched} escritas mirando su sección real.` : "",
          matchedPhotos > 0
            ? ` ${matchedPhotos} imagen(es) puestas donde van en el original.`
            : "",
          filledPhotos > 0
            ? ` ${filledPhotos} más del montón. Son de ${blueprint.storeName}: sustitúyelas antes de publicar.`
            : "",
          photoNote,
          /*
           * Lo que no cupo en el tope de Shopify.
           *
           * Se dice aparte de las que fallaron la revisión: son dos motivos
           * distintos y se arreglan distinto. Una que no cupo está bien escrita
           * y solo sobra sitio; quitando otra de la plantilla entra.
           */
          /*
           * Lo que se apartó **antes** de generarlo, por no caber.
           *
           * Va antes que lo demás porque no es un fallo: es una decisión que
           * ahorró dinero, y quien la lea tiene que poder decidir si quiere
           * hacer sitio y repetir.
           */
          plan.overflow.length > 0
            ? ` ${plan.overflow.length} no se generaron por falta de sitio (Shopify admite ${SECTION_LIMIT} por plantilla): ${plan.overflow
                .map((item) => item.kind)
                .join(", ")}. Quita alguna de las tuyas si las quieres.`
            : "",
          written.dropped.length > 0
            ? ` No cupieron ${written.dropped.length}: Shopify solo admite ${SECTION_LIMIT} secciones por plantilla y se quitaron las últimas (${written.dropped
                .map((item) => item.type)
                .join(", ")}). Quita alguna de las tuyas si las quieres.`
            : "",
          lost.length > 0
            ? ` No entraron: ${lost
                .map(
                  (job) =>
                    `${job.wanted.kind} — ${job.rejectedBy ?? job.problems[0] ?? "no pasó la revisión"}`,
                )
                .join(" | ")}`
            : "",
          stopped
            ? " Las que faltan siguen pendientes: continúa el trabajo cuando quieras y no se vuelve a pagar lo hecho."
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
 * Revisa las secciones que ya están escritas en el tema.
 *
 * Existe porque las comprobaciones se hacen **antes** de escribir, y una
 * sección escrita cuando la comprobación no existía sigue ahí con el fallo
 * dentro. El caso que lo motivó: un `img { display: none }` sin encerrar dentro
 * de un `{% style %}` —que durante un tiempo no se revisaba— deja la cabecera
 * sin logotipo aunque el logotipo esté bien puesto en los ajustes.
 *
 * No toca nada: solo dice qué archivo tiene qué. Arreglarlo automáticamente
 * significaría reescribir CSS ajeno a ciegas, y aquí lo caro no es el arreglo
 * sino saber cuál de veinte archivos es.
 */
export async function reviewThemeSectionsAction(
  storeId: unknown,
  themeId: unknown,
): Promise<{ ok: boolean; message: string; findings: { file: string; problems: string[] }[] }> {
  const theme = readText(themeId);
  if (!theme) return { ok: false, message: "Falta el tema.", findings: [] };

  try {
    const store = await findStore(readText(storeId));
    if (!store) return { ok: false, message: "No se encontró la tienda.", findings: [] };

    /*
     * Solo las escritas desde aquí, que se llaman `sections/lp-…`.
     *
     * Las del tema son de su autor: revisarlas llenaría la lista de avisos que
     * no se pueden ni se deben arreglar, y el que importa se perdería entre
     * ellos.
     */
    const mine = (await listThemeFiles(store, theme)).filter((file) =>
      file.filename.startsWith("sections/lp-"),
    );

    if (mine.length === 0) {
      return {
        ok: true,
        message: "Ese tema no tiene ninguna sección escrita desde aquí.",
        findings: [],
      };
    }

    const findings: { file: string; problems: string[] }[] = [];

    for (const file of mine) {
      if (!file.body) continue;

      const review = reviewSection(file.body);
      if (!review.ok) findings.push({ file: file.filename, problems: review.problems });
    }

    return {
      ok: true,
      message:
        findings.length === 0
          ? `Las ${mine.length} secciones escritas desde aquí pasan la revisión.`
          : `${findings.length} de ${mine.length} secciones tienen algo. Las de «selector no encerrado» son las que pueden estar tapando el logotipo.`,
      findings,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo revisar.",
      findings: [],
    };
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

/**
 * Reescribe **solo los textos** de una portada ya copiada.
 *
 * Hasta ahora, cambiar el texto de una página hecha desde aquí obligaba a tirar
 * lo escrito y rehacerla entera: diez u once llamadas al modelo, pagadas otra
 * vez, y otra estructura al final. Esto es la pieza que faltaba entre «me vale»
 * y «empiezo de cero»: una sola llamada, la misma página, otro ángulo.
 *
 * Lo que **no** toca: el orden de las secciones, los colores, las imágenes y los
 * enlaces. Eso lo garantiza `theme-texts.ts`, que solo escribe donde ya había un
 * texto y filtra por lo que cada ajuste es.
 */
export async function adaptPageTextsAction(form: FormData): Promise<LaunchResult> {
  const storeId = readText(form.get("storeId"));
  const themeId = readText(form.get("themeId"));
  const productId = readText(form.get("productId"));
  const angleId = readText(form.get("angleId"));
  const enfoque = readText(form.get("enfoque"));
  const page = readPage(form.get("page"));
  const templateName = TEMPLATE_FOR[page];

  if (!storeId || !themeId) throw new Error("Faltan la tienda o el tema.");
  if (!productId) throw new Error("Elige el producto del que sale el contenido.");
  if (!angleId && !enfoque) {
    throw new Error("Elige un ángulo o escribe un enfoque: sin uno de los dos no hay qué cambiar.");
  }

  const store = await findStore(storeId);
  if (!store) throw new Error("No se encontró la tienda.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  return runInBackground({
    productId,
    kind: "tema",
    label: `Adaptar los textos de ${templateName}`,
    work: async (report) => {
      await report(`Leyendo ${templateName}`);

      const [file] = await listThemeFiles(store, themeId, [templateName]);
      if (!file?.body) throw new Error(`No se pudo leer ${templateName} de ese tema.`);

      const textos = collectTemplateTexts(file.body);

      /*
       * Sin textos se **falla**, no se termina en silencio.
       *
       * Un trabajo que acaba «bien» sin haber hecho nada es indistinguible de
       * uno que no arrancó, y eso ya costó una vuelta entera preguntándose por
       * qué no cambiaba la portada.
       */
      if (textos.length === 0) {
        throw new Error(
          `No encontré textos que reescribir en ${templateName}. O la plantilla no es de bloques, o sus secciones no guardan texto en los ajustes.`,
        );
      }

      await report(`${textos.length} textos; escribiendo los nuevos`);

      const [research, angles] = await Promise.all([
        readProductResearch(productId),
        readAngles(productId),
      ]);
      const angle = angles.find((item) => item.id === angleId);
      const marketContext = await marketContextFor(product);

      const { buildProductContext } = await import("@/lib/copy-prompts");

      const prompt = `${buildProductContext(product, research, store, marketContext)}

## Qué hay que hacer

Reescribe los textos de esta página para que entren por otro sitio. La página se
queda como está: mismas secciones, mismo orden, mismas imágenes. Solo cambia lo
que dicen.

${angle ? `Ángulo: **${angle.name}**\n- Mecanismo del problema: ${angle.problemMechanism}\n- Mecanismo de la solución: ${angle.solutionMechanism}\n` : ""}${enfoque ? `Enfoque pedido: ${enfoque}\n(Manda sobre el ángulo si se contradicen.)\n` : ""}

Reglas:

- Devuelve **exactamente** las mismas rutas que te doy, sin inventar ninguna.
- Respeta la longitud aproximada de cada texto: un titular de cuatro palabras no
  puede volver con veinte, o la sección se rompe visualmente.
- Nada de precios ni de promesas que la investigación no sostenga.

## Los textos, con su ruta

${textos.map((item) => `- \`${item.path}\`: ${item.value}`).join("\n")}`;

      const outcome = await generateStructured<{ textos: { path: string; text: string }[] }>({
        prompt,
        schema: {
          type: "object",
          properties: {
            textos: {
              type: "array",
              items: {
                type: "object",
                properties: { path: { type: "string" }, text: { type: "string" } },
                required: ["path", "text"],
                additionalProperties: false,
              },
            },
          },
          required: ["textos"],
          additionalProperties: false,
        },
        role: "copy",
        maxTokens: 16_000,
      });

      const next = applyTemplateTexts(
        file.body,
        (outcome.data.textos ?? []).map((item: { path: string; text: string }) => ({
          path: item.path,
          value: item.text,
        })),
      );

      // Si no cambió nada no se escribe: cada escritura queda en el historial del
      // tema y una sin cambios solo añade ruido.
      if (next.trim() === file.body.trim()) {
        return { summary: "El modelo no cambió ningún texto. No se ha escrito nada." };
      }

      await report("Subiendo la plantilla al tema");
      await writeThemeFiles(store, themeId, [{ filename: templateName, content: next }]);

      return {
        summary: `${textos.length} textos reescritos en ${templateName}. Míralo en la vista previa antes de publicar.`,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      };
    },
  });
}
