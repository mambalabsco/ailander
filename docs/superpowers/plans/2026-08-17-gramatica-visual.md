# La gramática visual — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA:
> `superpowers:subagent-driven-development` o `superpowers:executing-plans`.

**Objetivo:** que el encargo de imagen deje de describir muebles colocados y pida
un anuncio: un dispositivo de confrontación, un titular de negación, tres alturas
de texto y una paleta que no se mueve dentro de la tanda.

**Arquitectura:** un módulo puro nuevo con las siete reglas **y** el catálogo de
instrucciones visuales —que se mueve ahí desde `short-ad-prompts.ts` para poder
probarlo—, cinco formatos nuevos sacados de las referencias, y los diez de ahora
reescritos.

**Spec:** `docs/superpowers/specs/2026-08-17-gramatica-visual-design.md`

## Restricciones globales

- **Nunca ejecutes prettier.**
- **Los tests cargan con ruta relativa y extensión.** `src/types/campaign.ts` sí
  se puede cargar: su único import es `import type`, y esos se borran al
  compilar. Comprobado.
- **`gramatica-visual.ts` no puede tener imports de valor con alias `@/`**, o deja
  de poder cargarse desde un test. `import type` sí.
- **Nada de lo que ya existe cambia de comportamiento**: los diez formatos
  conservan identificador y etapas.
- **Comentarios en español**, explicando **por qué**.
- Comprobaciones: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.

## Estructura de archivos

| Archivo | Qué |
|---|---|
| `src/lib/gramatica-visual.ts` | **Nuevo.** Las siete reglas y las quince instrucciones visuales |
| `src/lib/gramatica-visual.test.ts` | **Nuevo.** Deriva catálogo↔formatos, y las reglas |
| `src/types/campaign.ts` | Cinco formatos nuevos: array, fichas |
| `src/lib/short-ad-prompts.ts` | Pierde `FORMAT_IMAGE_BRIEFS`, gana el bloque de reglas |

---

### Tarea 1: Los cinco formatos nuevos

**Ficheros:** `src/types/campaign.ts`

**Interfaces:**
- Produce: `SHORT_AD_FORMATS` con quince identificadores y `SHORT_AD_FORMAT_META`
  con sus quince fichas.

- [ ] **Paso 1: Añadirlos al array** (línea 90), después de `"pregunta-directa"`:

```ts
  // Los cinco de las referencias: cada uno tiene un dispositivo de
  // confrontación, que es lo que separa un anuncio de una diapositiva.
  "rayo-de-negacion",
  "comparativa-dividida",
  "lo-que-probaste",
  "cadena-rota",
  "dos-vias",
```

- [ ] **Paso 2: Las cinco fichas** en `SHORT_AD_FORMAT_META`, al final:

```ts
  "rayo-de-negacion": {
    id: "rayo-de-negacion",
    name: "Rayo de negación",
    role: "Enfrenta la creencia falsa con la causa real: el mito a un lado, lo que de verdad pasa al otro.",
    origin: "propio",
    stages: ["TOFU", "MOFU"],
    hasText: true,
  },
  "comparativa-dividida": {
    id: "comparativa-dividida",
    name: "Comparativa dividida",
    role: "Una cara partida en dos: cómo se vive cuando funciona y cómo se vive ahora.",
    origin: "propio",
    stages: ["MOFU", "BOFU"],
    hasText: true,
  },
  "lo-que-probaste": {
    id: "lo-que-probaste",
    name: "Lo que probaste",
    role: "Nombra tachado todo lo que ya intentó y dice por qué ninguno llegó donde tenía que llegar.",
    origin: "propio",
    stages: ["MOFU"],
    hasText: true,
  },
  "cadena-rota": {
    id: "cadena-rota",
    name: "Cadena rota",
    role: "Enseña la cadena entera y señala el eslabón exacto que está roto.",
    origin: "propio",
    stages: ["MOFU", "BOFU"],
    hasText: true,
  },
  "dos-vias": {
    id: "dos-vias",
    name: "Dos vías",
    role: "El camino de siempre contra el del producto, paso a paso y en paralelo.",
    origin: "propio",
    stages: ["BOFU"],
    hasText: true,
  },
```

