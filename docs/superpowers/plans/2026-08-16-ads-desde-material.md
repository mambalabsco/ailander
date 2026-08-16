# Anuncios desde material — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementarlo tarea a tarea. Los pasos van
> con casilla (`- [ ]`).

**Objetivo:** que una tanda de anuncios pueda salir de un material que ya
funcionó —con su nivel de cercanía— y no solo de un ángulo, y que además haya un
botón que decida solo.

**Arquitectura:** la fuente de una tanda se hace explícita: ángulo (lo de hoy),
material (una anatomía, con nivel) o automático (una llamada corta elige y la
normal genera). Las tres desembocan en el **mismo** guardado —campaña, conjuntos,
anuncios numerados— y el origen se anota en `adsets`, donde ya vive `angle_id`.

**Tecnología:** Next.js 16 (App Router), React 19, Supabase con RLS por espacio
de trabajo, TypeScript, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-16-ads-desde-material-design.md`

## Restricciones globales

De `AGENTS.md` y de la spec. Aplican a **todas** las tareas.

- **Nunca ejecutes prettier.** El proyecto no tiene configuración y reformatea a
  80 columnas cuando el código está a 100.
- **Los tests solo cargan módulos puros, y con ruta relativa y extensión** —
  `./cosa.ts`, no `@/lib/cosa`. Un `import` **de valor** con alias `@/` impide
  cargar el módulo desde un test; los `import type` sí valen, porque se borran al
  compilar. Mira `src/lib/anatomia.ts:4`, que lo explica en su comentario.
- **No añadas `.eq("user_id", …)`** a ninguna consulta de lectura: la política ya
  acota por espacio de trabajo y ese filtro devuelve cero filas sin dar error.
- **`create policy` no admite `if not exists`.** Aquí no se crean políticas, pero
  si acabas escribiendo una, lleva `drop policy if exists` delante.
- **`database.ts` está escrito a mano** a partir de las migraciones: las columnas
  nuevas se añaden ahí también, y las que tengan valor por defecto van marcadas
  como opcionales en el `Insertable` de su tabla.
- **Comentarios en español**, explicando **por qué** y no qué.
- **El contexto del producto va en `context`, nunca dentro de `prompt`.** Es el
  prefijo cacheado; meterlo en el prompt hace pagar la ficha y la investigación
  enteras en cada llamada, y no falla — solo se paga.
- **El resumen de un trabajo dice lo que se guardó**, no lo que devolvió el
  modelo.
- Comprobaciones: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Cada tarea acaba en commit y `git push origin main`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/nivel-de-copia.ts` (nuevo) | Los tres niveles y su cruce con `ownership`. Puro, sin imports con alias |
| `src/lib/plan-automatico.ts` (nuevo) | El encargo del plan, su esquema y **su validación** contra identificadores reales. Puro |
| `src/lib/anatomia.ts` | Gana `ownership` en `Anatomia` |
| `src/lib/data/anatomias.ts` | Normaliza `ownership` al leer |
| `src/lib/short-ad-prompts.ts` | `buildShortAdBatchPrompt` acepta origen además de ángulo |
| `src/app/products/[id]/ads-generator.tsx` (nuevo) | El generador, con su selector de fuente. Sale de `tab-ads.tsx` |
| `src/app/products/[id]/generate-actions.ts` | `generateShortAdsAction` acepta origen; acciones nuevas |
| `supabase/migrations/20260816000100_tanda_desde_material.sql` (nuevo) | Las dos columnas de `adsets` |

---

### Tarea 1: Los tres niveles, en un módulo puro

La regla que sostiene todo lo demás, aislada y probada antes de que la use nadie.
Va en su propio archivo por el mismo motivo que `material-herencia.ts`:
saltársela **no da ningún error**, sale un anuncio que afirma lo que nadie
comprobó.

**Ficheros:**
- Crear: `src/lib/nivel-de-copia.ts`
- Test: `src/lib/nivel-de-copia.test.ts`

**Interfaces:**
- Consume: `inheritanceRule` de `./material-herencia.ts` (relativo y con
  extensión, que es un import de valor).
- Produce:
  - `type NivelDeCopia = "mismo" | "ampliado" | "referencia"`
  - `NIVELES: { id: NivelDeCopia; nombre: string; explicacion: string }[]`
  - `copyLevelRule(nivel: NivelDeCopia, ownership: "propio" | "ajeno"): string`

- [ ] **Paso 1: Escribe el test que falla**

`src/lib/nivel-de-copia.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { NIVELES, copyLevelRule } from "./nivel-de-copia.ts";

const OWNERSHIPS = ["propio", "ajeno"] as const;

test("de lo ajeno, ningún nivel deja heredar cifras", () => {
  // Es la esquina peligrosa: «mismo enfoque» sobre un anuncio de otra marca es
  // afirmar aquí lo que nadie ha comprobado aquí. No falla si se salta: sale un
  // anuncio con un dato que nadie puede sostener.
  for (const nivel of NIVELES) {
    assert.match(
      copyLevelRule(nivel.id, "ajeno"),
      /no atribuyas/i,
      `el nivel ${nivel.id} sobre material ajeno no lleva la prohibición`,
    );
  }
});

test("de lo propio, ningún nivel la lleva", () => {
  for (const nivel of NIVELES) {
    assert.ok(
      !/no atribuyas/i.test(copyLevelRule(nivel.id, "propio")),
      `el nivel ${nivel.id} sobre material propio prohíbe lo que sí está comprobado`,
    );
  }
});

test("las seis combinaciones son distintas", () => {
  // Si dos coinciden, uno de los dos mandos no está haciendo nada y la pantalla
  // ofrece una elección que no existe.
  const vistas = new Set<string>();

  for (const nivel of NIVELES) {
    for (const ownership of OWNERSHIPS) {
      vistas.add(copyLevelRule(nivel.id, ownership));
    }
  }

  assert.equal(vistas.size, NIVELES.length * OWNERSHIPS.length);
});

test("cada nivel dice lo suyo", () => {
  assert.match(copyLevelRule("mismo", "propio"), /misma promesa/i);
  assert.match(copyLevelRule("ampliado", "propio"), /entradas nuevas/i);
  assert.match(copyLevelRule("referencia", "propio"), /investigación/i);
});

test("son tres niveles y cada uno se puede enseñar en pantalla", () => {
  assert.equal(NIVELES.length, 3);

  for (const nivel of NIVELES) {
    assert.ok(nivel.nombre.length > 0);
    assert.ok(nivel.explicacion.length > 0);
  }
});
```

- [ ] **Paso 2: Ejecuta y comprueba que falla**

```bash
npm test
```

Esperado: `Cannot find module './nivel-de-copia.ts'`.

- [ ] **Paso 3: Escribe el módulo**

`src/lib/nivel-de-copia.ts`:

