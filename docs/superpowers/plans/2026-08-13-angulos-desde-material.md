# Ángulos desde material que ya funcionó — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementarlo tarea a tarea. Los pasos van
> con casilla (`- [ ]`).

**Objetivo:** que un copy que funciona —con sus imágenes y sus vídeos— se pueda
analizar a fondo y produzca varios ángulos usables para copys largos y vídeos.

**Arquitectura:** dos pasadas. La primera escribe una **anatomía** del material
—cómo entra, qué promete, con qué ritmo, qué enseña, cómo cierra— que se guarda
en `analyses.payload` y **se puede corregir**. La segunda saca de ahí entre tres
y cinco **ángulos**, que se guardan como ángulos normales para que los copys y
los vídeos los consuman sin tocar nada. Los vídeos se analizan con lo que ya
existe (`analyzeVideoAction`).

**Tecnología:** Next.js 16 (App Router), React 19, Supabase con RLS por espacio
de trabajo, TypeScript, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-13-angulos-desde-material-design.md`

## Restricciones globales

De `AGENTS.md` y de la spec. Aplican a **todas** las tareas.

- **Nunca ejecutes prettier.**
- **Los tests importan con ruta relativa** —`./cosa.ts`— y solo prueban módulos
  puros. Un módulo con un `import` **de valor** usando `@/` no se puede cargar
  desde un test; los `import type` sí, porque se borran al compilar.
- **`create policy` no admite `if not exists`**: cada política nueva lleva
  delante su `drop policy if exists`.
- **No añadas `.eq("user_id", …)`** a ninguna consulta de lectura.
- **`database.ts` está escrito a mano** a partir de las migraciones: las columnas
  nuevas se añaden ahí también, y `market_id`-style columnas nuevas hay que
  marcarlas opcionales en el `Insertable` de las tablas que enumeran opcionales.
- **Comentarios en español**, explicando **por qué** y no qué.
- **Nada de esto acota la idea por lo que el producto puede prometer.** La
  acotación vive en el encargo del copy, que no se toca aquí.
- Comprobaciones: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Cada tarea acaba en commit y `git push origin main`.

---

### Tarea 1: De quién es el material

**Ficheros:**
- Crear: `supabase/migrations/20260813000100_material_propio.sql`
- Modificar: `src/types/database.ts`, `src/types/swipe.ts`,
  `src/lib/data/swipe.ts:96`, `src/components/swipe-file.tsx`

**Interfaces:**
- Produce: `SwipeCopy.ownership: "propio" | "ajeno"` y el parámetro homónimo en
  `saveSwipeCopy`.

- [ ] **Paso 1: Escribe la migración**

```sql
-- ---------------------------------------------------------------------------
-- De quién es el material que se analiza.
--
-- No es una etiqueta informativa: **decide qué se puede heredar**. De un anuncio
-- propio, una promesa concreta y sus cifras son datos comprobados y pueden pasar
-- al ángulo. De uno ajeno, una cifra es algo que dijo otro sobre otro producto, y
-- heredarla es afirmar lo que nadie ha comprobado.
--
-- El valor por defecto es 'ajeno' porque es el lado seguro: lo que ya hay en el
-- archivo se pegó de otras marcas.
-- ---------------------------------------------------------------------------

alter table public.swipe_copies
  add column if not exists ownership text not null default 'ajeno'
    check (ownership in ('propio', 'ajeno'));

comment on column public.swipe_copies.ownership is
  'propio = comprobado, se puede heredar la promesa. ajeno = solo la construcción.';
```

- [ ] **Paso 2: Aplícala y añade el tipo a mano**

```bash
npm run db:push
```

En `src/types/database.ts`, dentro de `SwipeCopyRow`:

```ts
  /** 'propio' se puede heredar entero; de 'ajeno', solo la construcción. */
  ownership: "propio" | "ajeno";
```

Y en la entrada del registro, añade `"ownership"` a la lista de opcionales del
`Insertable` de `swipe_copies`: la columna tiene valor por defecto y todo el
código que ya inserta sin ella tiene que seguir compilando.

- [ ] **Paso 3: Llévalo hasta el tipo de la aplicación**

En `src/types/swipe.ts`:

```ts
  /**
   * De quién es.
   *
   * De lo propio se puede heredar una promesa y sus cifras: están comprobadas.
   * De lo ajeno, solo la construcción — una cifra de otro anuncio es algo que
   * dijo otro sobre otro producto.
   */
  ownership: "propio" | "ajeno";