- [ ] **Paso 3:** `npx tsc --noEmit` — sin errores. Si falta una ficha, el
  `Record<KnownShortAdFormat, …>` lo caza aquí.

- [ ] **Paso 4: Commit**

```bash
git add src/types/campaign.ts
git commit -m "Cinco formatos con dispositivo, sacados de las creatividades que funcionaron"
```

---

### Tarea 2: La gramática y el catálogo, con sus pruebas

**Ficheros:** `src/lib/gramatica-visual.ts`, `src/lib/gramatica-visual.test.ts`

**Interfaces:**
- Consume: `SHORT_AD_FORMATS` (tarea 1).
- Produce: `reglasVisuales({ total }): string` e `INSTRUCCIONES_VISUALES:
  Record<string, string>`.

- [ ] **Paso 1: Escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { INSTRUCCIONES_VISUALES, reglasVisuales } from "./gramatica-visual.ts";
import { SHORT_AD_FORMATS } from "../types/campaign.ts";

test("todo formato conocido tiene su instrucción visual escrita", () => {
  /*
   * La prueba que de verdad importa, y es de deriva.
   *
   * Si añades un formato y olvidas su instrucción, el encargo dice literalmente
   * «Decide tú el tratamiento visual y descríbelo» y **no falla nada**: sale una
   * imagen genérica y nadie sabe por qué. Es el mismo fallo que el titular
   * recortado —el encargo y el catálogo separándose en silencio—.
   */
  const sinInstruccion = SHORT_AD_FORMATS.filter((id) => !INSTRUCCIONES_VISUALES[id]);

  assert.deepEqual(sinInstruccion, [], `sin instrucción visual: ${sinInstruccion.join(", ")}`);
});

test("no sobra ninguna instrucción de un formato que ya no existe", () => {
  const conocidos = new Set<string>(SHORT_AD_FORMATS);
  const huerfanas = Object.keys(INSTRUCCIONES_VISUALES).filter((id) => !conocidos.has(id));

  assert.deepEqual(huerfanas, []);
});

test("las reglas piden tres viñetas y no cinco", () => {
  // Las referencias ponen tres. El encargo anterior pedía cinco y llenaba la
  // imagen de texto que no se lee en el feed.
  const reglas = reglasVisuales({ total: 10 });

  assert.match(reglas, /tres viñetas/i);
  assert.ok(!/cinco viñetas/i.test(reglas));
});

test("las reglas exigen la medida del titular, no «grande»", () => {
  // «Grande» es relativo y un modelo lo lee como grandecito. Un cuarto del alto
  // no se puede interpretar.
  assert.match(reglasVisuales({ total: 10 }), /un cuarto del alto/i);
});

test("las reglas prohíben la letra pequeña", () => {
  assert.match(reglasVisuales({ total: 10 }), /letra pequeña/i);
});

test("las reglas dicen cuántos anuncios comparten paleta", () => {
  /*
   * El número tiene que ser el de la tanda real: escribir «todos» deja al modelo
   * decidir cuántos son.
   *
   * Con un total de una cifra esta prueba no valdría nada: las reglas van
   * numeradas del 1 al 7, así que un `/7/` acertaría sin que el total apareciera
   * por ninguna parte. Por eso 23.
   */
  assert.match(reglasVisuales({ total: 23 }), /23/);
});

