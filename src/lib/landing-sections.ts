/**
 * Convertir una página copiada en una sección de Shopify editable.
 *
 * Sin imports, probado en `landing-sections.test.ts`.
 *
 * ## La decisión que lo gobierna todo: no se trocea el marcado
 *
 * La forma «normal» de hacer una página editable en Shopify es partirla en
 * secciones —cabecera, testimonios, oferta— cada una con sus ajustes. Aquí eso
 * sería un error: cuanto más se trocea una página ajena, menos se parece al
 * original, y parecerse al original es justo lo que ha costado semanas.
 *
 * Así que el marcado se deja **exactamente como está** y solo se sustituyen los
 * puntos que de verdad se cambian: las direcciones de las imágenes y los
 * vídeos, y los titulares. Cada uno pasa a ser un ajuste de la sección; el
 * resto del HTML no se toca ni un carácter.
 *
 * ## El original va de respaldo, no de valor por defecto
 *
 * `image_picker` de Shopify **no admite `default`**. Si el ajuste vacío se
 * pintara tal cual, la página recién publicada saldría sin ninguna imagen y
 * parecería rota. Por eso cada hueco se escribe como «si hay ajuste, el ajuste;
 * si no, la dirección original»: se publica idéntica y se va sustituyendo una a
 * una desde el editor.
 *
 * ## Y por qué hay tope
 *
 * Una landing copiada trae setenta y cinco imágenes y cientos de frases.
 * Convertirlo todo en ajustes daría un panel imposible de recorrer y un archivo
 * de tema enorme. Se cogen las primeras, que en una página de ventas son las de
 * arriba —las que se miran y las que se cambian—, y se dice cuántas quedaron
 * fuera en vez de cortarlas en silencio.
 */

export interface Setting {
  type: "image_picker" | "text" | "textarea" | "url";
  id: string;
  label: string;
  /** `image_picker` no lo admite; los demás sí. */
  default?: string;
  info?: string;
}

export interface Sectioned {
  /** El marcado con los ajustes puestos, listo para el archivo de sección. */
  liquid: string;
  settings: Setting[];
  /** Cuántas imágenes y titulares se quedaron fuera del tope. */
  skipped: number;
}

const MAX_IMAGES = 40;
const MAX_HEADINGS = 20;
/** Por sección. Repartida en varias, cabe editar el texto sin llenar el panel. */
const MAX_TEXTS = 15;

/**
 * Parte el marcado por sus bloques de primer nivel.
 *
 * ## Para qué
 *
 * Para que en el editor de temas salgan **varias** secciones —una por bloque de
 * la página— en vez de una sola con todo dentro. Con una sola, el panel es una
 * lista de cien ajustes sin orden; con varias, cada tramo se abre, se edita, se
 * mueve y se quita por separado.
 *
 * ## Y lo que cuesta, que hay que saberlo
 *
 * Shopify envuelve cada sección en su propio contenedor. Una regla de CSS que
 * relacione **dos bloques hermanos** —`.a + .b`— deja de aplicar cuando esos dos
 * bloques quedan en secciones distintas. Las reglas de descendencia, que son la
 * mayoría, siguen valiendo porque cada trozo conserva su envoltorio `.copiado`.
 *
 * Se cuentan las llaves de las etiquetas, no se parte por `</div>`: partir por
 * el cierre trocearía los `div` anidados por la mitad, que es marcado inválido
 * y una página descolocada, no un error.
 */
export function splitTopLevel(html: string, maxParts = 20): string[] {
  const inner = /^\s*<div class="copiado">([\s\S]*)<\/div>\s*$/.exec(html.trim());
  const body = inner ? inner[1] : html;

  const parts: string[] = [];

  let at = 0;
  let depth = 0;
  let start = -1;

  const tags = [...body.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)];

  for (const tag of tags) {
    const closing = tag[1] === "/";
    const selfClosing = tag[3] === "/" || /^(img|br|hr|input|source|meta|link)$/i.test(tag[2]);

    if (selfClosing) {
      if (depth === 0) {
        parts.push(body.slice(tag.index, tag.index + tag[0].length));
        at = tag.index + tag[0].length;
      }
      continue;
    }

    if (!closing) {
      if (depth === 0) start = tag.index;
      depth += 1;
      continue;
    }

    depth = Math.max(0, depth - 1);

    if (depth === 0 && start >= 0) {
      parts.push(body.slice(start, tag.index + tag[0].length));
      at = tag.index + tag[0].length;
      start = -1;
    }
  }

  // Lo que quedara suelto al final —texto sin etiqueta, o una etiqueta sin
  // cerrar— no se tira: iría a parar a ningún sitio y faltaría en la página.
  const rest = body.slice(at).trim();
  if (rest) parts.push(rest);

  const clean = parts.map((part) => part.trim()).filter(Boolean);

  if (clean.length <= maxParts) return clean.map((part) => `<div class="copiado">${part}</div>`);

  /*
   * Con más bloques que el tope, los últimos se juntan en uno.
   *
   * Cincuenta secciones en el editor son inmanejables, y quedarse solo con las
   * primeras veinte perdería media página — que es peor que una sección larga.
   */
  const head = clean.slice(0, maxParts - 1);
  const tail = clean.slice(maxParts - 1).join("");

  return [...head, tail].map((part) => `<div class="copiado">${part}</div>`);
}

