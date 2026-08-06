"use server";

import { revalidatePath } from "next/cache";
import { findProductAnywhere } from "@/lib/products";
import { findStore } from "@/lib/store-registry";
import { readProductResearch } from "@/lib/research-store";
import { readAngles, readCopies } from "@/lib/copy-store";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { generateStructured } from "@/lib/generators";
import { LANDING_PAGE_SCHEMA } from "@/lib/generation-schemas";
import { buildLandingPrompt } from "@/lib/landing-prompt";
import { findModelPage } from "@/lib/store-blueprint";
import { AVATAR_POOL_SIZE, avatarSlot, buildAvatarPrompt } from "@/lib/avatar-prompts";
import { saveLanding, deleteLanding } from "@/lib/data/landings";
import { lookOf } from "@/lib/landing-look";
import type { LandingTheme } from "@/lib/landing-theme";
import { runInBackground } from "@/lib/background";
import { recordRun } from "@/lib/data/runs";
import { estimateCost, copyModel } from "@/lib/claude";
import { findCopyMethod } from "@/types/copy";
import type { LandingComment, LandingImageSlot, LandingSection } from "@/types/landing";
import type { LaunchResult } from "@/types/jobs";

/**
 * Generar un publirreportaje como página web completa.
 *
 * Se guarda por secciones y no como HTML: así, mejorar la plantilla mejora
 * también las páginas ya generadas, y el HTML se deriva al leer.
 */

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function generateLandingAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const method = findCopyMethod(readText(raw.methodId));
  if (!method) throw new Error("Ese marco de escritura no existe.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const [research, angles, copies] = await Promise.all([
    readProductResearch(productId),
    readAngles(productId),
    readCopies(productId),
  ]);

  const store = product.storeId ? await findStore(product.storeId) : null;

  const angleId = readText(raw.angleId);
  const angle = angles.find((item) => item.id === angleId) ?? null;

  // Cuando se parte de un copy ya escrito, se adapta en vez de empezar de cero.
  const copyId = readText(raw.copyId);
  const baseCopy = copies.find((item) => item.id === copyId)?.content.primaryText;

  const commentStyle = readText(raw.commentStyle) === "testimonios" ? "testimonios" : "facebook";

  /*
   * La referencia puede ser tres cosas, y las tres se tratan igual: un copy del
   * archivo, una landing pegada a mano, o **una página de una tienda analizada**.
   *
   * Esta última es la que cierra el círculo. Analizar un competidor daba hasta
   * ahora la estructura —trece etiquetas de sección y la oferta— pero para
   * escribir la página hacía falta el texto delante: por dónde entra, cuánto
   * tarda en nombrar el producto, dónde mete la objeción. Sin eso, «replicar»
   * era reordenar secciones vacías.
   *
   * Lo que se replica es la **construcción**. El producto, el mecanismo, los
   * datos y los nombres salen de esta investigación, y eso lo impone el prompt.
   */
  const referenceId = readText(raw.referenceId);
  let reference: { label: string; body: string; images?: string[] } | undefined;
  let theme: LandingTheme | undefined;

  if (referenceId.startsWith("plano:")) {
    const { listBlueprints } = await import("@/lib/data/blueprints");
    const found = findModelPage(await listBlueprints(), referenceId);
    if (!found) {
      throw new Error(
        "Esa página analizada ya no está disponible. Si el análisis es anterior a esta versión no guardó el texto: vuelve a analizar la tienda.",
      );
    }

    reference = { label: found.label, body: found.body, images: found.images };
  } else if (referenceId) {
    // Entre todos: calcar una landing de otra marca es el caso normal aquí, y
    // llega elegida por su id.
    const { listAllSwipeCopies } = await import("@/lib/data/swipe");
    const found = (await listAllSwipeCopies()).find((item) => item.id === referenceId);
    if (!found) throw new Error("Esa referencia ya no existe.");

    reference = {
      label: [found.title, found.source].filter(Boolean).join(" · "),
      body: found.body,
    };

    /*
     * El aspecto sale de la página de verdad, no del texto guardado.
     *
     * Al traerla se guardó la dirección en `note`, así que se vuelve a
     * descargar para leer sus colores y su letra. Es una petición por
     * generación y evita el problema que había: todas las landings salían
     * iguales porque el aire estaba escrito a fuego, y el aire es la mitad que
     * hace que parezca un artículo y no un anuncio.
     *
     * Si la página ya no está o no se deja leer, se sigue con el de siempre: es
     * peor no generar nada que generar con el aspecto por defecto.
     */
    if (found.format === "landing" && found.note) {
      theme = await lookOf(found.note).catch(() => undefined);

      /*
       * Y sus imágenes, para calcar también dónde iba cada una.
       *
       * Solo al calcar: inspirándose, la página nueva coloca las suyas donde le
       * convenga y esta lista no llevaría a ninguna decisión — sería una
       * descarga más para nada.
       */
      if (readText(raw.fidelity) !== "inspirado") {
        const { readReferenceSections } = await import("@/lib/reference-page");

        reference.images = await readReferenceSections(found.note)
          .then((sections) => [...new Set(sections.flatMap((section) => section.imageUrls))])
          .catch(() => []);
      }
    }
  }

  const { readFidelity } = await import("@/lib/landing-fidelity");
  const fidelity = readFidelity(raw.fidelity);

  /*
   * Qué forma tiene la página.
   *
   * Sin elegir, se propone una que este producto no haya usado todavía: la
   * segunda página no debería salir igual que la primera solo porque nadie se
   * acordó de cambiarlo.
   */
  const { nextShape } = await import("@/lib/landing-shapes");
  const { listLandings } = await import("@/lib/data/landings");

  const usedShapes = await listLandings(productId)
    .then((pages) => pages.map((page) => page.shapeId ?? "").filter(Boolean))
    .catch(() => []);

  const shapeId = nextShape(usedShapes, readText(raw.shapeId) || undefined).id;

  const prompt = buildLandingPrompt({
    product,
    research,
    store,
    method,
    baseCopy,
    angle,
    commentStyle,
    reference,
    fidelity,
    shapeId,
    countryName: product.country || "México",
  });

  return runInBackground({
    productId,
    kind: "landing",
    label: `Página · ${method.name}`,
    work: async () => {
      const { data, inputTokens, outputTokens } = await generateStructured<{
        title: string;
        slug: string;
        header?: { enabled: boolean; announcement: string; logoText: string; kicker: string };
        author?: { name: string; credentials: string; updatedAt: string };
        sections: LandingSection[];
        imageSlots: LandingImageSlot[];
        comments: LandingComment[];
      }>({ prompt, schema: LANDING_PAGE_SCHEMA, role: "copy", maxTokens: 48_000 });

      const slots = data.imageSlots ?? [];

      /*
       * El logo y el retrato se enlazan solo si el modelo los propuso.
       *
       * Si no están, la cabecera cae al logo tipográfico y la ficha del autor a
       * su inicial: la página se ve entera desde el primer momento, sin esperar
       * a generar ninguna imagen.
       */
      const has = (slot: string) => slots.some((item) => item.slot === slot);

      const page = await saveLanding({
        productId,
        theme,
        shapeId,
        copyId: copyId || undefined,
        title: data.title,
        slug: data.slug,
        methodId: method.id,
        header: data.header
          ? {
              enabled: data.header.enabled !== false,
              announcement: data.header.announcement || undefined,
              logoText: data.header.logoText || product.brand || product.name,
              logoSlot: has("logo") ? "logo" : undefined,
              kicker: data.header.kicker || undefined,
            }
          : undefined,
        author: data.author?.name
          ? {
              name: data.author.name,
              credentials: data.author.credentials || "",
              photoSlot: has("autor") ? "autor" : undefined,
              updatedAt: data.author.updatedAt || undefined,
            }
          : undefined,
        sections: data.sections ?? [],
        imageSlots: slots,
        comments: data.comments ?? [],
      });

      const model = await copyModel();
      await recordRun({
        productId,
        productName: product.name,
        kind: "copy",
        detail: `Página: ${page.title}`,
        model,
        inputTokens,
        outputTokens,
      });

      return {
        summary: `«${page.title}» — ${page.sections.length} secciones, ${page.imageSlots.length} imágenes y ${page.comments.length} comentarios.`,
        inputTokens,
        outputTokens,
        costUsd: estimateCost(model, inputTokens, outputTokens),
      };
    },
  });
}