test("el dispositivo es la primera regla y prohíbe la rejilla neutra", () => {
  const reglas = reglasVisuales({ total: 10 });

  assert.match(reglas, /dispositivo/i);
  assert.match(reglas, /rejilla/i);
});
```

- [ ] **Paso 2:** `npm test` — falla con «Cannot find module './gramatica-visual.ts'».

- [ ] **Paso 3: Escribir el módulo**

```ts
/**
 * Cómo se ve una creatividad, y no solo qué lleva dentro.
 *
 * **Existe porque los prompts no eran cortos: eran planos.** El encargo generaba
 * mil caracteres bien escritos que describían *muebles colocados* —«cuatro cajas
 * iguales en fila», «tres tarjetas en rejilla»—, y eso es una diapositiva. Las
 * creatividades que funcionan tienen otra cosa: **un dispositivo de
 * confrontación** —un rayo que parte el lienzo, una cara dividida, una cadena
 * con un eslabón roto— y una jerarquía tipográfica que no admite lectura tibia.
 *
 * Y un síntoma medido, que es el que más se notaba: tres anuncios seguidos del
 * mismo producto pidieron «fondo verde oscuro», «fondo claro» y «degradado a
 * verde menta». Tres marcas distintas. De ahí la regla de la paleta.
 *
 * Puro y sin imports de valor, para poder cargarlo desde `node --test`.
 */

/**
 * Las reglas que mandan sobre la instrucción de cada formato.
 *
 * Van **una sola vez** en el encargo y no repetidas en cada formato: repetirlas
 * diez veces gasta contexto y mueve el punto de corte de la caché de prefijo.
 */
export function reglasVisuales(opciones: { total: number }): string {
  return `## Cómo se ve una creatividad de esta marca

Estas siete reglas mandan sobre la instrucción visual de cada formato. Si una
instrucción y una regla se contradicen, **gana la regla**.

1. **Un dispositivo, siempre.** Cada imagen se organiza alrededor de UNA tensión
   visual: un rayo que parte el lienzo en dos, una cara dividida por la mitad,
   una cadena con un eslabón roto, dos paneles enfrentados, una lista tachada.
   **Nada de rejillas neutras** de tarjetas o cajas repartidas por igual: eso es
   una diapositiva, no un anuncio.

2. **Tres alturas de texto, y solo tres.** Un antetítulo de dos a cuatro
   palabras; debajo **una sola palabra** en mayúsculas que ocupe **un cuarto del
   alto del lienzo**; debajo un subtitular de una línea en el color de acento.
   Escribe esa medida dentro del prompt —«occupying one quarter of the canvas
   height»—, nunca «large» a secas: «grande» es relativo y sale grandecito.

3. **Tres viñetas. Nunca cinco.** Con casilla marcada, de cuatro a seis palabras
   cada una.

4. **Una sola paleta en los ${opciones.total}.** El primer anuncio fija fondo,
   color de acento y color de texto, y los demás los repiten **con las mismas
   palabras**. El rojo se reserva para el lado equivocado —el mito, lo que falló,
   el eslabón roto— y no se usa para nada más.

5. **La misma barra inferior en los ${opciones.total}**, con la forma
   \`Marca · Oferta · Garantía\`, escrita igual en todos.

6. **Nada de letra pequeña.** Lo que no se lea en una miniatura no entra: pedir
   «fine print» produce manchas grises ilegibles.

7. **El envase abajo y centrado**, descrito con las mismas palabras en todos.`;
}

/**
 * La instrucción visual de cada formato.
 *
 * Vive aquí y no en `short-ad-prompts.ts` para poder probar que ningún formato
 * se queda sin ella: aquel importa con alias y no se puede cargar desde un test.
 */