```

En `src/lib/data/swipe.ts`, en el mapeador y en `saveSwipeCopy` (línea 96),
añade `ownership` con `"ajeno"` por defecto.

- [ ] **Paso 4: La casilla en el archivo de copys**

En `src/components/swipe-file.tsx`, junto a los campos de fuente y formato:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={draft.ownership === "propio"}
    onChange={(event) =>
      setDraft({ ...draft, ownership: event.target.checked ? "propio" : "ajeno" })
    }
    className="size-4 accent-violet-600"
  />
  <span>
    Es mío y ya lo lancé
    <span className="block text-xs text-slate-500 dark:text-slate-400">
      De lo tuyo se puede reutilizar una promesa concreta. De lo ajeno, solo cómo está construido.
    </span>
  </span>
</label>
```

- [ ] **Paso 5: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add -A
git commit -m "El material del archivo dice de quién es"
git push origin main
```

---

### Tarea 2: Qué se puede heredar, en un módulo puro

La regla que sostiene la spec entera, aislada y probada antes de que la use nadie.

**Ficheros:**
- Crear: `src/lib/material-herencia.ts`
- Test: `src/lib/material-herencia.test.ts`

**Interfaces:**
- Consume: nada. Sin imports.
- Produce: `inheritanceRule(ownership: "propio" | "ajeno"): string`

- [ ] **Paso 1: Escribe el test que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { inheritanceRule } from "./material-herencia.ts";

test("de lo propio se puede heredar la promesa y sus cifras", () => {
  const rule = inheritanceRule("propio");

  assert.match(rule, /comprobad/i);
  assert.ok(!/no atribuyas/i.test(rule));
});

test("de lo ajeno, solo la construcción", () => {
  // Es la regla que impide que una cifra de otro anuncio acabe dicha como
  // nuestra. No falla si se salta: sale un copy con un dato que nadie comprobó.
  const rule = inheritanceRule("ajeno");

  assert.match(rule, /no atribuyas/i);
  assert.match(rule, /construcción/i);
});

test("las dos reglas son distintas, o la distinción no sirve de nada", () => {
  assert.notEqual(inheritanceRule("propio"), inheritanceRule("ajeno"));
});
```

- [ ] **Paso 2: Ejecuta y comprueba que falla**

```bash
npm test
```

Esperado: `Cannot find module './material-herencia.ts'`.

- [ ] **Paso 3: Escribe el módulo**

```ts
/**
 * Qué se puede reutilizar de un material, según de quién sea.
 *
 * Sin imports, probado en `material-herencia.test.ts`.
 *
 * Va en su propio archivo porque es **la regla que sostiene todo lo demás**, y
 * porque el fallo de saltársela es silencioso: sale un copy con una cifra que
 * nadie comprobó, dicha con la misma seguridad que las nuestras.
 */
export function inheritanceRule(ownership: "propio" | "ajeno"): string {
  if (ownership === "propio") {
    return "Este material es **nuestro y ya se lanzó**: sus promesas y sus cifras están comprobadas, así que se pueden reutilizar tal cual en los ángulos.";
  }

  return "Este material es **de otra marca**: reutiliza solo su construcción —cómo entra, cómo ordena, con qué ritmo—. **No atribuyas a nuestro producto ninguna cifra, resultado ni promesa concreta del anuncio**: son de otro producto y nadie las ha comprobado aquí.";
}
```

- [ ] **Paso 4: Ejecuta y comprueba que pasa**

```bash
npm test
```

- [ ] **Paso 5: Commit**

```bash
git add src/lib/material-herencia.ts src/lib/material-herencia.test.ts
git commit -m "La regla de qué se hereda de un material, en un módulo puro"
git push origin main
```

---

### Tarea 3: La anatomía: tipo, encargo y guardado

**Ficheros:**
- Crear: `src/lib/anatomia.ts`, `src/lib/data/anatomias.ts`
- Test: `src/lib/anatomia.test.ts`

**Interfaces:**
- Consume: `inheritanceRule` de `@/lib/material-herencia`.
- Produce:
  - `interface Anatomia` con los campos de la spec
  - `ANATOMIA_SCHEMA` para `generateStructured`
  - `buildAnatomiaPrompt(input): string`
  - `describeVideoAnalyses(analyses: VideoAnalysis[]): string`
  - `saveAnatomia(input): Promise<string>` y `readAnatomia(id)`

- [ ] **Paso 1: Escribe el test de lo que es puro**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { describeVideoAnalyses } from "./anatomia.ts";

const analysis = {
  hook: "Empieza con la factura de la luz",
  promise: "Bajarla a la mitad",
  voice: "Un vecino, no un vendedor",
  beats: [],
  averageShotSeconds: 2.4,
  productMoment: "A los 12 segundos, en la mano",
  callToAction: "Enlace en el primer comentario",
  whyItWorks: "El problema se ve antes de que nadie hable",
};