export async function deleteLandingAction(id: unknown, productId: unknown): Promise<void> {
  const landingId = readText(id);
  const product = readText(productId);
  if (!landingId) return;

  await deleteLanding(landingId);
  if (product) revalidatePath(`/products/${product}`);
}

/* ------------------------- Retratos para los comentarios ------------------------- */

/**
 * Genera el grupo de retratos que usarán los comentarios.
 *
 * **Uno por producto, no uno por página.** Ocho caras bastan para que no se
 * repitan seguidas, y sirven en todas las landings: generar doce por página
 * sería pagar muchas veces por lo mismo.
 *
 * **Personas sintéticas.** No se parte de fotos de perfiles reales: la cara de
 * alguien identificable junto a un comentario escrito para la página implica un
 * aval que esa persona nunca dio.
 */
export async function generateCommentAvatarsAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  /*
   * Los retratos son **de cada página**, no del producto.
   *
   * Antes se guardaban solo con su concepto —`avatar-0`, `avatar-1`— sin atarse
   * a ninguna landing, con la idea de que las mismas caras sirvieran en todas.
   * No sirven: cada página tiene sus propios comentaristas, con otros nombres.
   * Y al generarlos desde una segunda página aparecían dos imágenes con el mismo
   * concepto, así que la búsqueda por concepto devolvía una cualquiera y **las
   * caras de la primera landing cambiaban solas**.
   */
  const landingId = readText(raw.landingId);
  if (!landingId) throw new Error("Falta la página a la que pertenecen los retratos.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const modelSlug = readText(raw.modelSlug) || "text2image_soul_v2";

  // Solo los que faltan **en esta página**: repetir los que ya están es gastar
  // dos veces, y mirar los de otra página los daría por hechos sin estarlo.
  const existing = (await import("@/lib/image-store").then((m) => m.readProductImages(productId)))
    .filter((image) => image.landingId === landingId)
    .map((image) => image.concept)
    .filter(Boolean);

  const pending = Array.from({ length: AVATAR_POOL_SIZE }, (_, index) => index).filter(
    (index) => !existing.includes(avatarSlot(index)),
  );

  if (pending.length === 0) {
    return { started: false, message: "Esta página ya tiene todos sus retratos." };
  }

  const { generateAdVisualsAction } = await import("@/app/products/[id]/image-generate-actions");

  return generateAdVisualsAction({
    productId,
    landingId,
    modelSlug,
    // Sin la foto del producto: aquí se generan caras, no envases.
    withReference: false,
    visuals: pending.map((index) => ({
      title: `Retrato ${index + 1}`,
      prompt: buildAvatarPrompt({
        index,
        countryName: product.country || "México",
        audience: product.targetAudience,
      }),
      aspectRatio: "1:1",
      concept: avatarSlot(index),
      origin: "retrato de comentario",
    })),
  });
}