```ts
// Relativo y con extensión: es un import **de valor**, y con el alias `@/` el
// corredor de Node no lo resuelve y el test de este módulo no se puede cargar.
import { inheritanceRule } from "./material-herencia.ts";

/**
 * Con qué cercanía se copia un material que ya funcionó.
 *
 * Sin imports con alias, probado en `nivel-de-copia.test.ts`.
 *
 * ## Por qué el nivel y `ownership` son dos mandos y no uno
 *
 * El nivel dice cuánto se acerca **la forma**; `ownership` dice si **el
 * contenido** puede viajar. Se cruzan, y el cruce importa: «mismo enfoque» sobre
 * un anuncio de otra marca significa misma construcción y misma **clase** de
 * promesa —nunca sus cifras—, porque una cifra de otro anuncio es algo que dijo
 * otro sobre otro producto.
 *
 * Confundirlos no da ningún error. Da un anuncio que afirma un resultado que
 * nadie ha comprobado, dicho con la misma seguridad que los nuestros.
 *
 * Ojo al reescribir estos textos: entran en el encargo de la tanda. Meter aquí
 * algo variable —una fecha, un contador— no falla: rompe el prefijo cacheado y
 * se paga entero sin que nadie se entere.
 */

export type NivelDeCopia = "mismo" | "ampliado" | "referencia";

/** Los tres, en el orden en el que se ofrecen: de más pegado a más suelto. */
export const NIVELES: { id: NivelDeCopia; nombre: string; explicacion: string }[] = [
  {
    id: "mismo",
    nombre: "Mismo enfoque",
    explicacion:
      "Misma promesa, mismo mecanismo, mismo público. Cambia la ejecución. Es lo de escalar un ganador sin romperlo.",
  },
  {
    id: "ampliado",
    nombre: "Parecido, con más ideas",
    explicacion:
      "Conserva el mecanismo y el deseo, y busca entradas nuevas: otras objeciones, otro momento, un público de al lado.",
  },
  {
    id: "referencia",
    nombre: "Solo como referencia",
    explicacion:
      "Se toma cómo está construido —cómo entra, cómo ordena, cómo cierra— y el contenido sale de la investigación del producto.",
  },
];

/** El texto base de cada nivel, que cambia si el material es de otra marca. */
function levelText(nivel: NivelDeCopia, ownership: "propio" | "ajeno"): string {
  if (nivel === "mismo") {
    return ownership === "propio"
      ? "**Mismo enfoque.** Mantén la **misma promesa**, el mismo mecanismo y el mismo público del material. Lo que cambia es la ejecución: otro gancho, otra entrada, otro formato. No busques un ángulo nuevo — este ya funciona y lo que se quiere es más de esto."
      : "**Mismo enfoque.** Mantén la construcción y la **misma promesa** en su *clase* —el mismo tipo de resultado y el mismo mecanismo—, pero dicha con lo que nuestra investigación sostiene. Lo que cambia es la ejecución: otro gancho, otra entrada, otro formato.";
  }

  if (nivel === "ampliado") {
    return ownership === "propio"
      ? "**Parecido, con más ideas.** Conserva el mecanismo y el deseo del material, y añade **entradas nuevas**: otras objeciones, otro momento emocional, un público adyacente. Cada anuncio tiene que aportar algo que el material no tenía."
      : "**Parecido, con más ideas.** Conserva el mecanismo y el deseo del material, y añade **entradas nuevas** —otras objeciones, otro momento emocional, un público adyacente— sostenidas por nuestra investigación, no por lo que prometía el otro anuncio.";
  }

  return "**Solo como referencia.** Toma de aquí únicamente la construcción: cómo entra, en qué orden coloca las partes, con qué ritmo y cómo cierra. Todo lo que se afirme sale de la **investigación** de nuestro producto, no del material.";
}

/**
 * La instrucción completa: el nivel, y encima qué se puede heredar.
 *
 * Las dos van juntas siempre. Devolver solo el nivel dejaría que «mismo enfoque»
 * arrastrara las cifras de otra marca, que es justo lo que la otra regla existe
 * para impedir.
 */
export function copyLevelRule(nivel: NivelDeCopia, ownership: "propio" | "ajeno"): string {
  return `${levelText(nivel, ownership)}\n\n${inheritanceRule(ownership)}`;
}
```

- [ ] **Paso 4: Ejecuta y comprueba que pasa**

```bash
npm test
```

Esperado: los cinco tests en verde.

- [ ] **Paso 5: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add src/lib/nivel-de-copia.ts src/lib/nivel-de-copia.test.ts
git commit -m "Con qué cercanía se copia un material, y qué se puede heredar"
git push origin main
```

---

### Tarea 2: La anatomía se acuerda de quién era el material

Sin esto la tarea 5 no puede cruzar el nivel con `ownership`: al elegir una
anatomía guardada no hay forma de saber si el anuncio era propio o ajeno. **No
hace falta migración**: `analyses.payload` es JSON.

**Ficheros:**
- Modificar: `src/lib/anatomia.ts:23-46`, `src/lib/data/anatomias.ts`,
  `src/app/products/[id]/material-actions.ts:107`,
  `src/app/products/[id]/anatomy-editor.tsx`
- Test: `src/lib/anatomia.test.ts` (ya existe; se le añade un caso)

**Interfaces:**
- Produce: `Anatomia.ownership: "propio" | "ajeno"` y
  `normalizeAnatomia(payload: unknown): Anatomia`.

- [ ] **Paso 1: Escribe el test que falla**

Añade al final de `src/lib/anatomia.test.ts`:

```ts
import { normalizeAnatomia } from "./anatomia.ts";

test("una anatomía vieja, sin ownership, se lee como ajena", () => {
  // Las dos que ya están guardadas se escribieron antes de que este campo
  // existiera. 'ajeno' es el lado seguro: como mucho prohíbe heredar algo que sí
  // se podía. Al revés, un `propio` supuesto deja pasar la cifra de otra marca.
  const leida = normalizeAnatomia({ promesa: "Bajarla a la mitad", entrada: "La factura" });

  assert.equal(leida.ownership, "ajeno");
  assert.equal(leida.promesa, "Bajarla a la mitad");
});

test("un ownership que no es ninguno de los dos también cae en ajeno", () => {
  assert.equal(normalizeAnatomia({ ownership: "cualquier cosa" }).ownership, "ajeno");
});

test("el ownership guardado se respeta", () => {
  assert.equal(normalizeAnatomia({ ownership: "propio" }).ownership, "propio");
});

test("las listas ausentes salen vacías y no como undefined", () => {
  // `estructura.map(...)` sobre undefined revienta el encargo entero, y el
  // payload es JSON: puede venir sin ellas.
  const leida = normalizeAnatomia({});

  assert.deepEqual(leida.estructura, []);
  assert.deepEqual(leida.objeciones, []);
});
```

- [ ] **Paso 2: Ejecuta y comprueba que falla**

```bash
npm test
```

Esperado: `normalizeAnatomia is not exported` o equivalente.

- [ ] **Paso 3: Añade el campo y el normalizador a `src/lib/anatomia.ts`**

En la interfaz `Anatomia`, después de `swipeId`:

```ts
  /**
   * De quién era el material.
   *
   * Se guarda **dentro de la anatomía** y no solo en `swipe_copies` porque es
   * aquí donde hace falta: al sacar una tanda de anuncios meses después, lo
   * único que se elige es la anatomía, y sin este campo no hay forma de saber si
   * sus cifras se pueden repetir.
   */
  ownership: "propio" | "ajeno";
