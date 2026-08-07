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
 * Las clases que el CSS pinta como una banda: fondo propio o ancho completo.
 *
 * ## Por qué esto sustituye a mirar una captura
 *
 * Lo que hace que una persona vea «aquí empieza otra sección» casi siempre es
 * un **cambio de fondo** o una banda a todo el ancho. Eso está escrito en el
 * CSS de la página copiada, así que se puede leer sin renderizar nada.
 *
 * La alternativa —hacer una captura y mirarla— exige un navegador headless en
 * el servidor. Este tiene dos núcleos y sirve las páginas con ellos; arrancar
 * Chrome por cada copia es justo lo que el resto del proyecto evita.
 *
 * Se ignoran los fondos transparentes y el blanco: no separan nada, y tomarlos
 * por banda partiría la página en cada `div`.
 */
export function bandClasses(css: string): Set<string> {
  const found = new Set<string>();

  for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const body = rule[2];

    const fondo = /background(?:-color)?\s*:\s*([^;]+)/i.exec(body)?.[1]?.trim().toLowerCase();
    const ancho = /width\s*:\s*100(?:vw|%)/i.test(body) || /max-width\s*:\s*none/i.test(body);

    const pinta =
      Boolean(fondo) &&
      !/^(?:none|transparent|inherit|initial|unset)$/.test(fondo ?? "") &&
      !/^(?:#fff(?:fff)?|white|rgba?\(\s*255\s*,\s*255\s*,\s*255)/.test(fondo ?? "");

    if (!pinta && !ancho) continue;

    for (const name of rule[1].matchAll(/\.([\w-]+)/g)) found.add(name[1]);
  }

  return found;
}

/**
 * El troceo crudo: los bloques de primer nivel de ese marcado.
 *
 * Va aparte de `splitTopLevel` para que la bajada de nivel pueda usarlo **sin
 * volver a bajar**. Cuando `splitTopLevel` se llamaba a sí misma, cada llamada
 * repetía la bajada sobre el mismo bloque dominante y no paraba nunca: pila
 * agotada, no un resultado raro.
 */
function topLevelChunks(body: string): string[] {
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

  return parts;
}

  /*
   * Los bloques sin nada visible se caen.
   *
   * Un `<div>` vacío, un contenedor de un script ya quitado o un separador
   * sueltan una sección más en el editor: aparece en la lista, no se puede
   * editar y nadie sabe qué trae. Con once secciones, tres de ellas así
   * convierten el panel en un adivinanza.
   */

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
export function splitTopLevel(html: string, maxParts = 20, bands?: Set<string>): string[] {
  const inner = /^\s*<div class="copiado">([\s\S]*)<\/div>\s*$/.exec(html.trim());
  const body = inner ? inner[1] : html;

  const parts = topLevelChunks(body);

  let clean = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => hasSomething(part));

  /*
   * Si un solo bloque se lleva casi toda la página, se baja un nivel.
   *
   * Muchas landings cuelgan de un único `<div>` envolvente. Partiendo por el
   * primer nivel sale **una sección con todo dentro** y unas cuantas migajas
   * detrás: en el editor eso es exactamente lo que no se puede manejar.
   *
   * Se repite hasta tres veces. Más sería seguir bajando hasta los párrafos, y
   * entonces cada frase es una sección.
   */
  for (let vuelta = 0; vuelta < 3; vuelta += 1) {
    const total = clean.reduce((sum, part) => sum + part.length, 0);
    const mayor = clean.reduce((top, part) => (part.length > top.length ? part : top), "");

    /*
     * Solo si el bloque es **grande de verdad**.
     *
     * Sin el mínimo, cualquier página con dos párrafos se sigue partiendo hasta
     * dejar una sección por frase. Cuatro mil caracteres es un tramo de landing
     * de los que se editan; por debajo, partirlo no arregla nada.
     */
    if (clean.length >= maxParts || total === 0) break;
    if (mayor.length < 4000 || mayor.length < total * 0.6) break;

    // El troceo crudo, no `splitTopLevel`: llamarse a sí misma repetía la
    // bajada sobre el mismo bloque y agotaba la pila.
    const dentro = topLevelChunks(
      /^<[a-z][^>]*>/i.test(mayor) ? mayor.replace(/^<[^>]*>/, "").replace(/<\/[^>]*>$/, "") : mayor,
    ).filter((part) => hasSomething(part));

    /*
     * Si dentro hay bandas, se corta por ellas y se juntan las migajas.
     *
     * Un tramo que no empieza una banda pertenece a la de arriba: pegarlo allí
     * es lo que evita que un titular y su fondo acaben en secciones distintas,
     * que en el editor se ve como dos secciones que no se pueden mover por
     * separado sin romper la página.
     */
    if (bands && bands.size > 0) {
      const juntos: string[] = [];

      for (const trozo of dentro) {
        if (juntos.length > 0 && !startsBand(trozo, bands)) {
          juntos[juntos.length - 1] += trozo;
        } else {
          juntos.push(trozo);
        }
      }

      if (juntos.length > 1) {
        const at = clean.indexOf(mayor);
        clean = [...clean.slice(0, at), ...juntos, ...clean.slice(at + 1)];
        continue;
      }
    }

    // Si dentro solo hay uno, bajar otra vez daría lo mismo: se para.
    if (dentro.length <= 1) break;

    const at = clean.indexOf(mayor);
    clean = [...clean.slice(0, at), ...dentro, ...clean.slice(at + 1)];
  }

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