/* ------------------------------ Publicar en Shopify ------------------------------ */

/**
 * Sube las imágenes y publica la página en la tienda.
 *
 * El orden importa: **primero las imágenes, después la página**. El HTML lleva
 * las URLs del CDN de Shopify incrustadas, así que publicarlo antes de tenerlas
 * dejaría una página con los huecos vacíos y habría que repasarla a mano.
 *
 * Las imágenes ya subidas no se vuelven a subir: se guarda su URL de Shopify la
 * primera vez. Republicar es entonces barato y **actualiza la misma página**, en
 * vez de dejar otra con un enlace nuevo que los anuncios ya no apuntan.
 */
export async function publishLandingAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const landingId = readText(raw.id);
  const productId = readText(raw.productId);
  if (!landingId || !productId) throw new Error("Falta la página.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }

  const { readLanding } = await import("@/lib/data/landings");
  const page = await readLanding(landingId);
  if (!page) throw new Error("Esa página ya no existe.");

  return runInBackground({
    productId,
    kind: "shopify",
    label: `Publicar «${page.title}»`,
    work: async () => {
      const { readProductImages } = await import("@/lib/image-store");
      const { uploadImages, createPage, updatePage, PageGoneError } = await import(
        "@/lib/shopify",
      );
      const { renderLandingHtml } = await import("@/lib/landing-html");
      const { setShopifyUrl, markLandingPublished } = await import("@/lib/data/landings");
      const { AVATAR_POOL_SIZE, avatarSlot } = await import("@/lib/avatar-prompts");

      /*
       * La tienda del producto: cada una tiene su propia app y su propio token.
       * Sin tienda no hay dónde publicar, y decirlo aquí evita subir las
       * imágenes para descubrirlo después.
       */
      const product = await findProductAnywhere(productId);
      if (!product?.storeId) {
        throw new Error(
          "Este producto no está asignado a ninguna tienda. Asígnale una en Editar producto para poder publicar.",
        );
      }

      const store = await findStore(product.storeId);
      if (!store) throw new Error("No se encontró la tienda del producto.");

      const images = await readProductImages(productId);

      /*
       * Las de esta página, y solo las suyas.
       *
       * Antes entraban también los retratos de cualquier página, porque se
       * consideraban del producto. Con dos landings eso mezclaba las caras: la
       * segunda tanda de retratos se colaba en la primera página al republicarla.
       */
      const avatarConcepts = Array.from({ length: AVATAR_POOL_SIZE }, (_, index) =>
        avatarSlot(index),
      );

      const mine = images.filter((image) => image.landingId === page.id);

      /*
       * Respaldo para las páginas de antes del cambio.
       *
       * Sus retratos se guardaron sin `landingId`, así que sin esto una página ya
       * publicada perdería las caras al republicarla. Solo se usan los huérfanos
       * —los que no pertenecen a ninguna página— y solo para los huecos que esta
       * no tenga cubiertos.
       */
      const orphans = images.filter(
        (image) => !image.landingId && image.concept && avatarConcepts.includes(image.concept),
      );

      const covered = new Set(mine.map((image) => image.concept));
      const relevant = [
        ...mine,
        ...orphans.filter((image) => !covered.has(image.concept)),
      ];

      const toUpload = relevant.filter((image) => !image.shopifyUrl);

      let uploaded = 0;
      if (toUpload.length > 0) {
        const result = await uploadImages(
          store,
          toUpload.map((image) => ({
            url: image.url,
            alt:
              page.imageSlots.find((slot) => slot.slot === image.concept)?.alt || image.name,
          })),
        );

        for (const image of toUpload) {
          const file = result.get(image.url);
          if (!file) continue;

          await setShopifyUrl(image.id, file.url);
          image.shopifyUrl = file.url;
          uploaded += 1;
        }
      }

      /*
       * Solo entran las que ya tienen URL de Shopify.
       *
       * Una que haya fallado al subir se queda como hueco marcado en la página:
       * es visible y se arregla, mientras que meter la URL firmada de Supabase
       * daría una imagen que se rompe en una hora sin avisar.
       */
      const urls: Record<string, string> = {};
      const avatars: string[] = [];

      for (const image of relevant) {
        if (!image.shopifyUrl || !image.concept) continue;
        if (image.concept.startsWith("avatar-")) continue;
        urls[image.concept] = image.shopifyUrl;
      }

      for (let index = 0; index < AVATAR_POOL_SIZE; index += 1) {
        const found = relevant.find((image) => image.concept === avatarSlot(index));
        if (found?.shopifyUrl) avatars.push(found.shopifyUrl);
      }

      const rendered = renderLandingHtml(page, { urls, avatars, embedUrls: true });

      /*
       * El CSS sale del cuerpo y se sirve aparte.
       *
       * Shopify rechaza un `page.body` de más de 512 KB, y una copia de una
       * landing de Shopify se pasa: el marcado son unos 220 KB y el CSS del tema
       * unos 350. Podarlo baja a 471 —publica, con 41 KB de margen— y la
       * siguiente página un poco más pesada vuelve a chocar.
       *
       * La salida limpia sería un asset del tema, pero `themeFilesUpsert` exige
       * además de `write_themes` una exención que Shopify concede a mano, y
       * aplica igual a las apps personalizadas de una tienda. Un `<link>` no
       * pide permiso a nadie.
       *
       * Si la subida de la hoja falla, se publica con el CSS dentro: una página
       * que quizá no quepa es mejor que ninguna, y el error de Shopify dice
       * exactamente qué pasó.
       */
      const { externalizeCss } = await import("@/lib/landing-copy-html");
      const { uploadVideoAsset } = await import("@/lib/data/video-assets");

      let html = rendered;

      // Sin dirección todavía: esta pasada solo sirve para saber si hay CSS que
      // sacar y cuánto pesa. La buena se hace abajo, ya con el enlace.
      const partes = externalizeCss(rendered, "");

      if (partes.css) {
        try {
          const href = await uploadVideoAsset({
            videoId: `landing-${page.id}`,
            name: "estilos.css",
            data: Buffer.from(partes.css, "utf8"),
            contentType: "text/css",
          });

          html = externalizeCss(rendered, href).html;
        } catch {
          html = rendered;
        }
      }

      /*
       * Además de la página, una **plantilla en el tema**.
       *
       * El cuerpo de una página de Shopify se edita en un cuadro de texto
       * enriquecido que reescribe el marcado: se abre, se guarda, y el editor
       * limpia atributos y reordena etiquetas — una copia fiel deja de serlo.
       * Una plantilla se edita como código y sale tal cual.
       *
       * Y de paso quita el tope: los 512 KB son del cuerpo de la página, no de
       * los archivos del tema.
       *
       * Solo para las copias. Las landings generadas se pintan con nuestras
       * secciones y no tienen marcado ajeno que preservar.
       */
      let suffix = "";
      /** Lo que no salió bien pero no impide publicar. Va en el resumen. */
      const avisos: string[] = [];

      if (page.shapeId === "copia") {
        try {
          const { listThemes, writeThemeFilesLenient } = await import("@/lib/shopify-store");
          const { pruneCss, templateSuffix } = await import("@/lib/landing-copy-html");
          const { sectionFile, sectionize, sectionNote, splitTopLevel, templateFor } = await import(
            "@/lib/landing-sections"
          );

          const themes = await listThemes(store);
          const live = themes.find((item) => item.role?.toLowerCase() === "main") ?? themes[0];

          if (live) {
            const wanted = templateSuffix(page.slug);

            /*
             * Dos archivos: la sección y la plantilla que la coloca.
             *
             * Los ajustes editables viven en una **sección**, no en la
             * plantilla: una plantilla no tiene `{% schema %}`, así que sin
             * separarlas no habría panel donde cambiar nada.
             */
            /*
             * Una sección por bloque de la página, no una con todo dentro.
             *
             * Con una sola, el panel del editor es una lista de cien ajustes
             * sin orden. Con varias, cada tramo se abre, se edita, se mueve y
             * se quita por separado — que es lo que se pidió.
             */
            const bloques = splitTopLevel(partes.html);

            const hechas = bloques.map((bloque, at) => {
              const parts = sectionize(bloque);

              /*
               * El CSS se poda **por sección**, contra su propio marcado.
               *
               * Repetir la hoja entera en veinte archivos serían varios megas
               * de tema y veinte veces las mismas reglas descargadas por quien
               * visita la página. Cada sección se lleva solo lo que usa.
               */
              return {
                name: `${wanted}-${String(at + 1).padStart(2, "0")}`,
                parts,
                css: pruneCss(partes.css, bloque),
              };
            });

            const done = await writeThemeFilesLenient(store, live.id, [
              ...hechas.map((hecha) => ({
                filename: `sections/${hecha.name}.liquid`,
                content: sectionFile({
                  liquid: hecha.parts.liquid,
                  css: hecha.css,
                  settings: hecha.parts.settings,
                  name: `${page.title} ${hecha.name.slice(-2)}`,
                }),
              })),
              {
                filename: `templates/page.${wanted}.liquid`,
                content: hechas.map((hecha) => templateFor(hecha.name)).join("\n"),
              },
            ]);

            /*
             * Todas o ninguna. Con la plantilla escrita y una sección sin
             * escribir, ese tramo sale **en blanco**: `{% section %}` sobre un
             * archivo que no existe no da error, no pinta nada — y la página
             * publicada tiene un hueco que nadie relaciona con esto.
             */
            if (done.written === hechas.length + 1) {
              suffix = wanted;

              const total = hechas.reduce(
                (sum, hecha) => ({
                  liquid: "",
                  settings: [...sum.settings, ...hecha.parts.settings],
                  skipped: sum.skipped + hecha.parts.skipped,
                }),
                { liquid: "", settings: [] as typeof hechas[number]["parts"]["settings"], skipped: 0 },
              );

              avisos.push(`${hechas.length} secciones. ${sectionNote(total, wanted)}`);
            } else if (done.written > 0) {
              avisos.push(
                `La plantilla del tema se escribió a medias (${done.failed.map((item) => `${item.filename}: ${item.reason}`).join("; ")}), así que la página se publica con el contenido dentro.`,
              );
            }
          }
        } catch (error) {
          /*
           * Sin plantilla se publica igual, con el cuerpo de siempre.
           *
           * Falta el permiso `write_theme_code` o el tema no deja escribir; en
           * los dos casos, una página publicada y editable a medias es mejor
           * que ninguna. Se cuenta en el resumen, no se calla.
           */
          avisos.push(
            `No se pudo crear la plantilla en el tema: ${error instanceof Error ? error.message : "sin motivo"}. La página se publica con el contenido dentro, que Shopify limita a 512 KB y su editor reescribe.`,
          );
        }
      }

      const crear = () =>
        createPage(store, {
          title: page.title,
          handle: page.slug,
          body: suffix ? "" : html,
          templateSuffix: suffix || undefined,
          published: true,
        });

      /*
       * Si la página se borró en Shopify, se vuelve a crear en vez de fallar.
       *
       * La plataforma guarda su identificador, así que después de borrarla desde
       * el panel de Shopify seguía intentando actualizar algo que ya no estaba.
       * La única salida era borrar la página aquí y rehacerla entera, perdiendo
       * el texto, las imágenes y el reparto de tráfico que colgaran de ella.
       */
      let published: Awaited<ReturnType<typeof createPage>>;
      let recreated = false;

      if (page.shopifyPageId) {
        try {
          published = await updatePage(store, page.shopifyPageId, {
            title: page.title,
            // Con plantilla, el cuerpo se vacía: si se dejara el marcado
            // dentro, la página saldría dos veces —una del cuerpo y otra de la
            // plantilla— y nada avisaría.
            body: suffix ? "" : html,
            templateSuffix: suffix || undefined,
            published: true,
          });
        } catch (error) {
          if (!(error instanceof PageGoneError)) throw error;
          published = await crear();
          recreated = true;
        }
      } else {
        published = await crear();
      }

      await markLandingPublished(page.id, published.id, published.url);

      const missing = relevant.length - relevant.filter((image) => image.shopifyUrl).length;

      return {
        summary: [
          `${recreated ? "Vuelta a crear" : "Publicada"} en ${published.url}.`,
          suffix
            ? ` Con plantilla propia en el tema (templates/page.${suffix}.liquid).`
            : "",
          ` ${uploaded} imagen(es) subidas`,
          missing > 0 ? `, ${missing} sin subir y marcadas como hueco` : "",
          ".",
          avisos.length > 0 ? ` ${avisos.join(" ")}` : "",
        ].join(""),
      };
    },
  });
}