export const INSTRUCCIONES_VISUALES: Record<string, string> = {
  "cuaderno-manuscrito": `Cuaderno de espiral sobre mesa de madera, luz cálida. En la hoja, **una sola frase manuscrita enorme** ocupando media página y subrayada a marcador; el resto de la nota, mucho más pequeño y a boli. El producto apoyado encima. El dispositivo es el salto de tamaño entre esa frase y todo lo demás: nada de párrafos parejos.`,

  "beneficios-flotantes": `Persona real del público sosteniendo el producto, **iluminada** contra un fondo del color de marca que se apaga hacia los bordes. Solo **tres** etiquetas flotantes en píldora, grandes y legibles. Encima, el antetítulo pequeño y la palabra gigante. El dispositivo es la luz: ella brilla y el fondo no.`,

  "urgencia-countdown": `Un reloj enorme ocupando un tercio del lienzo, con la aguja en rojo, enfrentado al producto al otro lado. Entre los dos, el plazo como palabra gigante. Nada de escena de temporada con muchos elementos: el reloj contra el producto y ya.`,

  "comparativa-precio": `Tres gastos cotidianos **tachados**, en gris y pequeños a un lado, contra el producto al otro ocupando el doble de espacio. Entre ambos, el coste diario del producto como titular a un cuarto del alto. Tres viñetas debajo. Nada más.`,

  "testimonios-grid": `**Un solo** testimonio grande —foto circular, cinco estrellas y la cita como titular a un cuarto del alto— con dos más pequeños debajo a modo de refuerzo. El dispositivo es la jerarquía: uno manda y dos acompañan. Nada de tres tarjetas iguales en fila.`,

  "antes-despues": `Dos encuadres de la misma persona separados por una **línea diagonal marcada**, no por un borde fino: el izquierdo desaturado y apagado, el derecho con color y luz. Un rótulo corto sobre cada lado. La diferencia se ve y sigue siendo creíble.`,

  "ugc-selfie": `Foto de móvil sin producción: alguien del público sosteniendo el producto en su casa, luz de ventana, encuadre descentrado e imperfecto. **Es el único formato sin texto incrustado y sin dispositivo**: su fuerza es parecer una foto enviada a una amiga, así que las reglas 1, 2 y 3 no se le aplican. Las demás sí.`,

  "mecanismo-explicado": `Tres pasos encadenados de izquierda a derecha con flechas, y el **tercero roto y en rojo**, marcado con una equis. El producto debajo, con una flecha gruesa señalando justo ese paso. Arriba, el titular de negación.`,

  "packshot-oferta": `El producto centrado y grande sobre fondo liso del color de marca, con el precio como **la palabra gigante** —un cuarto del alto— y el precio anterior tachado al lado, mucho más pequeño. Tres sellos en píldora debajo. Mucho aire alrededor.`,

  "pregunta-directa": `Fondo liso y saturado con una sola pregunta ocupando casi todo el lienzo, **la última palabra en el color de acento** y el resto en blanco. El producto pequeño abajo, centrado. La pregunta es la creatividad.`,

  "rayo-de-negacion": `A la izquierda, la silueta de una persona apagada, en gris y hundida. A la derecha, la misma silueta **iluminada** con el color de acento, de pie y con los brazos arriba. Entre las dos, **un rayo que parte el lienzo de arriba abajo**. Sobre la izquierda, una insignia roja redondeada con el mito y una equis; sobre la derecha, una verde con la causa real y un check. En el centro, el antetítulo pequeño y debajo la palabra gigante con lo que se niega, y bajo ella el subtitular en el color de acento con la causa real. Tres viñetas. Envase abajo centrado.`,

  "comparativa-dividida": `El primer plano de una persona **partido justo por la mitad**: la mitad izquierda con color y sonriendo, la derecha en gris y agotada. Sobre cada mitad, un rótulo en píldora: a la izquierda cómo se vive cuando funciona, a la derecha «la tuya». A cada lado, cinco filas cortas en píldora, con check verde a la izquierda y equis roja a la derecha. El producto centrado sobre la línea de corte. Arriba, el titular de negación en dos líneas, la segunda con la parte clave en el color de acento.`,

  "lo-que-probaste": `Dos columnas. A la izquierda, bajo el rótulo «lo que probaste», siete u ocho soluciones **tachadas con una línea**, en gris. A la derecha, bajo «por qué no funcionó», una frase corta en el color de acento y debajo la explicación en dos líneas. Entre las columnas, un rayo vertical. Abajo, cruzando el ancho, la palabra gigante con lo que de verdad falló. Envase abajo centrado.`,

  "cadena-rota": `Una cadena de cinco eslabones redondeados en fila, unidos por flechas. Los dos primeros en verde con check; **el tercero en rojo, roto y con una equis**; los dos últimos apagados en gris. Dentro del roto, en mayúsculas, lo que le falta. Desde el producto, abajo, una flecha gruesa del color de acento apuntando justo a ese eslabón. Arriba, el titular. Fondo claro para que la cadena se lea.`,

  "dos-vias": `Dos paneles verticales enfrentados con borde redondeado: el izquierdo con borde rojo y el rótulo del camino de siempre, el derecho con borde del color de acento y el del camino del producto. Dentro de cada uno, cinco pasos en vertical unidos por flechas hacia abajo, con equis roja a la izquierda y check verde a la derecha, y un dibujo sencillo encima de cada columna. El producto entre los dos paneles. Abajo, dos líneas grandes con la conclusión.`,
};
```

- [ ] **Paso 4:** `npm test` — las siete pasan.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/gramatica-visual.ts src/lib/gramatica-visual.test.ts
git commit -m "La gramática visual de una creatividad, y sus quince instrucciones"
```