/**
 * Recorre las etiquetas de un tipo, leyéndolas enteras.
 *
 * ## Por qué no vale una expresión regular
 *
 * Porque `[^>]*` corta en el primer `>`, y hay atributos que lo llevan **dentro
 * del valor**: `aria-label="<p>QUIERO COMPRAR</p>"` es marcado real de un
 * constructor de páginas. Con la etiqueta cortada, el `href` que va detrás no
 * existe para el código — y eso no da error, deja el botón sin ajuste y a nadie
 * mirando por qué.
 *
 * Aquí se cuenta si se está dentro de comillas, así que un `>` dentro de un
 * valor no termina nada.
 */
function replaceTags(html: string, name: string, change: (tag: string) => string): string {
  const open = new RegExp(`<${name}\\b`, "gi");

  let out = "";
  let at = 0;

  for (const found of [...html.matchAll(open)]) {
    const start = found.index;
    if (start < at) continue;

    let cursor = start + found[0].length;
    let quote = "";

    while (cursor < html.length) {
      const char = html[cursor];

      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }

      cursor += 1;
    }

    // Sin cierre, la etiqueta está partida: se deja tal cual antes que
    // reescribir a ciegas media página.
    if (cursor >= html.length) break;

    out += html.slice(at, start) + change(html.slice(start, cursor + 1));
    at = cursor + 1;
  }

  return out + html.slice(at);
}

/** Si ese trozo abre una banda: su etiqueta lleva una clase de fondo propio. */
function startsBand(html: string, bands: Set<string>): boolean {
  // `<section>` y `<header>` son bandas por sí mismos: el marcado ya lo dice.
  if (/^<(?:section|header|footer)\b/i.test(html.trim())) return true;

  const classes = /^<[^>]*\sclass="([^"]*)"/i.exec(html.trim())?.[1] ?? "";

  return classes.split(/\s+/).some((name) => name && bands.has(name));
}

/**
 * Si ese trozo enseña algo.
 *
 * Se mira que tenga texto, una imagen, un vídeo o un fondo. Un `<div>` con
 * clases y nada dentro ocupa una sección del editor y no se puede tocar.
 */