```

Y al final del archivo:

```ts
/**
 * Una anatomía leída de `payload`, con los huecos rellenos.
 *
 * `payload` es JSON: puede traer cualquier cosa, y las dos anatomías que ya
 * existen se escribieron antes de que hubiera `ownership`. Se normaliza al leer
 * y no al escribir porque lo que hay guardado no se puede cambiar retroactivamente.
 *
 * `ajeno` por defecto es el lado seguro: como mucho prohíbe heredar algo que sí
 * se podía: al revés, un `propio` supuesto deja salir la cifra de otra marca
 * dicha como nuestra.
 */
export function normalizeAnatomia(payload: unknown): Anatomia {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const text = (value: unknown): string => (typeof value === "string" ? value : "");

  return {
    swipeId: text(raw.swipeId),
    ownership: raw.ownership === "propio" ? "propio" : "ajeno",
    entrada: text(raw.entrada),
    promesa: text(raw.promesa),
    publico: text(raw.publico),
    deseo: text(raw.deseo),
    estructura: Array.isArray(raw.estructura)
      ? (raw.estructura as Anatomia["estructura"])
      : [],
    ritmo: text(raw.ritmo),
    queEnsena: text(raw.queEnsena),
    objeciones: Array.isArray(raw.objeciones)
      ? (raw.objeciones as Anatomia["objeciones"])
      : [],
    cierre: text(raw.cierre),
    porQueFunciona: text(raw.porQueFunciona),
  };
}
```

- [ ] **Paso 4: Ejecuta y comprueba que pasa**

```bash
npm test
```

- [ ] **Paso 5: Úsalo al leer, en `src/lib/data/anatomias.ts`**

Añade el import —con alias, que aquí sí vale porque este módulo no se prueba—:

```ts
import { normalizeAnatomia } from "@/lib/anatomia";
```

En `readAnatomia`, sustituye el `return`:

```ts
  return data ? normalizeAnatomia(data.payload) : null;
```

En `listAnatomias`, sustituye el mapeo de `anatomia`:

```ts
    anatomia: normalizeAnatomia(row.payload),
```

- [ ] **Paso 6: Guárdalo al escribir**

En `src/app/products/[id]/material-actions.ts`, dentro de `analyzeMaterialAction`,
la llamada a `saveAnatomia` pasa a llevar el `ownership` que ya se leyó del
formulario en la línea 40:

```ts
      await saveAnatomia({
        productId,
        title: `Anatomía · ${copy.slice(0, 60)}`,
        anatomia: { ...outcome.data, swipeId, ownership },
      });
```

`ANATOMIA_SCHEMA` **no se toca**: el modelo no decide de quién es el material, lo
dice quien lo sube.

- [ ] **Paso 7: Que el editor no lo pierda**

En `src/app/products/[id]/anatomy-editor.tsx`, el estado arranca de `inicial` y se
manda entero al guardar. Comprueba que `ownership` viaja: si el componente
construye el objeto campo a campo en vez de esparcir el anterior, añade
`ownership: inicial.ownership` al objeto que se envía. Un editor que lo pierda
convierte cualquier material propio en ajeno la primera vez que se corrige una
coma, y eso no da ningún error.

- [ ] **Paso 8: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add -A
git commit -m "La anatomía se acuerda de si el material era nuestro"
git push origin main
```

---

### Tarea 3: El origen de una tanda, en el conjunto

**Ficheros:**
- Crear: `supabase/migrations/20260816000100_tanda_desde_material.sql`
- Modificar: `src/types/database.ts:300-319` y `:1302-1319`,
  `src/types/campaign.ts:239-262`, `src/lib/data/campaigns.ts:101-123` y `:258-289`

**Interfaces:**
- Produce: `AdSet.sourceAnalysisId?: string` y `AdSet.sourceLevel?: NivelDeCopia`,
  guardados y leídos.

- [ ] **Paso 1: Escribe la migración**

```sql
-- ---------------------------------------------------------------------------
-- De qué material salió una tanda de anuncios, cuando no salió de un ángulo.
--
-- Va en el **conjunto** y no en cada anuncio porque es una propiedad de la
-- tanda: repetirla en las veinte filas es la misma verdad escrita veinte veces,
-- y `angle_id` —lo mismo para el otro camino— ya vive aquí.
--
-- `set null` y no `cascade`: borrar la anatomía no puede llevarse por delante
-- una campaña que está corriendo. Pierde la referencia, que es lo que sobra, no
-- el trabajo.
--
-- El `check` no es adorno: un nivel mal escrito no fallaría al guardar, y al
-- leerlo no coincidiría con ninguno de los tres. La tanda saldría sin nivel y
-- nadie sabría por qué.
-- ---------------------------------------------------------------------------

alter table public.adsets
  add column if not exists source_analysis_id uuid
    references public.analyses (id) on delete set null;

alter table public.adsets
  add column if not exists source_level text not null default ''
    check (source_level in ('', 'mismo', 'ampliado', 'referencia'));

comment on column public.adsets.source_analysis_id is
  'La anatomía de la que salió la tanda. Nulo = salió de un ángulo o de nada.';

comment on column public.adsets.source_level is
  'Con qué cercanía se copió el material. Vacío = no salió de un material.';
```

- [ ] **Paso 2: Aplícala**

```bash
npm run db:push && npm run db:verify
```

Esperado: `db:verify` termina en «Todo correcto».

- [ ] **Paso 3: Añade las columnas a `src/types/database.ts` a mano**

En `AdsetRow`, después de `angle_id`:

```ts
  source_analysis_id: string | null;
  source_level: string;
```

Y en el `Insertable` de `adsets` (línea ~1306), añade las dos a la lista de
opcionales, detrás de `"angle_id"`:

```ts
          | "source_analysis_id"
          | "source_level"
```

Tienen valor por defecto y todo el código que ya inserta conjuntos sin ellas
tiene que seguir compilando.

- [ ] **Paso 4: Llévalas al tipo de la aplicación**

En `src/types/campaign.ts`, dentro de `AdSet`, después de `angleId`:

```ts
  /**
   * Anatomía de la que salió la tanda, si salió de un material.
   *
   * Vive aquí y no en el anuncio por lo mismo que `angleId`: todos los anuncios
   * de un conjunto comparten origen.
   */
  sourceAnalysisId?: string;
  /** Con qué cercanía se copió. Vacío o ausente = no salió de un material. */
  sourceLevel?: "mismo" | "ampliado" | "referencia";
```

