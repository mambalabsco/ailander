import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bandClasses,
buildSectionNamesPrompt,
  readSectionNames,
sectionFile,
  sectionize,
  sectionNote,
  splitTopLevel,
  templateFor,
} from "./landing-sections.ts";

test("la imagen se hace editable sin perder sus atributos", () => {
  /*
   * Se reemplaza **solo el valor** de `src`. Reconstruir la etiqueta es donde
   * se pierde el maquetado: `class`, `style` y `loading` son lo que le daban su
   * tamaño y su sitio.
   */
  const out = sectionize('<img class="hero" style="width:100%" loading="lazy" src="https://x/a.jpg">');

  assert.ok(out.liquid.includes('class="hero"'));
  assert.ok(out.liquid.includes('style="width:100%"'));
  assert.ok(out.liquid.includes('loading="lazy"'));
  assert.ok(out.liquid.includes("section.settings.img_1"));
});

test("el original queda de respaldo, porque image_picker no admite default", () => {
  /*
   * Si el ajuste vacío se pintara tal cual, la página recién publicada saldría
   * sin ninguna imagen y parecería rota.
   */
  const out = sectionize('<img src="https://x/a.jpg">');

  assert.ok(out.liquid.includes("{% else %}https://x/a.jpg{% endif %}"));
  assert.equal(out.settings[0].type, "image_picker");
  assert.equal(out.settings[0].default, undefined);
});

test("se pide un ancho al servir la imagen del ajuste", () => {
  // Sin ancho, Shopify devuelve la original: una foto de móvil son varios megas.
  assert.ok(sectionize('<img src="https://x/a.jpg">').liquid.includes("image_url: width: 1600"));
});

test("las imágenes incrustadas se dejan en paz", () => {
  // Un `data:` no se puede sustituir por un selector de imagen y ocupa lo que
  // ocupa: convertirlo en ajuste solo añadiría un campo inútil al panel.
  const out = sectionize('<img src="data:image/png;base64,AAAA">');

  assert.equal(out.settings.length, 0);
});

test("los vídeos se cambian por dirección, no por selector", () => {
  // No hay selector que sirva para un `.webm` alojado fuera.
  const out = sectionize('<source src="https://x/a.webm" type="video/webm">');

  assert.equal(out.settings[0].type, "url");
  assert.ok(out.liquid.includes('type="video/webm"'));
});

test("los titulares se hacen editables con su texto de partida", () => {
  const out = sectionize("<h2>Ocho razones</h2>");

  assert.ok(out.liquid.includes("{{ section.settings.titulo_1 }}"));
  assert.equal(out.settings[0].default, "Ocho razones");
});

test("un titular con marcado dentro no se toca", () => {
  /*
   * Sustituirlo por un campo de texto perdería ese marcado, y con él el color o
   * el salto de línea que le daba forma.
   */
  const out = sectionize('<h2>Ocho <span class="rojo">razones</span></h2>');

  assert.ok(out.liquid.includes('<span class="rojo">'));
  assert.equal(out.settings.length, 0);
});

test("los párrafos también se editan, ahora que hay varias secciones", () => {
  // Con una sola sección eran cientos de ajustes; con quince por sección se
  // editan los de ese tramo y ya.
  const out = sectionize("<p>Un texto suficientemente largo de la página</p>");

  assert.equal(out.settings[0].type, "textarea");
  assert.ok(out.liquid.includes("{{ section.settings.texto_1 }}"));
});

test("un párrafo con enlace o negrita no se convierte en campo de texto", () => {
  /*
   * Cambiarlo por un campo de texto se comería el `<a>` o el `<strong>`. El
   * enlace de dentro sí se hace editable —un `#` a secas es un botón muerto—
   * pero el párrafo se queda con su marcado.
   */
  const out = sectionize('<p>Mira <a href="#">esta oferta</a> antes de que acabe hoy</p>');

  assert.ok(out.liquid.includes("<a href="));
  assert.ok(out.liquid.includes("Mira "));
  assert.ok(!out.settings.some((setting) => setting.type === "textarea"));
});