/** Para que un texto quepa en la etiqueta de un ajuste sin romper el panel. */
function short(value: string, max = 40): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** El JSON del esquema escapa comillas y saltos, o el archivo deja de ser válido. */
function json(value: string): string {
  return JSON.stringify(value);
}

/**
 * El marcado con sus puntos editables convertidos en ajustes.
 *
 * ## Qué se toca y qué no
 *
 * - **`<img src>`** — pasa a `image_picker`. Es lo primero que hay que cambiar
 *   en una copia: las fotos son del producto de otro.
 * - **`<source src>` y `<video src>`** — pasan a un campo de dirección. No hay
 *   selector de vídeo que sirva para un `.webm` alojado fuera, y un campo de
 *   texto acepta tanto una dirección propia como la del original.
 * - **`<h1>`, `<h2>`, `<h3>`** — pasan a campos de texto. Son los que se
 *   reescriben; los párrafos se dejan, porque cientos de ajustes de párrafo
 *   hacen el panel inservible.
 *
 * Todo lo demás —clases, estilos, estructura, atributos— se queda intacto.
 */
export function sectionize(html: string): Sectioned {
  const settings: Setting[] = [];
  let skipped = 0;

  let images = 0;
  let headings = 0;

  /*
   * Las imágenes primero.
   *
   * Se reemplaza **solo el valor** de `src`, no la etiqueta entera: así
   * sobreviven `class`, `style`, `loading`, `srcset` y todo lo que le daba su
   * tamaño y su sitio. Reconstruir la etiqueta es donde se pierde el maquetado.
   */
  let out = html.replace(/(<img\b[^>]*?\ssrc=)"([^"]*)"/gi, (match, before: string, url: string) => {
    if (!url || url.startsWith("data:")) return match;

    if (images >= MAX_IMAGES) {
      skipped += 1;
      return match;
    }

    images += 1;
    const id = `img_${images}`;

    settings.push({
      type: "image_picker",
      id,
      label: `Imagen ${images}`,
      info: "Vacío deja la del original.",
    });

    /*
     * `image_url` sin `width` devuelve la original sin redimensionar, que en
     * una foto de móvil son varios megas por imagen. Con ancho, Shopify sirve
     * la versión que toca desde su CDN.
     */
    return `${before}"{% if section.settings.${id} %}{{ section.settings.${id} | image_url: width: 1600 }}{% else %}${url}{% endif %}"`;
  });

  // Los vídeos, con el mismo criterio.
  let videos = 0;

  out = out.replace(
    /(<(?:source|video)\b[^>]*?\ssrc=)"([^"]*)"/gi,
    (match, before: string, url: string) => {
      if (!url || url.startsWith("data:")) return match;

      videos += 1;
      const id = `video_${videos}`;

      settings.push({
        type: "url",
        id,
        label: `Vídeo ${videos}`,
        info: "Vacío deja el del original.",
      });

      return `${before}"{% if section.settings.${id} %}{{ section.settings.${id} }}{% else %}${url}{% endif %}"`;
    },
  );

  /*
   * Los titulares.
   *
   * Solo el contenido que sea texto plano. Un `<h2>` con un `<span>` dentro se
   * deja: sustituirlo por un campo de texto perdería ese marcado, y con él el
   * color o el salto de línea que le daba forma.
   */
  out = out.replace(
    /(<h([1-3])\b[^>]*>)([^<]+)(<\/h\2>)/gi,
    (match, open: string, _level: string, text: string, close: string) => {
      if (!text.trim()) return match;

      if (headings >= MAX_HEADINGS) {
        skipped += 1;
        return match;
      }

      headings += 1;
      const id = `titulo_${headings}`;

      settings.push({
        type: "text",
        id,
        label: `Titular ${headings}`,
        default: text.trim(),
      });

      return `${open}{{ section.settings.${id} }}${close}`;
    },
  );

  /*
   * Los párrafos, ahora que la página va repartida en varias secciones.
   *
   * Con una sola sección eran cientos de ajustes y un panel inservible; con
   * quince por sección se editan los de ese tramo y ya. Solo los de texto
   * plano: un `<p>` con un `<a>` o un `<strong>` dentro se deja, porque
   * cambiarlo por un campo de texto se comería el enlace o la negrita.
   */
  let texts = 0;

  out = out.replace(/(<p\b[^>]*>)([^<]+)(<\/p>)/gi, (match, open: string, text: string, close: string) => {
    const clean = text.trim();

    // Los muy cortos no son párrafos: son separadores, «·», precios sueltos.
    if (clean.length < 25) return match;

    if (texts >= MAX_TEXTS) {
      skipped += 1;
      return match;
    }

    texts += 1;
    const id = `texto_${texts}`;

    settings.push({
      type: "textarea",
      id,
      label: `Texto ${texts}`,
      default: clean,
    });

    return `${open}{{ section.settings.${id} }}${close}`;
  });

  return { liquid: out, settings, skipped };
}

