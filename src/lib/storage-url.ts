/**
 * Reconocer una dirección de nuestro propio almacenamiento.
 *
 * Sin imports, probado en `storage-url.test.ts`.
 *
 * ## Por qué hace falta
 *
 * Las direcciones firmadas de Supabase **caducan a la hora**. Eso está bien
 * mientras se mira una imagen en pantalla, y es un fallo silencioso en cuanto la
 * dirección se guarda: un flujo montado ayer lleva dentro la firma de ayer, y al
 * ejecutarlo hoy el generador recibe un enlace muerto.
 *
 * Lo que pasa entonces no es un error claro. El proveedor no puede descargar la
 * foto del envase y genera **sin ella**: sale una imagen convincente con un bote
 * que no existe. Se anima, se monta, y el fallo se descubre mirando el vídeo
 * terminado.
 *
 * Con el cubo y la ruta se puede volver a firmar en el momento de usarla, que es
 * la única forma de que una dirección guardada siga sirviendo mañana sin hacer
 * público el cubo.
 */

export interface StorageRef {
  bucket: string;
  path: string;
}

/**
 * El cubo y la ruta de una dirección de Supabase Storage, o `null`.
 *
 * Acepta las tres formas que sirve Supabase:
 *
 *     /storage/v1/object/sign/<cubo>/<ruta>?token=…   ← firmada, caduca
 *     /storage/v1/object/public/<cubo>/<ruta>          ← pública
 *     /storage/v1/object/<cubo>/<ruta>                 ← autenticada
 *
 * `null` para cualquier otra cosa —una del CDN de Shopify, una de fal— porque
 * esas no son nuestras y volver a firmarlas no significa nada.
 */
export function storageRefFrom(url: string, supabaseUrl: string): StorageRef | null {
  if (!url || !supabaseUrl) return null;

  let parsed: URL;
  let base: URL;

  try {
    parsed = new URL(url);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }

  /*
   * Se compara el servidor, no un prefijo de texto.
   *
   * `url.startsWith(supabaseUrl)` daría por nuestra una dirección como
   * `https://proyecto.supabase.co.otro-sitio.com/…`, que es de quien la haya
   * puesto. Volver a firmarla no filtraría nada, pero enseñaría si existe.
   */
  if (parsed.host !== base.host) return null;

  const marker = "/storage/v1/object/";
  const at = parsed.pathname.indexOf(marker);
  if (at === -1) return null;

  const rest = parsed.pathname.slice(at + marker.length);
  const parts = rest.split("/").filter(Boolean);

  // `sign`, `public` y `authenticated` son la modalidad, no el cubo.
  const start = ["sign", "public", "authenticated"].includes(parts[0] ?? "") ? 1 : 0;

  const bucket = parts[start];
  const path = parts.slice(start + 1).join("/");

  if (!bucket || !path) return null;

  return { bucket, path: decodeURIComponent(path) };
}

/**
 * Si esa dirección caduca.
 *
 * Solo las firmadas. Una pública del mismo cubo sirve siempre, y volver a
 * firmarla sería una ida y vuelta a la base de datos por nada.
 */
export function expires(url: string): boolean {
  return url.includes("/object/sign/") || url.includes("token=");
}
