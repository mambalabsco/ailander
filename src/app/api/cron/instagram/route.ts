import { NextResponse } from "next/server";

import {
  cabenPorDia,
  decide,
  horaProgramada,
  SEPARACION_MINUTOS,
  TOPE_INTENTOS_MEDIA,
} from "@/lib/instagram/autopilot";
import { esPermanente } from "@/lib/instagram/errors";
import { publishNow } from "@/lib/instagram/publish";
import {
  anotarFallo,
  anotarIntentoMedia,
  type AutopilotRow,
  cerrarPublicacion,
  contarEsperandoVideo,
  contarSinImagen,
  contarUltimas24h,
  limpiarFallos,
  listarActivos,
  listasDe,
  listasSinMedia,
  programar,
  reservarVencida,
  soltarVuelta,
  tokenDePublicacion,
  tomarVuelta,
  ultimaPublicacion,
} from "@/lib/data/instagram-service";

/**
 * La vuelta del autopiloto.
 *
 * ## Por qué una publicación por vuelta y no un lote
 *
 * Porque publicar tarda: crear el contenedor, esperar el procesado —un vídeo
 * puede tardar minutos— y publicar. Un lote de cinco tiene la ruta abierta
 * demasiado tiempo, y si el servidor la corta a mitad quedan filas marcadas como
 * «publicando» sin nada publicado. Con el cron cada cinco minutos hay 288
 * oportunidades al día: doce veces el tope de la API.
 *
 * ## Por qué publicar antes que rellenar
 *
 * Porque publicar es lo que tiene hora. Si la vuelta se queda sin tiempo, lo que
 * se pierde es el relleno, y el relleno espera cinco minutos sin que se note.
 *
 * ## Por qué una vuelta a la vez, y no dos
 *
 * Porque el tope de 24h y la última publicación se leen **al empezar** cada
 * producto y no se vuelven a mirar al reservar. La reserva de `instagram_posts`
 * protege una fila de salir dos veces; no protege a la cuenta de que dos
 * vueltas solapadas publiquen dos piezas **distintas** con segundos de
 * diferencia, saltándose los 90 minutos y sumando las dos contra el tope del
 * día. En cuanto el relleno funcione, una vuelta durará minutos y el
 * solapamiento será lo normal, no la excepción.
 */
