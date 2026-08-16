import "server-only";

/**
 * La captura móvil de una página, con un navegador sin cabeza.
 *
 * ## Por qué hace falta esto y no basta con leer el HTML
 *
 * Las apps de casino son PWA: la página se pinta con JavaScript, así que pedir
 * el HTML devuelve un armazón vacío. Para ver lo que ve una persona hay que
 * renderizar.
 *
 * ## Qué se captura de verdad, que no es lo que parece
 *
 * Comprobado contra `dreamsenmonticell.bar` el 16 de agosto: esa dirección **no
 * es la app**, es una réplica de la ficha de Google Play. La captura sale
 * correcta y enseña esa ficha, no una pantalla de casino. Sirve como
 * *prelanding* —es lo que ve quien pulsa el anuncio— pero **no como referencia
 * de la app**: para eso están las imágenes incrustadas en la propia página, que
 * saca `imagesFrom`.
 *
 * ## El navegador
 *
 * `playwright-core` no trae navegadores: hay que instalarlos aparte con
 * `npx playwright-core install chromium`. Está en DEPLOY.md. Si falta, esto
 * lanza un error que lo dice en vez de uno de Playwright que manda a buscar en
 * el sitio equivocado.
 */

/** Un iPhone moderno: es donde se ve esto, y el ancho cambia la maqueta. */
const MOVIL = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

export async function captureMobile(url: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No hay navegador para hacer la captura. En el servidor: «npx playwright-core install chromium». (${detail})`,
    );
  }

  try {
    const page = await browser.newPage({
      viewport: { width: MOVIL.width, height: MOVIL.height },
      deviceScaleFactor: MOVIL.deviceScaleFactor,
      isMobile: MOVIL.isMobile,
      hasTouch: MOVIL.hasTouch,
      userAgent: MOVIL.userAgent,
    });

    /*
     * `networkidle` y no `load`.
     *
     * Una PWA termina de cargar el documento y **después** pinta: con `load` la
     * captura sale en blanco, y no falla — se guarda una imagen vacía.
     */
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });

    return await page.screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}
