/**
 * De dónde se puede descargar y con qué nombre.
 *
 * Sin imports, probado en `download.test.ts`.
 *
 * ## Por qué la lista blanca no es una precaución de más
 *
 * El intermediario de descarga hace una petición **desde el servidor** con una
 * dirección que llega del navegador. Sin lista, alguien podría pedirle que se
 * conecte a donde quisiera: a `localhost`, a la red interna del proveedor de
 * nube, a los metadatos de la máquina. El servidor sí llega a sitios a los que
 * nadie llega desde fuera, y eso convierte una descarga en una ventana.
 *
 * Por eso se comprueba el dominio y no el protocolo o la forma: una dirección
 * puede parecer inofensiva y resolver a una interna.
 */

/**
 * Los dominios de los que sale lo que esta plataforma genera.
 *
 * Se comparan por sufijo con un punto delante para que `malicioso-fal.media` no
 * cuele: sin el punto, «acaba en fal.media» lo cumple cualquier dominio que
 * termine con esas letras.
 */
const HOSTS = [
  "fal.media",
  "fal.run",
  "fal.ai",
  "kie.ai",
  "aiquickdraw.com",
  "supabase.co",
  "supabase.in",
  "higgsfield.ai",
  "cloudfront.net",
  "amazonaws.com",
  "googleapis.com",
  "cdn.shopify.com",
];

export function allowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  return HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/**
 * Un nombre que diga qué es.
 *
 * Se prefiere el del archivo original cuando trae uno legible; si es un
 * identificador de treinta letras, se compone uno con el tipo. Guardar
 * `a3f9b2c1-4d5e-11ef.mp4` en la carpeta de descargas es no encontrarlo nunca.
 *
 * **El nombre se limpia siempre.** Va dentro de una cabecera entre comillas: una
 * comilla o un salto de línea dentro lo partirían, y eso es una cabecera
 * inyectada, no un nombre feo.
 */
export function fileNameFor(pathname: string, contentType: string): string {
  const extension = EXTENSIONS[contentType.split(";")[0].trim()] ?? "";

  const raw = decodeURIComponent(pathname.split("/").pop() ?? "");
  const clean = raw.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");

  const stem = clean.replace(/\.[^.]+$/, "");

  // Un nombre que es solo un identificador no ayuda a encontrarlo después.
  const useful = stem.length > 3 && !/^[0-9a-f-]{16,}$/i.test(stem);

  const base = useful ? stem.slice(0, 60) : `plataforma-${extension || "archivo"}`;

  return extension ? `${base}.${extension}` : base || "descarga";
}
