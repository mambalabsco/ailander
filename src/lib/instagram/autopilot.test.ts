import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cabenPorDia,
  decide,
  horaProgramada,
  mismaHoraEnUTC,
  repartoAutopiloto,
  SEPARACION_MINUTOS,
  TOPE_API,
} from "./autopilot.ts";

const base = {
  ahora: "2026-08-12T19:00:00.000Z",
  porDia: 1,
  colchonDias: 3,
  horaDesde: 18,
  horaHasta: 21,
  publicadasUltimas24h: 0,
  ultimaPublicacionAt: null as string | null,
  listas: [] as { scheduledAt: string }[],
};

test("con la cola vacía se escribe el colchón entero", () => {
  const { escribir } = decide(base);

  assert.equal(escribir, 3, "tres días × una al día");
});

test("con el colchón lleno no se escribe nada", () => {
  const listas = [
    { scheduledAt: "2026-08-13T19:00:00.000Z" },
    { scheduledAt: "2026-08-14T19:00:00.000Z" },
    { scheduledAt: "2026-08-15T19:00:00.000Z" },
  ];

  assert.equal(decide({ ...base, listas }).escribir, 0);
});

test("solo se escribe lo que falta, no el colchón entero", () => {
  const listas = [{ scheduledAt: "2026-08-13T19:00:00.000Z" }];

  assert.equal(decide({ ...base, listas }).escribir, 2);
});

test("dos al día piden el doble de colchón", () => {
  assert.equal(decide({ ...base, porDia: 2 }).escribir, 6);
});

test("se publica cuando toca", () => {
  const { publicar } = decide(base);

  assert.equal(publicar, true);
});

test("el tope propio del día detiene la publicación", () => {
  const resultado = decide({ ...base, publicadasUltimas24h: 1, porDia: 1 });

  assert.equal(resultado.publicar, false);
  assert.ok(resultado.motivo.includes("tope"), `el motivo tiene que decirlo: ${resultado.motivo}`);
});

test("el tope de la API manda aunque el propio sea altísimo", () => {
  /*
   * Pasarse no falla al programar: falla al publicar, horas después. Así que se
   * para aquí y no allí.
   */
  const resultado = decide({ ...base, porDia: 100, publicadasUltimas24h: TOPE_API });

  assert.equal(resultado.publicar, false);
  assert.ok(resultado.motivo.includes("Instagram"));
});

test("la separación mínima evita que un atasco resuelto vomite cinco seguidas", () => {
  const haceDiezMinutos = "2026-08-12T18:50:00.000Z";
  const resultado = decide({ ...base, ultimaPublicacionAt: haceDiezMinutos });

  assert.equal(resultado.publicar, false);
  assert.ok(resultado.motivo.includes("separación"));
});

test("pasada la separación se vuelve a publicar", () => {
  const haceDosHoras = "2026-08-12T17:00:00.000Z";

  assert.equal(decide({ ...base, ultimaPublicacionAt: haceDosHoras }).publicar, true);
});

test("no poder publicar no impide seguir rellenando", () => {
  /*
   * Son dos cosas independientes: que hoy ya se haya publicado no significa que
   * la cola de la semana que viene esté llena.
   */
  const resultado = decide({ ...base, publicadasUltimas24h: 1 });

  assert.equal(resultado.publicar, false);
  assert.equal(resultado.escribir, 3);
});

/** Una pieza en su hueco, con la ventana de siempre y el reloj de siempre. */
const hora = (
  hueco: number,
  semilla: string,
  porDia = 1,
  desde = 18,
  hasta = 21,
  zonaHoraria = "UTC",
) =>
  horaProgramada({
    base: new Date(base.ahora),
    hueco,
    porDia,
    horaDesde: desde,
    horaHasta: hasta,
    zonaHoraria,
    semilla,
  });

/** Qué hora marca ese instante en esa zona. */
const horaEn = (iso: string, zona: string): number =>
  Number(
    new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", hour: "2-digit" }).format(
      new Date(iso),
    ),
  );

test("la hora cae dentro de la ventana", () => {
  const cuando = new Date(hora(0, "pieza-uno"));

  assert.ok(cuando.getUTCHours() >= 18 && cuando.getUTCHours() <= 21, cuando.toISOString());
});