test("los textos muy cortos no son párrafos", () => {
  // Son separadores, «·», precios sueltos: llenarían el panel de ajustes vacíos.
  assert.equal(sectionize("<p>19,90 €</p>").settings.length, 0);
});

test("lo que pasa del tope se cuenta, no se corta en silencio", () => {
  const muchas = Array.from({ length: 60 }, (_, at) => `<img src="https://x/${at}.jpg">`).join("");
  const out = sectionize(muchas);

  assert.equal(out.settings.filter((setting) => setting.type === "image_picker").length, 40);
  assert.equal(out.skipped, 20);
  assert.match(sectionNote(out, "copia"), /se quedaron fuera del tope/);
});

test("el esquema es JSON válido", () => {
  /*
   * Una coma de más o una comilla sin escapar y Shopify rechaza el archivo
   * entero, con un error que señala la línea del esquema y no el texto que lo
   * causó.
   */
  const out = sectionize('<h2>Con "comillas" y \\n saltos</h2><img src="https://x/a.jpg">');
  const file = sectionFile({ liquid: out.liquid, settings: out.settings, name: "Copia" });

  const raw = /{% schema %}([\s\S]*?){% endschema %}/.exec(file);
  assert.ok(raw);
  assert.doesNotThrow(() => JSON.parse(raw[1]));
});

test("el nombre de la sección no se pasa de largo", () => {
  // El panel del editor lo recorta y deja dos secciones con el mismo nombre.
  const file = sectionFile({ liquid: "", settings: [], name: "x".repeat(80) });
  const schema = JSON.parse(/{% schema %}([\s\S]*?){% endschema %}/.exec(file)![1]);

  assert.ok(schema.name.length <= 25);
});

test("la sección no se puede insertar por error en otra página", () => {
  // Sin `presets` no aparece en «añadir sección»: la coloca la plantilla y
  // nadie mete la página de otro en la portada sin querer.
  const file = sectionFile({ liquid: "", settings: [], name: "Copia" });
  const schema = JSON.parse(/{% schema %}([\s\S]*?){% endschema %}/.exec(file)![1]);

  assert.equal(schema.presets, undefined);
});

test("la plantilla es JSON, que es lo que el editor deja tocar", () => {
  /*
   * Con `{% section %}` fijos en un `.liquid`, el editor enseña las secciones y
   * no deja ocultarlas, moverlas ni añadir otras.
   */
  const out = JSON.parse(templateFor(["copia-x-01", "copia-x-02"]));

  const tipos = Object.values(out.sections as Record<string, { type: string }>).map(
    (item) => item.type,
  );

  assert.deepEqual(tipos, ["copia-x-01", "copia-x-02"]);
});

test("el orden va en `order`, no en las claves", () => {
  // Un objeto JSON no garantiza el orden de sus claves, y con veinte secciones
  // eso es una página barajada.
  const out = JSON.parse(templateFor(["a", "b", "c"]));

  assert.equal(out.order.length, 3);
  assert.equal(out.sections[out.order[0]].type, "a");
  assert.equal(out.sections[out.order[2]].type, "c");
});

test("cada sección carga la hoja de estilos", () => {
  // Una plantilla JSON no admite Liquid suelto, así que no hay dónde ponerla
  // una sola vez; el navegador se queda con una descarga aunque salga varias.
  const file = sectionFile({ liquid: "<p></p>", settings: [], name: "x", cssAsset: "copia.css" });

  assert.ok(file.includes("'copia.css' | asset_url | stylesheet_tag"));
});

test("la sección no lleva CSS dentro", () => {
  /*
   * Un archivo de tema no puede pasar de 256 KB, y repitiendo la hoja en cada
   * sección la primera se pasaba: Shopify la rechazaba y la página salía con
   * «is not a valid section type», que no dice nada de tamaños.
   */
  const file = sectionFile({ liquid: "<p></p>", settings: [], name: "x" });

  assert.ok(!file.includes("<style"));
});