test("los vídeos entran descritos, no como datos sueltos", () => {
  const text = describeVideoAnalyses([analysis]);

  assert.match(text, /Empieza con la factura/);
  assert.match(text, /2,4|2\.4/);
});

test("sin vídeos no se escribe una sección vacía", () => {
  // Un encabezado sin nada debajo le dice al modelo que había vídeos y no los
  // vio, y se pone a suponer qué salía en ellos.
  assert.equal(describeVideoAnalyses([]), "");
});

test("varios vídeos van numerados, para poder citarlos", () => {
  const text = describeVideoAnalyses([analysis, { ...analysis, hook: "Otro gancho" }]);

  assert.match(text, /Vídeo 1/);
  assert.match(text, /Vídeo 2/);
});
```

- [ ] **Paso 2: Ejecuta y comprueba que falla**

```bash
npm test
```

- [ ] **Paso 3: Escribe `src/lib/anatomia.ts`**

Con el tipo de la spec, el esquema y los dos constructores. `describeVideoAnalyses`
va primero porque es lo probado:

```ts
import type { VideoAnalysis } from "@/lib/video/analysis";
import { inheritanceRule } from "@/lib/material-herencia";

export interface Anatomia {
  swipeId: string;
  entrada: string;
  promesa: string;
  publico: string;
  deseo: string;
  estructura: { parte: string; papel: string }[];
  ritmo: string;
  queEnsena: string;
  objeciones: { objecion: string; comoLaResuelve: string }[];
  cierre: string;
  porQueFunciona: string;
}

/**
 * Los vídeos, ya analizados, dichos en prosa.
 *
 * Van descritos y no como JSON crudo porque el modelo los lee mejor así, y
 * numerados para que la anatomía pueda decir «como en el vídeo 2».
 *
 * Sin vídeos devuelve cadena vacía, no un encabezado suelto: un título sin nada
 * debajo le dice al modelo que había vídeos y no los vio, y entonces supone.
 */