test("la misma pieza da siempre la misma hora", () => {
  /*
   * Determinista y no aleatoria: dos vueltas del cron sobre la misma pieza le
   * pondrían dos horas distintas, y el calendario cambiaría solo.
   */
  assert.equal(hora(0, "pieza-uno"), hora(0, "pieza-uno"));
});

test("dos piezas del mismo día no caen a la misma hora clavada", () => {
  assert.notEqual(hora(0, "pieza-uno", 2), hora(1, "pieza-dos", 2));
});

test("cada día va después del anterior", () => {
  assert.ok(new Date(hora(1, "a")) > new Date(hora(0, "a")));
});

test("con dos al día, dos piezas caen el mismo día", () => {
  /*
   * Era el fallo: `decide` pedía `colchonDias × porDia` piezas y esto colocaba
   * una por día de calendario. Con `por_dia: 2` se escribían seis repartidas en
   * seis días, la cuenta seguía publicando una vez al día y el colchón parecía
   * lleno para siempre.
   */
  const primera = new Date(hora(0, "a", 2));
  const segunda = new Date(hora(1, "b", 2));

  assert.equal(primera.getUTCDate(), segunda.getUTCDate());
  assert.notEqual(new Date(hora(2, "c", 2)).getUTCDate(), primera.getUTCDate());
});

test("dos del mismo día respetan la separación mínima", () => {
  for (const [uno, otro] of [
    ["a", "b"],
    ["pieza-larguísima-con-otro-nombre", "x"],
    ["zzz", "aaa"],
  ]) {
    const primera = new Date(hora(0, uno, 2)).getTime();
    const segunda = new Date(hora(1, otro, 2)).getTime();

    assert.ok(
      (segunda - primera) / 60_000 >= SEPARACION_MINUTOS,
      `${uno}/${otro}: ${(segunda - primera) / 60_000} minutos`,
    );
  }
});

test("tres al día siguen separadas y siguen dentro de la ventana", () => {
  const cuando = [hora(0, "a", 3), hora(1, "b", 3), hora(2, "c", 3)].map((one) => new Date(one));

  for (const una of cuando) {
    assert.ok(una.getUTCHours() >= 18 && una.getUTCHours() <= 21, una.toISOString());
  }

  assert.ok((cuando[1].getTime() - cuando[0].getTime()) / 60_000 >= SEPARACION_MINUTOS);
  assert.ok((cuando[2].getTime() - cuando[1].getTime()) / 60_000 >= SEPARACION_MINUTOS);
});

test("en la ventana de 18 a 21 caben tres, no cinco", () => {
  // Cuatro horas dan para 18:00, 19:30 y 21:00. La quinta pieza no cabe sin
  // apilarse, así que se va al día siguiente y quien llama lo dice en el parte.
  assert.equal(cabenPorDia(18, 21), 3);
});

test("la ventana que no da para las pedidas estira el reparto, no las apila", () => {
  const cuando = [0, 1, 2, 3, 4].map((hueco) => new Date(hora(hueco, `pieza-${hueco}`, 5)));

  // Las tres que caben van hoy; la cuarta y la quinta, al día siguiente.
  assert.equal(cuando[0].getUTCDate(), cuando[2].getUTCDate());
  assert.notEqual(cuando[3].getUTCDate(), cuando[0].getUTCDate());

  for (let i = 1; i < cuando.length; i += 1) {
    const minutos = (cuando[i].getTime() - cuando[i - 1].getTime()) / 60_000;

    assert.ok(minutos >= SEPARACION_MINUTOS, `entre ${i - 1} y ${i}: ${minutos} minutos`);
  }
});

test("la ventana abierta de par en par no pega el final de un día con el principio del otro", () => {
  /*
   * Con `0` a `23` la última del día podía caer a las 23:59 y la primera del
   * siguiente a las 00:00: dos publicaciones con un minuto de diferencia, cada
   * una dentro de su ventana y ninguna comprobación viéndolo.
   */
  const cuando = [0, 1, 2, 3, 4, 5].map((hueco) => new Date(hora(hueco, `p${hueco}`, 2, 0, 23)));

  for (let i = 1; i < cuando.length; i += 1) {
    const minutos = (cuando[i].getTime() - cuando[i - 1].getTime()) / 60_000;

    assert.ok(minutos >= SEPARACION_MINUTOS, `entre ${i - 1} y ${i}: ${minutos} minutos`);
  }
});