test("ninguna sección se acerca al tope de tamaño", () => {
  // El marcado de un bloque son unos kilobytes; era el CSS lo que lo hinchaba.
  const file = sectionFile({
    liquid: "<div>".repeat(500) + "</div>".repeat(500),
    settings: [],
    name: "x",
  });

  assert.ok(Buffer.byteLength(file, "utf8") < 256 * 1024);
});

/* -------------------------- Partir en varias secciones --------------------- */

test("la página se parte por sus bloques de primer nivel", () => {
  /*
   * Con una sola sección, el panel del editor es una lista de cien ajustes sin
   * orden. Con varias, cada tramo se abre, se edita, se mueve y se quita.
   */
  const parts = splitTopLevel('<div class="copiado"><section>A</section><section>B</section></div>');

  assert.equal(parts.length, 2);
  assert.ok(parts[0].includes("A"));
  assert.ok(parts[1].includes("B"));
});

test("cada trozo conserva su envoltorio, o pierde todo su CSS", () => {
  // El CSS de la copia está acotado a `.copiado`: un trozo sin ese envoltorio
  // sale sin un solo estilo.
  for (const part of splitTopLevel("<section>A</section><section>B</section>")) {
    assert.ok(part.startsWith('<div class="copiado">'));
  }
});

test("los bloques anidados no se trocean por la mitad", () => {
  /*
   * Partir por `</div>` cortaría los `div` anidados, que es marcado inválido —
   * y eso no da error, da una página descolocada.
   */
  const parts = splitTopLevel("<div><div>dentro</div>fuera</div><p>otro</p>");

  assert.equal(parts.length, 2);
  assert.ok(parts[0].includes("<div>dentro</div>fuera"));
});

test("las etiquetas que se cierran solas no abren un bloque", () => {
  const parts = splitTopLevel('<img src="a.jpg"><p>texto</p>');

  assert.equal(parts.length, 2);
});

test("con demasiados bloques, los últimos se juntan en vez de perderse", () => {
  // Cincuenta secciones son inmanejables; quedarse con veinte perdería media
  // página, que es peor que una sección larga.
  const muchos = Array.from({ length: 50 }, (_, at) => `<p>${at}</p>`).join("");
  const parts = splitTopLevel(muchos, 20);

  assert.equal(parts.length, 20);
  assert.ok(parts[19].includes("49"));
});

test("lo que quede suelto al final no se tira", () => {
  // Iría a parar a ningún sitio y faltaría en la página.
  const parts = splitTopLevel("<p>uno</p>texto suelto");

  assert.ok(parts.some((part) => part.includes("texto suelto")));
});

/* ------------------- Lo que impedía sustituir una imagen ------------------- */

test("se quita el srcset, que es el que ganaba", () => {
  /*
   * El navegador prefiere `srcset` sobre `src` cuando están los dos. Cambiando
   * solo el `src`, la imagen nueva se escribía y **seguía viéndose la del
   * original**.
   */
  const out = sectionize('<img src="https://x/a.jpg" srcset="https://x/a-2x.jpg 2x" sizes="100vw">');

  assert.ok(!out.liquid.includes("srcset"));
  assert.ok(!out.liquid.includes("sizes="));
  assert.ok(out.liquid.includes("section.settings.img_1"));
});

test("los source de un picture no se quedan pisando la imagen", () => {
  // Un `<picture>` con `<source srcset>` no mira el `src` del `<img>`: si se
  // dejan, sustituir la imagen no cambia nada de lo que se ve.
  const out = sectionize('<picture><source srcset="https://x/a.webp"><img src="https://x/a.jpg"></picture>');

  assert.ok(!out.liquid.includes("a.webp"));
  assert.ok(out.liquid.includes("<picture>"));
});

