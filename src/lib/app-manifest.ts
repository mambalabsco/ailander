/**
 * Lo que se puede sacar de una app con solo su dirección.
 *
 * Sin imports, probado en `app-manifest.test.ts`.
 *
 * Las apps de casino son **PWA**: sirven un `manifest.json` con su nombre, su
 * descripción, su color y sus iconos. Eso es gratis y es fiable — no hay que
 * adivinarlo del HTML ni pedírselo a un modelo.
 *
 * Lo que el manifiesto **no** trae casi nunca es `screenshots`, así que la
 * captura de pantalla no sale de aquí: hay que renderizar la página.
 */

export interface AppFromManifest {
  name: string;
  description: string;
  /** El icono más grande. Vacío si no declara ninguno. */
  iconUrl: string;
  themeColor: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Los píxeles de un `sizes`, o cero si no se puede leer. */
function pixels(sizes: unknown): number {
  const parsed = Number.parseInt(text(sizes).split("x")[0] ?? "", 10);

  // `sizes` puede venir como "any" en un SVG, y ahí `parseInt` da NaN. Sin este
  // cero, NaN se cuela en la comparación y gana el icono que no sirve.
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readAppManifest(manifest: unknown): AppFromManifest {
  const raw = (manifest ?? {}) as Record<string, unknown>;
  const icons = Array.isArray(raw.icons) ? (raw.icons as Record<string, unknown>[]) : [];

  /*
   * El más grande, y no el primero.
   *
   * La lista llega desordenada y con el mismo icono repetido en varios tamaños y
   * `purpose`. Un icono de 48 píxeles metido en una creatividad sale como una
   * mancha, y no da ningún error: sale la imagen, borrosa.
   */
  const mayor = icons.reduce<{ src: string; size: number }>(
    (best, icon) => {
      const size = pixels(icon.sizes);
      return size > best.size ? { src: text(icon.src), size } : best;
    },
    { src: "", size: -1 },
  );

  return {
    name: text(raw.name) || text(raw.short_name),
    description: text(raw.description),
    iconUrl: mayor.src,
    themeColor: text(raw.theme_color),
  };
}

/**
 * Dónde pedir el manifiesto, a partir del HTML de la página.
 *
 * Si no lo declara, se prueba `/manifest.json`: casi todas las PWA lo sirven ahí
 * de todos modos, y probar cuesta una petición que además puede fallar sin
 * consecuencias.
 */
export function manifestUrlFrom(html: string, pageUrl: string): string {
  const match = /<link[^>]*rel=["']manifest["'][^>]*>/i.exec(html);
  const href = match ? /href=["']([^"']+)["']/i.exec(match[0])?.[1] : undefined;

  return new URL(href || "/manifest.json", pageUrl).toString();
}

/**
 * Las imágenes de la página, absolutas y sin los iconos.
 *
 * Las apps de casino se anuncian con una réplica de la ficha de Google Play, y
 * dentro llevan **sus pantallas promocionales**: el bono, los juegos y los
 * métodos de pago locales. Eso es mucho mejor referencia que una captura de la
 * página entera, que lo que enseña es la ficha falsa y no la app.
 *
 * Se descartan los iconos —vienen con el sufijo de tamaño, `_w192h192`— porque
 * un logo metido de referencia hace que la creatividad enseñe el logo en vez de
 * la app, y eso no da ningún error: sale una imagen, y es la equivocada.
 */
export function imagesFrom(html: string, pageUrl: string): string[] {
  const encontradas = html.match(/src=["']([^"']+\.(?:png|jpe?g|webp))["']/gi) ?? [];

  const urls = encontradas
    .map((tag) => /src=["']([^"']+)["']/i.exec(tag)?.[1] ?? "")
    .filter((src) => src && !/_w\d+h\d+\./i.test(src))
    .map((src) => {
      try {
        return new URL(src, pageUrl).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  return [...new Set(urls)];
}