/**
 * El archivo de sección completo, con su esquema.
 *
 * El `{% schema %}` va **al final** y es JSON estricto: una coma de más o una
 * comilla sin escapar y Shopify rechaza el archivo entero con un error que
 * señala la línea del esquema, no el texto que la causó.
 */
export function sectionFile(options: {
  liquid: string;
  settings: Setting[];
  name: string;
}): string {
  const schema = {
    name: short(options.name, 25),
    settings: options.settings.map((setting) => ({
      type: setting.type,
      id: setting.id,
      label: setting.label,
      ...(setting.default === undefined ? {} : { default: setting.default }),
      ...(setting.info === undefined ? {} : { info: setting.info }),
    })),
    /*
     * `presets` es lo que permite añadirla desde el editor. Aquí no hace falta
     * —la plantilla la coloca— y ponerlo dejaría que alguien la insertara en la
     * portada por error, con la página de otro dentro.
     */
  };

  return [
    "{% comment %}",
    "  Generado por la plataforma al copiar una página.",
    "  Las imágenes, los vídeos y los titulares se cambian desde el editor de",
    "  temas, en los ajustes de esta sección. El resto es el marcado original.",
    "  Al volver a copiar esa misma página se sobrescribe.",
    "{% endcomment %}",
    /*
     * El CSS **no** va aquí: va en un asset que carga la plantilla.
     *
     * Un archivo de tema no puede pasar de 256 KB, y repitiendo la hoja en cada
     * sección la primera se pasaba y Shopify la rechazaba — dejando la página
     * con «is not a valid section type», que no dice nada de tamaños.
     *
     * Y aunque cupiera: once secciones con el mismo CSS son once descargas de
     * lo mismo para quien visita la página.
     */
    options.liquid,
    "",
    "{% schema %}",
    JSON.stringify(schema, null, 2),
    "{% endschema %}",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * La plantilla de página: la hoja de estilos y las secciones, en orden.
 *
 * El CSS se carga desde un asset y no desde un `<style>` dentro de la
 * plantilla, por dos motivos que van juntos: un archivo de tema no puede pasar
 * de 256 KB y el CSS de una copia ronda los 240, y un asset lo sirve el CDN de
 * Shopify con caché en vez de repetirlo en cada carga de la página.
 */
export function templateFor(cssAsset: string, sectionNames: string[]): string {
  return [
    cssAsset ? `{{ '${cssAsset}' | asset_url | stylesheet_tag }}` : "",
    ...sectionNames.map((name) => `{% section '${name}' %}`),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Lo que se le cuenta a quien acaba de publicar. */
export function sectionNote(result: Sectioned, sectionName: string): string {
  const images = result.settings.filter((setting) => setting.type === "image_picker").length;
  const videos = result.settings.filter((setting) => setting.type === "url").length;
  const titles = result.settings.filter((setting) => setting.type === "text").length;

  return [
    `Sección editable «${sectionName}» en el tema:`,
    ` ${images} imagen(es), ${videos} vídeo(s) y ${titles} titular(es) se cambian desde el editor.`,
    result.skipped > 0
      ? ` ${result.skipped} más se quedaron fuera del tope y se editan en el código.`
      : "",
    " El resto del marcado va tal cual, para que se siga pareciendo al original.",
  ].join("");
}

export { json };