/* ------------------------------ Ajustes y pruebas -------------------------------- */

export async function saveLandingSettingsAction(input: unknown): Promise<void> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const id = readText(raw.id);
  const productId = readText(raw.productId);
  if (!id) throw new Error("Falta la página.");

  const { updateLandingSettings } = await import("@/lib/data/landings");

  await updateLandingSettings(id, {
    hideThemeChrome: raw.hideThemeChrome === true,
    utmCampaign: readText(raw.utmCampaign),
  });

  if (productId) revalidatePath(`/products/${productId}`);
}

export interface AbReport {
  landings: { key: string; orders: number; revenue: number; currency: string }[];
  verdict: { decided: boolean; winner?: string; message: string };
  byAd: Record<string, { key: string; orders: number; revenue: number; currency: string }[]>;
  totalOrders: number;
  days: number;
}

/**
 * Los resultados de cada landing, leídos de Shopify.
 *
 * Se lee en vivo y no se guarda copia: los pedidos cambian de estado
 * —reembolsos, cancelaciones— y una copia envejecería sin avisar, que en una
 * decisión de apagar una campaña es peor que no tener el dato.
 */
export async function readAbReportAction(input: unknown): Promise<AbReport> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  const days = Math.min(60, Math.max(1, Number(raw.days) || 30));

  const product = await findProductAnywhere(productId);
  if (!product?.storeId) throw new Error("El producto no está asignado a ninguna tienda.");

  const store = await findStore(product.storeId);
  if (!store) throw new Error("No se encontró la tienda.");

  const { readAttributedOrders } = await import("@/lib/shopify");
  const { byLanding, byAd, judge } = await import("@/lib/ab-stats");

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const orders = await readAttributedOrders(store, { since });

  // Solo las páginas: los pedidos que entraron por la ficha de producto o por la
  // portada no dicen nada sobre qué publirreportaje funciona.
  const fromPages = orders.filter((order) => order.landingPath?.startsWith("/pages/"));

  const landings = byLanding(fromPages);
  const perAd: AbReport["byAd"] = {};
  for (const landing of landings) {
    perAd[landing.key] = byAd(fromPages, landing.key);
  }

  return {
    landings,
    verdict: judge(landings),
    byAd: perAd,
    totalOrders: orders.length,
    days,
  };
}

