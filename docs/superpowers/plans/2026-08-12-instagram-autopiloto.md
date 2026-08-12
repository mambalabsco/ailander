# Autopiloto de Instagram — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cron escriba las publicaciones de Instagram, les genere la imagen, las programe y las publique solo, con los topes de la cuenta respetados y un panel que diga por qué está parado cuando lo está.

**Architecture:** Una ruta de cron protegida por secreto llama a un bucle **puro** (`autopilot.ts`) que decide qué toca; toda la escritura pasa por una capa de datos de servicio nueva que filtra por `workspace_id` explícito, porque bajo `service_role` no hay RLS ni `auth.uid()`. La capa de sesión que usa la interfaz no se toca.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (Postgres + RLS), `@anthropic-ai/sdk`, `sharp`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-12-instagram-autopiloto-design.md`

## Global Constraints

- **Next.js 16 no es el que conoces.** `AGENTS.md` lo dice: antes de escribir código de rutas o acciones, lee la guía correspondiente en `node_modules/next/dist/docs/`. No escribas una Route Handler de memoria.
- **Tests:** `npm test` → `node --test` sobre `src/**/*.test.ts`. Los imports relativos dentro de `src/lib` llevan extensión `.ts` (ver `plan.test.ts`).
- **Idioma:** todo el código, los comentarios, los mensajes de error y los commits van en español, con el tono del repo: explicar **por qué**, no qué.
- **`service_role` nunca llega al navegador.** Solo en la ruta de cron y en `src/lib/data/instagram-service.ts`, ambos con `import "server-only"`.
- **Toda escritura de la capa de servicio pone `workspace_id` y `user_id` a mano.** El trigger `poner_espacio()` usa `auth.uid()`, que bajo `service_role` es NULL, y una fila sin espacio es invisible en la interfaz.
- **Tras cada commit, `git push origin main`.** El servidor despliega con `git pull`.
- El agente **no aprueba ni publica por decisión propia**: publica lo que el autopiloto ya aprobó según sus reglas. Aprobar a mano sigue existiendo para quien no usa autopiloto.

---

### Task 1: El `enfoque` que se tiraba

La herramienta `escribir_publicaciones` declara `enfoque` —lo que traduce «insiste en el sueño»— y nadie lo pasa. El agente dice que lo hizo y escribe lo de siempre. Se arregla primero porque es un fallo que **miente sin dar error** y no depende de nada más.

**Files:**
- Modify: `src/lib/instagram/content.ts` (añadir `buildFocusNote`)
- Modify: `src/app/products/[id]/instagram-actions.ts:22-154` (`generateInstagramAction` recibe `focus`)
- Modify: `src/app/products/[id]/agent-actions.ts:133-144` (pasar `args.enfoque`)
- Test: `src/lib/instagram/content.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `buildFocusNote(focus: string): string` — bloque de encargo, cadena vacía si no hay enfoque.

- [ ] **Step 1: Write the failing test**

En `src/lib/instagram/content.test.ts`, añadir al final:

```ts
test("el enfoque entra en el encargo con las palabras de quien lo pidió", () => {
  /*
   * Parafrasearlo lo estropea: «insiste en el sueño» y «habla de descanso
   * nocturno» no piden lo mismo, y quien lo dijo no reconoce lo segundo.
   */
  const nota = buildFocusNote("  insiste en el sueño  ");

  assert.ok(nota.includes("insiste en el sueño"), "va literal");
  assert.ok(!nota.includes("  insiste"), "sin los espacios de sobra");
  assert.ok(nota.toLowerCase().includes("todas"), "manda para todas las piezas de la tanda");
});

test("sin enfoque no se añade una sección vacía", () => {
  // Un «## En qué insistir» sin nada debajo invita a inventarse un tema.
  assert.equal(buildFocusNote(""), "");
  assert.equal(buildFocusNote("   "), "");
});
```

Y añadir `buildFocusNote` al import que ya existe en la primera línea del archivo de test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `buildFocusNote is not a function` (o error de import).

- [ ] **Step 3: Write minimal implementation**

Al final de `src/lib/instagram/content.ts`:

```ts
/**
 * En qué insistir esta tanda, con las palabras de quien lo pidió.
 *
 * ## Por qué literal y no reformulado
 *
 * Porque «insiste en el sueño» y «habla del descanso nocturno» no piden lo
 * mismo, y quien dijo lo primero no reconoce lo segundo en lo que sale. El
 * encargo lo repite tal cual y deja que el modelo lo interprete una sola vez,
 * no dos.
 */
export function buildFocusNote(focus: string): string {
  const limpio = focus.trim();

  if (!limpio) return "";

  return [
    `## En qué insistir`,
    ``,
    `«${limpio}»`,
    ``,
    `Vale para **todas** las piezas de esta tanda, no para una. No es el tema de`,
    `cada publicación: es el ángulo desde el que se mira lo que ya ibas a contar.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Enchufarlo a la acción**

En `src/app/products/[id]/instagram-actions.ts`, dentro de `generateInstagramAction`, junto a las otras lecturas de `raw` (sobre la línea 39):

```ts
  /*
   * El enfoque, tal como llegó.
   *
   * Se declaraba en la herramienta del agente y se tiraba aquí: el agente
   * contestaba «he insistido en el sueño» y escribía lo de siempre. Un fallo
   * que no da error es el que más tarda en encontrarse.
   */
  const focus = readText(raw.focus);
```

Añadir el import junto a los que ya hay de `content.ts`:

```ts
import { buildCaption, buildContentPrompt, buildFocusNote, findFormat } from "@/lib/instagram/content";
```

Y meterlo en el `prompt` de `generateStructured`, **entre la memoria y la guía de ganchos** (línea 114 aprox.), de modo que el array quede:

```ts
      prompt: [
        buildContentPrompt({
          format,
          productName: product.name,
          audience: product.targetAudience || "el público objetivo",
          country: product.country || "México",
          count,
        }),
        memoria,
        buildFocusNote(focus),
        buildHookGuide(pickArchetypes(count, anteriores.length)),
      ]
        .filter(Boolean)
        .join("\n\n"),
```

- [ ] **Step 6: Pasarlo desde el agente**

En `src/app/products/[id]/agent-actions.ts`, en la rama `escribir_publicaciones` (línea 133):

```ts
          if (call.name === "escribir_publicaciones") {
            const result = await generateInstagramAction({
              productId,
              format: readText(args.formato) || "feed",
              count: Number(args.cuantas) || 3,
              focus: readText(args.enfoque),
            });
```

- [ ] **Step 7: Comprobar que compila y pasan los tests**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores de tipos, todos los tests en verde.

- [ ] **Step 8: Commit**

```bash
git add src/lib/instagram/content.ts src/lib/instagram/content.test.ts \
        src/app/products/\[id\]/instagram-actions.ts \
        src/app/products/\[id\]/agent-actions.ts
git commit -m "El enfoque del agente deja de tirarse por el camino"
git push origin main
```

---

### Task 2: El detector de gancho casi-repetido

`recentSummary` mete lo anterior en el encargo, y el modelo lo ignora a la décima pieza. Hace falta una comprobación dura después de generar.

**Files:**
- Create: `src/lib/instagram/duplicates.ts`
- Test: `src/lib/instagram/duplicates.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizeHook(text: string): string`
  - `similarity(a: string, b: string): number` — 0 a 1, por trigramas.
  - `isRepeat(hook: string, previous: string[], threshold?: number): boolean` — `threshold` por defecto `0.6`.

- [ ] **Step 1: Write the failing test**

Crear `src/lib/instagram/duplicates.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { isRepeat, normalizeHook, similarity } from "./duplicates.ts";

test("el gancho se normaliza antes de comparar", () => {
  /*
   * Sin normalizar, «¿El zumbido no se va?» y «el zumbido no se va» son dos
   * ganchos distintos, y salen los dos.
   */
  assert.equal(normalizeHook("  ¿El ZUMBIDO no se va?  "), "el zumbido no se va");
  assert.equal(normalizeHook("¡Duermes mal, otra vez!"), "duermes mal otra vez");
});

test("el mismo gancho con otra puntuación se detecta", () => {
  assert.ok(isRepeat("¿El zumbido no se va?", ["El zumbido no se va"]));
});

test("un gancho distinto no se marca", () => {
  assert.ok(!isRepeat("Tu almohada no es el problema", ["El zumbido no se va"]));
});

test("dos formas de decir lo mismo se parecen sin ser iguales", () => {
  const parecido = similarity(
    normalizeHook("el zumbido no se va nunca"),
    normalizeHook("el zumbido no se va"),
  );

  assert.ok(parecido > 0.6, `esperaba parecido alto, salió ${parecido}`);
  assert.ok(parecido < 1, "no son idénticos");
});

test("compartir tema no es repetirse", () => {
  /*
   * Dos publicaciones pueden hablar del sueño toda la semana: eso es tener una
   * línea. Repetirse es decirlo con las mismas palabras.
   */
  assert.ok(
    !isRepeat("Duermes ocho horas y amaneces roto", ["El zumbido no te deja dormir"]),
  );
});

test("sin historial nada es repetido", () => {
  assert.ok(!isRepeat("El zumbido no se va", []));
});

test("el umbral se puede subir para ser más permisivo", () => {
  const casi = "el zumbido no se va nunca";
  const antes = ["el zumbido no se va"];

  assert.ok(isRepeat(casi, antes, 0.6));
  assert.ok(!isRepeat(casi, antes, 0.99));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no existe `./duplicates.ts`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/lib/instagram/duplicates.ts`:

```ts
/**
 * Que no salga dos veces el mismo gancho con otras palabras.
 *
 * ## Por qué no basta con metérselo en el encargo
 *
 * `recentSummary` ya le manda lo publicado con un «no repetir». Funciona las
 * primeras veces y deja de funcionar sobre la décima: el modelo encuentra la
 * forma que le sale bien y vuelve a ella. Metido en el encargo es una petición;
 * aquí es una comprobación, y una comprobación no se cansa.
 *
 * ## Por qué trigramas y no comparar palabras
 *
 * Porque lo que se repite no son las palabras exactas sino la forma: «el
 * zumbido no se va» y «el zumbido no se va nunca» comparten casi todo el hilo
 * de letras aunque tengan distinto número de palabras. Contando palabras
 * sueltas, «duermes mal» y «mal duermes» darían idénticos, que no lo son.
 */

/** Minúsculas, sin signos y sin espacios de sobra. Lo demás se conserva. */
export function normalizeHook(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    // Los diacríticos fuera: «sueño» y «sueno» no deberían ser dos ganchos.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const trigrams = (text: string): Set<string> => {
  const out = new Set<string>();
  // El relleno de los extremos hace que el principio y el final cuenten: dos
  // ganchos que empiezan igual se parecen más que dos que coinciden en medio.
  const padded = `  ${text}  `;

  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));

  return out;
};

/** Cuánto se parecen, de 0 a 1. Jaccard sobre trigramas. */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const uno = trigrams(a);
  const otro = trigrams(b);

  let comunes = 0;
  for (const gram of uno) if (otro.has(gram)) comunes += 1;

  const total = uno.size + otro.size - comunes;

  return total === 0 ? 0 : comunes / total;
}

