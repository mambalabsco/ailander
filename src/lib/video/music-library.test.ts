import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AD_BRIEFS,
  ENERGIES,
  MOODS,
  USES,
  buildPickPrompt,
  describeTrack,
  filterTracks,
  readPick,
  attributionFor,
  openverseQuery,
  readCatalogTrack,
  usableInAds,
  type Track,
} from "./music-library.ts";

const track = (over: Partial<Track> = {}): Track => ({
  id: "t1",
  name: "Cama cálida",
  url: "https://a/1.mp3",
  seconds: 90,
  mood: "calido",
  energy: "baja",
  uses: ["completo"],
  source: "generada",
  prompt: "warm acoustic bed",
  notes: "",
  ...over,
});

test("un filtro vacío no filtra", () => {
  /*
   * «No me importa el ánimo» y «quiero las que no tienen ánimo» no son lo
   * mismo. Tratarlos igual dejaría la lista vacía nada más abrir la pantalla,
   * que se lee como «no tienes música».
   */
  const tracks = [track(), track({ id: "t2", mood: "urgencia" })];

  assert.equal(filterTracks(tracks, {}).length, 2);
  assert.equal(filterTracks(tracks, { mood: "" }).length, 2);
});

test("filtra por ánimo, energía y para qué sirve", () => {
  const tracks = [
    track({ id: "a", mood: "urgencia", energy: "alta", uses: ["cierre"] }),
    track({ id: "b", mood: "calido", energy: "baja", uses: ["prueba"] }),
  ];

  assert.deepEqual(filterTracks(tracks, { mood: "urgencia" }).map((t) => t.id), ["a"]);
  assert.deepEqual(filterTracks(tracks, { energy: "baja" }).map((t) => t.id), ["b"]);
  assert.deepEqual(filterTracks(tracks, { use: "cierre" }).map((t) => t.id), ["a"]);
});

test("la duración mínima descarta lo que no cubre el vídeo", () => {
  // Es el fallo de siempre: una pieza preciosa de 30 s para un anuncio de 90.
  const tracks = [track({ id: "corta", seconds: 30 }), track({ id: "larga", seconds: 120 })];

  assert.deepEqual(filterTracks(tracks, { minSeconds: 90 }).map((t) => t.id), ["larga"]);
});

test("una pista sin duración medida no se descarta", () => {
  // Cero es «no se sabe», y esconderla obligaría a buscarla por otro sitio.
  const tracks = [track({ id: "sin", seconds: 0 })];

  assert.equal(filterTracks(tracks, { minSeconds: 90 }).length, 1);
});

test("la búsqueda no distingue acentos ni mayúsculas", () => {
  const tracks = [track({ id: "e", notes: "épico y lento" })];

  assert.equal(filterTracks(tracks, { text: "EPICO" }).length, 1);
  assert.equal(filterTracks(tracks, { text: "épico" }).length, 1);
  assert.equal(filterTracks(tracks, { text: "alegre" }).length, 0);
});

test("la búsqueda mira también el encargo con el que se generó", () => {
  const tracks = [track({ id: "p", prompt: "fingerpicked nylon guitar" })];

  assert.equal(filterTracks(tracks, { text: "nylon" }).length, 1);
});

test("la descripción lleva el identificador entre corchetes", () => {
  // Es lo que se le pide de vuelta al modelo: por nombre no vale, dos pistas
  // se pueden llamar igual.
  assert.match(describeTrack(track()), /^\[t1\]/);
});

test("el encargo incluye las pistas y pide el motivo", () => {
  const prompt = buildPickPrompt({ criteria: "algo íntimo", tracks: [track()], seconds: 90 });

  assert.ok(prompt.includes("[t1]"));
  assert.ok(prompt.includes("algo íntimo"));
  assert.match(prompt, /90 segundos/);
  assert.match(prompt, /por qué esa/);
});

test("el encargo deja decir que ninguna sirve", () => {
  // Sin esa salida, el modelo siempre elige una: la menos mala se presenta con
  // la misma seguridad que una buena.
  const prompt = buildPickPrompt({ criteria: "x", tracks: [track()] });

  assert.match(prompt, /ninguna cumple/);
});

test("solo se acepta un identificador que exista", () => {
  /*
   * Un modelo puede devolver uno inventado o el de una pista ya borrada. Usarlo
   * sin comprobar pondría en el anuncio una música que no existe — o ninguna,
   * en silencio.
   */
  const tracks = [track({ id: "real" })];

  assert.equal(readPick("Me quedo con [inventada] porque...", tracks), null);
  assert.equal(readPick("Me quedo con [real] porque...", tracks)?.id, "real");
});

test("con varios corchetes gana el primero que existe", () => {
  const tracks = [track({ id: "b" })];

  assert.equal(readPick("Entre [a] y [b], elijo [b].", tracks)?.id, "b");
});

test("los briefs sembrados usan etiquetas que existen", () => {
  // Una etiqueta escrita a mano que no está en la lista no filtra nunca: el
  // brief queda invisible y parece que no se guardó.
  const moods = new Set(MOODS.map((tag) => tag.id));
  const energies = new Set(ENERGIES.map((tag) => tag.id));
  const uses = new Set(USES.map((tag) => tag.id));

  for (const brief of AD_BRIEFS) {
    assert.ok(moods.has(brief.mood), `${brief.id}: ánimo ${brief.mood}`);
    assert.ok(energies.has(brief.energy), `${brief.id}: energía ${brief.energy}`);
    for (const use of brief.uses) assert.ok(uses.has(use), `${brief.id}: uso ${use}`);
  }
});