---

### Tarea 3: Enchufarla en el encargo

**Ficheros:** `src/lib/short-ad-prompts.ts`

**Interfaces:**
- Consume: `reglasVisuales`, `INSTRUCCIONES_VISUALES` (tarea 2).

- [ ] **Paso 1: Borrar `FORMAT_IMAGE_BRIEFS`** entero (líneas 45-56) y sus diez
  entradas. Se ha movido, no duplicado: dejarlo sería mantener dos catálogos que
  se separan.

- [ ] **Paso 2: Importar lo nuevo**, junto a los demás imports:

```ts
import { INSTRUCCIONES_VISUALES, reglasVisuales } from "@/lib/gramatica-visual";
```

- [ ] **Paso 3: Usar el catálogo nuevo** en `formatList`: sustituye
  `FORMAT_IMAGE_BRIEFS[format]` por `INSTRUCCIONES_VISUALES[format]`. El
  respaldo se queda como está —un formato inventado por el modelo no tiene
  instrucción escrita y hay que decírselo—.

- [ ] **Paso 4: Meter las reglas en el encargo**, **antes** de la lista de
  formatos. Busca la línea que abre el bloque de formatos e inserta delante:

```ts
${reglasVisuales({ total: count })}

```

- [ ] **Paso 5:** `npx tsc --noEmit && npm run lint && npm test && npm run build`.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/short-ad-prompts.ts
git commit -m "El encargo pide un dispositivo y una paleta, no una rejilla"
```

---

### Tarea 4: La comprobación

- [ ] **Paso 1:** `npm run dev`, producto con investigación, pestaña Ads, generar
  una tanda **de tres** —no de diez: esto cuesta dinero—.

- [ ] **Paso 2:** Leer los tres `imagePrompt` que salgan y comprobar, sin generar
  imagen todavía:
  1. Los tres piden **el mismo fondo con las mismas palabras**.
  2. Cada uno nombra su dispositivo —rayo, cara partida, cadena rota, línea
     diagonal— y ninguno dice «cuatro cajas iguales en fila».
  3. Los tres llevan la medida del titular escrita, no «large».
  4. Tres viñetas, no cinco.
  5. La misma barra inferior en los tres.

- [ ] **Paso 3:** Solo si los tres pasan, generar las imágenes y comparar con las
  referencias.

- [ ] **Paso 4:** Lo que falle, a `docs/pendiente.md`.