/**
 * Si este gancho ya se dijo.
 *
 * El umbral de 0.6 está puesto para el primer despliegue y se ajusta con las
 * piezas que ya hay en la base, no a ojo: por debajo deja pasar variaciones de
 * la misma frase, por encima descarta piezas distintas que comparten tema.
 */
export function isRepeat(hook: string, previous: string[], threshold = 0.6): boolean {
  const limpio = normalizeHook(hook);

  if (!limpio) return false;

  return previous.some((one) => similarity(limpio, normalizeHook(one)) >= threshold);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, los siete.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/duplicates.ts src/lib/instagram/duplicates.test.ts
git commit -m "El detector del gancho que ya se dijo con otras palabras"
git push origin main
```

---

### Task 3: La proporción, comprobada antes del contenedor

Hoy una proporción mala revienta **dentro** del procesado de Meta, minutos después, con un mensaje que no dice eso.

**Files:**
- Create: `src/lib/instagram/aspect.ts`
- Test: `src/lib/instagram/aspect.test.ts`

**Interfaces:**
- Consumes: `findFormat` de `content.ts` no hace falta; se recibe el `formatId`.
- Produces: `checkAspect(width: number, height: number, formatId: string): { ok: boolean; reason: string }`

- [ ] **Step 1: Write the failing test**

Crear `src/lib/instagram/aspect.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkAspect } from "./aspect.ts";

test("la vertical 4:5 vale para el feed", () => {
  assert.equal(checkAspect(1080, 1350, "feed").ok, true);
});

test("el cuadrado y el apaisado también valen en el feed", () => {
  // Instagram acepta de 4:5 a 1.91:1. Rechazar el cuadrado sería inventarse un
  // límite que no existe.
  assert.equal(checkAspect(1080, 1080, "feed").ok, true);
  assert.equal(checkAspect(1910, 1000, "feed").ok, true);
});

test("más alta que 4:5 no vale en el feed, y se dice por qué", () => {
  const resultado = checkAspect(1080, 1920, "feed");

  assert.equal(resultado.ok, false);
  assert.ok(resultado.reason.includes("4:5"), `el motivo tiene que citar el límite: ${resultado.reason}`);
});

test("el reel y la historia quieren 9:16", () => {
  assert.equal(checkAspect(1080, 1920, "reel").ok, true);
  assert.equal(checkAspect(1080, 1920, "historia").ok, true);
});

test("una imagen de feed mandada a un reel se rechaza", () => {
  assert.equal(checkAspect(1080, 1350, "reel").ok, false);
});