Escrito a mano y no importando `NivelDeCopia`: `types/campaign.ts` solo tiene
imports de tipo, y meterle uno de valor de `@/lib/nivel-de-copia` rompería
cualquier test que lo cargue.

- [ ] **Paso 5: Mapea en las dos direcciones**

En `src/lib/data/campaigns.ts`, en `toAdset` (línea 101), después de `angleId`:

```ts
    sourceAnalysisId: row.source_analysis_id ?? undefined,
    sourceLevel: (row.source_level || undefined) as AdSet["sourceLevel"],
```

Y en `saveAdset` (línea 258), dentro de `row`, después de `angle_id`:

```ts
    source_analysis_id: input.sourceAnalysisId ?? null,
    source_level: input.sourceLevel ?? "",
```

- [ ] **Paso 6: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "Un conjunto anota de qué material salió, y con qué cercanía"
git push origin main
```

---

### Tarea 4: El generador sale de la pestaña

Refactor sin cambio de comportamiento, hecho **antes** de añadir nada: con tres
fuentes dentro, `tab-ads.tsx` —520 líneas, de las que la mitad es la tarjeta de
generar— deja de leerse. Al terminar esta tarea la pantalla tiene que funcionar
**exactamente igual** que antes.

**Ficheros:**
- Crear: `src/app/products/[id]/ads-generator.tsx`
- Modificar: `src/app/products/[id]/tab-ads.tsx:1-375`

**Interfaces:**
- Produce: `<AdsGenerator />` con las props que hoy usa la tarjeta:
  `product`, `prelandings`, `angles`, `desires`, `nextNumbers`, `hasApiKey`.

- [ ] **Paso 1: Mueve la tarjeta a su archivo**

Crea `src/app/products/[id]/ads-generator.tsx` como componente cliente
(`"use client"`) con esta cabecera:

```tsx
/**
 * De dónde sale una tanda de anuncios.
 *
 * Vive aparte de `tab-ads.tsx` porque la pestaña además enseña la estructura de
 * campaña, las prelandings, las creatividades y los formatos: con las fuentes
 * dentro, el archivo pasaba del tamaño en el que se puede leer de una vez.
 */
```

Lleva ahí, **sin tocar su lógica**, todo lo que hoy hay en `tab-ads.tsx` entre el
`useState` de `stage` (línea 70) y el cierre del primer `<SectionCard>` (línea
375), con sus `useState`, sus constantes derivadas (`derivedTheme`,
`derivedFocus`, `derivedAudience`, `campaignName`, `adsetName`, `stageFormats`) y
sus imports.

- [ ] **Paso 2: Úsalo desde la pestaña**

En `tab-ads.tsx`, sustituye ese bloque entero por:

```tsx
      <AdsGenerator
        product={product}
        prelandings={prelandings}
        angles={angles}
        desires={desires}
        nextNumbers={nextNumbers}
        hasApiKey={hasApiKey}
        hasResearch={hasResearch}
      />
```

Y borra de `tab-ads.tsx` los imports que ya no use —`SelectField`, `TextField`,
`GenerateButton`, `generateShortAdsAction`, `DEFAULT_BATCH_SIZE`,
`FUNNEL_STAGES`, `FUNNEL_STAGE_META`, `buildAdsetName`, `buildCampaignName`,
`formatsForStage`, `FunnelStage`, `AdDestinationType`, `MarketingAngle`—.
`npm run lint` te dirá cuáles sobran.

- [ ] **Paso 3: Comprueba que no cambió nada**

```bash
npx tsc --noEmit && npm run lint && npm run build
npm run dev
```

Abre la pestaña Ads de un producto: los mismos campos, la misma vista previa de
nombres y el mismo botón. Si algo se ve distinto, el movimiento no fue limpio.

- [ ] **Paso 4: Comitea**

```bash
git add -A
git commit -m "El generador de anuncios, en su propio archivo"
git push origin main
```

---

### Tarea 5: Una tanda desde una anatomía ya escrita

El camino corto y el que más rinde: ya hay dos anatomías guardadas, así que esto
se puede usar en cuanto esté.

**Ficheros:**
- Modificar: `src/lib/short-ad-prompts.ts:55-177`,
  `src/app/products/[id]/generate-actions.ts:598-776`,
  `src/app/products/[id]/ads-generator.tsx`,
  `src/app/products/[id]/page.tsx:605-619`

**Interfaces:**
- Consume: `copyLevelRule`, `NIVELES`, `NivelDeCopia` de `@/lib/nivel-de-copia`;
  `readAnatomia` de `@/lib/data/anatomias`.
- Produce: `buildShortAdBatchPrompt` acepta
  `origen?: { anatomia: Anatomia; nivel: NivelDeCopia }`, y
  `generateShortAdsAction` acepta `anatomiaId` y `nivel`.

- [ ] **Paso 1: El bloque del material, en el encargo**

En `src/lib/short-ad-prompts.ts`, añade a las opciones de
`buildShortAdBatchPrompt`, junto a `angle`:

```ts
  /**
   * El material del que sale la tanda, cuando no sale de un ángulo.
   *
   * Sustituye al bloque del ángulo, no se suma: dos orígenes a la vez son dos
   * instrucciones que se pisan, y el modelo obedece a la última.
   */
  origen?: { anatomia: Anatomia; nivel: NivelDeCopia };
```

Con los imports de tipo arriba —`import type { Anatomia } from "@/lib/anatomia";`
y `import type { NivelDeCopia } from "@/lib/nivel-de-copia";`— y el de valor
`import { copyLevelRule } from "@/lib/nivel-de-copia";`.

Antes del `return`, monta el bloque:

```ts
  /*
   * El material va donde iba el ángulo, y con la misma forma: el resto del
   * encargo —formatos, estructura de campaña, reglas— no distingue de dónde
   * salió la idea, y esa es justo la razón de que esto no sea una segunda ruta.
   */
  const origenBloque = options.origen
    ? `### El anuncio que ya funcionó

- Cómo entra: ${options.origen.anatomia.entrada}
- Qué promete: ${options.origen.anatomia.promesa}
- A quién le habla: ${options.origen.anatomia.publico}
- El deseo que explota: ${options.origen.anatomia.deseo}
- Ritmo y tono: ${options.origen.anatomia.ritmo}
- Qué enseña: ${options.origen.anatomia.queEnsena}
- Cómo cierra: ${options.origen.anatomia.cierre}
- Por qué funciona: ${options.origen.anatomia.porQueFunciona}

Estructura:
${options.origen.anatomia.estructura.map((item) => `- ${item.parte}: ${item.papel}`).join("\n")}

Objeciones que toca:
${options.origen.anatomia.objeciones.map((item) => `- ${item.objecion} → ${item.comoLaResuelve}`).join("\n")}

### Con qué cercanía copiarlo

${copyLevelRule(options.origen.nivel, options.origen.anatomia.ownership)}`
    : "";
