import assert from "node:assert/strict";
import { test } from "node:test";
import { sectionFile, sectionize, sectionNote, templateFor } from "./landing-sections.ts";

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

test("los párrafos se quedan como están", () => {
  // Cientos de ajustes de párrafo hacen el panel inservible.
  const out = sectionize("<p>Un texto largo de la página</p>");

  assert.equal(out.settings.length, 0);
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
  const file = sectionFile({ liquid: out.liquid, css: ".a{}", settings: out.settings, name: "Copia" });

  const raw = /{% schema %}([\s\S]*?){% endschema %}/.exec(file);
  assert.ok(raw);
  assert.doesNotThrow(() => JSON.parse(raw[1]));
});

test("el nombre de la sección no se pasa de largo", () => {
  // El panel del editor lo recorta y deja dos secciones con el mismo nombre.
  const file = sectionFile({ liquid: "", css: "", settings: [], name: "x".repeat(80) });
  const schema = JSON.parse(/{% schema %}([\s\S]*?){% endschema %}/.exec(file)![1]);

  assert.ok(schema.name.length <= 25);
});

test("la sección no se puede insertar por error en otra página", () => {
  // Sin `presets` no aparece en «añadir sección»: la coloca la plantilla y
  // nadie mete la página de otro en la portada sin querer.
  const file = sectionFile({ liquid: "", css: "", settings: [], name: "Copia" });
  const schema = JSON.parse(/{% schema %}([\s\S]*?){% endschema %}/.exec(file)![1]);

  assert.equal(schema.presets, undefined);
});

test("la plantilla solo coloca la sección", () => {
  assert.equal(templateFor("copia-x"), "{% section 'copia-x' %}");
});

test("sin CSS no se escribe un bloque de estilos vacío", () => {
  assert.ok(!sectionFile({ liquid: "<p></p>", css: "", settings: [], name: "x" }).includes("<style"));
});