test("los source de vídeo sí se quedan", () => {
  // Ahí es de donde sale el archivo: quitarlos deja el vídeo sin nada.
  const out = sectionize('<video><source src="https://x/a.webm" type="video/webm"></video>');

  assert.ok(out.liquid.includes("a.webm"));
});

test("cada imagen tiene subida y dirección, y manda la subida", () => {
  const out = sectionize('<img src="https://x/a.jpg">');

  assert.ok(out.settings.some((setting) => setting.id === "img_1"));
  assert.ok(out.settings.some((setting) => setting.id === "img_1_url"));

  // El orden del `if` es la prioridad: subida, dirección, original.
  const at = (needle: string) => out.liquid.indexOf(needle);
  assert.ok(at("{% if section.settings.img_1 %}") < at("elsif section.settings.img_1_url"));
  assert.ok(at("elsif section.settings.img_1_url") < at("https://x/a.jpg"));
});

/* ------------------- Las secciones que no se entendían --------------------- */

test("un bloque sin nada visible no llega a ser sección", () => {
  /*
   * Un `<div>` vacío o el contenedor de un script ya quitado sueltan una
   * sección más en el editor: aparece en la lista, no se puede editar y nadie
   * sabe qué trae.
   */
  const parts = splitTopLevel('<div class="a"></div><p>texto de verdad</p><div>&nbsp;</div>');

  assert.equal(parts.length, 1);
  assert.ok(parts[0].includes("texto de verdad"));
});

test("un bloque con solo una imagen sí cuenta", () => {
  // No tiene texto y es contenido: quitarlo dejaría un hueco en la página.
  assert.equal(splitTopLevel('<div><img src="https://x/a.jpg"></div>').length, 1);
});

test("un bloque que se lleva casi toda la página se parte por dentro", () => {
  /*
   * Muchas landings cuelgan de un único `<div>` envolvente. Partiendo solo por
   * el primer nivel sale **una sección con todo dentro** y unas migajas detrás
   * — justo lo que no se puede manejar en el editor.
   */
  const tramo = (n: number) => `<section>${"x".repeat(3000)} ${n}</section>`;
  const parts = splitTopLevel(`<div class="envoltorio">${tramo(1)}${tramo(2)}${tramo(3)}</div>`);

  assert.ok(parts.length >= 3, `salieron ${parts.length}`);
});

test("una página pequeña no se sigue partiendo hasta la frase", () => {
  // Sin mínimo de tamaño, cualquier página con dos párrafos acabaría con una
  // sección por frase.
  const parts = splitTopLevel("<div><p>uno</p><p>dos</p></div>");

  assert.equal(parts.length, 1);
});

test("el enlace de un botón se puede cambiar desde el editor", () => {
  const out = sectionize('<a class="boton" href="https://mitienda.com/products/x">Comprar</a>');

  assert.ok(out.settings.some((setting) => setting.id === "enlace_1"));
  assert.ok(out.liquid.includes("{{ section.settings.enlace_1 }}"));
  /*
   * Sin `default`: Shopify rechaza el **esquema entero** si un ajuste de tipo
   * `url` trae uno —«default must be a string or datasource access path»— y
   * entonces no se guarda el archivo. El original va dentro del Liquid.
   */
  assert.equal(out.settings.find((setting) => setting.id === "enlace_1")?.default, undefined);
  assert.ok(out.liquid.includes("https://mitienda.com/products/x"));
});

test("las anclas internas no se convierten en ajuste", () => {
  // Son navegación dentro de la misma página: un campo por cada «ver la oferta»
  // llenaría el panel sin que nadie los cambie nunca.
  const out = sectionize('<a href="#precios">Ver la oferta</a>');

  assert.equal(out.settings.length, 0);
});

/* ----------------------- Nombres que se reconocen ------------------------- */