/* ----------------------------- Reparto de tráfico -------------------------------- */

export interface ExperimentReport {
  experiment: import("@/types/experiment").LandingExperiment;
  funnels: import("@/types/experiment").VariantFunnel[];
}

export async function listExperimentsAction(productId: unknown) {
  const id = readText(productId);
  if (!id || !isSupabaseConfigured()) return [];

  const { listExperiments } = await import("@/lib/data/experiments");
  return listExperiments(id).catch(() => []);
}

export async function saveExperimentAction(input: unknown): Promise<void> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const name = readText(raw.name);
  const slug = readText(raw.slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!productId) throw new Error("Falta el producto.");
  if (!name) throw new Error("Ponle un nombre a la prueba.");
  if (!slug) throw new Error("La prueba necesita un identificador para su URL.");

  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .map((item) => {
      const variant = (item ?? {}) as Record<string, unknown>;
      return {
        landingId: readText(variant.landingId),
        weight: Math.max(0, Math.round(Number(variant.weight) || 0)),
      };
    })
    .filter((variant) => variant.landingId);

  if (variants.length < 2) {
    throw new Error("Una prueba necesita al menos dos páginas entre las que repartir.");
  }
  if (variants.every((variant) => variant.weight === 0)) {
    throw new Error("Al menos una página tiene que llevarse tráfico.");
  }

  const { saveExperiment } = await import("@/lib/data/experiments");
  await saveExperiment({ productId, name, slug, variants, id: readText(raw.id) || undefined });

  revalidatePath(`/products/${productId}`);
}