test("dimensiones imposibles no revientan", () => {
  // Un generador que devuelve una imagen rota no debería tumbar la vuelta del
  // cron: se rechaza esa pieza y se sigue.
  assert.equal(checkAspect(0, 0, "feed").ok, false);
  assert.equal(checkAspect(-10, 100, "feed").ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no existe `./aspect.ts`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/lib/instagram/aspect.ts`:

```ts
/**
 * La proporción, comprobada **antes** de crear el contenedor.
 *
 * ## Por qué aquí y no dejar que falle Meta
 *
 * Porque Meta no falla al crear el contenedor: lo acepta, se pone a procesarlo
 * y falla **dentro**, minutos después, con un estado `ERROR` cuyo mensaje no
 * dice que el problema era la proporción. Para entonces la pieza ya se marcó
 * como «publicando» y hay que rescatarla.
 *
 * Comprobarlo aquí cuesta una división y convierte un fallo tardío y opaco en
 * uno inmediato que dice qué pasó.
 */

/** Lo que Instagram acepta en el feed: de 4:5 (0.8) a 1.91:1. */
const FEED_MIN = 0.8;
const FEED_MAX = 1.91;

/** Vertical completa. Se deja holgura: los generadores no clavan el píxel. */
const VERTICAL = 9 / 16;
const VERTICAL_TOLERANCIA = 0.03;

export function checkAspect(
  width: number,
  height: number,
  formatId: string,
): { ok: boolean; reason: string } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: "La imagen no dice cuánto mide." };
  }

  const ratio = width / height;

  if (formatId === "reel" || formatId === "historia") {
    const bien = Math.abs(ratio - VERTICAL) <= VERTICAL_TOLERANCIA;

    return bien
      ? { ok: true, reason: "" }
      : {
          ok: false,
          reason: `Un ${formatId} va en 9:16 y esta mide ${width}×${height}.`,
        };
  }

  if (ratio < FEED_MIN) {
    return {
      ok: false,
      reason: `Más alta de lo que admite el feed: el límite es 4:5 y esta mide ${width}×${height}.`,
    };
  }

  if (ratio > FEED_MAX) {
    return {
      ok: false,
      reason: `Más ancha de lo que admite el feed: el límite es 1.91:1 y esta mide ${width}×${height}.`,
    };
  }

  return { ok: true, reason: "" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/aspect.ts src/lib/instagram/aspect.test.ts
git commit -m "La proporción se comprueba antes, no dentro del procesado de Meta"
git push origin main
```

---

### Task 3b: Los dos filtros, enchufados

Las tareas 2 y 3 escriben dos comprobaciones que **nadie llama todavía**. Código
que no se invoca es código que no protege de nada, y además engaña: está ahí, se
lee, y parece que el problema está resuelto.

**Files:**
- Modify: `src/app/products/[id]/instagram-actions.ts` (`generateInstagramAction` descarta repetidas; `generatePostMediaAction` comprueba la proporción)

**Interfaces:**
- Consumes: `isRepeat` (Task 2), `checkAspect` (Task 3).
- Produces: nada nuevo. Cambia el mensaje que devuelven las dos acciones.

- [ ] **Step 1: Descartar las repetidas al escribir**

En `src/app/products/[id]/instagram-actions.ts`, añadir el import:

```ts
import { isRepeat } from "@/lib/instagram/duplicates";
```

Y sustituir el bloque que va de `const posts = (written.data.posts ?? [])` hasta
`const saved = await addPosts(productId, posts, auto);` por:

```ts
    const escritas = (written.data.posts ?? [])
      .map((one) => ({
        format: format.id,
        caption: buildCaption({
          text: [one.first?.trim(), one.body?.trim()].filter(Boolean).join("\n\n"),
          hashtags: one.hashtags ?? [],
        }),
        hashtags: one.hashtags ?? [],
        scene: one.scene ?? "",
        showsProduct: one.showsProduct === true,
        mediaKind: one.media === "video" ? "video" : "imagen",
      }))
      .filter((one) => one.caption.trim());

    /*
     * El filtro duro contra repetirse.
     *
     * `recentSummary` ya se lo pidió en el encargo, y funciona las primeras
     * veces: sobre la décima el modelo vuelve a la forma que le sale bien. Una
     * petición se puede desoír; esto no.
     *
     * Se compara también contra lo que lleva escrito **en esta misma tanda**,
     * no solo contra la base: pedir cinco de golpe y que dos sean la misma es
     * justo el caso que más se da.
     */
    const ganchosPrevios = anteriores.map((one) => one.caption.split("\n")[0] ?? "");
    const posts: typeof escritas = [];
    let repetidas = 0;

    for (const una of escritas) {
      const gancho = una.caption.split("\n")[0] ?? "";

      if (isRepeat(gancho, ganchosPrevios)) {
        repetidas += 1;
        continue;
      }

      ganchosPrevios.push(gancho);
      posts.push(una);
    }

    const saved = await addPosts(productId, posts, auto);
```

- [ ] **Step 2: Decirlo en el mensaje**

Sustituir el `return` de éxito de `generateInstagramAction` por:

```ts
    /*
     * Las descartadas se cuentan en voz alta.
     *
     * Pedir cinco y recibir tres sin explicación parece un fallo. Diciéndolo, es
     * información: el modelo se está repitiendo y quizá haga falta cambiar el
     * enfoque en vez de pedir más.
     */
    const nota = repetidas > 0 ? ` ${repetidas} descartada(s) por repetir un gancho ya usado.` : "";

    return saved > 0
      ? {
          ok: true,
          message:
            (auto
              ? `${saved} publicación(es) aprobadas. Saldrán sin que nadie las lea.`
              : `${saved} publicación(es) en borrador. Revísalas antes de programar.`) + nota,
        }
      : {
          ok: false,
          message:
            repetidas > 0
              ? `Las ${repetidas} que escribió repetían ganchos ya usados. Prueba con otro enfoque.`
              : "No devolvió ninguna publicación usable.",
        };
```

- [ ] **Step 3: Comprobar la proporción antes de guardar la imagen**

En `generatePostMediaAction`, sustituir el bloque que va de
`const url = generated.imageUrls[0];` hasta `await updatePostMedia(id, url);` por:

```ts
    const url = generated.imageUrls[0];
    if (!url) return { ok: false, message: "No devolvió ninguna imagen." };

    /*
     * La proporción, comprobada aquí y no por Meta.
     *
     * Meta acepta el contenedor, se pone a procesarlo y falla **dentro**, con un
     * estado de error cuyo mensaje no dice que el problema era la proporción.
     * Para entonces la pieza ya está marcada como «publicando» y hay que
     * rescatarla a mano.
     *
     * Si no se puede medir la imagen se deja pasar: quedarse sin publicar por no
     * haber podido descargarla es peor que arriesgarse a que Meta la rechace.
     */
    const { checkAspect } = await import("@/lib/instagram/aspect");
    const sharp = (await import("sharp")).default;

    const bytes = await fetch(url, { cache: "no-store" })
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null);

    if (bytes) {
      const { width, height } = await sharp(Buffer.from(bytes)).metadata();
      const proporcion = checkAspect(width ?? 0, height ?? 0, post.format);

      if (!proporcion.ok) {
        return {
          ok: false,
          message: `${proporcion.reason} Vuelve a generarla: guardada, fallaría al publicar.`,
        };
      }
    }

    await updatePostMedia(id, url);
```

- [ ] **Step 4: Comprobar tipos y tests**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores, todo en verde.

- [ ] **Step 5: Verlo descartar de verdad**

Run: `npm run dev`, abrir un producto con cola, pedir diez publicaciones del
mismo formato dos veces seguidas.

Expected: la segunda tanda devuelve menos de diez y el mensaje dice cuántas
descartó por repetir. Si descarta las diez, el umbral de `isRepeat` está
demasiado bajo para este producto: subirlo a 0.7 en `duplicates.ts` y anotarlo.

- [ ] **Step 6: Commit**

```bash
git add src/app/products/\[id\]/instagram-actions.ts
git commit -m "Los dos filtros dejan de ser decorativos: repetidas fuera, proporción comprobada"
git push origin main
```

---

### Task 4: El bucle, puro

El corazón. No toca base ni red: recibe el estado y dice qué hacer. Por eso se puede probar entero.

**Files:**
- Create: `src/lib/instagram/autopilot.ts`
- Test: `src/lib/instagram/autopilot.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface AutopilotState { ahora: string; porDia: number; colchonDias: number; horaDesde: number; horaHasta: number; publicadasUltimas24h: number; ultimaPublicacionAt: string | null; listas: { scheduledAt: string }[] }`
  - `decide(state: AutopilotState): { publicar: boolean; motivo: string; escribir: number }`
  - `TOPE_API` (25), `SEPARACION_MINUTOS` (90)
  - `horaProgramada(base: Date, diaIndex: number, horaDesde: number, horaHasta: number, semilla: string): string`

- [ ] **Step 1: Write the failing test**

Crear `src/lib/instagram/autopilot.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { decide, horaProgramada, SEPARACION_MINUTOS, TOPE_API } from "./autopilot.ts";

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

test("la hora cae dentro de la ventana", () => {
  const cuando = new Date(horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-uno"));
  const hora = cuando.getUTCHours();

  assert.ok(hora >= 18 && hora <= 21, `salió a las ${hora}`);
});

test("la misma pieza da siempre la misma hora", () => {
  /*
   * Determinista y no aleatoria: dos vueltas del cron sobre la misma pieza le
   * pondrían dos horas distintas, y el calendario cambiaría solo.
   */
  const uno = horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-uno");
  const otro = horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-uno");

  assert.equal(uno, otro);
});

test("dos piezas del mismo día no caen a la misma hora clavada", () => {
  const uno = horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-uno");
  const otro = horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-dos");

  assert.notEqual(uno, otro);
});

test("cada día va después del anterior", () => {
  const primero = horaProgramada(new Date(base.ahora), 1, 18, 21, "a");
  const segundo = horaProgramada(new Date(base.ahora), 2, 18, 21, "a");

  assert.ok(new Date(segundo) > new Date(primero));
});

test("la separación mínima es la que dice la constante", () => {
  assert.equal(SEPARACION_MINUTOS, 90);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no existe `./autopilot.ts`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/lib/instagram/autopilot.ts`:

```ts
/**
 * Qué toca hacer esta vuelta.
 *
 * ## Por qué esto no toca la base ni la red
 *
 * Porque es donde vive la única lógica que puede equivocarse de forma cara:
 * publicar de más, publicar dos veces, o dejar de publicar creyendo que va
 * sobrada. Separado del acceso a datos se prueba entero en milisegundos y sin
 * montar nada; mezclado, se prueba con la cuenta de la marca en producción.
 */

/** El tope duro de Instagram: 25 publicaciones por cuenta cada 24 horas. */
export const TOPE_API = 25;

/**
 * Minutos entre dos publicaciones de la misma cuenta.
 *
 * Es lo que evita que un atasco resuelto —tres piezas vencidas que por fin
 * pueden salir— se vaya entero en quince minutos. Ese día, y solo ese día, la
 * cuenta parecería un bot.
 */
export const SEPARACION_MINUTOS = 90;

export interface AutopilotState {
  /** ISO. Se pasa en vez de leer el reloj para poder probarlo. */
  ahora: string;
  porDia: number;
  colchonDias: number;
  horaDesde: number;
  horaHasta: number;
  /** De la **cuenta**, no del producto: el tope lo impone Instagram sobre ella. */
  publicadasUltimas24h: number;
  ultimaPublicacionAt: string | null;
  /** Aprobadas, con media, con fecha futura. Los borradores no cuentan. */
  listas: { scheduledAt: string }[];
}

export interface AutopilotDecision {
  publicar: boolean;
  /** Por qué no se publica. Vacío cuando sí. */
  motivo: string;
  /** Cuántas piezas faltan para llenar el colchón. */
  escribir: number;
}

export function decide(state: AutopilotState): AutopilotDecision {
  const ahora = new Date(state.ahora);

  const objetivo = Math.max(0, state.colchonDias) * Math.max(0, state.porDia);
  const escribir = Math.max(0, objetivo - state.listas.length);

  if (state.publicadasUltimas24h >= TOPE_API) {
    return {
      publicar: false,
      motivo: `Instagram no admite más de ${TOPE_API} publicaciones al día en una cuenta.`,
      escribir,
    };
  }

  if (state.publicadasUltimas24h >= state.porDia) {
    return {
      publicar: false,
      motivo: `Alcanzado el tope de ${state.porDia} al día.`,
      escribir,
    };
  }

  if (state.ultimaPublicacionAt) {
    const desde = (ahora.getTime() - new Date(state.ultimaPublicacionAt).getTime()) / 60_000;

    if (desde < SEPARACION_MINUTOS) {
      return {
        publicar: false,
        motivo: `Separación mínima: faltan ${Math.ceil(SEPARACION_MINUTOS - desde)} minutos.`,
        escribir,
      };
    }
  }

  return { publicar: true, motivo: "", escribir };
}

/**
 * Un número estable a partir de un texto.
 *
 * No sirve para nada criptográfico y no lo pretende: solo hace falta que la
 * misma pieza dé siempre el mismo número, que es lo que impide que el
 * calendario se mueva solo entre dos vueltas del cron.
 */
function semillaNumerica(texto: string): number {
  let valor = 0;

  for (let i = 0; i < texto.length; i += 1) {
    valor = (valor * 31 + texto.charCodeAt(i)) % 1_000_003;
  }

  return valor;
}

/**
 * A qué hora sale una pieza, dentro de la ventana y sin clavar el minuto.
 *
 * Hoy `planWeekAction` pone las 19:00 en punto todos los días. Publicar siete
 * días seguidos a la misma hora exacta no es lo que hace una persona, y es lo
 * único de la lista del agente ajeno que sí conviene imitar — no para engañar a
 * nadie, sino porque una cuenta que publica a las 19:00:00 clavadas se lee como
 * una máquina.
 */
export function horaProgramada(
  base: Date,
  diaIndex: number,
  horaDesde: number,
  horaHasta: number,
  semilla: string,
): string {
  const cuando = new Date(base);
  cuando.setUTCDate(base.getUTCDate() + diaIndex);

  const desde = Math.min(horaDesde, horaHasta);
  const hasta = Math.max(horaDesde, horaHasta);

  const n = semillaNumerica(semilla);
  const horas = hasta - desde + 1;

  cuando.setUTCHours(desde + (n % horas), n % 60, 0, 0);

  return cuando.toISOString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, los quince.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/autopilot.ts src/lib/instagram/autopilot.test.ts
git commit -m "El bucle del autopiloto: qué toca esta vuelta, sin tocar nada"
git push origin main
```

---

### Task 5: Distinguir el fallo que se arregla solo del que no

Reintentar 288 veces al día con un token caducado llena el registro y no arregla nada. Distinguirlo por el texto del mensaje es frágil: Meta lo cambia y lo traduce. Hay que quedarse con el **código**.

**Files:**
- Create: `src/lib/instagram/errors.ts`
- Test: `src/lib/instagram/errors.test.ts`
- Modify: `src/lib/instagram/publish.ts:31-62` (`graph` conserva el código)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `class InstagramError extends Error { code: number; subcode: number }`
  - `esPermanente(error: unknown): boolean`

- [ ] **Step 1: Write the failing test**

Crear `src/lib/instagram/errors.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { esPermanente, InstagramError } from "./errors.ts";

test("el token caducado es permanente: no se arregla reintentando", () => {
  assert.equal(esPermanente(new InstagramError("Session expired", 190, 463)), true);
});

test("el permiso que falta es permanente", () => {
  assert.equal(esPermanente(new InstagramError("Permiso no concedido", 200, 0)), true);
});

test("la cuenta que no es profesional es permanente", () => {
  // Convertirla es cosa de una persona en la app de Instagram. Reintentar cada
  // cinco minutos no la convierte.
  assert.equal(esPermanente(new InstagramError("The user is not an Instagram Business", 10, 2207018)), true);
});

test("el límite de peticiones es transitorio: mañana sí", () => {
  assert.equal(esPermanente(new InstagramError("Application request limit reached", 4, 0)), false);
});

test("un fallo de red no es permanente", () => {
  assert.equal(esPermanente(new Error("fetch failed")), false);
});

test("un error desconocido se trata como transitorio", () => {
  /*
   * Por defecto se reintenta: pausar el piloto por algo que no se conoce deja
   * la cuenta muda hasta que alguien mire, y eso es peor que tres reintentos de
   * más. Los tres fallos seguidos ya lo pausan de todas formas.
   */
  assert.equal(esPermanente(new InstagramError("vete a saber", 999, 0)), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no existe `./errors.ts`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/lib/instagram/errors.ts`:

```ts
/**
 * Lo que se arregla solo y lo que no.
 *
 * ## Por qué el código y no el mensaje
 *
 * Porque el mensaje de Meta cambia y se traduce, y una condición escrita contra
 * un texto deja de cumplirse el día que a Meta le da por reescribirlo — sin
 * avisar y sin dar error. El código no cambia: es lo que Meta promete que es
 * estable.
 *
 * El mensaje se sigue conservando porque es lo que hace útil el registro: dice
 * «la cuenta no es profesional» donde el código solo dice `10`.
 */

export class InstagramError extends Error {
  readonly code: number;
  readonly subcode: number;

  constructor(message: string, code: number, subcode = 0) {
    super(message);
    this.name = "InstagramError";
    this.code = code;
    this.subcode = subcode;
  }
}

/**
 * Códigos que no se arreglan esperando.
 *
 * - `190`: el token no vale. Hay que reautorizar.
 * - `200`, `10`: falta un permiso, o la cuenta no es profesional.
 * - `100` con subcódigo `33`: se pide un objeto que no existe o al que la app
 *   no llega — normalmente la cuenta de Instagram equivocada.
 */
const PERMANENTES = new Set([190, 200, 10]);

export function esPermanente(error: unknown): boolean {
  if (!(error instanceof InstagramError)) return false;

  if (error.code === 100 && error.subcode === 33) return true;

  return PERMANENTES.has(error.code);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, los seis.

- [ ] **Step 5: Que `publish.ts` conserve el código**

En `src/lib/instagram/publish.ts`, sustituir el bloque `if (!response.ok)` (líneas 48-59) por:

```ts
  if (!response.ok) {
    /*
     * El mensaje de Meta se devuelve tal cual, y el código va aparte.
     *
     * Los suyos dicen qué pasó —«la cuenta no es profesional», «el vídeo dura
     * demasiado»— y traducirlos a «no se pudo publicar» obliga a ir al registro
     * para averiguar lo que ya venía escrito. Pero decidir **si se reintenta**
     * leyendo ese texto es frágil: se decide por el código.
     */
    const error = (data.error ?? {}) as {
      message?: string;
      code?: number;
      error_subcode?: number;
    };

    throw new InstagramError(
      error.message ?? `Instagram respondió ${response.status}.`,
      Number(error.code ?? 0),
      Number(error.error_subcode ?? 0),
    );
  }
```

Y añadir el import arriba del archivo, tras el `import "server-only"`:

```ts
import { InstagramError } from "./errors.ts";
```

- [ ] **Step 6: Comprobar tipos y tests**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores, todo en verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/instagram/errors.ts src/lib/instagram/errors.test.ts src/lib/instagram/publish.ts
git commit -m "El código de error de Meta, que es lo que decide si se reintenta"
git push origin main
```

---

### Task 6: Las migraciones

**Files:**
- Create: `supabase/migrations/20260812000200_instagram_autopilot.sql`
- Modify: `src/types/database.ts` (fila nueva y columna nueva)

**Interfaces:**
- Consumes: `public.mis_espacios()`, `public.poner_espacio()`, tabla `public.workspaces` — ya existen.
- Produces: tabla `public.instagram_autopilot`, columna `public.instagram_posts.ig_user_id`, tipo `InstagramAutopilotRow`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260812000200_instagram_autopilot.sql`:

```sql
-- El autopiloto: qué producto publica solo, dónde, cuánto y en qué franja.
--
-- ## Por qué la cuenta va en la fila y no en una variable de entorno
--
-- Porque cada producto puede publicar en una cuenta distinta, y una variable de
-- entorno es una sola para todo el servidor. El día que haya dos marcas, la
-- variable publica las dos en la misma cuenta y nadie se entera hasta verlo.
--
-- ## Por qué `pausado_por` es texto y no un booleano
--
-- Porque cuando el piloto se apaga solo, lo primero que se quiere saber es si
-- fue el tope del día, el token caducado o tres fallos seguidos. Con un booleano
-- hay que ir al registro a averiguarlo, y el registro está en el servidor.
create table if not exists public.instagram_autopilot (
  product_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,

  activo boolean not null default false,
  ig_user_id text,

  por_dia integer not null default 1,
  colchon_dias integer not null default 3,
  hora_desde integer not null default 18,
  hora_hasta integer not null default 21,

  -- Solo para enseñarlo. El tope y la separación se calculan de
  -- `instagram_posts`, porque son de la cuenta y no del producto.
  ultima_publicacion_at timestamptz,
  fallos_seguidos integer not null default 0,
  pausado_por text not null default '',

  created_at timestamptz not null default now()
);

alter table public.instagram_autopilot enable row level security;

drop policy if exists "instagram_autopilot: el equipo ve lo suyo" on public.instagram_autopilot;
create policy "instagram_autopilot: el equipo ve lo suyo" on public.instagram_autopilot
  for select to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_autopilot: el equipo crea en lo suyo" on public.instagram_autopilot;
create policy "instagram_autopilot: el equipo crea en lo suyo" on public.instagram_autopilot
  for insert to authenticated
  with check (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_autopilot: el equipo edita lo suyo" on public.instagram_autopilot;
create policy "instagram_autopilot: el equipo edita lo suyo" on public.instagram_autopilot
  for update to authenticated
  using (workspace_id in (select public.mis_espacios()))
  with check (workspace_id in (select public.mis_espacios()));

drop policy if exists "instagram_autopilot: el equipo borra lo suyo" on public.instagram_autopilot;
create policy "instagram_autopilot: el equipo borra lo suyo" on public.instagram_autopilot
  for delete to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop trigger if exists poner_espacio on public.instagram_autopilot;
create trigger poner_espacio before insert on public.instagram_autopilot
  for each row execute function public.poner_espacio();

-- En qué cuenta salió cada publicación.
--
-- Sin esto se puede saber cuántas publicó un producto, que no es la pregunta:
-- el tope de 25 al día lo impone Instagram sobre **la cuenta**, y dos productos
-- que compartan cuenta se pasarían entre los dos, cada uno convencido de ir
-- dentro de su límite.
alter table public.instagram_posts add column if not exists ig_user_id text;

create index if not exists instagram_posts_por_cuenta
  on public.instagram_posts (ig_user_id, published_at);
```

- [ ] **Step 2: Aplicarla y verificarla**

Run: `npm run db:push && npm run db:verify`
Expected: la migración se aplica sin error y la verificación pasa.

- [ ] **Step 3: Añadir los tipos**

En `src/types/database.ts`, junto a los demás `…Row`, añadir:

```ts
/** El autopiloto de un producto: si publica solo, dónde y a qué ritmo. */
type InstagramAutopilotRow = {
  product_id: string;
  user_id: string;
  workspace_id: string | null;
  activo: boolean;
  /** La cuenta de Instagram. `null` mientras no se elige ninguna. */
  ig_user_id: string | null;
  por_dia: number;
  colchon_dias: number;
  hora_desde: number;
  hora_hasta: number;
  ultima_publicacion_at: string | null;
  fallos_seguidos: number;
  /** Vacío es «no está pausado». Con texto, dice por qué. */
  pausado_por: string;
  created_at: string;
};
```

Registrarla en el mapa de tablas, junto a `instagram_posts`:

```ts
      instagram_autopilot: Table<
        InstagramAutopilotRow,
        Partial<InstagramAutopilotRow> & { product_id: string }
      >;
```

Y añadir a `InstagramPostRow` la columna nueva:

```ts
  /** En qué cuenta salió. Es lo que permite contar el tope por cuenta. */
  ig_user_id: string | null;
```

- [ ] **Step 4: Comprobar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260812000200_instagram_autopilot.sql src/types/database.ts
git commit -m "El autopiloto en la base, y en qué cuenta salió cada publicación"
git push origin main
```

---

### Task 7: La capa de datos sin sesión

Aquí no hay RLS. Cada consulta pone su `workspace_id`, y una que no lo ponga se ve a simple vista.

**Files:**
- Create: `src/lib/data/instagram-service.ts`

**Interfaces:**
- Consumes: `createAdminClient` de `@/lib/supabase/admin`; `InstagramError` de `@/lib/instagram/errors`.
- Produces:
  - `interface AutopilotRow { productId, userId, workspaceId, igUserId, porDia, colchonDias, horaDesde, horaHasta, ultimaPublicacionAt, fallosSeguidos, pausadoPor }`
  - `listarActivos(): Promise<AutopilotRow[]>`
  - `contarUltimas24h(igUserId: string): Promise<number>`
  - `ultimaPublicacion(igUserId: string): Promise<string | null>`
  - `listasDe(productId: string, workspaceId: string): Promise<{ id: string; scheduledAt: string }[]>`
  - `reservarVencida(row: AutopilotRow): Promise<{ id: string; caption: string; mediaUrl: string; format: string; mediaKind: string } | null>`
  - `cerrarPublicacion(id: string, workspaceId: string, outcome: { instagramId?: string; igUserId?: string; error?: string }): Promise<void>`
  - `anotarFallo(productId: string, motivo: string, permanente: boolean): Promise<void>`
  - `limpiarFallos(productId: string, cuando: string): Promise<void>`

- [ ] **Step 1: Escribir la capa**

Crear `src/lib/data/instagram-service.ts`:

```ts
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * La cola vista desde el cron, que no es nadie.
 *
 * ## Por qué esta capa existe además de `data/instagram.ts`
 *
 * Porque aquella pasa por `requireContext()`, que redirige a la entrada cuando
 * no hay sesión: llamada desde un cron no falla con un mensaje raro, **redirige
 * un proceso que no tiene navegador**. Y porque el cliente que usa salta RLS,
 * así que la seguridad deja de ponerla la base de datos.
 *
 * De ahí la regla de este archivo, que se cumple sin excepciones: **toda
 * consulta lleva su `workspace_id`**. Una que no lo lleve devuelve las
 * publicaciones de otro cliente sin dar ningún error, que es la peor forma que
 * tiene un fallo de manifestarse.
 */

export interface AutopilotRow {
  productId: string;
  userId: string;
  workspaceId: string;
  igUserId: string;
  porDia: number;
  colchonDias: number;
  horaDesde: number;
  horaHasta: number;
  ultimaPublicacionAt: string | null;
  fallosSeguidos: number;
  pausadoPor: string;
}

/**
 * Los que publican solos: activos, sin pausar, con cuenta y con espacio.
 *
 * Sin `workspace_id` la fila no se puede escribir de vuelta sin arriesgarse a
 * tocar otra, así que se descarta aquí en vez de arrastrar un `null` hasta el
 * bucle.
 */
export async function listarActivos(): Promise<AutopilotRow[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_autopilot")
    .select("*")
    .eq("activo", true)
    .eq("pausado_por", "")
    .not("ig_user_id", "is", null)
    .not("workspace_id", "is", null);

  return (data ?? []).map((row) => ({
    productId: row.product_id,
    userId: row.user_id,
    workspaceId: row.workspace_id as string,
    igUserId: row.ig_user_id as string,
    porDia: row.por_dia,
    colchonDias: row.colchon_dias,
    horaDesde: row.hora_desde,
    horaHasta: row.hora_hasta,
    ultimaPublicacionAt: row.ultima_publicacion_at,
    fallosSeguidos: row.fallos_seguidos,
    pausadoPor: row.pausado_por,
  }));
}

/** Cuántas salieron por esa cuenta en 24 horas. El tope es de la cuenta. */
export async function contarUltimas24h(igUserId: string): Promise<number> {
  const supabase = createAdminClient();
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("instagram_posts")
    .select("id", { count: "exact", head: true })
    .eq("ig_user_id", igUserId)
    .eq("status", "publicado")
    .gte("published_at", desde);

  return count ?? 0;
}

/** Cuándo salió la última de esa cuenta, para la separación mínima. */
export async function ultimaPublicacion(igUserId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_posts")
    .select("published_at")
    .eq("ig_user_id", igUserId)
    .eq("status", "publicado")
    .order("published_at", { ascending: false })
    .limit(1);

  return (data ?? [])[0]?.published_at ?? null;
}

/**
 * Las que van a salir: aprobadas, con media, con fecha por delante.
 *
 * Los borradores no entran aunque tengan imagen y fecha: `reservarVencida` solo
 * coge aprobadas, así que un borrador no se publica solo nunca. Contándolos, el
 * colchón se llenaría de piezas muertas y la cuenta dejaría de publicar creyendo
 * que va sobrada — que es el fallo peor, porque no se nota.
 */
export async function listasDe(
  productId: string,
  workspaceId: string,
): Promise<{ id: string; scheduledAt: string }[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_posts")
    .select("id, scheduled_at")
    .eq("workspace_id", workspaceId)
    .eq("product_id", productId)
    .eq("status", "aprobado")
    .not("media_url", "is", null)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    scheduledAt: row.scheduled_at as string,
  }));
}

/**
 * Coge la pieza vencida más atrasada y la marca como suya.
 *
 * ## Por qué en dos pasos y no en un solo `update`
 *
 * Porque `.limit(1)` sobre un `update` de PostgREST acota **lo que se devuelve**,
 * no lo que se toca: un solo `update` con filtro puede marcar como «publicando»
 * todas las piezas vencidas y devolver una. Las demás quedan bloqueadas media
 * hora sin que nadie las publique.
 *
 * En dos pasos: se elige el candidato ordenado, y se marca **por su id y solo si
 * sigue aprobado**. Si otra vuelta llegó antes, el `update` no encuentra nada y
 * devuelve vacío — que es exactamente lo que evita la doble publicación.
 */
export async function reservarVencida(row: AutopilotRow): Promise<{
  id: string;
  caption: string;
  mediaUrl: string;
  format: string;
  mediaKind: string;
} | null> {
  const supabase = createAdminClient();

  const ahora = new Date();
  const muerta = new Date(ahora.getTime() - 30 * 60 * 1000).toISOString();

  const { data: candidatos } = await supabase
    .from("instagram_posts")
    .select("id, status, claimed_at")
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId)
    .lte("scheduled_at", ahora.toISOString())
    .not("media_url", "is", null)
    .or(`status.eq.aprobado,and(status.eq.publicando,claimed_at.lt.${muerta})`)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  const candidato = (candidatos ?? [])[0];
  if (!candidato) return null;

  const { data: reservadas } = await supabase
    .from("instagram_posts")
    .update({ status: "publicando", claimed_at: ahora.toISOString() })
    .eq("id", candidato.id)
    .eq("workspace_id", row.workspaceId)
    // La condición es la del estado que se leyó: si cambió entre la lectura y
    // ahora, esta vuelta se queda sin nada y la otra publica.
    .eq("status", candidato.status)
    .select("id, caption, media_url, format, media_kind");

  const pieza = (reservadas ?? [])[0];
  if (!pieza) return null;

  return {
    id: pieza.id,
    caption: pieza.caption,
    mediaUrl: pieza.media_url as string,
    format: pieza.format,
    mediaKind: pieza.media_kind,
  };
}

/** Cierra una publicación: salió o no salió, y por dónde salió. */
export async function cerrarPublicacion(
  id: string,
  workspaceId: string,
  outcome: { instagramId?: string; igUserId?: string; error?: string },
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from("instagram_posts")
    .update(
      outcome.instagramId
        ? {
            status: "publicado",
            instagram_id: outcome.instagramId,
            ig_user_id: outcome.igUserId ?? null,
            published_at: new Date().toISOString(),
            error: "",
          }
        : {
            /*
             * Vuelve a «aprobado», no a «error»: un fallo de red o un procesado
             * lento no significan que la pieza esté mal, sino que no salió esta
             * vez. En «error» se quedaría fuera para siempre.
             */
            status: "aprobado",
            claimed_at: null,
            error: outcome.error ?? "falló sin motivo",
          },
    )
    .eq("id", id)
    .eq("workspace_id", workspaceId);
}

/**
 * Anota el fallo y pausa si toca.
 *
 * Lo permanente pausa a la primera: un token caducado no se arregla esperando, y
 * reintentarlo cada cinco minutos son 288 fallos al día que nadie lee. Lo
 * transitorio pausa a los tres seguidos.
 */
export async function anotarFallo(
  productId: string,
  motivo: string,
  permanente: boolean,
): Promise<void> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_autopilot")
    .select("fallos_seguidos")
    .eq("product_id", productId)
    .limit(1);

  const seguidos = ((data ?? [])[0]?.fallos_seguidos ?? 0) + 1;
  const pausar = permanente || seguidos >= 3;

  await supabase
    .from("instagram_autopilot")
    .update({
      fallos_seguidos: seguidos,
      pausado_por: pausar
        ? permanente
          ? motivo
          : `Tres intentos seguidos sin salir. El último: ${motivo}`
        : "",
    })
    .eq("product_id", productId);
}

/** Salió bien: se borra la cuenta de fallos y se anota cuándo. */
export async function limpiarFallos(productId: string, cuando: string): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from("instagram_autopilot")
    .update({ fallos_seguidos: 0, pausado_por: "", ultima_publicacion_at: cuando })
    .eq("product_id", productId);
}
```

- [ ] **Step 2: Comprobar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Auditar la regla del espacio**

Run: `grep -n "from(\"instagram" src/lib/data/instagram-service.ts`

Comprobar a ojo que **toda** consulta sobre `instagram_posts` lleva
`.eq("workspace_id", …)`. Las de `instagram_autopilot` van por `product_id`, que
es su clave primaria y por tanto ya identifica una fila única.

Expected: ninguna consulta a `instagram_posts` sin su espacio.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/instagram-service.ts
git commit -m "La cola vista desde el cron, que no es nadie y no tiene RLS que le cubra"
git push origin main
```

---

### Task 8: La ruta de cron

Une las piezas: publica una, rellena el colchón. Es la única que habla con todo.

**Files:**
- Create: `src/app/api/cron/instagram/route.ts`
- Modify: `.env.example` (documentar `CRON_SECRET`)

**Interfaces:**
- Consumes: `decide`, `horaProgramada` (Task 4); `esPermanente`, `InstagramError` (Task 5); toda la capa de Task 7; `publishNow` de `@/lib/instagram/publish`; `generateInstagramAction` y `generatePostMediaAction` de `@/app/products/[id]/instagram-actions`.
- Produces: `GET /api/cron/instagram` → `{ ok: boolean; parte: string[] }`

- [ ] **Step 1: Leer la guía de rutas de esta versión de Next**

Run: `ls node_modules/next/dist/docs/`

Leer la guía de Route Handlers **antes** de escribir el archivo. `AGENTS.md` lo
exige y esta versión de Next no es la de tu memoria: la forma de declarar una
ruta dinámica y de leer cabeceras puede haber cambiado.

- [ ] **Step 2: Escribir la ruta**

Crear `src/app/api/cron/instagram/route.ts`. La estructura, adaptada a lo que
diga la guía que acabas de leer:

```ts
import { NextResponse } from "next/server";

import { decide, horaProgramada } from "@/lib/instagram/autopilot";
import { esPermanente } from "@/lib/instagram/errors";
import { publishNow } from "@/lib/instagram/publish";
import {
  anotarFallo,
  type AutopilotRow,
  cerrarPublicacion,
  contarUltimas24h,
  limpiarFallos,
  listarActivos,
  listasDe,
  listasSinMedia,
  programar,
  reservarVencida,
  tokenDePublicacion,
  ultimaPublicacion,
} from "@/lib/data/instagram-service";

/**
 * La vuelta del autopiloto.
 *
 * ## Por qué una publicación por vuelta y no un lote
 *
 * Porque publicar tarda: crear el contenedor, esperar el procesado —un vídeo
 * puede tardar minutos— y publicar. Un lote de cinco tiene la ruta abierta
 * demasiado tiempo, y si el servidor la corta a mitad quedan filas marcadas como
 * «publicando» sin nada publicado. Con el cron cada cinco minutos hay 288
 * oportunidades al día: doce veces el tope de la API.
 *
 * ## Por qué publicar antes que rellenar
 *
 * Porque publicar es lo que tiene hora. Si la vuelta se queda sin tiempo, lo que
 * se pierde es el relleno, y el relleno espera cinco minutos sin que se note.
 */
export async function GET(request: Request): Promise<Response> {
  const secreto = process.env.CRON_SECRET?.trim();

  if (!secreto) {
    return NextResponse.json(
      { ok: false, parte: ["Falta CRON_SECRET: el autopiloto no arranca sin él."] },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    // Sin detalle: una respuesta que explique qué falta es un mapa para quien
    // esté probando.
    return NextResponse.json({ ok: false, parte: [] }, { status: 401 });
  }

  const parte: string[] = [];

  for (const row of await listarActivos()) {
    try {
      const [publicadas, ultima, listas] = await Promise.all([
        contarUltimas24h(row.igUserId),
        ultimaPublicacion(row.igUserId),
        listasDe(row.productId, row.workspaceId),
      ]);

      const decision = decide({
        ahora: new Date().toISOString(),
        porDia: row.porDia,
        colchonDias: row.colchonDias,
        horaDesde: row.horaDesde,
        horaHasta: row.horaHasta,
        publicadasUltimas24h: publicadas,
        ultimaPublicacionAt: ultima,
        listas,
      });

      if (decision.publicar) {
        await publicarUna(row, parte);
      } else if (decision.motivo) {
        parte.push(`${row.productId}: ${decision.motivo}`);
      }

      if (decision.escribir > 0) {
        await rellenar(row, decision.escribir, listas.length, parte);
      }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : "falló sin motivo";

      await anotarFallo(row.productId, motivo, esPermanente(error));
      parte.push(`${row.productId}: ${motivo}`);
    }
  }

  return NextResponse.json({ ok: true, parte });
}
```

- [ ] **Step 3: Escribir las dos mitades, en el mismo archivo**

Debajo del `GET`:

```ts
/** Publica la pieza vencida más atrasada de este producto. */
async function publicarUna(
  row: AutopilotRow,
  parte: string[],
): Promise<void> {
  const pieza = await reservarVencida(row);

  if (!pieza) return;

  try {
    const token = await tokenDePublicacion(row.userId);

    const instagramId = await publishNow(
      { igUserId: row.igUserId, token },
      {
        mediaUrl: pieza.mediaUrl,
        caption: pieza.caption,
        kind: pieza.mediaKind,
        isStory: pieza.format === "historia",
      },
    );

    await cerrarPublicacion(pieza.id, row.workspaceId, {
      instagramId,
      igUserId: row.igUserId,
    });

    await limpiarFallos(row.productId, new Date().toISOString());

    parte.push(`${row.productId}: publicada ${instagramId}.`);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "falló sin motivo";

    // La pieza vuelve a «aprobado» con su error: no salió esta vez, no está mal.
    await cerrarPublicacion(pieza.id, row.workspaceId, { error: motivo });
    await anotarFallo(row.productId, motivo, esPermanente(error));

    parte.push(`${row.productId}: no salió — ${motivo}`);
  }
}

/**
 * Rellena el colchón: escribe, genera la imagen y pone hora.
 *
 * ## Por qué no pasa por el bucle de conversación del agente
 *
 * Porque el bucle de herramientas existe para que una persona pueda pedir cosas
 * en lenguaje suelto. Un cron ya sabe lo que quiere: meterlo por ahí añade seis
 * vueltas de modelo, su coste y una forma nueva de fallar, y no gana nada.
 *
 * ## Por qué las de vídeo se escriben pero no cuentan
 *
 * Porque el vídeo no se genera solo todavía. Si contaran para el colchón, tres
 * reels sin vídeo lo llenarían y la cuenta dejaría de publicar creyendo que va
 * sobrada — sin dar ningún error.
 */
async function rellenar(
  row: AutopilotRow,
  cuantas: number,
  yaHay: number,
  parte: string[],
): Promise<void> {
  const { generateInstagramAction, generatePostMediaAction } = await import(
    "@/app/products/[id]/instagram-actions"
  );

  /*
   * El reparto de formatos, con el que ya existe.
   *
   * Pidiendo siempre «feed» la cuenta publicaría la misma forma todos los días
   * y no saldría un solo reel — que es lo único que alcanza a quien no te sigue.
   * `weekPlan` ya sabe repartir y continuar donde se quedó: reescribirlo aquí
   * sería tener dos repartos que se separan a la primera corrección.
   */
  const { countsFor, weekPlan } = await import("@/lib/instagram/plan");

  for (const { format, count } of countsFor(weekPlan(cuantas, yaHay))) {
    const escrito = await generateInstagramAction({
      productId: row.productId,
      format,
      count,
      auto: true,
    });

    if (!escrito.ok) {
      // Que falle un formato no deja sin escribir a los demás: media semana es
      // mejor que ninguna.
      parte.push(`${row.productId}: no se pudo escribir ${format} — ${escrito.message}`);
    }
  }

  const sinMedia = (await listasSinMedia(row)).slice(0, cuantas);
  const base = new Date();

  for (const [index, pieza] of sinMedia.entries()) {
    if (pieza.mediaKind === "video") {
      parte.push(`${row.productId}: ${pieza.id} espera vídeo, que no se genera solo.`);
      continue;
    }

    const media = await generatePostMediaAction({ id: pieza.id, productId: row.productId });

    if (!media.ok) {
      // No pausa el piloto: no publicar hoy es peor que gastar dos veces en una
      // imagen. La vuelta siguiente lo reintenta.
      parte.push(`${row.productId}: sin imagen para ${pieza.id} — ${media.message}`);
      continue;
    }

    await programar(
      pieza.id,
      row.workspaceId,
      horaProgramada(base, yaHay + index + 1, row.horaDesde, row.horaHasta, pieza.id),
    );

    parte.push(`${row.productId}: ${pieza.id} lista y programada.`);
  }
}
```

Añadir en `src/lib/data/instagram-service.ts` las dos funciones que faltan, con
el mismo criterio de espacio explícito:

```ts
/** Las recién escritas que aún no tienen media ni hora. */
export async function listasSinMedia(row: {
  productId: string;
  workspaceId: string;
}): Promise<{ id: string; mediaKind: string }[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_posts")
    .select("id, media_kind")
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId)
    .eq("status", "aprobado")
    .is("media_url", null)
    .is("scheduled_at", null)
    .order("created_at", { ascending: true });

  return (data ?? []).map((one) => ({ id: one.id, mediaKind: one.media_kind }));
}

/** Le pone la hora, ya con imagen. */
export async function programar(
  id: string,
  workspaceId: string,
  cuando: string,
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from("instagram_posts")
    .update({ scheduled_at: cuando })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
}
```

Importarlas en la ruta junto a las demás.

- [ ] **Step 4: El token de publicación**

Añadir en `src/lib/data/instagram-service.ts`:

```ts
/**
 * El token con el que se publica.
 *
 * Se elige el acceso de Meta que **tenga el permiso de publicar**, no el
 * primero: la conexión de anuncios nació con `ads_read` a secas y con ella el
 * contenedor falla con un error que no dice que faltaba un permiso.
 */
export async function tokenDePublicacion(userId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("meta_logins")
    .select("access_token, scopes, token_expires_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false });

  const valido = (data ?? []).find(
    (one) =>
      (one.scopes ?? []).includes("instagram_content_publish") &&
      (!one.token_expires_at || new Date(one.token_expires_at) > new Date()),
  );

  if (!valido) {
    throw new Error(
      "Ninguna conexión de Meta tiene permiso para publicar en Instagram. Reautoriza con instagram_content_publish.",
    );
  }

  return valido.access_token;
}
```

Importarla en la ruta.

- [ ] **Step 5: Documentar el secreto**

En `.env.example`, junto a las demás variables de servidor:

```
# El secreto del cron del autopiloto de Instagram. La ruta rechaza cualquier
# petición que no traiga `Authorization: Bearer <esto>`. Genéralo con
# `openssl rand -hex 32` y no lo compartas: quien lo tenga puede disparar
# publicaciones.
CRON_SECRET=
```

- [ ] **Step 6: Comprobar tipos y tests**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores, todos los tests en verde.

- [ ] **Step 7: Probar la puerta en local**

```bash
npm run dev
# En otra terminal:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/instagram
curl -s -H "Authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2)" \
     http://localhost:3000/api/cron/instagram
```

Expected: `401` sin cabecera; con ella, un JSON `{"ok":true,"parte":[]}` cuando
no hay ningún autopiloto activo.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/cron/instagram/route.ts src/lib/data/instagram-service.ts .env.example
git commit -m "La vuelta del autopiloto: publica una y rellena el colchón"
git push origin main
```

---

### Task 9: El panel

Sin esto el autopiloto no se puede encender, y uno pausado no se distingue de uno que va bien pero no tiene nada que publicar.

**Files:**
- Create: `src/lib/data/autopilot.ts`
- Create: `src/lib/instagram/accounts.ts`
- Create: `src/app/instagram/autopilot-actions.ts`
- Create: `src/components/autopilot-panel.tsx`
- Modify: `src/app/instagram/page.tsx` (leerlo y montarlo)

**Interfaces:**
- Consumes: `requireContext` de `@/lib/supabase/session`; `Button`, `Field`, `SelectField`, `TextField` de `@/components/ui`; `SectionCard` de `@/components/section-card`.
- Produces:
  - `interface Autopilot { productId, activo, igUserId, porDia, colchonDias, horaDesde, horaHasta, ultimaPublicacionAt, pausadoPor }`
  - `readAutopilot(productId: string): Promise<Autopilot | null>`
  - `listPublishableAccounts(): Promise<{ id: string; username: string }[]>`
  - `saveAutopilotAction(input): Promise<{ ok, message }>`
  - `resumeAutopilotAction(input): Promise<{ ok, message }>`

- [ ] **Step 1: La lectura y la escritura, por sesión**

Crear `src/lib/data/autopilot.ts`. Va por la capa de **sesión** y no por la de
servicio: esto lo lanza una persona desde el navegador, y ahí RLS es justo lo que
tiene que proteger.

```ts
import "server-only";

import { requireContext } from "@/lib/supabase/session";

/** El autopiloto de un producto, visto por quien manda en él. */
export interface Autopilot {
  productId: string;
  activo: boolean;
  igUserId: string;
  porDia: number;
  colchonDias: number;
  horaDesde: number;
  horaHasta: number;
  ultimaPublicacionAt: string | null;
  /** Vacío es «no está pausado». Con texto, dice por qué se apagó solo. */
  pausadoPor: string;
}

export async function readAutopilot(productId: string): Promise<Autopilot | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("instagram_autopilot")
    .select("*")
    .eq("product_id", productId)
    .limit(1);

  const row = (data ?? [])[0];

  if (!row) return null;

  return {
    productId: row.product_id,
    activo: row.activo,
    igUserId: row.ig_user_id ?? "",
    porDia: row.por_dia,
    colchonDias: row.colchon_dias,
    horaDesde: row.hora_desde,
    horaHasta: row.hora_hasta,
    ultimaPublicacionAt: row.ultima_publicacion_at,
    pausadoPor: row.pausado_por,
  };
}

/**
 * Guarda los ajustes, creando la fila si no existía.
 *
 * `upsert` y no `insert` más `update`: el panel no distingue entre configurar
 * por primera vez y cambiar algo, y hacer que lo distinga solo sirve para tener
 * dos caminos donde uno basta.
 */
export async function saveAutopilot(
  productId: string,
  patch: Omit<Autopilot, "productId" | "ultimaPublicacionAt" | "pausadoPor">,
): Promise<void> {
  const { supabase, userId } = await requireContext();

  await supabase.from("instagram_autopilot").upsert(
    {
      product_id: productId,
      user_id: userId,
      activo: patch.activo,
      ig_user_id: patch.igUserId || null,
      por_dia: patch.porDia,
      colchon_dias: patch.colchonDias,
      hora_desde: patch.horaDesde,
      hora_hasta: patch.horaHasta,
    },
    { onConflict: "product_id" },
  );
}

/**
 * Reanudar borra el motivo **y** la cuenta de fallos.
 *
 * Dejando los fallos puestos, el siguiente tropiezo pausaría otra vez al
 * instante y el botón parecería no hacer nada.
 */
export async function resumeAutopilot(productId: string): Promise<void> {
  const { supabase } = await requireContext();

  await supabase
    .from("instagram_autopilot")
    .update({ pausado_por: "", fallos_seguidos: 0 })
    .eq("product_id", productId);
}
```

- [ ] **Step 2: Qué cuentas pueden publicar**

Crear `src/lib/instagram/accounts.ts`:

```ts
import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * Las cuentas de Instagram donde se puede publicar de verdad.
 *
 * ## Por qué se pregunta a Meta y no se escribe a mano
 *
 * Porque el identificador de una cuenta de Instagram no se parece a nada que
 * nadie sepa de memoria, y pegado a mano de un sitio equivocado el fallo llega
 * tarde: el contenedor se crea, se procesa y falla con un error sobre un objeto
 * que no existe.
 *
 * ## Y por qué se recorren las Páginas
 *
 * Porque la API no da «tus cuentas de Instagram»: da tus Páginas de Facebook, y
 * de cada una, la cuenta profesional vinculada si la hay. Una cuenta personal no
 * aparece por ningún lado — que es exactamente lo que hay que poder decir.
 */
export async function listPublishableAccounts(): Promise<
  { id: string; username: string }[]
> {
  const { supabase, userId } = await requireContext();

  const { data } = await supabase
    .from("meta_logins")
    .select("access_token, scopes, token_expires_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false });

  const valido = (data ?? []).find(
    (one) =>
      (one.scopes ?? []).includes("instagram_content_publish") &&
      (!one.token_expires_at || new Date(one.token_expires_at) > new Date()),
  );

  if (!valido) return [];

  const url = new URL("https://graph.facebook.com/v26.0/me/accounts");
  url.searchParams.set("fields", "instagram_business_account{id,username}");
  url.searchParams.set("access_token", valido.access_token);

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!response?.ok) return [];

  const body = (await response.json().catch(() => ({}))) as {
    data?: { instagram_business_account?: { id?: string; username?: string } }[];
  };

  return (body.data ?? [])
    .map((page) => page.instagram_business_account)
    .filter((one): one is { id: string; username?: string } => Boolean(one?.id))
    .map((one) => ({ id: one.id, username: one.username ?? one.id }));
}
```

- [ ] **Step 3: Las acciones**

Crear `src/app/instagram/autopilot-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { resumeAutopilot, saveAutopilot } from "@/lib/data/autopilot";

const readText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const entre = (value: unknown, min: number, max: number, porDefecto: number): number => {
  const n = Number(value);

  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : porDefecto;
};

export async function saveAutopilotAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const productId = readText(raw.productId);

  if (!productId) return { ok: false, message: "Falta el producto." };

  const activo = raw.activo === true;
  const igUserId = readText(raw.igUserId);

  /*
   * Encenderlo sin cuenta se rechaza aquí y no en el cron.
   *
   * Un piloto activo sin cuenta se pausaría solo en la primera vuelta, y quien
   * lo encendió se iría convencido de que quedó funcionando. Decirlo al pulsar
   * cuesta una comprobación.
   */
  if (activo && !igUserId) {
    return { ok: false, message: "Elige la cuenta de Instagram antes de encenderlo." };
  }

  const horaDesde = entre(raw.horaDesde, 0, 23, 18);
  const horaHasta = entre(raw.horaHasta, 0, 23, 21);

  try {
    await saveAutopilot(productId, {
      activo,
      igUserId,
      porDia: entre(raw.porDia, 1, 5, 1),
      colchonDias: entre(raw.colchonDias, 1, 14, 3),
      // Al revés no es un error de quien lo puso: es una ventana que cruza la
      // medianoche, y aquí no se admite. Se ordena y se dice en el mensaje.
      horaDesde: Math.min(horaDesde, horaHasta),
      horaHasta: Math.max(horaDesde, horaHasta),
    });

    revalidatePath("/instagram");

    return {
      ok: true,
      message: activo
        ? "Encendido. Publicará solo, y lo que salga no lo va a leer nadie."
        : "Guardado. Está apagado: no publicará nada solo.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function resumeAutopilotAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const productId = readText((input as Record<string, unknown>)?.productId);

  if (!productId) return { ok: false, message: "Falta el producto." };

  try {
    await resumeAutopilot(productId);
    revalidatePath("/instagram");

    return { ok: true, message: "Reanudado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}
```

- [ ] **Step 4: El panel**

Crear `src/components/autopilot-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Field, SelectField, TextField } from "@/components/ui";
import { resumeAutopilotAction, saveAutopilotAction } from "@/app/instagram/autopilot-actions";
import type { Autopilot } from "@/lib/data/autopilot";

/**
 * El panel del autopiloto.
 *
 * ## Por qué se enseña el motivo de la pausa y no solo «parado»
 *
 * Porque un piloto pausado y uno que va bien pero no tiene nada que publicar se
 * ven exactamente igual desde fuera: la cuenta está callada. Sin el motivo, la
 * única forma de distinguirlos es entrar al servidor a leer el registro.
 */
export function AutopilotPanel({
  productId,
  estado,
  cuentas,
  listas,
}: {
  productId: string;
  estado: Autopilot | null;
  cuentas: { id: string; username: string }[];
  /** Cuántas hay listas por delante. Es lo que dice si el colchón se sostiene. */
  listas: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");

  const [activo, setActivo] = useState(estado?.activo ?? false);
  const [igUserId, setIgUserId] = useState(estado?.igUserId ?? "");
  const [porDia, setPorDia] = useState(estado?.porDia ?? 1);
  const [colchonDias, setColchonDias] = useState(estado?.colchonDias ?? 3);
  const [horaDesde, setHoraDesde] = useState(estado?.horaDesde ?? 18);
  const [horaHasta, setHoraHasta] = useState(estado?.horaHasta ?? 21);

  const correr = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await fn();
      setNote(result.message);
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      {estado?.pausadoPor ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <p className="font-medium">Está parado.</p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{estado.pausadoPor}</p>
          <Button
            className="mt-2"
            disabled={pending}
            onClick={() => correr(() => resumeAutopilotAction({ productId }))}
          >
            Reanudar
          </Button>
        </div>
      ) : null}

      {cuentas.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ninguna conexión de Meta puede publicar todavía: la que hay nació solo con permiso de
          lectura de anuncios.{" "}
          <Link href="/datos/conexiones" className="underline">
            Reautoriza con permiso de publicación
          </Link>{" "}
          para poder encender esto.
        </p>
      ) : (
        <Field label="Cuenta de Instagram">
          <SelectField value={igUserId} onChange={(e) => setIgUserId(e.target.value)}>
            <option value="">Elige una</option>
            {cuentas.map((one) => (
              <option key={one.id} value={one.id}>
                @{one.username}
              </option>
            ))}
          </SelectField>
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Al día">
          <TextField
            type="number"
            min={1}
            max={5}
            value={porDia}
            onChange={(e) => setPorDia(Number(e.target.value))}
          />
        </Field>
        <Field label="Colchón (días)">
          <TextField
            type="number"
            min={1}
            max={14}
            value={colchonDias}
            onChange={(e) => setColchonDias(Number(e.target.value))}
          />
        </Field>
        <Field label="Desde las">
          <TextField
            type="number"
            min={0}
            max={23}
            value={horaDesde}
            onChange={(e) => setHoraDesde(Number(e.target.value))}
          />
        </Field>
        <Field label="Hasta las">
          <TextField
            type="number"
            min={0}
            max={23}
            value={horaHasta}
            onChange={(e) => setHoraHasta(Number(e.target.value))}
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
        />
        <span>
          <span className="font-medium">Publicar solo.</span>{" "}
          <span className="text-slate-500 dark:text-slate-400">
            Escribe, genera la imagen, programa y publica sin que nadie lo lea. Los reels quedan
            esperando vídeo, que todavía no se genera solo.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            correr(() =>
              saveAutopilotAction({
                productId,
                activo,
                igUserId,
                porDia,
                colchonDias,
                horaDesde,
                horaHasta,
              }),
            )
          }
        >
          Guardar
        </Button>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {listas} lista(s) por delante
          {estado?.ultimaPublicacionAt
            ? ` · última publicación ${new Date(estado.ultimaPublicacionAt).toLocaleString()}`
            : " · todavía no ha publicado nada"}
        </p>
      </div>

      {note ? <p className="text-sm text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}
```

- [ ] **Step 5: Montarlo en la página**

En `src/app/instagram/page.tsx`, añadir los imports:

```ts
import { AutopilotPanel } from "@/components/autopilot-panel";
import { readAutopilot } from "@/lib/data/autopilot";
import { listPublishableAccounts } from "@/lib/instagram/accounts";
```

Tras la línea de `posts`, leer lo demás:

```ts
  const [autopilot, cuentas] = actual
    ? await Promise.all([
        readAutopilot(actual.id).catch(() => null),
        // Si Meta no contesta, la lista sale vacía y el panel lo dice. Que no
        // conteste no debería dejar la página en blanco.
        listPublishableAccounts().catch(() => []),
      ])
    : [null, []];
```

Y renderizar el panel **antes** del chat del agente, porque es lo que decide si
hace falta hablar con él o no:

```tsx
      {actual ? (
        <SectionCard
          title="Autopiloto"
          description="Que la cuenta se lleve sola: escribe, genera la imagen, programa y publica."
        >
          <AutopilotPanel
            productId={actual.id}
            estado={autopilot}
            cuentas={cuentas}
            listas={
              posts.filter(
                (one) => one.status === "aprobado" && one.mediaUrl && one.scheduledAt,
              ).length
            }
          />
        </SectionCard>
      ) : null}
```

- [ ] **Step 6: Comprobar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 7: Verlo funcionar**

Run: `npm run dev`, abrir `/instagram`, elegir un producto.

Comprobar a mano:

- Se enciende y se apaga, y los valores siguen ahí al recargar.
- Sin conexión con permiso de publicar, sale el texto y el enlace en vez de un
  desplegable vacío.
- Encender sin elegir cuenta lo rechaza con su mensaje.
- Poniendo `pausado_por` a mano en la base sale el aviso, y «Reanudar» lo limpia.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/autopilot.ts src/lib/instagram/accounts.ts \
        src/app/instagram/autopilot-actions.ts src/components/autopilot-panel.tsx \
        src/app/instagram/page.tsx
git commit -m "El panel del autopiloto: encenderlo, y saber por qué está parado"
git push origin main
```

---

### Task 10: El disparador y la documentación

**Files:**
- Modify: `DEPLOY.md`
- Modify: `docs/instagram.md` (el estado, que dejará de ser el que dice)

- [ ] **Step 1: Documentar el cron en `DEPLOY.md`**

Añadir una sección con la línea de `crontab` y por qué cinco minutos:

```
*/5 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/instagram >> /var/log/ig-autopilot.log 2>&1
```

Explicar: cada cinco minutos son 288 vueltas al día, doce veces el tope de la
API, así que el ritmo lo marcan los guardarraíles y no la frecuencia del cron. Y
que `CRON_SECRET` tiene que existir en el entorno del cron, no solo en el de la
aplicación.

- [ ] **Step 2: Actualizar `docs/instagram.md`**

Los puntos 1 y 2 de «Falta» —generar la media y el cron— dejan de faltar. El 3,
la conexión con Meta, sigue faltando y ahora es **lo único** que separa esto de
funcionar. Reescribir esa sección para que lo diga.

- [ ] **Step 3: Commit**

```bash
git add DEPLOY.md docs/instagram.md
git commit -m "Cómo se dispara el autopiloto, y qué queda de verdad"
git push origin main
```

---

## Verificación en producción

Nada de esto cuenta como hecho hasta que se vea, y solo se puede ver después de
reautorizar Meta con `instagram_basic`, `instagram_content_publish`,
`pages_show_list` y `pages_read_engagement`:

1. `./actualizar.sh` en el servidor: migraciones aplicadas, tests en verde,
   construido y reiniciado.
2. Una pieza escrita por el cron, con su imagen, programada dentro de la ventana.
3. Esa pieza publicada, con su `instagram_id` y su `ig_user_id` anotados.
4. El tope diario deteniendo la segunda publicación del día — comprobable
   bajando `por_dia` a 1 y mirando el parte.
5. Un token inválido pausando el piloto, con el motivo escrito en el panel.

## Lo que este plan deja fuera a propósito

Cada uno con su propio ciclo de spec y plan: vídeo automático, que el agente lea
los seis documentos de investigación, el avatar de marca, carruseles, métricas y
aprendizaje, banco de arquetipos, fuentes de tendencia, y los hashtags en el
primer comentario (necesita `instagram_manage_comments`).