test("el encargo lleva un tramo por bloque, con su texto", () => {
  /*
   * En el editor salen once secciones «Copia de trysculptique 01, 02, 03…».
   * Para mover el bloque de testimonios hay que abrirlas una a una.
   */
  const prompt = buildSectionNamesPrompt(["Ocho razones", "Lo que dicen"]);

  assert.ok(prompt.includes("Tramo 1"));
  assert.ok(prompt.includes("Tramo 2"));
  assert.ok(prompt.includes("Ocho razones"));
});

test("un nombre que falte deja el número, no desplaza al resto", () => {
  /*
   * Un nombre desplazado es peor que ninguno: pondría «La oferta» sobre los
   * testimonios y el orden se cambiaría al revés de lo que se quería.
   */
  const names = readSectionNames(["Titular", "", "La oferta"], 3, "Copia");

  assert.deepEqual(names, ["Titular", "Copia 02", "La oferta"]);
});

test("faltando nombres, los que sobran se numeran", () => {
  assert.deepEqual(readSectionNames(["Titular"], 3, "Copia"), [
    "Titular",
    "Copia 02",
    "Copia 03",
  ]);
});

test("un nombre repetido no distingue, así que se numera", () => {
  // Es el problema que esto viene a resolver: dos filas iguales en una lista.
  assert.deepEqual(readSectionNames(["Testimonios", "Testimonios"], 2, "Copia"), [
    "Testimonios",
    "Copia 02",
  ]);
});

test("lo que no sea una lista no rompe nada", () => {
  assert.equal(readSectionNames(null, 2, "Copia").length, 2);
  assert.equal(readSectionNames("Titular", 1, "Copia")[0], "Copia 01");
});

test("un nombre kilométrico se recorta", () => {
  // El panel del editor lo corta y deja dos filas que empiezan igual.
  assert.ok(readSectionNames(["x".repeat(90)], 1, "Copia")[0].length <= 24);
});

/* --------------------- Cortar donde cambia el fondo ------------------------ */

test("una clase con fondo propio cuenta como banda", () => {
  /*
   * Lo que hace que alguien vea «aquí empieza otra sección» casi siempre es un
   * cambio de fondo. Está en el CSS, así que se puede leer sin renderizar nada.
   */
  const bands = bandClasses(".hero{background:#f4f4f4}.texto{color:#111}");

  assert.ok(bands.has("hero"));
  assert.ok(!bands.has("texto"));
});

test("el blanco y lo transparente no separan nada", () => {
  // Tomarlos por banda partiría la página en cada `div`.
  const bands = bandClasses(".a{background:#fff}.b{background:transparent}.c{background:none}");

  assert.equal(bands.size, 0);
});

test("una banda a todo el ancho también cuenta", () => {
  assert.ok(bandClasses(".ancho{width:100vw}").has("ancho"));
});

test("los tramos que no abren banda se pegan al de arriba", () => {
  /*
   * Un titular y su fondo en secciones distintas se ven en el editor como dos
   * secciones que no se pueden mover por separado sin romper la página.
   */
  const bands = bandClasses(".banda{background:#eee}");
  const largo = "y".repeat(4000);

  const parts = splitTopLevel(
    `<div><div class="banda">A${largo}</div><p>suelto</p><div class="banda">B${largo}</div></div>`,
    20,
    bands,
  );

  assert.equal(parts.length, 2);
  assert.ok(parts[0].includes("suelto"));
});

test("section y header son banda por sí mismos", () => {
  // El marcado ya lo dice: no hace falta que el CSS lo repita.
  const largo = "y".repeat(4000);
  const parts = splitTopLevel(
    `<div><section>A${largo}</section><section>B${largo}</section></div>`,
    20,
    new Set(["algo"]),
  );

  assert.equal(parts.length, 2);
});

test("sin bandas conocidas se parte como antes", () => {
  const largo = "y".repeat(4000);
  const parts = splitTopLevel(`<div><p>A${largo}</p><p>B${largo}</p></div>`, 20, new Set());

  assert.equal(parts.length, 2);
});

