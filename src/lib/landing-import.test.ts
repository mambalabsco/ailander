import assert from "node:assert/strict";
import { test } from "node:test";

import { judgeImport, MIN_WORDS, readPageUrl } from "./landing-import.ts";

const palabras = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(" ");

/* ------------------------------ La dirección ------------------------------- */

test("se acepta pegada sin https", () => {
  // Es como se copia de la barra a veces.
  assert.equal(readPageUrl("trysculptique.com").url, "https://trysculptique.com/");
});

test("una dirección completa se respeta", () => {
  assert.equal(
    readPageUrl("https://trysculptique.com/pages/oferta").url,
    "https://trysculptique.com/pages/oferta",
  );
});

test("lo que no es una dirección se rechaza con motivo", () => {
  assert.match(readPageUrl("no soy una url").problem, /dirección web/);
  assert.match(readPageUrl("   ").problem, /Pega el enlace/);
});

/*
 * Esta descarga la hace el **servidor**: llega a sitios a los que nadie llega
 * desde fuera. Sin filtro, pegar una dirección interna lo convierte en una
 * ventana.
 */
test("lo interno no se descarga", () => {
  assert.equal(readPageUrl("http://localhost:3000").url, "");
  assert.equal(readPageUrl("http://192.168.1.10").url, "");
  assert.equal(readPageUrl("http://169.254.169.254/latest/meta-data").url, "");
  assert.equal(readPageUrl("http://intranet.local").url, "");
});

test("lo que no es web no se descarga", () => {
  assert.equal(readPageUrl("ftp://archivos.com/algo").url, "");
  assert.equal(readPageUrl("file:///etc/passwd").url, "");
});

/* ---------------------------- Lo que llegó sirve --------------------------- */

/*
 * El fallo que persigue esto: una página moderna devuelve un 200 con casi nada
 * dentro, porque el contenido lo pinta el navegador. Guardar eso es guardar un
 * cascarón y generar después una landing a partir de nada.
 */
test("un cascarón se rechaza diciendo por qué", () => {
  const result = judgeImport({
    title: "Sculptique",
    text: "Cargando… Inicio Tienda Contacto",
    host: "trysculptique.com",
  });

  assert.ok(result.problem);
  assert.match(result.problem, /pinta el navegador/);
});

test("sin nada de texto se dice que puede estar bloqueando", () => {
  const result = judgeImport({ title: "", text: "", host: "x.com" });

  assert.match(result.problem, /bloquee las descargas/);
});

test("una landing de verdad pasa", () => {
  const result = judgeImport({
    title: "La verdad sobre la tiroides",
    text: palabras(1200),
    host: "x.com",
  });

  assert.equal(result.problem, "");
  assert.equal(result.note, "");
  assert.ok(result.words >= MIN_WORDS);
});

test("una página corta pasa, pero se pide repasarla", () => {
  // Entre el mínimo y las seiscientas puede ser una landing corta legítima o
  // media página descargada, y eso hay que mirarlo antes de calcarlo.
  const result = judgeImport({ title: "x", text: palabras(300), host: "x.com" });

  assert.equal(result.problem, "");
  assert.match(result.note, /repásala/);
});

/*
 * Un menú son cincuenta palabras de una a tres letras. Contarlas igual que las
 * de un párrafo haría pasar por buena una página vacía.
 */
test("las palabras de una y dos letras no cuentan", () => {
  const menu = Array.from({ length: 200 }, () => "de la a el un").join(" ");
  const result = judgeImport({ title: "x", text: menu, host: "x.com" });

  assert.ok(result.problem, "un menú largo no puede pasar por una landing");
});

test("sin título se compone uno con el dominio", () => {
  const result = judgeImport({ title: "", text: palabras(1200), host: "naturox.cl" });

  assert.equal(result.title, "Landing de naturox.cl");
});

test("un título larguísimo se recorta", () => {
  const result = judgeImport({ title: "a".repeat(300), text: palabras(1200), host: "x.com" });

  assert.ok(result.title.length <= 120);
});

test("los espacios de más no se guardan", () => {
  const result = judgeImport({ title: " x ", text: "  hola    mundo   ", host: "x.com" });

  assert.equal(result.text, "hola mundo");
});
