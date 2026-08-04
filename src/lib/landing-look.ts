import "server-only";

import { themeFrom, type LandingTheme } from "@/lib/landing-theme";

/**
 * Leer el aspecto de una página web: sus colores, su letra y su ancho.
 *
 * Aparte de `landing-theme.ts` porque aquello no toca la red y esto sí. Lo que
 * decide cómo se reparten los colores se puede probar sin descargar nada; sacar
 * los colores de un HTML, no.
 *
 * ## Del HTML y no de un navegador
 *
 * Lo suyo sería medir la página pintada, pero eso exige un navegador de verdad
 * en el servidor. Leyendo el CSS se acierta lo bastante: los colores que una
 * página declara son los que usa, y el orden de aparición se parece al de
 * importancia porque las reglas generales van arriba.
 */

/** Los colores que declara, del más repetido al menos. */
function colorsIn(css: string): string[] {
  const counts = new Map<string, number>();

  for (const match of css.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    const color = match[0].toLowerCase();
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }

  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)
    .slice(0, 24);
}

/**
 * Las familias declaradas, sin las alternativas del sistema.
 *
 * Se quitan porque están en todas las páginas y taparían a la de verdad: si
 * `sans-serif` cuenta como fuente, la primera que sale es siempre esa.
 */
function fontsIn(css: string): string[] {
  const generic =
    /^(sans-serif|serif|monospace|system-ui|inherit|initial|-apple-system|blinkmacsystemfont|ui-sans-serif|ui-serif|segoe ui|roboto|helvetica|helvetica neue|arial)$/i;

  const found: string[] = [];

  for (const match of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    for (const raw of match[1].split(",")) {
      const font = raw.trim().replace(/["']/g, "");

      if (!font || generic.test(font) || font.startsWith("var(")) continue;
      if (!found.includes(font)) found.push(font);
    }
  }

  return found.slice(0, 4);
}

/** El ancho de la columna de lectura, si lo declara. */
function widthIn(css: string): number | undefined {
  const widths = [...css.matchAll(/max-width\s*:\s*(\d{3,4})px/gi)]
    .map((match) => Number(match[1]))
    // Entre 500 y 1000: por debajo son cajas sueltas y por encima el contenedor
    // de la página entera, que no es la columna de leer.
    .filter((value) => value >= 500 && value <= 1000);

  if (widths.length === 0) return undefined;

  // La más repetida: la columna de texto se declara muchas veces y un ancho
  // suelto solo una.
  const counts = new Map<number, number>();
  for (const width of widths) counts.set(width, (counts.get(width) ?? 0) + 1);

  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Descarga la página y compone su aspecto.
 *
 * Solo el estilo en línea y las hojas del mismo dominio. Las de fuera —tipos de
 * letra de Google, widgets— son megas de reglas que no dicen nada del diseño y
 * multiplican el tiempo de la descarga por diez.
 */
export async function lookOf(pageUrl: string, timeoutMs = 15_000): Promise<LandingTheme> {
  const target = new URL(pageUrl);

  const get = async (url: string) => {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    return response.ok ? response.text() : "";
  };

  const html = await get(target.toString());

  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join("\n");

  const sheets = [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)]
    .map((tag) => tag[0].match(/href=["']([^"']+)["']/)?.[1] ?? "")
    .filter(Boolean)
    .map((href) => new URL(href, target).toString())
    .filter((href) => new URL(href).hostname === target.hostname)
    .slice(0, 4);

  const css = [inline, ...(await Promise.all(sheets.map((url) => get(url).catch(() => ""))))].join(
    "\n",
  );

  return themeFrom({ colors: colorsIn(css), fonts: fontsIn(css), width: widthIn(css) });
}
