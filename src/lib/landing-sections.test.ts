import assert from "node:assert/strict";
import { test } from "node:test";
import {
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

test("un párrafo con enlace o negrita no se toca", () => {
  // Cambiarlo por un campo de texto se comería el `<a>` o el `<strong>`.
  const out = sectionize('<p>Mira <a href="#">esta oferta</a> antes de que acabe hoy</p>');

  assert.ok(out.liquid.includes("<a href=\"#\">"));
  assert.equal(out.settings.length, 0);
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

test("la plantilla carga la hoja y coloca las secciones en orden", () => {
  const out = templateFor("copia-x.css", ["copia-x-01", "copia-x-02"]);

  assert.ok(out.includes("'copia-x.css' | asset_url | stylesheet_tag"));
  assert.ok(out.indexOf("copia-x-01") < out.indexOf("copia-x-02"));
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