```

Y en la plantilla del `return`, sustituye el bloque del ángulo por:

```
${
  origenBloque ||
  (angle
    ? `### Ángulo de la tanda\n\n**${angle.name}** — ${angle.targetAudience}\n\n- Mecanismo del problema: ${angle.problemMechanism}\n- Mecanismo de la solución: ${angle.solutionMechanism}\n- Momento emotivo: ${angle.emotionalMoment}`
    : "")
}
```

- [ ] **Paso 2: La acción acepta el origen**

En `src/app/products/[id]/generate-actions.ts`, dentro de
`generateShortAdsAction`, después de leer `prelandingId` (línea 609):

```ts
  const anatomiaId = readText(raw.anatomiaId);
  const nivel = readText(raw.nivel) as NivelDeCopia | "";
```

Y después de resolver `angle` (línea 616):

```ts
  /*
   * El material manda sobre el ángulo cuando viene.
   *
   * Se lee **antes** de lanzar el trabajo y no dentro: si la anatomía ya no
   * existe, mejor un error inmediato que un trabajo en segundo plano que arranca,
   * cobra el contexto y termina diciendo que no encontró nada.
   */
  const anatomia = anatomiaId ? await readAnatomia(anatomiaId) : null;
  if (anatomiaId && !anatomia) throw new Error("Esa anatomía ya no existe.");
  if (anatomia && !nivel) throw new Error("Falta con qué cercanía copiar el material.");
```

En la llamada a `buildShortAdBatchPrompt` (línea 644), añade:

```ts
    origen: anatomia && nivel ? { anatomia, nivel } : undefined,
```

En `saveAdset` (línea 723), junto a `angleId`:

```ts
          sourceAnalysisId: anatomia ? anatomiaId : undefined,
          sourceLevel: anatomia && nivel ? nivel : undefined,
```

Y en el `label` de `runInBackground` (línea 665), para que el panel de trabajos
diga de dónde sale:

```ts
    label: anatomia
      ? `Anuncios desde material · ${anatomia.promesa.slice(0, 40)}`
      : `Anuncios · ${theme || ctx.product.name}`,
```

Imports nuevos al principio del archivo:

```ts
import { readAnatomia } from "@/lib/data/anatomias";
import type { NivelDeCopia } from "@/lib/nivel-de-copia";
```

- [ ] **Paso 3: El selector de fuente y el panel de material**

En `ads-generator.tsx`, añade dos props —`anatomias: { id: string; title: string;
summary: string; anatomia: Anatomia }[]`— y el estado:

```tsx
  const [fuente, setFuente] = useState<"angulo" | "material">("angulo");
  const [anatomiaId, setAnatomiaId] = useState(anatomias[0]?.id ?? "");
  const [nivel, setNivel] = useState<NivelDeCopia>("ampliado");