export async function deleteExperimentAction(id: unknown, productId: unknown): Promise<void> {
  const { deleteExperiment } = await import("@/lib/data/experiments");
  await deleteExperiment(readText(id));

  const product = readText(productId);
  if (product) revalidatePath(`/products/${product}`);
}

/** El embudo de cada variante de una prueba. */
export async function readExperimentFunnelsAction(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;

  const experimentId = readText(raw.experimentId);
  if (!experimentId) throw new Error("Falta la prueba.");

  const days = Math.min(90, Math.max(1, Number(raw.days) || 14));

  const { readFunnels } = await import("@/lib/data/experiments");
  const funnels = await readFunnels(experimentId, days);

  return Object.fromEntries(funnels);
}

/**
 * Olvida la página de Shopify sin borrar la de aquí.
 *
 * Existe para el caso de haber borrado la página desde el panel de Shopify: la
 * plataforma seguía guardando su identificador, así que solo ofrecía
 * «Actualizar» sobre algo que ya no estaba.
 *
 * La publicación se recupera sola de ese caso —si Shopify dice que no existe,
 * la vuelve a crear—, pero esto queda como salida manual: no todos los temas ni
 * todas las versiones devuelven el mismo error, y quedarse encerrado por un
 * mensaje que no encaja con lo esperado es peor que tener un botón de más.
 *
 * **No toca nada en Shopify.** Si la página sigue allí, se quedará; lo único que
 * se pierde es el vínculo, y la siguiente publicación creará otra.
 */
export async function unlinkLandingAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const landingId = readText(raw.id);
  const productId = readText(raw.productId);
  if (!landingId || !productId) throw new Error("Falta la página.");

  const { markLandingPublished } = await import("@/lib/data/landings");
  await markLandingPublished(landingId, null, null);

  revalidatePath(`/products/${productId}`);

  return {
    ok: true,
    message: "Desvinculada. El siguiente «Publicar» creará una página nueva en Shopify.",
  };
}

/**
 * Copiar una página entera: su marcado, su CSS y su reparto.
 *
 * ## En qué se diferencia de calcarla
 *
 * Calcar reutiliza **el texto** y lo reparte en las secciones que la plataforma
 * sabe pintar: sale con nuestros colores, nuestros anchos y nuestros tamaños.
 * Para inspirarse vale; cuando lo que se quiere es *esa* página, no.
 *
 * Aquí se reutiliza el marcado y el CSS de cada sección tal y como están y lo
 * único que cambia es el texto visible. Los colores, los anchos, los tamaños de
 * bloque y las posiciones salen de la referencia porque son literalmente los
 * suyos.
 *
 * ## Sección a sección, y no la página de una vez
 *
 * Una landing larga son cien mil caracteres de marcado. De una vez no cabe en
 * una petición, y aunque cupiera, un fallo a mitad tiraría las secciones que ya
 * estaban bien. Por secciones, cada una es una petición corta, se puede reportar
 * el avance, y la que salga mal se queda con su marcado original en vez de
 * tumbar la página entera.
 *
 * ## Lo que se limpia y lo que se comprueba
 *
 * El marcado viene de la web de otro y se va a servir dentro de una página
 * nuestra: se limpia siempre, con lista de lo permitido. Y se comprueba que lo
 * que devuelve el modelo sigue siendo la misma sección con otro texto — a veces
 * devuelve *su* versión del marcado, que no da error y da una página que ya no
 * se parece a la que se quería copiar.
 */