test("un botón con `>` dentro de un atributo sí recibe su campo editable", () => {
  /*
   * Marcado real de un constructor de páginas: `aria-label` lleva un `>` dentro
   * del valor. Cualquier expresión con `[^>]*` corta ahí, no llega al `href` y
   * no crea el ajuste — el botón se queda sin campo en el editor de temas y
   * nada falla.
   */
  const tag = '<a aria-label="<p>QUIERO COMPRAR</p>" href="https://mitienda.com/p" class="boton">Ir</a>';
  const out = sectionize(tag);

  assert.ok(out.settings.some((setting) => setting.id === "enlace_1"), "no creó el ajuste");
  assert.ok(out.liquid.includes("{{ section.settings.enlace_1 }}"));
  assert.equal(out.settings.find((setting) => setting.id === "enlace_1")?.default, undefined);
  assert.ok(out.liquid.includes("https://mitienda.com/p"));
});

test("el atributo con `>` no se destroza al reescribir", () => {
  // Perderlo cambiaría lo que lee un lector de pantalla, y eso no se ve.
  const tag = '<a aria-label="<p>Comprar</p>" href="https://x.com/p">Ir</a>';

  assert.ok(sectionize(tag).liquid.includes('aria-label="<p>Comprar</p>"'));
});

test("una etiqueta sin cerrar no se reescribe a ciegas", () => {
  // Reescribir media página por una etiqueta partida es peor que dejarla.
  const roto = '<a href="https://x.com/p" class="sin cerrar';

  assert.equal(sectionize(roto).liquid, roto);
});

test("el caso real: el botón de trysculptique queda editable y entero", () => {
  /*
   * Es el marcado que falló en producción. Tres cosas tenían que salir bien a
   * la vez, y fallaba la tercera: leer la etiqueta hasta su cierre de verdad,
   * crear el ajuste del enlace, y **no** tratar el `<p>` de dentro del
   * `aria-label` como un párrafo. Ese último partía la etiqueta y se llevaba el
   * `href` por delante, dejando el botón sin campo y sin destino.
   */
  const tag =
    '<a aria-label="<p>QUIERO DESHINCHARME AHORA</p>" href="https://sculptchile.com/products/x?utm_content=adv37" class="gp-button-base"><span><p>QUIERO DESHINCHARME AHORA</p></span></a>';

  const out = sectionize(tag);

  assert.ok(out.settings.some((setting) => setting.id === "enlace_1"), "sin campo editable");
  assert.ok(out.liquid.includes("{{ section.settings.enlace_1 }}"), "sin liquid en el href");
  assert.ok(out.liquid.includes('aria-label="<p>QUIERO DESHINCHARME AHORA</p>"'), "atributo roto");
});

test("un `<p>` dentro de un atributo no es un párrafo", () => {
  // Tratarlo como marcado reescribe el valor del atributo y parte la etiqueta.
  const out = sectionize('<a aria-label="<p>Un texto suficientemente largo aquí</p>" href="https://x/p">Ir</a>');

  assert.ok(!out.settings.some((setting) => setting.type === "textarea"));
});

test("un titular dentro de un atributo tampoco", () => {
  const out = sectionize('<div data-tip="<h2>Oferta</h2>"><h2>Oferta de verdad</h2></div>');

  assert.equal(out.settings.filter((setting) => setting.type === "text").length, 1);
});

test("ningún ajuste de tipo url lleva default", () => {
  /*
   * Shopify no rechaza solo ese ajuste: **no guarda el archivo**. La página se
   * queda sin plantilla y el error que llega habla de permisos, que manda a
   * mirar donde no es.
   */
  const out = sectionize('<a href="https://x/p">Ir</a><img src="https://x/a.jpg">');

  for (const setting of out.settings) {
    if (setting.type === "url") assert.equal(setting.default, undefined, setting.id);
  }
});