test("todos los briefs piden instrumental", () => {
  // Una cama con voz compite con la locución por el mismo sitio del oído, y en
  // un anuncio la locución siempre gana.
  for (const brief of AD_BRIEFS) {
    assert.match(brief.prompt, /no vocals/i, brief.id);
  }
});

/* ----------------------------- Catálogos libres ---------------------------- */

test("solo pasan las licencias que valen para un anuncio", () => {
  /*
   * `by-nc-nd` es lo que más sale buscando música de fondo, y es justo lo que
   * no se puede usar: NonCommercial prohíbe el anuncio y NoDerivatives prohíbe
   * montarla dentro de un vídeo. Suena perfecta y se descarga igual.
   */
  assert.ok(usableInAds("cc0"));
  assert.ok(usableInAds("by"));
  assert.ok(!usableInAds("by-nc-nd"));
  assert.ok(!usableInAds("by-nc"));
  assert.ok(!usableInAds("by-sa"));
  assert.ok(!usableInAds(""));
});

test("una licencia desconocida se descarta", () => {
  // El fallo va en el sentido correcto: dejar pasar lo que no se conoce acaba
  // en una reclamación; esconder una que valía solo cuesta una pista.
  assert.ok(!usableInAds("licencia-nueva-de-2027"));
});

test("la búsqueda pide solo licencias usables", () => {
  const sin = openverseQuery({ text: "cinematic" });
  assert.match(sin, /license=cc0(?!.*by-nc)/);
  assert.ok(!sin.includes("nc"));

  const con = openverseQuery({ text: "cinematic", allowAttribution: true });
  assert.match(con, /license=cc0%2Cby/);
});

test("la duración pedida recorta los efectos de sonido en el servidor", () => {
  assert.match(openverseQuery({ text: "x", minSeconds: 180 }), /length=long/);
  assert.match(openverseQuery({ text: "x", minSeconds: 60 }), /length=medium/);
  assert.ok(!openverseQuery({ text: "x", minSeconds: 10 }).includes("length="));
});

test("la duración del catálogo viene en milisegundos", () => {
  /*
   * Es el fallo que este mapeo existe para evitar: un `duration: 9369` leído
   * como segundos convierte un golpe de percusión en una pieza de dos horas y
   * media, que pasaría cualquier filtro de «que cubra el vídeo».
   */
  const parsed = readCatalogTrack({
    id: "x",
    title: "Hard Cinematic Hit",
    url: "https://cdn/x.mp3",
    duration: 9369,
    license: "cc0",
  });

  assert.equal(parsed?.seconds, 9);
});

test("la licencia se vuelve a comprobar al leer, no solo al pedir", () => {
  // El filtro del servidor es de ellos y puede cambiar; lo que está en juego es
  // publicar un anuncio con música que no se puede usar.
  const malo = readCatalogTrack({
    id: "x",
    title: "y",
    url: "https://cdn/x.mp3",
    duration: 180000,
    license: "by-nc-nd",
  });

  assert.equal(malo, null);
});

test("sin duración o sin dirección no hay pista", () => {
  assert.equal(readCatalogTrack({ id: "x", url: "https://cdn/x.mp3", license: "cc0" }), null);
  assert.equal(readCatalogTrack({ id: "x", duration: 5000, license: "cc0" }), null);
  assert.equal(readCatalogTrack("nada"), null);
});

test("las que no llegan a la duración pedida se caen", () => {
  const corta = readCatalogTrack(
    { id: "x", title: "y", url: "https://cdn/x.mp3", duration: 30000, license: "cc0" },
    90,
  );

  assert.equal(corta, null);
});

test("el ánimo sale de las etiquetas y lo desconocido se queda sin clasificar", () => {
  const conocido = readCatalogTrack({
    id: "x",
    title: "y",
    url: "https://cdn/x.mp3",
    duration: 180000,
    license: "cc0",
    tags: [{ name: "cinematic" }, { name: "trailer" }],
  });

  assert.equal(conocido?.mood, "cinematografico");

  const raro = readCatalogTrack({
    id: "z",
    title: "y",
    url: "https://cdn/z.mp3",
    duration: 180000,
    license: "cc0",
    tags: [{ name: "chirimoya" }],
  });

  assert.equal(raro?.mood, "");
});

test("CC0 no pide atribución y CC BY sí", () => {
  const libre = readCatalogTrack({
    id: "a",
    title: "Libre",
    url: "https://cdn/a.mp3",
    duration: 120000,
    license: "cc0",
    creator: "Alguien",
  });

  const citada = readCatalogTrack({
    id: "b",
    title: "Citada",
    url: "https://cdn/b.mp3",
    duration: 120000,
    license: "by",
    creator: "Otra",
    foreign_landing_url: "https://fuente/b",
  });

  assert.equal(attributionFor(libre!), "");
  assert.match(attributionFor(citada!), /Citada.*Otra.*https:\/\/fuente\/b/);
});

test("no se piden más resultados de los que el catálogo permite sin credenciales", () => {
  /*
   * Pedir cuarenta devuelve **401**, no un aviso ni una lista recortada: la
   * búsqueda entera falla. Estuvo a cuarenta desde el principio, así que la
   * biblioteca no encontró nunca nada y el mensaje decía «el catálogo no
   * contestó», que suena a que el servicio está caído.
   */
  const size = Number(new URL(openverseQuery({ text: "x" })).searchParams.get("page_size"));

  assert.ok(size <= 20, `page_size=${size}`);
});