export async function GET(request: Request): Promise<Response> {
  const secreto = process.env.CRON_SECRET?.trim();

  if (!secreto) {
    return NextResponse.json(
      { ok: false, parte: ["Falta CRON_SECRET: el autopiloto no arranca sin él."] },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    // Sin detalle: una respuesta que explique qué falta es un mapa para quien
    // esté probando.
    return NextResponse.json({ ok: false, parte: [] }, { status: 401 });
  }

  const parte: string[] = [];

  const token = await tomarVuelta();

  if (!token) {
    /*
     * Otra vuelta está dentro: esta se va sin tocar nada.
     *
     * No es un error y no se cuenta como tal. Con el cron cada cinco minutos
     * hay 288 oportunidades al día: saltarse una no retrasa nada, y entrar a la
     * vez sí publica de más.
     */
    return NextResponse.json({
      ok: true,
      parte: ["Hay otra vuelta del autopiloto en curso. Esta se salta."],
    });
  }

  try {
    await darLaVuelta(parte);
  } finally {
    try {
      await soltarVuelta(token);
    } catch (error) {
      // Se dice, no se traga: un arriendo que no se suelta deja al autopiloto
      // callado media hora, hasta que el plazo lo rescate.
      parte.push(
        `No se pudo soltar el arriendo: ${error instanceof Error ? error.message : "sin motivo"}.`,
      );
    }
  }

  return NextResponse.json({ ok: true, parte });
}

/** El trabajo de la vuelta, ya con el turno tomado. */
async function darLaVuelta(parte: string[]): Promise<void> {
  for (const row of await listarActivos()) {
    try {
      const [publicadas, ultima, listas] = await Promise.all([
        contarUltimas24h(row.igUserId),
        ultimaPublicacion(row.igUserId),
        listasDe(row.productId, row.workspaceId),
      ]);

      const decision = decide({
        ahora: new Date().toISOString(),
        porDia: row.porDia,
        colchonDias: row.colchonDias,
        horaDesde: row.horaDesde,
        horaHasta: row.horaHasta,
        publicadasUltimas24h: publicadas,
        ultimaPublicacionAt: ultima,
        listas,
      });

      if (decision.publicar) {
        await publicarUna(row, parte);
      } else if (decision.motivo) {
        parte.push(`${row.productId}: ${decision.motivo}`);
      }

      if (decision.escribir > 0) {
        await rellenar(row, decision.escribir, listas.length, parte);
      }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : "falló sin motivo";

      await anotarFallo(row.productId, motivo, esPermanente(error));
      parte.push(`${row.productId}: ${motivo}`);
    }
  }
}

/**
 * Publica la pieza vencida más atrasada de este producto.
 *
 * ## Por qué el `try` que revierte no llega hasta el final
 *
 * Solo cubre lo que de verdad se puede deshacer: pedir el token y llamar a
 * Instagram. Si cualquiera de esas dos falla, no se ha publicado nada de
 * verdad y la pieza puede volver a «aprobado» sin coste.
 *
 * En cuanto `publishNow` devuelve un id, la publicación **ya existe en
 * Instagram** y nada de lo que pase después —que `cerrarPublicacion` falle,
 * que `limpiarFallos` falle— puede deshacer eso. Antes, esas dos llamadas
 * vivían dentro del mismo `try`: si `limpiarFallos` lanzaba, el `catch`
 * volvía a poner la pieza en «aprobado» con `claimed_at: null` — una pieza ya
 * publicada, con su `instagram_id` y su `scheduled_at` vencido intactos, lista
 * para que la vuelta siguiente la reservara y la publicara **otra vez**.
 */
async function publicarUna(row: AutopilotRow, parte: string[]): Promise<void> {
  const pieza = await reservarVencida(row);

  if (!pieza) return;

  let instagramId: string;

  try {
    const token = await tokenDePublicacion(row.workspaceId);

    instagramId = await publishNow(
      { igUserId: row.igUserId, token },
      {
        mediaUrl: pieza.mediaUrl,
        caption: pieza.caption,
        kind: pieza.mediaKind,
        isStory: pieza.format === "historia",
      },
    );
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "falló sin motivo";

    // Nada se publicó todavía: la pieza vuelve a «aprobado» con su error, no
    // salió esta vez, no está mal.
    await cerrarPublicacion(pieza.id, row.workspaceId, { error: motivo });
    await anotarFallo(row.productId, motivo, esPermanente(error));

    parte.push(`${row.productId}: no salió — ${motivo}`);
    return;
  }

  try {
    await cerrarPublicacion(pieza.id, row.workspaceId, { instagramId, igUserId: row.igUserId });
    await limpiarFallos(row.productId, new Date().toISOString());

    parte.push(`${row.productId}: publicada ${instagramId}.`);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "falló sin motivo";

    /*
     * Ya está en Instagram: no se revierte ni se anota como fallo del
     * autopiloto (eso pausaría una cuenta que sí publicó). Si quien lanzó fue
     * `cerrarPublicacion`, la fila queda en «publicando» con el filtro de
     * estado que ahora exige esa función, y el rescate de los 30 minutos la
     * reservará de nuevo — republicándola en Instagram de verdad, porque la
     * base no tiene forma de saber que ya salió. Es un defecto conocido y
     * deliberadamente sin resolver aquí: arreglarlo exige guardar el
     * resultado de Instagram en otro sitio antes de intentar cerrar, y eso es
     * más alcance del que pide este arreglo.
     */
    parte.push(`${row.productId}: publicada ${instagramId} pero no se pudo cerrar — ${motivo}`);
  }
}

/**
 * Rellena el colchón: escribe, genera la imagen y pone hora.
 *
 * ## Por qué no pasa por el bucle de conversación del agente
 *
 * Porque el bucle de herramientas existe para que una persona pueda pedir cosas
 * en lenguaje suelto. Un cron ya sabe lo que quiere: meterlo por ahí añade seis
 * vueltas de modelo, su coste y una forma nueva de fallar, y no gana nada.
 *
 * ## Por qué las de vídeo se escriben pero no cuentan
 *
 * Porque el vídeo no se genera solo todavía. Si contaran para el colchón, tres
 * reels sin vídeo lo llenarían y la cuenta dejaría de publicar creyendo que va
 * sobrada — sin dar ningún error.
 */
async function rellenar(
  row: AutopilotRow,
  cuantas: number,
  yaHay: number,
  parte: string[],
): Promise<void> {
  const { generateInstagramAction, generatePostMediaAction } = await import(
    "@/app/products/[id]/instagram-actions"
  );

  /*
   * El reparto de formatos, con el que ya existe.
   *
   * Pidiendo siempre «feed» la cuenta publicaría la misma forma todos los días
   * y no saldría un solo reel — que es lo único que alcanza a quien no te sigue.
   * `weekPlan` ya sabe repartir y continuar donde se quedó: reescribirlo aquí
   * sería tener dos repartos que se separan a la primera corrección.
   */
  const { countsFor, weekPlan } = await import("@/lib/instagram/plan");

  for (const { format, count } of countsFor(weekPlan(cuantas, yaHay))) {
    const escrito = await generateInstagramAction({
      productId: row.productId,
      format,
      count,
      auto: true,
    });

    if (!escrito.ok) {
      // Que falle un formato no deja sin escribir a los demás: media semana es
      // mejor que ninguna.
      parte.push(`${row.productId}: no se pudo escribir ${format} — ${escrito.message}`);
    }
  }

  /*
   * `listasSinMedia` ya deja fuera las de vídeo — si no lo hiciera, ocuparían
   * para siempre las primeras posiciones de `slice(0, cuantas)` y ninguna
   * imagen llegaría a generarse detrás. Se cuentan aparte para poder avisar
   * sin bloquear la cola.
   */
  const [sinMedia, esperandoVideo, atascadas] = await Promise.all([
    listasSinMedia(row).then((rows) => rows.slice(0, cuantas)),
    contarEsperandoVideo(row),
    contarSinImagen(row),
  ]);

  if (esperandoVideo > 0) {
    parte.push(
      `${row.productId}: ${esperandoVideo} pieza(s) esperando vídeo, que no se genera solo.`,
    );
  }

  /*
   * Lo que ya no se reintenta se dice en cada vuelta.
   *
   * Callarlo lo convertiría en lo de siempre: una pieza aprobada, sin imagen y
   * sin fecha que nadie va a publicar y que nadie sabe que está ahí. Cada una
   * lleva además su motivo escrito en la cola.
   */
  if (atascadas > 0) {
    parte.push(
      `${row.productId}: ${atascadas} pieza(s) sin imagen tras ${TOPE_INTENTOS_MEDIA} intentos.` +
        " No se reintentan: míralas en la cola.",
    );
  }

  const base = new Date();

  /*
   * Si la ventana no da para las `por_dia` pedidas, se dice.
   *
   * El reparto no las apila: estira a más días. Pero callándolo, quien puso
   * cinco al día en una franja de cuatro horas seguiría creyendo que publica
   * cinco al día, y la cuenta publicaría tres.
   */
  const caben = cabenPorDia(row.horaDesde, row.horaHasta);

  if (caben < row.porDia) {
    parte.push(
      `${row.productId}: entre las ${row.horaDesde} y las ${row.horaHasta} de ${row.zonaHoraria}` +
        ` solo caben ${caben} al día` +
        ` con ${SEPARACION_MINUTOS} minutos entre ellas. Las ${row.porDia} pedidas se reparten en más días.`,
    );
  }

  /*
   * El hueco lo lleva la cuenta de las colocadas, no el índice del bucle.
   *
   * Con el índice, una pieza cuya imagen falla se llevaría su hueco por
   * delante: el reparto dejaría un agujero en el calendario y las siguientes
   * saldrían a destiempo sin que nada lo dijera.
   */
  let colocadas = 0;

  for (const pieza of sinMedia) {
    const media = await generatePostMediaAction({ id: pieza.id, productId: row.productId });

    if (!media.ok) {
      /*
       * No pausa el piloto —no publicar hoy es peor que gastar dos veces en una
       * imagen— pero sí se cuenta. Sin la cuenta, una pieza que falla siempre
       * se regenera 288 veces al día, cada una pagada, y el parte repite la
       * misma línea sin que nada indique que ya es la número cuatrocientas.
       */
      const intentos = await anotarIntentoMedia(row, pieza.id, media.message);

      parte.push(
        `${row.productId}: sin imagen para ${pieza.id} (intento ${intentos}` +
          ` de ${TOPE_INTENTOS_MEDIA}) — ${media.message}`,
      );
      continue;
    }

    await programar(
      pieza.id,
      row.workspaceId,
      horaProgramada({
        base,
        hueco: yaHay + colocadas,
        porDia: row.porDia,
        horaDesde: row.horaDesde,
        horaHasta: row.horaHasta,
        zonaHoraria: row.zonaHoraria,
        semilla: pieza.id,
      }),
    );

    colocadas += 1;
    parte.push(`${row.productId}: ${pieza.id} lista y programada.`);
  }
}