```

`"ampliado"` por defecto y no `"mismo"`: es el que aporta algo sin alejarse, y
el que menos se parece a lo que ya tienes.

Encima de los campos actuales, las dos pestañas:

```tsx
<div className="flex flex-wrap gap-2">
  {(
    [
      ["angulo", "Desde un ángulo"],
      ["material", "Desde un anuncio que funcionó"],
    ] as const
  ).map(([value, label]) => {
    const disabled = value === "material" && anatomias.length === 0;
    return (
      <button
        key={value}
        type="button"
        onClick={() => !disabled && setFuente(value)}
        disabled={disabled}
        title={disabled ? "Analiza un anuncio en la pestaña Ángulos para tener material" : undefined}
        className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
          fuente === value
            ? "border-violet-600 bg-violet-600 text-white"
            : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        }`}
      >
        {label}
      </button>
    );
  })}
</div>
```

Cuando `fuente === "material"`, en lugar del selector de ángulo:

```tsx
<Field label="Qué anuncio copiar">
  <SelectField value={anatomiaId} onChange={(event) => setAnatomiaId(event.target.value)}>
    {anatomias.map((item) => (
      <option key={item.id} value={item.id}>
        {item.summary || item.title}
      </option>
    ))}
  </SelectField>
</Field>

<div>
  <span className="mb-2 block text-sm font-medium">Con qué cercanía</span>
  <div className="space-y-2">
    {NIVELES.map((item) => (
      <label
        key={item.id}
        className="flex cursor-pointer items-start gap-2 rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-800"
      >
        <input
          type="radio"
          name="nivel"
          checked={nivel === item.id}
          onChange={() => setNivel(item.id)}
          className="mt-1 size-4 accent-violet-600"
        />
        <span>
          {item.nombre}
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {item.explicacion}
          </span>
        </span>
      </label>
    ))}
  </div>
</div>
```

Y en la llamada del `GenerateButton`, pasa el origen solo cuando toca:

```tsx
                    ...(fuente === "material" ? { anatomiaId, nivel } : {}),
```

- [ ] **Paso 4: Pásale las anatomías desde la página**

En `src/app/products/[id]/page.tsx`, en `<AdsTab …>` (línea 606) añade
`anatomias={anatomias}` —ya se leen en la línea 326— y hazlas llegar por
`tab-ads.tsx` hasta `<AdsGenerator />`.

- [ ] **Paso 5: Compruébalo a mano**

```bash
npm run dev
```

Con un producto que tenga anatomía: genera tres anuncios en nivel «mismo
enfoque» y otros tres en «solo como referencia». Los primeros tienen que sonar al
material; los segundos, no. Si suenan igual, el nivel no está llegando al
encargo.

Y en la base, que el origen quedó anotado:

```sql
select name, source_level, source_analysis_id from adsets order by created_at desc limit 4;
```

- [ ] **Paso 6: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "Una tanda de anuncios puede salir de un anuncio que funcionó"
git push origin main
```

---

### Tarea 6: Pegar material nuevo sin salir de Ads

Un botón para quien lo usa; dos llamadas por dentro, en **un solo trabajo de
fondo**: escribe la anatomía y después genera. La anatomía queda guardada y
aparece en Ángulos, corregible allí.

**Ficheros:**
- Modificar: `src/app/products/[id]/material-actions.ts`,
  `src/app/products/[id]/ads-generator.tsx`
- Reutiliza: `src/components/video/reference-ads.tsx` (ya hace la extracción de
  fotogramas en el navegador y el análisis)

**Interfaces:**
- Produce: `generateAdsFromNewMaterialAction(form: FormData): Promise<LaunchResult>`

- [ ] **Paso 1: La acción encadenada**

En `src/app/products/[id]/material-actions.ts`, al final:

```ts
/**
 * Pegar un material y sacar anuncios de él, de una vez.
 *
 * Dos llamadas dentro de un solo trabajo, y **pasando por la anatomía** aunque
 * saltársela sería una llamada menos. Dos motivos:
 *
 * - La anatomía es donde se corrige. Una lectura equivocada del anuncio cuesta
 *   un minuto ahí, y diez anuncios escritos con ella si se descubre después.
 * - Queda guardada: la segunda tanda desde el mismo material ya no la paga.
 *
 * Los vídeos que se estén analizando **no se esperan**. Analizar son minutos, y
 * un botón que se queda girando es un botón que se pulsa dos veces.
 */
export async function generateAdsFromNewMaterialAction(
  form: FormData,
): Promise<LaunchResult> {
  const productId = readText(form.get("productId"));
  const copy = readText(form.get("copy"));
  const ownership = readText(form.get("ownership")) === "propio" ? "propio" : "ajeno";
  const nivel = readText(form.get("nivel")) || "ampliado";
  const cuantos = Math.min(20, Math.max(1, Number(form.get("cuantos")) || 5));
  const etapa = readText(form.get("stage")) || "BOFU";
  const destino = readText(form.get("destination")) || "producto";
  const prelandingId = readText(form.get("prelandingId"));
  const pendientes = readText(form.get("videosPendientes"));
  const videoIds = form
    .getAll("videoReferenceIds")
    .map((item) => readText(item))
    .filter(Boolean);

  if (!productId) throw new Error("Falta el producto.");
  if (copy.length < 200) {
    throw new Error("Pega el copy entero: con un fragmento no hay anatomía que sacar.");
  }

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const imagenes = form.getAll("imagenes").filter((item): item is File => item instanceof File);

  return runInBackground({
    productId,
    kind: "anuncios",
    label: `Material y anuncios · ${copy.slice(0, 40)}…`,
    work: async (report) => {
      await report("Leyendo el material");

      const referencias = await listVideoReferences();
      const analyses = referencias
        .filter((item) => videoIds.includes(item.id))
        .map((item) => item.analysis);

      const store = product.storeId ? await findStore(product.storeId) : null;
      const research = await readProductResearch(productId);
      const marketContext = await marketContextFor(product);
      const { buildProductContext } = await import("@/lib/copy-prompts");
      const context = buildProductContext(product, research, store, marketContext);

      const images = await Promise.all(
        imagenes.slice(0, 6).map(async (file) => ({
          mediaType: file.type,
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      );

      const anatomiaSalida = await generateStructured<Omit<Anatomia, "swipeId" | "ownership">>({
        context,
        prompt: buildAnatomiaPrompt({ copy, ownership, videos: describeVideoAnalyses(analyses) }),
        schema: ANATOMIA_SCHEMA,
        role: "copy",
        images,
        maxTokens: 8_000,
      });

      await report("Guardando la anatomía");

      const anatomiaId = await saveAnatomia({
        productId,
        title: `Anatomía · ${copy.slice(0, 60)}`,
        anatomia: { ...anatomiaSalida.data, swipeId: "", ownership },
      });

      await report("Escribiendo los anuncios");

      const { generateShortAdsAction } = await import(
        "@/app/products/[id]/generate-actions"
      );

      /*
       * Se reutiliza la acción de siempre en vez de repetir aquí el guardado de
       * campaña, conjuntos y anuncios. Dos rutas paralelas se desincronizan: se
       * arregla una y la otra sigue rota.
       *
       * Ojo: esa acción abre **su propio trabajo de fondo**, así que en el panel
       * aparecen dos filas —la anatomía y los anuncios— y cada una lleva sus
       * tokens. Por eso este resumen dice «encargados» y no «guardados»: los
       * anuncios los cuenta la otra fila, que es la que sabe cuántos se salvaron.
       */
      await generateShortAdsAction({
        productId,
        anatomiaId,
        nivel,
        count: cuantos,
        stage: etapa,
        destination: destino,
        prelandingId,
      });

      revalidatePath(`/products/${productId}`);

      return {
        // Lo que **no** entró se dice, y no en letra pequeña: una tanda que salió
        // sin mirar lo que le diste es indistinguible de una que sí lo miró.
        summary: `Anatomía escrita con ${analyses.length} vídeo(s) y ${images.length} imagen(es), y ${cuantos} anuncios encargados desde ella.${
          pendientes
            ? ` Generado sin ${pendientes}, que sigue analizándose: vuelve a generar cuando termine si quieres que entre.`
            : ""
        } La anatomía queda en Ángulos por si hay que corregirla.`,
        inputTokens: anatomiaSalida.inputTokens,
        outputTokens: anatomiaSalida.outputTokens,
      };
    },
  });
}
```

- [ ] **Paso 2: El panel de material nuevo**

En `ads-generator.tsx`, añade `"nuevo"` a las fuentes —tercera pestaña, «Pegar un
anuncio»—, más el mismo selector de nivel de la tarea 5.

Los campos y su maquetación se copian de `src/app/products/[id]/material-form.tsx`,
que ya los tiene escritos: el área de texto del copy, la casilla «Es mío y ya lo
lancé» con su explicación, el `input type="file"` de imágenes y las casillas de
vídeos ya analizados. Lo que **no** se copia de ahí es el botón, porque llama a
otra acción.

El `FormData` que espera `generateAdsFromNewMaterialAction` es exactamente este
—si falta una clave, el valor por defecto de la acción se aplica en silencio—:

| Clave | Valor |
|---|---|
| `productId` | `product.id` |
| `copy` | el texto pegado, mínimo 200 caracteres |
| `ownership` | `"propio"` o `"ajeno"` |
| `nivel` | `"mismo"`, `"ampliado"` o `"referencia"` |
| `cuantos` | el mismo contador que la fuente de ángulo |
| `stage` | la etapa elegida arriba |
| `destination` | `"producto"`, `"prelanding"` o `"prelanding-pendiente"` |
| `prelandingId` | solo si el destino es una prelanding |
| `imagenes` | `append` por cada archivo |
| `videoReferenceIds` | `append` por cada vídeo marcado |
| `videosPendientes` | texto para el aviso, p. ej. `«el testimonio»`. Vacío si no hay ninguno |

Para **subir un vídeo nuevo**, no escribas extracción de fotogramas: pon debajo
del panel el componente que ya lo hace, con un aviso de que la tanda no lo
espera:

```tsx
<p className="text-xs text-slate-500 dark:text-slate-400">
  ¿El anuncio llevaba un vídeo que todavía no has analizado? Analízalo aquí abajo: son
  minutos, y esta tanda no lo va a esperar. Cuando termine, aparecerá arriba para la
  siguiente.
</p>
<ReferenceAds productId={product.id} references={videoReferences} />
```

`ReferenceAds` saca los fotogramas y la voz en el navegador y llama a
`analyzeVideoAction` por su cuenta: es su propio trabajo de fondo, y ahí está la
razón de que la tanda no lo espere.

- [ ] **Paso 3: Compruébalo a mano**

```bash
npm run dev
```

Pega un copy largo de otra marca sin marcar «es mío», sube dos imágenes y genera.
Comprueba tres cosas: que el resumen dice cuántas imágenes entraron, que la
anatomía aparece en la pestaña Ángulos, y que en los anuncios **no** hay ninguna
cifra que viniera del copy pegado.

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "Pegar un anuncio en Ads y sacar la tanda de él"
git push origin main
```

---

### Tarea 7: El botón que no pregunta

Dos llamadas: una corta que **elige** y la normal que genera. La elección se
valida contra los identificadores reales antes de usarse.

**Ficheros:**
- Crear: `src/lib/plan-automatico.ts`
- Test: `src/lib/plan-automatico.test.ts`
- Modificar: `src/app/products/[id]/generate-actions.ts`,
  `src/app/products/[id]/ads-generator.tsx`

**Interfaces:**
- Produce: `PLAN_SCHEMA`, `buildPlanPrompt(input)`,
  `validarPlan(devuelto, disponible): PlanDeTanda`, y
  `generateAdsAutoAction(productId): Promise<LaunchResult>`

- [ ] **Paso 1: Escribe el test que falla**

`src/lib/plan-automatico.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { validarPlan } from "./plan-automatico.ts";

const DISPONIBLE = { angulos: ["a1", "a2"], anatomias: ["m1"] };

const PLAN = {
  fuente: "material",
  id: "m1",
  nivel: "ampliado",
  etapa: "MOFU",
  cuantos: 6,
  porQue: "El material rinde y todavía no se ha probado con público de al lado",
};

test("un plan que apunta a algo que existe se acepta entero", () => {
  const plan = validarPlan(PLAN, DISPONIBLE);

  assert.equal(plan.fuente, "material");
  assert.equal(plan.id, "m1");
  assert.equal(plan.nivel, "ampliado");
  assert.equal(plan.cuantos, 6);
});

test("una anatomía inventada da error y NO cae al ángulo por defecto", () => {
  // Es el fallo que este módulo existe para impedir: una tanda correcta, cobrada,
  // y con la sensación de que salió del material que se quería.
  assert.throws(
    () => validarPlan({ ...PLAN, id: "no-existe" }, DISPONIBLE),
    /no existe/i,
  );
});

test("un ángulo inventado también", () => {
  assert.throws(
    () => validarPlan({ ...PLAN, fuente: "angulo", id: "a9", nivel: "" }, DISPONIBLE),
    /no existe/i,
  );
});

test("material sin nivel es un plan incompleto, no un nivel por defecto", () => {
  // Poner uno a dedo aquí sería decidir por el modelo justo lo que se le pidió.
  assert.throws(() => validarPlan({ ...PLAN, nivel: "" }, DISPONIBLE), /cercanía/i);
});

test("un nivel que no es ninguno de los tres se rechaza", () => {
  assert.throws(() => validarPlan({ ...PLAN, nivel: "parecidillo" }, DISPONIBLE), /cercanía/i);
});

test("una etapa desconocida cae en TOFU en vez de romper la tanda", () => {
  // Aquí sí hay valor por defecto sensato: la etapa no cambia de dónde sale la
  // idea, solo por dónde entra, y el modelo devuelve las tres etapas igualmente.
  assert.equal(validarPlan({ ...PLAN, etapa: "MEDIO" }, DISPONIBLE).etapa, "TOFU");
});

test("cuántos se acota a lo que la pantalla permite", () => {
  assert.equal(validarPlan({ ...PLAN, cuantos: 400 }, DISPONIBLE).cuantos, 20);
  assert.equal(validarPlan({ ...PLAN, cuantos: 0 }, DISPONIBLE).cuantos, 1);
});

test("sin motivo escrito, el plan se rechaza", () => {
  // El motivo es lo que separa esto de una caja negra: si no viene, el resumen
  // no puede decir qué eligió y por qué.
  assert.throws(() => validarPlan({ ...PLAN, porQue: "" }, DISPONIBLE), /por qué/i);
});
```

- [ ] **Paso 2: Ejecuta y comprueba que falla**

```bash
npm test
```

- [ ] **Paso 3: Escribe el módulo**

`src/lib/plan-automatico.ts`:

```ts
// Relativos y con extensión: son imports **de valor**, y con el alias `@/` el
// corredor de Node no los resuelve. `types/campaign.ts` solo tiene imports de
// tipo, así que se puede cargar desde un test.
import { NIVELES } from "./nivel-de-copia.ts";
import { FUNNEL_STAGES } from "../types/campaign.ts";
import type { NivelDeCopia } from "./nivel-de-copia.ts";
import type { FunnelStage } from "../types/campaign.ts";

/**
 * El plan de una tanda que nadie configuró.
 *
 * Son dos llamadas y no una: esta elige, y la de siempre genera. Así la
 * elección queda escrita en el resumen —que es lo que separa un botón de una
 * caja negra— y la tanda la escribe el código ya probado, en vez de una segunda
 * ruta que se desincroniza en cuanto se arregle algo en la primera.
 */

export interface PlanDeTanda {
  fuente: "angulo" | "material";
  id: string;
  /** Vacío cuando la fuente es un ángulo. */
  nivel: NivelDeCopia | "";
  etapa: FunnelStage;
  cuantos: number;
  porQue: string;
}

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    fuente: { type: "string", enum: ["angulo", "material"] },
    id: { type: "string" },
    nivel: { type: "string", enum: ["", "mismo", "ampliado", "referencia"] },
    etapa: { type: "string", enum: ["TOFU", "MOFU", "BOFU"] },
    cuantos: { type: "integer" },
    porQue: { type: "string" },
  },
  required: ["fuente", "id", "nivel", "etapa", "cuantos", "porQue"],
  additionalProperties: false,
} as const;

/**
 * Lo que devolvió el modelo, comprobado contra lo que de verdad existe.
 *
 * Un identificador inventado **da error**. Lo que no puede hacer es caer en
 * silencio al primer ángulo: saldría una tanda correcta, cobrada, y con la
 * sensación de que salió del material que se quería.
 */
export function validarPlan(
  devuelto: unknown,
  disponible: { angulos: string[]; anatomias: string[] },
): PlanDeTanda {
  const raw = (devuelto ?? {}) as Record<string, unknown>;
  const fuente = raw.fuente === "material" ? "material" : "angulo";
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const nivel = typeof raw.nivel === "string" ? raw.nivel.trim() : "";
  const porQue = typeof raw.porQue === "string" ? raw.porQue.trim() : "";

  const lista = fuente === "material" ? disponible.anatomias : disponible.angulos;
  if (!id || !lista.includes(id)) {
    throw new Error(
      `El plan eligió ${fuente === "material" ? "un material" : "un ángulo"} que no existe (${id || "sin identificador"}). Vuelve a intentarlo.`,
    );
  }

  if (fuente === "material" && !NIVELES.some((item) => item.id === nivel)) {
    throw new Error("El plan no dijo con qué cercanía copiar el material. Vuelve a intentarlo.");
  }

  if (!porQue) {
    throw new Error("El plan no dijo por qué eligió eso. Vuelve a intentarlo.");
  }

  const etapa = (FUNNEL_STAGES as readonly string[]).includes(String(raw.etapa))
    ? (raw.etapa as FunnelStage)
    : "TOFU";

  return {
    fuente,
    id,
    nivel: fuente === "material" ? (nivel as NivelDeCopia) : "",
    etapa,
    cuantos: Math.min(20, Math.max(1, Math.round(Number(raw.cuantos) || 5))),
    porQue,
  };
}

/**
 * El encargo de elegir.
 *
 * Se le pide que **evite lo último generado**: un modo automático que converge
 * en la misma tanda cada vez deja de servir a la tercera, y no da ningún error
 * — simplemente deja de aportar.
 */
export function buildPlanPrompt(input: {
  angulos: { id: string; name: string; targetAudience: string }[];
  anatomias: { id: string; promesa: string; deseo: string }[];
  ultimasTandas: string[];
}): string {
  return `## Con qué se puede tirar

### Ángulos

${input.angulos.map((item) => `- \`${item.id}\` — ${item.name} (${item.targetAudience})`).join("\n") || "- (ninguno)"}

### Anuncios que ya funcionaron, analizados

${input.anatomias.map((item) => `- \`${item.id}\` — promete: ${item.promesa}. Deseo: ${item.deseo}`).join("\n") || "- (ninguno)"}

${
  input.ultimasTandas.length > 0
    ? `## Lo último que se generó, que conviene no repetir\n\n${input.ultimasTandas.map((item) => `- ${item}`).join("\n")}`
    : ""
}

## Qué tienes que hacer

Elige **una** cosa con la que sacar la siguiente tanda de anuncios y di por qué.

Copia el identificador **tal cual** de las listas de arriba: si te lo inventas, la
tanda no se genera.

Si eliges un material, di con qué cercanía copiarlo:

${NIVELES.map((item) => `- \`${item.id}\` — ${item.nombre}: ${item.explicacion}`).join("\n")}

Elige lo que **menos se parezca** a lo último generado: lo que hace útil a esto es
cubrir lo que falta, no repetir lo que ya está.`;
}
```

- [ ] **Paso 4: Ejecuta y comprueba que pasa**

```bash
npm test
```

Esperado: los ocho tests en verde. Si el corredor no puede cargar
`../types/campaign.ts`, comprueba que ese archivo sigue teniendo **solo** imports
de tipo (`src/types/campaign.ts:1`); si alguien le añadió uno de valor, copia las
tres etapas aquí como constante local y dilo en un comentario.

- [ ] **Paso 5: La acción**

En `src/app/products/[id]/generate-actions.ts`:

```ts
/**
 * Una tanda sin preguntar nada.
 *
 * Elige y después genera, en dos llamadas. La elección se valida contra lo que
 * existe de verdad y **falla si el modelo se la inventa**: es preferible un
 * error a una tanda cobrada que crees que salió de tu material y no salió.
 */
export async function generateAdsAutoAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const ctx = await context(raw.productId);

  const [angles, anatomias, trees] = await Promise.all([
    readAngles(ctx.id),
    listAnatomias(ctx.id),
    readCampaignTrees(ctx.id),
  ]);

  if (angles.length === 0 && anatomias.length === 0) {
    throw new Error(
      "No hay ángulos ni material analizado con los que decidir. Saca ángulos o analiza un anuncio primero.",
    );
  }

  const { data } = await generateStructured<unknown>({
    context: buildProductContext(ctx.product, ctx.research, ctx.store, ctx.marketContext),
    prompt: buildPlanPrompt({
      angulos: angles.map((item) => ({
        id: item.id,
        name: item.name,
        targetAudience: item.targetAudience,
      })),
      anatomias: anatomias.map((item) => ({
        id: item.id,
        promesa: item.anatomia.promesa,
        deseo: item.anatomia.deseo,
      })),
      // Los nombres de los conjuntos ya dicen su enfoque: es lo más barato que
      // describe qué se ha cubierto ya.
      ultimasTandas: trees
        .flatMap((tree) => tree.adsets.map((adset) => adset.name))
        .slice(0, 12),
    }),
    schema: PLAN_SCHEMA,
    role: "copy",
    maxTokens: 1_500,
  });

  const plan = validarPlan(data, {
    angulos: angles.map((item) => item.id),
    anatomias: anatomias.map((item) => item.id),
  });

  return generateShortAdsAction({
    productId: ctx.id,
    count: plan.cuantos,
    stage: plan.etapa,
    angleId: plan.fuente === "angulo" ? plan.id : "",
    anatomiaId: plan.fuente === "material" ? plan.id : "",
    nivel: plan.nivel,
    destination: "producto",
    // El motivo viaja para que el resumen lo pueda decir: sin esto el botón es
    // una caja negra que cobra.
    motivo: plan.porQue,
  });
}
```

En `generateShortAdsAction`, lee `motivo` junto a los demás y añádelo al resumen
final (línea 771):

```ts
  const motivo = readText(raw.motivo);
```

```ts
        `${totalAds} anuncios en ${created.length} conjunto(s) de «${savedCampaign.name}».${
          motivo ? ` Se eligió esto porque: ${motivo}` : ""
        }`,
```

Imports nuevos:

```ts
import { listAnatomias } from "@/lib/data/anatomias";
import { PLAN_SCHEMA, buildPlanPrompt, validarPlan } from "@/lib/plan-automatico";
```

`readCampaignTrees` es el de `@/lib/campaign-store:104`, el mismo que usa la
página para pintar la estructura. Cada `CampaignTree` trae `adsets`, y cada uno
su `name`.

- [ ] **Paso 6: El botón**

En `ads-generator.tsx`, debajo de todo:

```tsx
<div className="rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
  <p className="text-sm font-medium">O que decida él</p>
  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Mira la investigación, los ángulos y el material analizado, elige con qué vale la pena
    tirar y arma la tanda. El resumen dice qué eligió y por qué.
  </p>
  <div className="mt-3">
    <GenerateButton
      action={() => generateAdsAutoAction({ productId: product.id })}
      label="Generar y ya"
      variant="secondary"
      disabled={!hasApiKey}
      disabledReason="Configura tu clave de API en Configuración"
      hint="Dos llamadas: una corta para elegir y la normal para escribir. Entre 0,20 y 0,60 USD."
    />
  </div>
</div>
```

- [ ] **Paso 7: Compruébalo a mano**

```bash
npm run dev
```

Púlsalo dos veces seguidas en el mismo producto: la segunda tanda tiene que
elegir algo distinto de la primera. Si elige lo mismo, `ultimasTandas` no está
llegando.

- [ ] **Paso 8: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "Un botón que elige con qué generar y lo dice"
git push origin main
```

---

## Lo que este plan deja fuera

Está en la spec y se repite aquí:

- **Reutilizar un material entre productos.** Sigue colgando del producto desde
  el que se analizó.
- **Generar las imágenes de la tanda.** El anuncio trae su instrucción de imagen,
  como hoy.
- **Aprender de lo que rindió.** Con el origen anotado en el conjunto se podrá
  preguntar el día que haya métricas de vuelta. Hoy no las hay.