export function describeVideoAnalyses(analyses: VideoAnalysis[]): string {
  if (analyses.length === 0) return "";

  return analyses
    .map((item, index) =>
      [
        `### Vídeo ${index + 1}`,
        `- Cómo entra: ${item.hook}`,
        `- Qué promete: ${item.promise}`,
        `- Voz: ${item.voice}`,
        `- Plano cada ${item.averageShotSeconds.toLocaleString("es-ES")} s`,
        `- El producto: ${item.productMoment}`,
        `- Cierre: ${item.callToAction}`,
        `- Por qué funciona: ${item.whyItWorks}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export const ANATOMIA_SCHEMA = {
  type: "object",
  properties: {
    entrada: { type: "string" },
    promesa: { type: "string" },
    publico: { type: "string" },
    deseo: { type: "string" },
    estructura: {
      type: "array",
      items: {
        type: "object",
        properties: { parte: { type: "string" }, papel: { type: "string" } },
        required: ["parte", "papel"],
        additionalProperties: false,
      },
    },
    ritmo: { type: "string" },
    queEnsena: { type: "string" },
    objeciones: {
      type: "array",
      items: {
        type: "object",
        properties: { objecion: { type: "string" }, comoLaResuelve: { type: "string" } },
        required: ["objecion", "comoLaResuelve"],
        additionalProperties: false,
      },
    },
    cierre: { type: "string" },
    porQueFunciona: { type: "string" },
  },
  required: [
    "entrada", "promesa", "publico", "deseo", "estructura",
    "ritmo", "queEnsena", "objeciones", "cierre", "porQueFunciona",
  ],
  additionalProperties: false,
} as const;

/**
 * El encargo de la anatomía.
 *
 * Pide **describir**, no juzgar ni mejorar: lo que se busca es cómo está
 * construido el anuncio, y un modelo al que se le pide opinión empieza a
 * proponer cambios en vez de leer lo que tiene delante.
 */
export function buildAnatomiaPrompt(input: {
  copy: string;
  ownership: "propio" | "ajeno";
  videos: string;
}): string {
  return `## El material

${inheritanceRule(input.ownership)}

### El copy, entero

${input.copy}

${input.videos ? `## Los vídeos que se lanzaron con él\n\n${input.videos}\n` : ""}
## Qué tienes que hacer

Descríbelo. No lo juzgues, no propongas mejoras y no lo reescribas: lo que hace
falta es entender **cómo está construido** para poder construir otra cosa igual
de buena por otro sitio.

Si hay imágenes, míralas: forman parte del anuncio tanto como el texto.`;
}
```

- [ ] **Paso 4: Ejecuta los tests**

```bash
npm test
```

Esperado: los tres de `describeVideoAnalyses` en verde.

- [ ] **Paso 5: Escribe `src/lib/data/anatomias.ts`**

```ts
import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { Anatomia } from "@/lib/anatomia";
import type { Json } from "@/types/database";

/**
 * Las anatomías, en `analyses`.
 *
 * En su propio módulo y no en `library.ts`: esa tabla la comparte el historial,
 * cuyo tipo no tiene `payload` —la columna existe desde el principio y nadie la
 * había usado— y ensancharlo para esto obligaría a tocar una pantalla que no
 * tiene nada que ver.
 */
export async function saveAnatomia(input: {
  id?: string;
  productId: string;
  title: string;
  anatomia: Anatomia;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId,
    title: input.title,
    kind: "anatomia",
    status: "completed",
    // El resumen es lo que se lee en una lista: la promesa dice más que nada.
    summary: input.anatomia.promesa,
    payload: input.anatomia as unknown as Json,
  };

  const query = input.id
    ? supabase.from("analyses").update(row).eq("id", input.id)
    : supabase.from("analyses").insert(row);

  const { data, error } = await query.select("id").single();
  if (error) throw new Error(`No se pudo guardar la anatomía: ${error.message}`);

  return data.id;
}

export async function readAnatomia(id: string): Promise<Anatomia | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("analyses")
    .select("payload")
    .eq("id", id)
    .eq("kind", "anatomia")
    .maybeSingle();

  return (data?.payload as unknown as Anatomia) ?? null;
}

export async function listAnatomias(
  productId: string,
): Promise<{ id: string; title: string; summary: string; anatomia: Anatomia }[]> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("analyses")
    .select("id, title, summary, payload")
    .eq("product_id", productId)
    .eq("kind", "anatomia")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    anatomia: row.payload as unknown as Anatomia,
  }));
}
```

- [ ] **Paso 6: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add -A
git commit -m "La anatomía de un material: tipo, encargo y guardado"
git push origin main
```

---

### Tarea 4: La acción que analiza el material

**Ficheros:**
- Crear: `src/app/products/[id]/material-actions.ts`

**Interfaces:**
- Consume: `buildAnatomiaPrompt`, `describeVideoAnalyses`, `ANATOMIA_SCHEMA`,
  `saveAnatomia`, `marketContextFor`, `analyzeVideoAction`.
- Produce: `analyzeMaterialAction(form: FormData): Promise<LaunchResult>`

- [ ] **Paso 1: Escribe la acción**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { runInBackground } from "@/lib/background";
import { findProductAnywhere } from "@/lib/products";
import { findStore } from "@/lib/store-registry";
import { readProductResearch } from "@/lib/research-store";
import { generateStructured } from "@/lib/generators";
import { marketContextFor } from "@/lib/market-context";
import { listVideoReferences } from "@/lib/data/video-references";
import { ANATOMIA_SCHEMA, buildAnatomiaPrompt, describeVideoAnalyses } from "@/lib/anatomia";
import { saveAnatomia } from "@/lib/data/anatomias";
import type { Anatomia } from "@/lib/anatomia";
import type { LaunchResult } from "@/types/jobs";

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Analiza un material y escribe su anatomía.
 *
 * Los vídeos **ya vienen analizados**: se suben y se analizan con
 * `analyzeVideoAction`, que es el camino que ya existe y que saca fotogramas y
 * transcripción. Aquí solo entran sus análisis, que es lo que hace falta.
 */
export async function analyzeMaterialAction(form: FormData): Promise<LaunchResult> {
  const productId = readText(form.get("productId"));
  const swipeId = readText(form.get("swipeId"));
  const copy = readText(form.get("copy"));
  const ownership = readText(form.get("ownership")) === "propio" ? "propio" : "ajeno";
  const videoIds = form.getAll("videoReferenceIds").map((item) => readText(item)).filter(Boolean);

  if (!productId) throw new Error("Falta el producto.");
  if (!copy) throw new Error("Pega el copy que quieres analizar.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const imagenes = form.getAll("imagenes").filter((item): item is File => item instanceof File);

  return runInBackground({
    productId,
    kind: "analisis",
    label: `Anatomía de «${copy.slice(0, 40)}…»`,
    work: async (report) => {
      await report("Reuniendo los vídeos ya analizados");

      const referencias = await listVideoReferences();
      const analyses = referencias
        .filter((item) => videoIds.includes(item.id))
        .map((item) => item.analysis);

      await report("Leyendo el material");

      const store = product.storeId ? await findStore(product.storeId) : null;
      const research = await readProductResearch(productId);
      const marketContext = await marketContextFor(product);
      const { buildProductContext } = await import("@/lib/copy-prompts");

      const images = await Promise.all(
        imagenes.slice(0, 6).map(async (file) => ({
          mediaType: file.type,
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      );

      const outcome = await generateStructured<Omit<Anatomia, "swipeId">>({
        // El contexto del producto va aparte: se reutiliza al sacar ángulos y es
        // el prefijo que la caché reaprovecha.
        context: buildProductContext(product, research, store, marketContext),
        prompt: buildAnatomiaPrompt({
          copy,
          ownership,
          videos: describeVideoAnalyses(analyses),
        }),
        schema: ANATOMIA_SCHEMA,
        role: "copy",
        images,
        maxTokens: 8_000,
      });

      await report("Guardando la anatomía");

      const id = await saveAnatomia({
        productId,
        title: `Anatomía · ${copy.slice(0, 60)}`,
        anatomia: { ...outcome.data, swipeId },
      });

      revalidatePath(`/products/${productId}`);

      return {
        summary: `Anatomía escrita con ${analyses.length} vídeo(s) y ${images.length} imagen(es). Revísala antes de sacar ángulos: corregirla ahora cuesta un minuto.`,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        id,
      };
    },
  });
}
```

- [ ] **Paso 2: El formulario que la lanza**

Sin esto la acción no tiene quién la llame: espera `copy`, `ownership`,
`imagenes` y `videoReferenceIds`, y ninguna pantalla los manda.

Crea `src/app/products/[id]/material-form.tsx`, componente cliente, en la
pestaña de Ángulos:

```tsx
"use client";

import { useRef, useState } from "react";
import { Field, TextAreaField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { analyzeMaterialAction } from "@/app/products/[id]/material-actions";

export function MaterialForm({
  productId,
  videoReferences,
  hasApiKey,
}: {
  productId: string;
  /** Vídeos ya analizados, que es de donde salen sus análisis. */
  videoReferences: { id: string; title: string }[];
  hasApiKey: boolean;
}) {
  const [copy, setCopy] = useState("");
  const [propio, setPropio] = useState(false);
  const [videos, setVideos] = useState<string[]>([]);
  const imagenesRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <Field label="El copy que funcionó, entero">
        <TextAreaField rows={10} value={copy} onChange={(e) => setCopy(e.target.value)} />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={propio}
          onChange={(e) => setPropio(e.target.checked)}
          className="mt-1 size-4 accent-violet-600"
        />
        <span>
          Es mío y ya lo lancé
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            De lo tuyo se puede reutilizar una promesa concreta y sus cifras. De lo ajeno, solo
            cómo está construido: una cifra de otro anuncio es algo que dijo otro sobre otro
            producto.
          </span>
        </span>
      </label>

      <Field label="Imágenes del anuncio (opcional)">
        <input type="file" accept="image/*" multiple ref={imagenesRef} />
      </Field>

      {/*
        Los vídeos se eligen entre los **ya analizados**: analizarlos es un
        trabajo largo que ya existe y tiene su propia pantalla. Repetirlo aquí
        sería tener dos caminos que hacen lo mismo y se desincronizan.
      */}
      {videoReferences.length > 0 ? (
        <Field label="Vídeos ya analizados que se lanzaron con este copy">
          <div className="space-y-1">
            {videoReferences.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={videos.includes(item.id)}
                  onChange={(e) =>
                    setVideos((current) =>
                      e.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                  className="size-4 accent-violet-600"
                />
                {item.title}
              </label>
            ))}
          </div>
        </Field>
      ) : null}

      <GenerateButton
        action={() => {
          const payload = new FormData();
          payload.set("productId", productId);
          payload.set("copy", copy);
          payload.set("ownership", propio ? "propio" : "ajeno");
          for (const id of videos) payload.append("videoReferenceIds", id);
          for (const file of imagenesRef.current?.files ?? []) payload.append("imagenes", file);

          return analyzeMaterialAction(payload);
        }}
        label="Analizar el material"
        disabled={!hasApiKey || copy.trim().length < 200}
        disabledReason={
          copy.trim().length < 200 ? "Pega el copy entero: con un fragmento no hay anatomía que sacar" : undefined
        }
        hint="Una llamada. Después podrás corregir la anatomía antes de sacar ángulos."
      />
    </div>
  );
}
```

Y en `page.tsx`, pásale `videoReferences` —que ya se leen— y `hasApiKey`.

- [ ] **Paso 3: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add -A
git commit -m "Analizar un material y escribir su anatomía"
git push origin main
```

---

### Tarea 5: Leer y corregir la anatomía

**Ficheros:**
- Crear: `src/app/products/[id]/anatomy-editor.tsx`
- Modificar: `src/app/products/[id]/tab-angles.tsx`, `src/app/products/[id]/page.tsx`

**Interfaces:**
- Consume: `listAnatomias`, `saveAnatomia`.
- Produce: `saveAnatomiaAction(id, productId, anatomia)`.

- [ ] **Paso 1: La acción de guardar correcciones**

En `src/app/products/[id]/material-actions.ts`:

```ts
export async function saveAnatomiaAction(
  id: unknown,
  productId: unknown,
  anatomia: unknown,
): Promise<{ ok: boolean; message: string }> {
  const anatomiaId = readText(id);
  const product = readText(productId);
  if (!anatomiaId || !product) return { ok: false, message: "Falta la anatomía." };

  const data = anatomia as Anatomia;
  if (!data?.promesa) return { ok: false, message: "La anatomía necesita al menos su promesa." };

  await saveAnatomia({ id: anatomiaId, productId: product, title: `Anatomía · ${data.promesa.slice(0, 60)}`, anatomia: data });
  revalidatePath(`/products/${product}`);

  return { ok: true, message: "Guardada. Los ángulos saldrán con lo corregido." };
}
```

- [ ] **Paso 2: El editor**

`anatomy-editor.tsx` es un componente cliente con un campo por apartado
—entrada, promesa, público, deseo, ritmo, qué enseña, cierre, por qué funciona—
y listas editables para `estructura` y `objeciones`, con el mismo patrón que
`objections-editor.tsx`, que ya existe y hace exactamente esto para las
objeciones del documento 4.

Debajo, el botón de sacar ángulos, con esta línea encima:

```tsx
<p className="text-sm text-slate-500 dark:text-slate-400">
  Corrige aquí lo que el análisis haya entendido mal. Hacerlo ahora cuesta un minuto; descubrirlo
  en cinco ángulos ya escritos cuesta cinco, y lo que se pagó por escribirlos.
</p>
```

- [ ] **Paso 3: Compruébalo a mano**

```bash
npm run dev
```

Analiza un material, corrige la promesa en el editor, recarga y comprueba que la
corrección sigue ahí.

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add -A
git commit -m "Leer y corregir la anatomía antes de sacar ángulos"
git push origin main
```

---

### Tarea 6: El troceado y el casado de los ángulos

Lo que evita repetir los dos fallos de las portadas: una respuesta que se corta
por longitud, y un resumen que cuenta lo que devolvió el modelo en vez de lo que
se guardó.

**Ficheros:**
- Crear: `src/lib/angulos-vuelta.ts`
- Test: `src/lib/angulos-vuelta.test.ts`

**Interfaces:**
- Produce: `matchByPosition<T>(pedidos: T[], vuelta: unknown[]): { casados: number; sobran: number }`

- [ ] **Paso 1: Escribe el test que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { matchByPosition } from "./angulos-vuelta.ts";

test("cuando vuelven todos, se casan todos", () => {
  assert.deepEqual(matchByPosition([1, 2, 3], ["a", "b", "c"]), { casados: 3, sobran: 0 });
});

test("si vuelven de menos, se casan los que hay y se dice cuántos faltan", () => {
  // No se corren posiciones: casar el tercero pedido con el segundo devuelto es
  // como acaba un titular en el sitio del botón.
  assert.deepEqual(matchByPosition([1, 2, 3], ["a", "b"]), { casados: 2, sobran: 1 });
});

test("si vuelven de más, se ignoran los sobrantes", () => {
  assert.deepEqual(matchByPosition([1, 2], ["a", "b", "c"]), { casados: 2, sobran: 0 });
});

test("sin vuelta no se casa nada, y se nota", () => {
  assert.deepEqual(matchByPosition([1, 2], []), { casados: 0, sobran: 2 });
});
```

- [ ] **Paso 2: Ejecuta y comprueba que falla**

```bash
npm test
```

- [ ] **Paso 3: Escribe el módulo**

```ts
/**
 * Cuántos de los pedidos volvieron de verdad.
 *
 * Sin imports, probado en `angulos-vuelta.test.ts`.
 *
 * Existe porque contar lo que devuelve el modelo y darlo por guardado ya costó
 * una noche: el resumen decía «doce reescritos» con la página intacta. Lo que
 * hay que contar es lo que **se casó**, y decir cuántos faltaron.
 */
export function matchByPosition<T>(
  pedidos: T[],
  vuelta: unknown[],
): { casados: number; sobran: number } {
  const casados = Math.min(pedidos.length, vuelta.length);
  return { casados, sobran: pedidos.length - casados };
}
```

- [ ] **Paso 4: Ejecuta y comprueba que pasa**

```bash
npm test
```

- [ ] **Paso 5: Commit**

```bash
git add src/lib/angulos-vuelta.ts src/lib/angulos-vuelta.test.ts
git commit -m "Contar los ángulos que vuelven de verdad"
git push origin main
```

---

### Tarea 7: Sacar los ángulos

**Ficheros:**
- Crear: `supabase/migrations/20260813000200_angulo_de_material.sql`
- Modificar: `src/types/database.ts`, `src/types/copy.ts`,
  `src/lib/data/copy.ts:62`, `src/app/products/[id]/material-actions.ts`

**Interfaces:**
- Consume: `matchByPosition`, `readAnatomia`, `addAngles`.
- Produce: `generateAnglesFromMaterialAction(input): Promise<LaunchResult>`

- [ ] **Paso 1: La migración**

```sql
-- De qué anatomía salió un ángulo, si salió de una.
--
-- `set null` y no `cascade`: borrar la anatomía no puede llevarse ángulos que ya
-- se están usando en copys y en vídeos. Pierden la referencia, que es lo que
-- sobra, no el trabajo.
alter table public.angles
  add column if not exists source_analysis_id uuid
    references public.analyses (id) on delete set null;
```

Aplícala con `npm run db:push` y añade la columna a `AngleRow` en `database.ts`,
marcándola opcional en el `Insertable` de `angles`.

- [ ] **Paso 2: La acción**

```ts
export async function generateAnglesFromMaterialAction(input: {
  anatomiaId: unknown;
  productId: unknown;
  cuantos?: unknown;
}): Promise<LaunchResult> {
  const anatomiaId = readText(input.anatomiaId);
  const productId = readText(input.productId);
  const cuantos = Math.min(Math.max(Number(input.cuantos) || 4, 3), 5);

  if (!anatomiaId || !productId) throw new Error("Falta la anatomía o el producto.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const anatomia = await readAnatomia(anatomiaId);
  if (!anatomia) throw new Error("Esa anatomía ya no existe.");

  return runInBackground({
    productId,
    kind: "angulos",
    label: `${cuantos} ángulos desde la anatomía`,
    work: async (report) => {
      await report("Escribiendo los ángulos");

      const store = product.storeId ? await findStore(product.storeId) : null;
      const research = await readProductResearch(productId);
      const marketContext = await marketContextFor(product);
      const { buildProductContext } = await import("@/lib/copy-prompts");

      const outcome = await generateStructured<{ angulos: AnguloDevuelto[] }>({
        context: buildProductContext(product, research, store, marketContext),
        prompt: buildAngulosPrompt({ anatomia, cuantos }),
        schema: ANGULOS_SCHEMA,
        role: "copy",
        maxTokens: 16_000,
      });

      const vuelta = outcome.data.angulos ?? [];
      const { casados, sobran } = matchByPosition(Array.from({ length: cuantos }), vuelta);

      if (casados === 0) {
        throw new Error("El modelo no devolvió ningún ángulo. Vuelve a intentarlo.");
      }

      const { addAngles } = await import("@/lib/data/copy");
      const guardados = await addAngles(
        productId,
        vuelta.slice(0, casados).map((item) => ({
          desire: item.deseo || anatomia.deseo,
          name: item.nombre,
          targetAudience: item.publico,
          storyArc: {
            start: item.arco.inicio,
            crisis: item.arco.crisis,
            discovery: item.arco.descubrimiento,
            resolution: item.arco.resolucion,
          },
          problemMechanism: item.mecanismoProblema,
          solutionMechanism: item.mecanismoSolucion,
          emotionalMoment: item.momentoEmocional,
        })),
        null,
        anatomiaId,
      );

      revalidatePath(`/products/${productId}`);

      return {
        // Lo **guardado**, no lo devuelto: es la diferencia entre «dice que sí» y
        // «lo hizo», y ya costó una noche aprenderla.
        summary: `${guardados.length} ángulos guardados${sobran > 0 ? ` (faltaron ${sobran} de los ${cuantos} pedidos)` : ""}. Ya se pueden usar en copys y en vídeos.`,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      };
    },
  });
}
```

`addAngles` recibe dos parámetros nuevos —el mercado, que ya tiene, y la
anatomía de origen—: añade `sourceAnalysisId` a su firma y `source_analysis_id`
al insert.

- [ ] **Paso 3: El encargo, en `anatomia.ts`**

```ts
/**
 * El encargo de los ángulos.
 *
 * Pide entradas **distintas entre sí** y no la misma idea reformulada: un
 * anuncio que funciona suele tener dentro más de una puerta —el miedo, el
 * atajo, la identidad— y sacar cinco variantes de la misma no da cinco ángulos,
 * da uno escrito cinco veces.
 *
 * No se acota por lo que el producto puede prometer: eso es lo pedido, y la
 * acotación vive en el encargo del copy.
 */
export function buildAngulosPrompt(input: { anatomia: Anatomia; cuantos: number }): string {
  const { anatomia, cuantos } = input;

  return `## La anatomía del anuncio que funcionó

- Cómo entra: ${anatomia.entrada}
- Qué promete: ${anatomia.promesa}
- A quién le habla: ${anatomia.publico}
- El deseo que explota: ${anatomia.deseo}
- Ritmo y tono: ${anatomia.ritmo}
- Qué enseña: ${anatomia.queEnsena}
- Cómo cierra: ${anatomia.cierre}
- Por qué funciona: ${anatomia.porQueFunciona}

Estructura:
${anatomia.estructura.map((item) => `- ${item.parte}: ${item.papel}`).join("\n")}

Objeciones que toca:
${anatomia.objeciones.map((item) => `- ${item.objecion} → ${item.comoLaResuelve}`).join("\n")}

## Qué tienes que hacer

Escribe **${cuantos} ángulos distintos** para nuestro producto, tomando de aquí
el mecanismo y extendiéndolo. Distintos de verdad: cada uno tiene que entrar por
una puerta diferente —un miedo, un atajo, una identidad, una comparación—, no ser
el mismo ángulo con otras palabras.

Devuélvelos en una lista, ${cuantos} en total y en orden.

No te limites por lo que el producto pueda prometer hoy: lo que se busca es el
enfoque. Si un ángulo necesita una promesa que la investigación no sostiene,
escríbelo igual y dilo en \`promesaPorValidar\`.`;
}
```

Con su tipo y su esquema, en el mismo archivo:

```ts
export interface AnguloDevuelto {
  nombre: string;
  deseo: string;
  publico: string;
  arco: { inicio: string; crisis: string; descubrimiento: string; resolucion: string };
  mecanismoProblema: string;
  mecanismoSolucion: string;
  momentoEmocional: string;
  /** Vacío cuando el ángulo se sostiene con lo que hay investigado. */
  promesaPorValidar: string;
}

export const ANGULOS_SCHEMA = {
  type: "object",
  properties: {
    angulos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          deseo: { type: "string" },
          publico: { type: "string" },
          arco: {
            type: "object",
            properties: {
              inicio: { type: "string" },
              crisis: { type: "string" },
              descubrimiento: { type: "string" },
              resolucion: { type: "string" },
            },
            required: ["inicio", "crisis", "descubrimiento", "resolucion"],
            additionalProperties: false,
          },
          mecanismoProblema: { type: "string" },
          mecanismoSolucion: { type: "string" },
          momentoEmocional: { type: "string" },
          promesaPorValidar: { type: "string" },
        },
        required: [
          "nombre", "deseo", "publico", "arco",
          "mecanismoProblema", "mecanismoSolucion", "momentoEmocional", "promesaPorValidar",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["angulos"],
  additionalProperties: false,
} as const;
```

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add -A
git commit -m "Sacar ángulos desde una anatomía, contando los guardados"
git push origin main
```

---

### Tarea 8: El aviso de promesa por validar

**Ficheros:**
- Crear: `supabase/migrations/20260813000300_angulo_por_validar.sql`
- Modificar: `src/types/copy.ts`, `src/lib/data/copy.ts`,
  `src/app/products/[id]/tab-angles.tsx`

- [ ] **Paso 1: La migración y el campo**

```sql
-- La promesa que el ángulo pide y la investigación no sostiene.
--
-- Se guarda, no se censura: un ángulo silenciado es un ángulo que no se puede
-- discutir, y esto existe para poder discutirlos. Vacío es lo normal.
alter table public.angles
  add column if not exists promise_to_validate text not null default '';
```

- [ ] **Paso 2: El aviso en la lista de ángulos**

En `tab-angles.tsx`, en los ángulos que lo traigan:

```tsx
{angle.promiseToValidate ? (
  <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
    Pide una promesa que la investigación no sostiene: {angle.promiseToValidate}. Compruébala antes
    de escribir el copy — el encargo no la va a afirmar por su cuenta.
  </p>
) : null}
```

- [ ] **Paso 3: Compruébalo**

Saca ángulos de una anatomía agresiva y comprueba que al menos uno sale con su
aviso, y que el resto no lo llevan.

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "Un ángulo que pide más de lo comprobado sale marcado, no censurado"
git push origin main
```

---

## Lo que este plan deja fuera

Está en la spec y se repite aquí:

- **Reutilizar un material en otro producto.**
- **Directrices propias de cada ángulo**: son comunes al material.
- **Aprender de lo que rinde**: nada de esto mira todavía qué ángulo funcionó.
