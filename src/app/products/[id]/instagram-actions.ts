"use server";

import { revalidatePath } from "next/cache";
import { generateStructured } from "@/lib/generators";
import { INSTAGRAM_POSTS_SCHEMA } from "@/lib/generation-schemas";
import { findProductAnywhere } from "@/lib/products";
import { readProductResearch } from "@/lib/research-store";
import { addPosts, deletePost, listPosts, updatePost } from "@/lib/data/instagram";
import { buildCaption, buildContentPrompt, buildFocusNote, findFormat } from "@/lib/instagram/content";
import { countsFor, recentSummary, weekPlan } from "@/lib/instagram/plan";
import { buildHookGuide, pickArchetypes } from "@/lib/instagram/hooks";
import { isRepeat } from "@/lib/instagram/duplicates";
import { mostRecent } from "@/lib/instagram/recency";

const readText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Escribe publicaciones y las deja en la cola, en borrador.
 *
 * La media no se genera aquí: cada pieza guarda **qué se ve**, y generarla es
 * otro paso y otro gasto. Escribir diez pies cuesta céntimos; diez vídeos, no —
 * y lo normal es descartar la mitad al leerlos.
 */
export async function generateInstagramAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const format = findFormat(readText(raw.format));
  const count = Math.min(Math.max(Number(raw.count) || 3, 1), 10);
  /*
   * Aprobar al crear, para que salga sin que nadie lo mire.
   *
   * Va como opción y no por defecto: quien lo enciende está aceptando que el
   * texto y la imagen que salgan a la cuenta de la marca no los va a leer
   * nadie. Es una decisión legítima —el agente escribe bien y el ritmo importa
   * más que la perfección— pero tiene que tomarse a propósito, no heredarse.
   */
  const auto = raw.auto === true;

  /*
   * El enfoque, tal como llegó.
   *
   * Se declaraba en la herramienta del agente y se tiraba aquí: el agente
   * contestaba «he insistido en el sueño» y escribía lo de siempre. Un fallo
   * que no da error es el que más tarda en encontrarse.
   */
  const focus = readText(raw.focus);

  if (!productId) return { ok: false, message: "Falta el producto." };

  try {
    const product = await findProductAnywhere(productId);
    if (!product) return { ok: false, message: "Ese producto ya no existe." };

    const research = await readProductResearch(productId).catch(() => null);

    const context = [
      product.description ? `Producto: ${product.description}` : "",
      product.benefits.length > 0 ? `Beneficios: ${product.benefits.join(", ")}` : "",
      research?.master ? `Le duele: ${research.master.psychographics.painPoints.join("; ")}` : "",
      research?.master ? `Habla así: ${research.master.psychographics.languageToUse.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4_000);

    /*
     * Lo que ya se publicó entra en el encargo.
     *
     * Es lo que separa un generador de un community manager: sin esto, cada
     * tanda empieza de cero y a la tercera ha escrito tres veces la misma
     * publicación con otras palabras. Va en el **prompt** y no en el contexto
     * cacheado a propósito: cambia en cada tanda, y metido en el prefijo
     * rompería la caché de todas.
     */
    const anteriores = await listPosts(productId).catch(() => []);

    /*
     * Las últimas quince, y las mismas para el encargo y para el filtro duro.
     *
     * El filtro comparaba contra **todo** el historial. Según crece, cualquier
     * gancho se parece a alguno de doscientos: suben los falsos positivos,
     * `saved` cae a cero, `escribir` no baja nunca y el cron llama al modelo
     * cada cinco minutos —del orden de mil veces al día— mientras la cola se
     * vacía y la cuenta se queda muda. El único rastro es una línea en el
     * parte. Quince es lo que dice el diseño y lo que ya usa `recentSummary`:
     * más atrás no es repetirse, es tener una línea.
     *
     * Por eso importa el **orden** con el que se recortan esas quince.
     * `anteriores` sale de `listPosts`, que ordena por `scheduled_at`
     * ascendente —lo próximo primero, para la pantalla de la cola— y no por
     * cuándo se escribió cada pieza. Recortando ese mismo orden con
     * `.slice(0, 15)` se cogen las quince con la fecha de publicación más
     * próxima, que con más de quince piezas en la cuenta son las más
     * **antiguas** en la práctica: una pieza publicada hace medio año
     * conserva un `scheduled_at` pequeño y se cuela delante de la que se
     * escribió ayer y todavía no tiene hora. El filtro duro —`isRepeat`, más
     * abajo— acabaría comparando el gancho recién escrito contra el del año
     * pasado y dejándolo pasar sin avisar: justo lo contrario de para lo que
     * existe. `mostRecent` ordena una copia por recencia antes de recortar,
     * sin tocar el orden que usa la pantalla de la cola.
     */
    const ultimas = mostRecent(anteriores, 15);

    const memoria = recentSummary(
      ultimas.map((one) => ({
        format: one.format,
        scene: one.scene,
        // El pie completo no: lo que hay que no repetir es el gancho, y es lo
        // primero que se lee de él.
        first: one.caption.split("\n")[0] ?? "",
        showsProduct: one.showsProduct,
      })),
    );

    const written = await generateStructured<{
      posts: {
        first: string;
        body: string;
        scene: string;
        showsProduct: boolean;
        media: string;
        hashtags: string[];
      }[];
    }>({
      /*
       * El contexto va por el camino de la caché.
       *
       * Es lo mismo en todas las tandas de este producto, y pedir tres formatos
       * distintos son tres llamadas con el mismo principio.
       */
      context: context || undefined,
      prompt: [
        buildContentPrompt({
          format,
          productName: product.name,
          audience: product.targetAudience || "el público objetivo",
          country: product.country || "México",
          count,
        }),
        memoria,
        buildFocusNote(focus),
        /*
         * Una fórmula distinta por pieza, y siguiendo donde se quedó.
         *
         * Sin esto el modelo repite la forma que le funcionó en la primera —lo
         * mismo que pasaba con los formatos— y diez publicaciones acaban
         * empezando igual aunque hablen de cosas distintas.
         */
        buildHookGuide(pickArchetypes(count, anteriores.length)),
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: INSTAGRAM_POSTS_SCHEMA,
      role: "copy",
      maxTokens: 8_000,
    });

    const escritas = (written.data.posts ?? [])
      .map((one) => ({
        format: format.id,
        caption: buildCaption({
          text: [one.first?.trim(), one.body?.trim()].filter(Boolean).join("\n\n"),
          hashtags: one.hashtags ?? [],
        }),
        hashtags: one.hashtags ?? [],
        scene: one.scene ?? "",
        showsProduct: one.showsProduct === true,
        mediaKind: one.media === "video" ? "video" : "imagen",
      }))
      .filter((one) => one.caption.trim());

    /*
     * El filtro duro contra repetirse.
     *
     * `recentSummary` ya se lo pidió en el encargo, y funciona las primeras
     * veces: sobre la décima el modelo vuelve a la forma que le sale bien. Una
     * petición se puede desoír; esto no.
     *
     * Se compara también contra lo que lleva escrito **en esta misma tanda**,
     * no solo contra la base: pedir cinco de golpe y que dos sean la misma es
     * justo el caso que más se da.
     */
    const ganchosPrevios = ultimas.map((one) => one.caption.split("\n")[0] ?? "");
    const posts: typeof escritas = [];
    let repetidas = 0;

    for (const una of escritas) {
      const gancho = una.caption.split("\n")[0] ?? "";

      if (isRepeat(gancho, ganchosPrevios)) {
        repetidas += 1;
        continue;
      }

      ganchosPrevios.push(gancho);
      posts.push(una);
    }

    const saved = await addPosts(productId, posts, auto);

    revalidatePath(`/products/${productId}`);

    /*
     * Las descartadas se cuentan en voz alta.
     *
     * Pedir cinco y recibir tres sin explicación parece un fallo. Diciéndolo, es
     * información: el modelo se está repitiendo y quizá haga falta cambiar el
     * enfoque en vez de pedir más.
     */
    const nota = repetidas > 0 ? ` ${repetidas} descartada(s) por repetir un gancho ya usado.` : "";

    return saved > 0
      ? {
          ok: true,
          message:
            (auto
              ? `${saved} publicación(es) aprobadas. Saldrán sin que nadie las lea.`
              : `${saved} publicación(es) en borrador. Revísalas antes de programar.`) + nota,
        }
      : {
          ok: false,
          message:
            repetidas > 0
              ? `Las ${repetidas} que escribió repetían ganchos ya usados. Prueba con otro enfoque.`
              : "No devolvió ninguna publicación usable.",
        };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function updateInstagramPostAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await updatePost(readText(raw.id), {
      ...(raw.caption !== undefined ? { caption: readText(raw.caption) } : {}),
      ...(raw.scheduledAt !== undefined ? { scheduledAt: readText(raw.scheduledAt) || null } : {}),
      ...(raw.status !== undefined ? { status: readText(raw.status) } : {}),
    });

    revalidatePath(`/products/${readText(raw.productId)}`);

    return { ok: true, message: "Guardado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function deleteInstagramPostAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await deletePost(readText(raw.id));
    revalidatePath(`/products/${readText(raw.productId)}`);

    return { ok: true, message: "Borrada." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

/**
 * Genera la imagen de **esa** publicación y la deja atada a ella.
 *
 * ## Por qué se guarda en la fila y no en la galería
 *
 * Porque una imagen suelta en el montón no dice a qué pie acompaña. Con dos
 * piezas se recuerda; con veinte no, y entonces hay que emparejarlas a mano
 * justo cuando toca publicar. Guardando la dirección en la fila, la pieza está
 * completa o no está.
 *
 * ## Y por qué usa la foto real del producto
 *
 * Porque sin ella el modelo se inventa el envase, y un envase inventado en la
 * cuenta de la marca es peor que no publicar: quien lo vea y luego reciba el
 * producto verá que no es el mismo.
 */
export async function generatePostMediaAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const id = readText(raw.id);
  const productId = readText(raw.productId);

  if (!id || !productId) return { ok: false, message: "Falta la publicación." };

  try {
    const { listPosts, updatePostMedia } = await import("@/lib/data/instagram");
    const post = (await listPosts(productId)).find((one) => one.id === id);

    if (!post) return { ok: false, message: "Esa publicación ya no existe." };
    if (!post.scene) return { ok: false, message: "Esta publicación no dice qué se ve." };

    const { findFormat } = await import("@/lib/instagram/content");
    const { generateWithCli, listCliModels } = await import("@/lib/higgsfield-cli");
    const { pickImageModel } = await import("@/lib/image-adapt");
    const { readPrimaryImage } = await import("@/lib/image-store");

    const model = pickImageModel((await listCliModels("image")).map((one) => one.slug));
    if (!model) {
      return {
        ok: false,
        message: "El CLI de Higgsfield no ofrece ningún modelo de imagen. Revisa la sesión en Estudio.",
      };
    }

    /*
     * La foto del producto **solo si el producto sale**.
     *
     * Pasándola siempre, el envase se cuela en todas las publicaciones y la
     * cuenta entera parece un catálogo. En la mayoría de las piezas lo que sale
     * es la persona, el momento o el problema — y ahí la foto del bote no
     * ayuda: estorba.
     *
     * Cuando sí sale, es imprescindible: sin ella el modelo se inventa el
     * envase, y quien lo vea y luego reciba el producto verá que no es el mismo.
     */
    const primary = post.showsProduct ? await readPrimaryImage(productId).catch(() => null) : null;
    const references: { filename: string; bytes: Uint8Array }[] = [];

    if (primary?.url) {
      const response = await fetch(primary.url, { cache: "no-store" }).catch(() => null);

      if (response?.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > 0) references.push({ filename: "producto.png", bytes });
      }
    }

    const generated = await generateWithCli({
      model,
      prompt: post.scene,
      aspectRatio: findFormat(post.format).aspectRatio,
      references,
    });

    const url = generated.imageUrls[0];
    if (!url) return { ok: false, message: "No devolvió ninguna imagen." };

    /*
     * La proporción, comprobada aquí y no por Meta.
     *
     * Meta acepta el contenedor, se pone a procesarlo y falla **dentro**, con un
     * estado de error cuyo mensaje no dice que el problema era la proporción.
     * Para entonces la pieza ya está marcada como «publicando» y hay que
     * rescatarla a mano.
     *
     * Si no se puede medir la imagen se deja pasar: quedarse sin publicar por no
     * haber podido descargarla es peor que arriesgarse a que Meta la rechace.
     *
     * «No se puede medir» son las dos cosas, no solo la descarga: si `sharp`
     * lanza al leer los bytes —un formato que no conoce, un archivo a medias—
     * antes se rechazaba la pieza, que es lo contrario del principio escrito. Y
     * con el tope de intentos, una pieza así se quedaba sin imagen para siempre
     * por un fallo del medidor, no de la imagen.
     */
    const { checkAspect } = await import("@/lib/instagram/aspect");
    const sharp = (await import("sharp")).default;

    const bytes = await fetch(url, { cache: "no-store" })
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null);

    const medida = bytes
      ? await sharp(Buffer.from(bytes))
          .metadata()
          .catch(() => null)
      : null;

    if (medida?.width && medida.height) {
      const proporcion = checkAspect(medida.width, medida.height, post.format);

      if (!proporcion.ok) {
        return {
          ok: false,
          message: `${proporcion.reason} Vuelve a generarla: guardada, fallaría al publicar.`,
        };
      }
    }

    await updatePostMedia(id, url);
    revalidatePath(`/products/${productId}`);

    return {
      ok: true,
      message:
        !post.showsProduct
          ? "Imagen lista. En esta pieza el producto no sale, y es a propósito."
          : references.length > 0
            ? "Imagen lista, con la foto del producto de referencia."
            : "Imagen lista, pero sin la foto del producto: revisa que el envase se parezca.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

/**
 * Planifica una semana entera: qué formato cada día y a qué hora.
 *
 * ## Por qué el reparto y no «dame siete»
 *
 * Porque siete piezas sin reparto salen casi todas del mismo formato —el modelo
 * repite el que le funcionó en la primera— y una cuenta con cinco reels
 * seguidos y luego cuatro días en blanco parece abandonada aunque publique lo
 * mismo. El ritmo se decide antes de escribir.
 *
 * ## Y por qué queda en borrador con fecha
 *
 * Porque planificar no es aprobar. Sale el calendario entero para poder mirarlo
 * de una vez —que es cuando se ve si la semana tiene sentido— y cada pieza se
 * aprueba después, una a una.
 */
export async function planWeekAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const days = Math.min(Math.max(Number(raw.days) || 7, 1), 14);
  const hour = Math.min(Math.max(Number(raw.hour) || 19, 0), 23);
  const auto = raw.auto === true;

  if (!productId) return { ok: false, message: "Falta el producto." };

  try {
    /*
     * El plan continúa donde se quedó el anterior.
     *
     * Empezando siempre por el mismo formato, dos semanas seguidas arrancan
     * igual y el patrón se nota a la tercera.
     */
    const yaHay = (await listPosts(productId).catch(() => [])).length;
    const plan = weekPlan(days, yaHay);

    const { updatePost } = await import("@/lib/data/instagram");

    let puestas = 0;
    const fallos: string[] = [];

    for (const { format, count } of countsFor(plan)) {
      const result = await generateInstagramAction({ productId, format, count, auto });

      if (!result.ok) {
        fallos.push(`${format}: ${result.message}`);
        continue;
      }

      puestas += count;
    }

    /*
     * Las fechas se ponen después, sobre lo que quedó sin programar.
     *
     * Repartir a ciegas pondría fecha a piezas que no llegaron a crearse si una
     * tanda falló, y el calendario diría que hay siete cuando hay cuatro.
     */
    const sinFecha = (await listPosts(productId)).filter(
      (one) => !one.scheduledAt && (one.status === "borrador" || one.status === "aprobado"),
    );

    const hoy = new Date();

    for (const [index, post] of sinFecha.slice(0, days).entries()) {
      const cuando = new Date(hoy);
      cuando.setDate(hoy.getDate() + index + 1);
      cuando.setHours(hour, 0, 0, 0);

      await updatePost(post.id, { scheduledAt: cuando.toISOString() });
    }

    revalidatePath(`/products/${productId}`);

    return {
      ok: puestas > 0,
      message: [
        `${Math.min(sinFecha.length, days)} publicación(es) programadas, una al día a las ${hour}:00.`,
        ` Reparto: ${plan.join(", ")}.`,
        fallos.length > 0 ? ` No salieron: ${fallos.join("; ")}.` : "",
        auto ? " Aprobadas: saldrán solas." : " Quedan en borrador: apruébalas una a una.",
      ].join(""),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}