test("la misma ventana en dos zonas da instantes distintos", () => {
  /*
   * Era el fallo silencioso: la ventana se leía en UTC y nada lo decía. Quien
   * pedía de 18 a 21 desde México publicaba a las 12:00 locales y solo se
   * enteraba mirando a qué hora salía la cuenta.
   */
  const enUTC = hora(0, "pieza", 1, 18, 21, "UTC");
  const enMexico = hora(0, "pieza", 1, 18, 21, "America/Mexico_City");

  assert.notEqual(enUTC, enMexico);
  assert.equal(horaEn(enUTC, "UTC") >= 18 && horaEn(enUTC, "UTC") <= 21, true);

  const local = horaEn(enMexico, "America/Mexico_City");
  assert.ok(local >= 18 && local <= 21, `en México salió a las ${local}`);
});

test("una zona con desfase de media hora también cae dentro de la ventana", () => {
  // India va a +5:30. Un desfase en horas enteras la deja media hora fuera de
  // la franja, y media hora antes de las 18:00 son las 17:30: fuera.
  for (const hueco of [0, 1, 2]) {
    const cuando = hora(hueco, `pieza-${hueco}`, 2, 18, 21, "Asia/Kolkata");
    const local = horaEn(cuando, "Asia/Kolkata");

    assert.ok(local >= 18 && local <= 21, `${cuando} son las ${local} en Kolkata`);
  }

  /*
   * Y la media hora está de verdad ahí. La misma pieza con la misma ventana:
   * en Kolkata el día de calendario local ya es el siguiente —a las 19:00 UTC
   * allí es la madrugada— y al instante hay que restarle 5:30. La diferencia
   * son 24h − 5:30 = 1.110 minutos, que con un desfase en horas enteras no
   * saldría.
   */
  const enUTC = new Date(hora(0, "pieza-0", 2, 18, 21, "UTC")).getTime();
  const enKolkata = new Date(hora(0, "pieza-0", 2, 18, 21, "Asia/Kolkata")).getTime();

  assert.equal((enKolkata - enUTC) / 60_000, 1_110);
});

test("con horario de verano la ventana sigue siendo la de pared", () => {
  // Madrid está en CEST en agosto: +2. Si el desfase se calculara con el
  // instante equivocado, la pieza saldría una hora antes durante medio año.
  const cuando = hora(0, "pieza", 1, 18, 21, "Europe/Madrid");
  const local = horaEn(cuando, "Europe/Madrid");

  assert.ok(local >= 18 && local <= 21, `en Madrid salió a las ${local}`);
});

test("una zona que no existe no tumba la vuelta: se programa en UTC", () => {
  assert.equal(hora(0, "pieza", 1, 18, 21, "Marte/Olympus"), hora(0, "pieza", 1, 18, 21, "UTC"));
});

test("el panel puede decir a qué hora UTC equivale la ventana", () => {
  const cuando = new Date(base.ahora);

  assert.equal(mismaHoraEnUTC(18, "UTC", cuando), "18:00");
  // India va a +5:30, y media hora es exactamente lo que un desplegable de
  // horas enteras no sabría enseñar.
  assert.equal(mismaHoraEnUTC(18, "Asia/Kolkata", cuando), "12:30");
  // Agosto en Madrid es CEST, +2.
  assert.equal(mismaHoraEnUTC(18, "Europe/Madrid", cuando), "16:00");
});

test("el autopiloto solo reparte lo que sabe terminar", () => {
  /*
   * Reusando `weekPlan` salían reels —que se quedan esperando un vídeo que no
   * se genera solo, una fila huérfana por ciclo— y carruseles, que están fuera
   * del alcance del diseño y salían como una imagen suelta con un pie escrito
   * para deslizar.
   */
  const plan = repartoAutopiloto(8);

  assert.deepEqual(new Set(plan), new Set(["feed", "historia"]));
});

test("el reparto alterna y continúa donde se quedó", () => {
  assert.deepEqual(repartoAutopiloto(4), ["feed", "historia", "feed", "historia"]);
  // Con tres ya escritas, la siguiente tanda no vuelve a empezar por «feed».
  assert.deepEqual(repartoAutopiloto(2, 3), ["historia", "feed"]);
  assert.deepEqual(repartoAutopiloto(0), []);
});

test("la separación mínima es la que dice la constante", () => {
  assert.equal(SEPARACION_MINUTOS, 90);
});
