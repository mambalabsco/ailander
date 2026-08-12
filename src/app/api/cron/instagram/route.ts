import { NextResponse } from "next/server";

import { decide, horaProgramada } from "@/lib/instagram/autopilot";
import { esPermanente } from "@/lib/instagram/errors";
import { publishNow } from "@/lib/instagram/publish";
import {
  anotarFallo,
  type AutopilotRow,
  cerrarPublicacion,
  contarUltimas24h,
  limpiarFallos,
  listarActivos,
  listasDe,
  listasSinMedia,
  programar,
  reservarVencida,
  tokenDePublicacion,
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

  return NextResponse.json({ ok: true, parte });
}

/** Publica la pieza vencida más atrasada de este producto. */
async function publicarUna(row: AutopilotRow, parte: string[]): Promise<void> {
  const pieza = await reservarVencida(row);

  if (!pieza) return;

  try {
    const token = await tokenDePublicacion(row.userId);

    const instagramId = await publishNow(
      { igUserId: row.igUserId, token },
      {
        mediaUrl: pieza.mediaUrl,
        caption: pieza.caption,
        kind: pieza.mediaKind,
        isStory: pieza.format === "historia",
      },
    );

    await cerrarPublicacion(pieza.id, row.workspaceId, {
      instagramId,
      igUserId: row.igUserId,
    });

    await limpiarFallos(row.productId, new Date().toISOString());

    parte.push(`${row.productId}: publicada ${instagramId}.`);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "falló sin motivo";

    // La pieza vuelve a «aprobado» con su error: no salió esta vez, no está mal.
    await cerrarPublicacion(pieza.id, row.workspaceId, { error: motivo });
    await anotarFallo(row.productId, motivo, esPermanente(error));

    parte.push(`${row.productId}: no salió — ${motivo}`);
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

  const sinMedia = (await listasSinMedia(row)).slice(0, cuantas);
  const base = new Date();

  for (const [index, pieza] of sinMedia.entries()) {
    if (pieza.mediaKind === "video") {
      parte.push(`${row.productId}: ${pieza.id} espera vídeo, que no se genera solo.`);
      continue;
    }

    const media = await generatePostMediaAction({ id: pieza.id, productId: row.productId });

    if (!media.ok) {
      // No pausa el piloto: no publicar hoy es peor que gastar dos veces en una
      // imagen. La vuelta siguiente lo reintenta.
      parte.push(`${row.productId}: sin imagen para ${pieza.id} — ${media.message}`);
      continue;
    }

    await programar(
      pieza.id,
      row.workspaceId,
      horaProgramada(base, yaHay + index + 1, row.horaDesde, row.horaHasta, pieza.id),
    );

    parte.push(`${row.productId}: ${pieza.id} lista y programada.`);
  }
}