export async function copyLandingAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const productId = readText(raw.productId);
  const pageUrl = readText(raw.pageUrl);
  /**
   * Empezar de cero: tirar las copias anteriores de esta misma página.
   *
   * La copia **siempre** parte de cero —se descarga sin caché y se guarda en una
   * fila nueva—, así que esto no cambia cómo se copia. Lo que cambia es lo que
   * queda: sin ello, cada intento deja otra copia en la lista y a la cuarta ya
   * no se sabe cuál es la buena. Va como opción y no por defecto porque borrar
   * lo que alguien pudo haber editado a mano no se hace sin pedirlo.
   */
  const fresh = raw.fresh === true;

  if (!productId) throw new Error("Falta el producto.");
  if (!pageUrl) throw new Error("Pega la dirección de la página que quieres copiar.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const { readPageUrl } = await import("@/lib/landing-import");
  const { url, problem } = readPageUrl(pageUrl);
  if (problem) throw new Error(problem);

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const research = await readProductResearch(productId);
  const store = product.storeId ? await findStore(product.storeId) : null;
  const { buildProductContext } = await import("@/lib/copy-prompts");
  const context = buildProductContext(product, research, store);

  return runInBackground({
    productId,
    kind: "landing",
    label: `Copiar página · ${new URL(url).hostname}`,
    revalidate: `/products/${productId}`,
    work: async (report, cancelled) => {
      await report("Descargando la página y separando sus secciones");

      const { readPageForCopy } = await import("@/lib/reference-page");
      const {
        absolutize,
        absolutizeCss,
        autoplayVideos,
        applyTexts,
        batchTexts,
        buildTextPrompt,
        closeOpenTags,
        dropHidingRules,
        extractTexts,
        reveal,
        scopeCss,
        unlazy,
        neutralizeLinks,
        pruneCss,
        sanitizeCss,
        sanitizeHtml,
      } = await import("@/lib/landing-copy-html");

      const page = await readPageForCopy(url);
      const origin = new URL(url).origin;

      // El prefijo de las copias de **esta** página, para no tocar las de otra.
      const oldPrefix = `copia-${new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-")}-`;

      const warnings: string[] = [];
      let inputTokens = 0;
      let outputTokens = 0;

      if (!page.body.trim()) {
        throw new Error(
          "De esa página no salió nada. Puede que la pinte entera el navegador: en ese caso no hay marcado que copiar.",
        );
      }

      /*
       * El cuerpo entero, en un solo paso y en este orden.
       *
       * Cada uno arregla algo que se veía:
       *
       * 1. `unlazy` — el `src` de una imagen no es la imagen: es un hueco, y la
       *    de verdad está en `data-src` esperando a un JavaScript que la copia no
       *    lleva. Y lo mismo en los `<source>` del `<picture>`, que el navegador
       *    prefiere.
       * 2. `absolutize` — `/cdn/shop/x.jpg` servido desde otro dominio se pide a
       *    ese otro dominio y no existe.
       * 3. `reveal` — los constructores dejan cada bloque invisible y su
       *    JavaScript le quita la clase al hacer scroll. Sin esto, la página
       *    entera se queda en `opacity: 0`.
       * 4. `sanitizeHtml` — y aquí se caen los `data-*`, por eso va después.
       * 5. `neutralizeLinks` — que el «Comprar» no lleve a su carrito, sino a
       *    la ficha de este producto si la tiene guardada. Si no la tiene va a
       *    `#`: construir una dirección a partir del nombre se pinta igual de
       *    bien y lleva a un 404.
       * 6. `closeOpenTags` — por si el tope de tamaño cortó algo.
       * 7. `autoplayVideos` — en la original los vídeos cortos arrancan solos y
       *    se repiten, como un GIF; en la copia salían con la barra de controles
       *    y parados, esperando un clic que nadie da.
       *
       * `autoplayVideos` va **al final**, después de limpiar: si fuera antes,
       * `sanitizeHtml` tendría que dejar pasar `autoplay` viniera de donde
       * viniera, y con eso podría colarse un vídeo de la página original que
       * arranca con sonido. Poniéndolo después, el único que decide qué vídeos
       * arrancan solos es este paso.
       */
      await report("Limpiando el marcado");

      const body = autoplayVideos(
        closeOpenTags(
          neutralizeLinks(
            sanitizeHtml(reveal(absolutize(unlazy(page.body), origin))),
            product.landingUrl,
          ).html,
        ),
      );

      /*
       * El texto sale numerado y vuelve numerado a su sitio.
       *
       * Se manda en tandas: una página entera puede llevar mil frases, y mil no
       * caben en una respuesta. Cada tanda es independiente, así que si una falla
       * las demás siguen — y lo que no vuelva se queda en su idioma, que se ve al
       * mirar la página. Un hueco vacío no se ve.
       */
      const texts = extractTexts(body);

      /*
       * En tandas medidas por caracteres, no por número.
       *
       * Lo que no cabe es la **respuesta**, y mide lo que midan los textos. Una
       * página de frases cortas va en dos tandas y una de párrafos largos en
       * ocho, sin que nadie tenga que ajustar nada.
       */
      const batches = batchTexts(texts);
      const adapted: string[] = [];
      let failed = 0;

      /**
       * Adapta una tanda, y si no cabe la parte en dos y lo intenta otra vez.
       *
       * Cuando la respuesta se corta, el fallo no es del texto: es del tamaño. La
       * mitad de una tanda que no cupo casi siempre cabe, y así se salva lo que
       * antes se perdía entero.
       */
      const adapt = async (batch: string[], depth = 0): Promise<string[]> => {
        try {
          const outcome = await generateStructured<{ textos: string[] }>({
            prompt: buildTextPrompt({
              texts: batch,
              context,
              language: `español de ${product.country || "México"}`,
            }),
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["textos"],
              properties: {
                textos: {
                  type: "array",
                  items: { type: "string" },
                  description: "Los mismos textos, en el mismo orden y con el mismo número.",
                },
              },
            },
            role: "copy",
            maxTokens: 16_000,
          });

          inputTokens += outcome.inputTokens;
          outputTokens += outcome.outputTokens;

          const back = outcome.data.textos ?? [];

          // Si volvieron menos de la mitad, casi seguro se cortó: se parte y se
          // reintenta en vez de dar por perdida la tanda.
          if (back.length < batch.length / 2 && batch.length > 1 && depth < 2) {
            const half = Math.ceil(batch.length / 2);

            return [
              ...(await adapt(batch.slice(0, half), depth + 1)),
              ...(await adapt(batch.slice(half), depth + 1)),
            ];
          }

          return batch.map((original, index) => back[index] ?? original);
        } catch (error) {
          if (batch.length > 1 && depth < 2) {
            const half = Math.ceil(batch.length / 2);

            return [
              ...(await adapt(batch.slice(0, half), depth + 1)),
              ...(await adapt(batch.slice(half), depth + 1)),
            ];
          }

          warnings.push(
            `Un texto no se pudo adaptar: ${error instanceof Error ? error.message : "falló"}.`,
          );

          return batch;
        }
      };

      for (const [index, batch] of batches.entries()) {
        if (await cancelled()) {
          /*
           * Cancelar a mitad deja el resto en su idioma, y eso **se dice**.
           *
           * Antes se salía del bucle en silencio: la página se guardaba sin
           * adaptar y con la misma cara que una adaptada. Un fallo mudo que
           * cuesta una copia entera.
           */
          warnings.push(
            `Cancelado: ${texts.length - adapted.length} textos se quedaron en el idioma original.`,
          );

          adapted.push(...batches.slice(index).flat());
          break;
        }

        await report(`Adaptando el texto · tanda ${index + 1} de ${batches.length}`);

        const back = await adapt(batch);

        failed += back.filter((text, at) => text === batch[at]).length;
        adapted.push(...back);
      }

      const out: LandingSection[] = [
        {
          kind: "crudo",
          html: applyTexts(body, adapted),
          /*
           * El CSS entero, atado al contenedor.
           *
           * Sin atarlo repinta **la plataforma**: un `.grid` o un `h2` del tema
           * ajeno cambiando los botones del panel, sin que nada falle y sin
           * ninguna pista de por qué. Y eso incluye lo de dentro de un `@media`,
           * que es donde vive media maqueta.
           */
          /*
             Y podado: lo que se copia no es el CSS de la página, es el del tema
             entero. En una landing de Shopify son unos 350 KB de los que se usan
             unas decenas — el resto viste el carrito, la ficha de producto y
             plantillas que esta página no tiene.

             No es elegancia: **Shopify rechaza un cuerpo de más de 512 KB** y
             entre el marcado y ese CSS se pasa. Medido en trysculptique: 574 KB
             sin podar, 471 con. Se poda contra el marcado ya limpio, que es el
             que de verdad se va a publicar.
          */
          css: scopeCss(
            pruneCss(dropHidingRules(absolutizeCss(sanitizeCss(page.css), origin)), body),
            ".copiado",
          ),
        },
      ];

      /*
       * Las imágenes del original, listadas para poder adaptarlas después.
       *
       * No se generan ni se sustituyen aquí: se guardan sus direcciones para que
       * la pestaña de imágenes las tenga a mano. Adaptarlas al producto propio es
       * otro paso y otra decisión.
       */
      const images = page.images.map((src, index) => ({
        slot: `orig-${index + 1}`,
        purpose: "Imagen de la página original, para adaptarla",
        prompt: "",
        alt: "",
        aspectRatio: "1:1",
        url: absolutizeCss(`url(${src})`, origin).slice(4, -1),
      }));

      await report("Guardando la página");

      /*
       * Se borran **después** de copiar, no antes.
       *
       * Antes dejaría al producto sin ninguna copia si la nueva falla a mitad,
       * y con esto se tarda varios minutos: quedarse sin la que ya funcionaba
       * por un intento que salió mal es la peor forma de perder trabajo.
       */
      const previous = fresh
        ? (await import("@/lib/data/landings").then((m) => m.listLandings(productId))).filter(
            (landing) => landing.slug.startsWith(oldPrefix),
          )
        : [];

      const saved = await saveLanding({
        productId,
        title: `Copia de ${new URL(url).hostname}`,
        slug: `copia-${new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}`,
        shapeId: "copia",
        sections: out,
        imageSlots: images.map((image) => ({
          slot: image.slot,
          purpose: image.purpose,
          // La dirección de la original va en el prompt: es de donde saldrá la
          // adaptación, y el hueco no tiene otro campo para guardarla.
          prompt: image.url,
          alt: image.alt,
          aspectRatio: image.aspectRatio,
        })),
        comments: [],
      });

      revalidatePath(`/products/${productId}`);

      /*
        Ahora sí: la nueva está guardada, así que quitar las viejas ya no puede
        dejar al producto sin ninguna. Un borrado que falle no tira la copia
        buena — se cuenta lo que se quitó y ya.
      */
      let removed = 0;

      if (previous.length > 0) {
        const { deleteLanding } = await import("@/lib/data/landings");

        for (const landing of previous) {
          try {
            await deleteLanding(landing.id);
            removed += 1;
          } catch {
            // Una copia vieja que no se deja borrar no es motivo para fallar.
          }
        }
      }

      return {
        /*
         * El recuento va siempre, salga bien o mal.
         *
         * «Copiada» a secas tiene la misma cara con doscientos textos adaptados
         * que con cero, y cero es lo que pasa cuando la respuesta no cabe. Con el
         * número delante, una copia sin adaptar se ve sin abrirla.
         */
        summary: [
          `Copiada ${new URL(url).hostname}: ${texts.length - failed} de ${texts.length} textos adaptados`,
          failed > 0 ? ` (${failed} se quedaron en el idioma original)` : "",
          `, ${images.length} imágenes y vídeos recogidos.`,
          removed > 0 ? ` Se quitaron ${removed} copias anteriores de esta página.` : "",
          warnings.length > 0 ? ` ${warnings.length} aviso(s).` : "",
          " Los archivos siguen siendo los suyos: adáptalos antes de publicar.",
        ].join(""),
        result: { landingId: saved.id, warnings },
        inputTokens,
        outputTokens,
      };
    },
  });
}
