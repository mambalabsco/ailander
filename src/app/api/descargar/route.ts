import { NextResponse } from "next/server";
import { requireContext } from "@/lib/supabase/session";
import { allowedHost, fileNameFor } from "@/lib/download";

/**
 * Descarga un archivo generado, con nombre y como descarga de verdad.
 *
 * ## Por qué hace falta un intermediario
 *
 * Los archivos viven en los proveedores —fal, kie, Supabase— y desde otro
 * dominio el atributo `download` de un enlace **no hace nada**: el navegador lo
 * ignora por seguridad y abre el vídeo en una pestaña. Quien quiere el archivo
 * acaba haciendo clic derecho y guardando con un nombre como
 * `a3f9b2c1-4d5e.mp4`.
 *
 * Pasando por aquí se puede poner `Content-Disposition` y un nombre que diga qué
 * es.
 *
 * ## Y por qué solo unos dominios
 *
 * Porque esto es una petición que hace **el servidor** con una dirección que
 * viene del navegador. Sin lista blanca, cualquiera podría pedirle que se
 * conecte a donde quisiera —incluida la red interna del propio servidor— y
 * usarlo para mirar lo que desde fuera no se ve.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Solo quien ha entrado. Sin esto, el intermediario queda abierto a cualquiera.
  await requireContext();

  const url = new URL(request.url).searchParams.get("url") ?? "";

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Esa dirección no vale." }, { status: 400 });
  }

  if (target.protocol !== "https:") {
    return NextResponse.json({ error: "Solo se descarga por HTTPS." }, { status: 400 });
  }

  if (!allowedHost(target.hostname)) {
    return NextResponse.json(
      { error: `No se descarga de ${target.hostname}: no es uno de los proveedores.` },
      { status: 400 },
    );
  }

  const upstream = await fetch(target, { cache: "no-store" });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `El proveedor respondió ${upstream.status}.` },
      { status: 502 },
    );
  }

  const type = upstream.headers.get("content-type") ?? "application/octet-stream";
  const name = fileNameFor(target.pathname, type);

  /*
   * Se reenvía el cuerpo tal cual, sin leerlo entero en memoria.
   *
   * Un vídeo de un minuto son decenas de megas y el servidor tiene cuatro
   * gigas: cargarlo en memoria para reenviarlo es la forma de tumbarlo con dos
   * descargas a la vez.
   */
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length")! }
        : {}),
    },
  });
}