function hasSomething(html: string): boolean {
  if (/<(?:img|video|source|iframe|svg)\b/i.test(html)) return true;

  // El texto que quede al quitar las etiquetas. Los espacios duros cuentan como
  // vacío: son separadores, no contenido.
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();

  return text.length > 0;
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
  let out = html.replace(/<img\b[^>]*>/gi, (tag: string) => {
    const url = /\ssrc="([^"]*)"/i.exec(tag)?.[1] ?? "";

    if (!url || url.startsWith("data:")) return tag;

    if (images >= MAX_IMAGES) {
      skipped += 1;
      return tag;
    }

    images += 1;
    const id = `img_${images}`;

    settings.push({
      type: "image_picker",
      id,
      label: `Imagen ${images}`,
      info: "Si subes una, manda sobre la del original.",
    });

    settings.push({
      type: "url",
      id: `${id}_url`,
      label: `Imagen ${images} · por dirección`,
      info: "Para usar una que ya esté en otro sitio. La subida manda sobre esta.",
    });

    /*
     * Se quita `srcset`, y aquí está el fallo que hacía que sustituir la imagen
     * no sirviera de nada.
     *
     * El navegador prefiere `srcset` sobre `src` cuando están los dos. Al
     * cambiar solo el `src`, la imagen nueva se escribía y **seguía viéndose la
     * del original**, porque el `srcset` con las direcciones de la página
     * copiada seguía ahí ganando.
     */
    const clean = tag
      .replace(/\s(?:srcset|data-srcset)="[^"]*"/gi, "")
      .replace(/\ssizes="[^"]*"/gi, "");

    /*
     * Tres orígenes, con prioridad: lo subido, luego la dirección escrita, y de
     * respaldo la del original. `image_picker` no admite valor por defecto, así
     * que sin el respaldo la página saldría sin imágenes hasta rellenarlas una
     * a una.
     */
    const value = `{% if section.settings.${id} %}{{ section.settings.${id} | image_url: width: 1600 }}{% elsif section.settings.${id}_url != blank %}{{ section.settings.${id}_url }}{% else %}${url}{% endif %}`;

    return clean.replace(/\ssrc="[^"]*"/i, ` src="${value}"`);
  });

  /*
   * Los `<source>` de un `<picture>` también mandan sobre el `<img>`.
   *
   * Un `<picture>` con `<source srcset>` no mira el `src` del `<img>` de
   * dentro: si se dejan, sustituir la imagen no cambia nada de lo que se ve.
   */
  out = out.replace(/<source\b[^>]*\ssrcset="[^"]*"[^>]*>/gi, (tag: string) =>
    /type="video/i.test(tag) ? tag : "",
  );

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
   * Los enlaces de los botones.
   *
   * En una copia todos apuntan a la ficha del producto, que es lo que se quiere
   * el noventa por ciento de las veces. El otro diez —un botón que lleva a la
   * oferta de tres, otro a la de seis— hay que poder cambiarlo sin tocar código.
   */
  let links = 0;

  /*
   * Las etiquetas `<a>` se leen **respetando las comillas**, no hasta el primer
   * `>`.
   *
   * Aquí estaba el fallo que dejaba los botones sin campo editable. Un
   * constructor de páginas escribe `aria-label="<p>QUIERO COMPRAR</p>"`, con un
   * `>` **dentro del valor**: cualquier expresión con `[^>]*` corta ahí, no
   * llega al `href` y no crea el ajuste. La etiqueta se queda como estaba y en
   * el editor de temas no hay nada que cambiar.
   */
  out = replaceTags(out, "a", (tag) => {
    const url = /\shref="([^"]*)"/i.exec(tag)?.[1] ?? "";

    // Las anclas con destino se quedan: son navegación dentro de la página.
    if (!url || (url.length > 1 && url.startsWith("#"))) return tag;

    links += 1;
    const id = `enlace_${links}`;

    settings.push({ type: "url", id, label: `Enlace ${links}`, default: url });

    return tag.replace(/\shref="[^"]*"/i, ` href="{{ section.settings.${id} }}"`);
  });

  /*
   * Los titulares.
   *
   * Solo el contenido que sea texto plano. Un `<h2>` con un `<span>` dentro se
   * deja: sustituirlo por un campo de texto perdería ese marcado, y con él el
   * color o el salto de línea que le daba forma.
   */
  out = out.replace(
    /(<h([1-3])\b[^>]*>)([^<]+)(<\/h\2>)/gi,
    (match, open: string, _level: string, text: string, close: string, at: number, whole: string) => {
      // Mismo motivo que en los párrafos: un titular dentro de un atributo no
      // es un titular, y reescribirlo parte la etiqueta que lo contiene.
      if (whole[at - 1] === '"' || whole[at - 1] === "'") return match;

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

  out = out.replace(/(<p\b[^>]*>)([^<]+)(<\/p>)/gi, (match, open: string, text: string, close: string, at: number, whole: string) => {
    /*
     * Un `<p>` **dentro de un atributo** no es marcado.
     *
     * `aria-label="<p>QUIERO COMPRAR</p>"` es marcado real de un constructor de
     * páginas. Tratarlo como párrafo reescribía el valor del atributo, partía
     * la etiqueta `<a>` y con ella se perdía el `href` — el botón se quedaba
     * sin campo editable y sin destino, y nada fallaba.
     */
    if (whole[at - 1] === '"' || whole[at - 1] === "'") return match;

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
  /** El asset con la hoja de estilos de la copia. */
  cssAsset?: string;
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
     * La hoja se carga desde **cada** sección, no desde la plantilla.
     *
     * Una plantilla JSON no admite Liquid suelto, así que no hay dónde ponerla
     * una sola vez. El navegador se queda con una descarga aunque el `<link>`
     * salga varias veces, y así la página sigue con sus estilos aunque se
     * oculte o se borre cualquier sección.
     */
    options.cssAsset ? `{{ '${options.cssAsset}' | asset_url | stylesheet_tag }}` : "",
    /*
     * El CSS en sí **no** va aquí: va en un asset.
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
export function templateFor(sectionNames: string[]): string {
  /*
   * JSON y no Liquid, y esa es toda la diferencia.
   *
   * Una plantilla `.liquid` con `{% section %}` fijos coloca las secciones y
   * ahí se acaba: en el editor no se pueden ocultar, ni mover, ni añadir otras.
   * Una plantilla `.json` es la que Shopify trata como editable — el orden vive
   * en el archivo y el editor lo reescribe al arrastrar.
   *
   * Se guarda el orden en `order` y no en el orden de las claves: un objeto
   * JSON no garantiza el orden de sus claves, y con veinte secciones eso es una
   * página barajada.
   */
  const sections: Record<string, { type: string }> = {};
  const order: string[] = [];

  for (const [at, name] of sectionNames.entries()) {
    const key = `s${at + 1}`;
    sections[key] = { type: name };
    order.push(key);
  }

  return JSON.stringify({ sections, order }, null, 2);
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

/**
 * El encargo para ponerle nombre a cada sección.
 *
 * ## Por qué hace falta
 *
 * Porque en el editor de temas salen once secciones llamadas «Copia de
 * trysculptique 01», «… 02», «… 03». Para mover el bloque de testimonios hay
 * que abrirlas una a una hasta dar con él, y con la página larga eso es
 * exactamente lo que hace que nadie las toque.
 *
 * Con el nombre puesto —«Testimonios», «La oferta», «Garantía»— la lista se lee
 * de un vistazo y el orden se cambia arrastrando.
 *
 * ## Se le da el texto, no el marcado
 *
 * Lo que distingue una sección de otra es lo que dice, no sus etiquetas. Y el
 * marcado de once bloques no cabe en una petición.
 */
export function buildSectionNamesPrompt(blocks: string[]): string {
  return [
    "Pon nombre a cada tramo de una página de venta, para que se reconozca en una lista.",
    "",
    "Devuelve **exactamente** un nombre por tramo, en el mismo orden.",
    "Dos o tres palabras, en español, describiendo qué es ese tramo dentro de la página:",
    "«Titular y gancho», «El problema», «Cómo funciona», «Testimonios», «La oferta»,",
    "«Preguntas frecuentes», «Garantía», «Aviso legal».",
    "",
    "No repitas el mismo nombre dos veces: si hay dos tramos de testimonios,",
    "llámalos «Testimonios» y «Más testimonios». Un nombre repetido en una lista",
    "no distingue nada, que es el problema que esto viene a resolver.",
    "",
    ...blocks.map((text, at) => `--- Tramo ${at + 1} ---\n${text.slice(0, 900)}`),
  ].join("\n");
}

/**
 * Los nombres que devolvió el modelo, comprobados contra los tramos.
 *
 * Si faltan, sobran o vienen vacíos, ese tramo se queda con su número. Un
 * nombre desplazado es peor que ninguno: pondría «La oferta» sobre los
 * testimonios y el orden se cambiaría al revés de lo que se quería.
 */
export function readSectionNames(names: unknown, count: number, fallback: string): string[] {
  const list = Array.isArray(names) ? names : [];

  const seen = new Set<string>();

  return Array.from({ length: count }, (_, at) => {
    const raw = typeof list[at] === "string" ? (list[at] as string).trim() : "";
    const clean = raw.replace(/\s+/g, " ").slice(0, 24);

    if (!clean || seen.has(clean.toLowerCase())) {
      return `${fallback} ${String(at + 1).padStart(2, "0")}`;
    }

    seen.add(clean.toLowerCase());
    return clean;
  });
}
