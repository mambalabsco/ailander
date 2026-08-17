# El nombre de una creatividad — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementarlo tarea a tarea. Los pasos van
> con casilla (`- [ ]`).

**Objetivo:** que el archivo que descargas de una creatividad se llame como su
anuncio con un correlativo al final —`Ad48_Beneficios_..._02`—, que ese nombre
sea único de verdad, que se puedan bajar todas las de una campaña o un conjunto
de una vez, y que lo ya creado quede arreglado.

**Arquitectura:** una columna `ad_sequence` con índice único parcial, el número
calculado en el único punto por el que entra una imagen generada
—`uploadGeneratedImage`—, y una migración determinista que renombra las diez
filas de anuncio y desempata las sueltas que chocan.

**Tecnología:** Next.js 16 (App Router), React 19, Supabase con RLS por espacio
de trabajo, TypeScript, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-16-nombre-de-creatividad-design.md`

## Restricciones globales

- **Nunca ejecutes prettier.** El proyecto no tiene configuración y reformatea a
  80 columnas cuando el código está a 100.
- **Los tests solo cargan módulos puros, con ruta relativa y extensión** —
  `./nombre-de-creatividad.ts`, no `@/lib/nombre-de-creatividad`.
- **No añadas `.eq("user_id", …)`** a ninguna consulta de lectura.
- **Las migraciones se reejecutan en cada despliegue**: todo lo que hagan tiene
  que dar el mismo resultado la segunda vez. `create policy` no admite
  `if not exists`; `create index` sí.
- **`database.ts` está escrito a mano**: la columna nueva se añade ahí también, y
  va **opcional** en el `Insertable` de `product_images`.
- **Comentarios en español**, explicando **por qué** y no qué.
- Comprobaciones: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Cada tarea acaba en commit.

## Estructura de archivos

**Nuevos:**

| Archivo | De qué responde |
|---|---|
| `supabase/migrations/20260816000500_nombre_de_creatividad.sql` | La columna, el índice y el arreglo de lo ya creado |
| `src/lib/nombre-de-creatividad.ts` | Módulo **puro**: el nombre a partir del anuncio y el correlativo |
| `src/lib/nombre-de-creatividad.test.ts` | Sus pruebas |
| `src/app/products/[id]/campaign-download.tsx` | El botón de bajar todas las de una campaña o conjunto |

**Modificados:**

| Archivo | Qué cambia |
|---|---|
| `src/types/database.ts` | `ad_sequence` en `ProductImageRow` y en su `Insertable` |
| `src/types/visuals.ts` | `ProductImage.adSequence` |
| `src/lib/data/mappers.ts` | Lo mapea |
| `src/lib/data/images.ts` | Calcula el número, monta el nombre y reintenta al chocar |
| `src/app/products/[id]/campaign-structure.tsx` | El botón, en las dos alturas |

---

### Tarea 1: La columna, el índice y el arreglo de lo ya creado

**Ficheros:**
- Crear: `supabase/migrations/20260816000500_nombre_de_creatividad.sql`
- Modificar: `src/types/database.ts`, `src/types/visuals.ts`,
  `src/lib/data/mappers.ts`

**Interfaces:**
- Produce: `product_images.ad_sequence`, el índice
  `product_images_ad_sequence_uniq`, y `ProductImage.adSequence?: number`.

- [ ] **Paso 1: Escribir la migración**

El orden de los cuatro bloques no es libre: **el índice va después del
renombrado**. Crearlo sobre datos aún sin numerar abortaría la migración entera y
con ella todo lo que venga detrás en ese despliegue.

```sql
-- ---------------------------------------------------------------------------
-- El nombre de una creatividad es el nombre de su anuncio en Facebook.
--
-- Un anuncio ya no tiene una sola imagen: el lote genera varias y «Rehacer»
-- añade más. Cada una es **un anuncio distinto en el gestor**, así que su
-- archivo tiene que llamarse como se va a llamar allí.
--
-- Y el nombre de hoy no era único: el generador numera con `existing.length`
-- sobre todas las imágenes del producto, y ese contador **retrocede** al
-- borrar. Hay cinco grupos de nombres repetidos en la base — al bajarlos, uno
-- pisa al otro sin decir nada.
-- ---------------------------------------------------------------------------

alter table public.product_images
  add column if not exists ad_sequence integer;

comment on column public.product_images.ad_sequence is
  'Qué lugar ocupa dentro de su anuncio, empezando en 1. Nulo si no es de un anuncio. No se reutiliza nunca.';

-- ---------------------------------------------------------------------------
-- Las que cuelgan de un anuncio: se numeran por fecha y se renombran.
--
-- El desempate por `id` no es adorno: sin él, dos imágenes creadas en el mismo
-- milisegundo podrían intercambiarse el número entre dos despliegues, y esta
-- migración se reejecuta en todos.
-- ---------------------------------------------------------------------------

with numeradas as (
  select i.id,
         a.name as ad_name,
         row_number() over (partition by i.ad_id order by i.created_at, i.id) as n
  from public.product_images i
  join public.short_ads a on a.id = i.ad_id
)
update public.product_images i
set ad_sequence = numeradas.n,
    name = numeradas.ad_name || '_' || lpad(numeradas.n::text, 2, '0')
from numeradas
where i.id = numeradas.id;

-- ---------------------------------------------------------------------------
-- Las sueltas que chocan: solo a partir de la segunda de cada grupo.
--
-- El sufijo es un trozo del identificador y **no un contador**: con un contador,
-- un `foo` duplicado pasaría a `foo_02`, y si ya existiera un `foo_02` en la
-- tabla habríamos creado el choque que veníamos a quitar.
--
-- La más antigua de cada grupo conserva su nombre, así que nada que ya fuera
-- único cambia.
-- ---------------------------------------------------------------------------

with repetidas as (
  select id,
         row_number() over (partition by name order by created_at, id) as n
  from public.product_images
  where ad_id is null
)
update public.product_images i
set name = i.name || '_' || left(i.id::text, 6)
from repetidas
where i.id = repetidas.id and repetidas.n > 1;

-- ---------------------------------------------------------------------------
-- Y ahora sí, la garantía en la base y no en una promesa del código.
--
-- Parcial: 325 filas no cuelgan de ningún anuncio y no deben competir por un
-- número.
-- ---------------------------------------------------------------------------

create unique index if not exists product_images_ad_sequence_uniq
  on public.product_images (ad_id, ad_sequence)
  where ad_id is not null and ad_sequence is not null;
```

- [ ] **Paso 2: Aplicarla**

Ejecuta: `npm run db:push && npm run db:verify`
Esperado: aplica sin error y `db:verify` termina en «Todo correcto».

- [ ] **Paso 3: Comprobarla contra la base, que es lo que vale**

No te fíes de que no diera error.

**El archivo va en la raíz del proyecto, no en `/tmp`.** Node resuelve los
paquetes desde la carpeta del *script*, no desde donde lo ejecutas: fuera del
proyecto, `import pg` falla con `ERR_MODULE_NOT_FOUND` aunque `pg` esté
instalado. Créalo como `comprobar-nombres.mjs` en la raíz y **bórralo al
terminar** — hay otra sesión trabajando en este repo y un archivo suelto acaba
dentro de su commit.

```js
import pg from "pg";
import { connectionString } from "./scripts/db-env.mjs";

const c = new pg.Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
await c.connect();

const dup = await c.query(
  "select name, count(*) from public.product_images group by name having count(*) > 1",
);
console.log("nombres repetidos:", dup.rowCount === 0 ? "ninguno ✓" : dup.rows);

const ads = await c.query(`
  select i.name, i.ad_sequence, a.name as anuncio
  from public.product_images i join public.short_ads a on a.id = i.ad_id
  order by a.name, i.ad_sequence
`);
for (const r of ads.rows) {
  const ok = r.name === `${r.anuncio}_${String(r.ad_sequence).padStart(2, "0")}`;
  console.log(`${ok ? "✓" : "✗"} ${r.name}`);
}

await c.end();
```

Ejecuta: `node comprobar-nombres.mjs && rm comprobar-nombres.mjs`
Esperado: «nombres repetidos: ninguno ✓» y las diez filas con ✓.

- [ ] **Paso 4: La columna en `database.ts`**

En `ProductImageRow`, junto a `discarded_at`:

```ts
  /** Qué lugar ocupa dentro de su anuncio. Nulo si no es de un anuncio. */
  ad_sequence: number | null;
```

Y en el `Insertable` de `product_images`, añade `| "ad_sequence"` al final de la
lista de opcionales, después de `"discarded_at"`.

- [ ] **Paso 5: El campo en `ProductImage` y en el mapeador**

En `src/types/visuals.ts`, dentro de `ProductImage`, junto a `discardedAt`:

```ts
  /** Qué lugar ocupa dentro de su anuncio, empezando en 1. */
  adSequence?: number;
```

Y en `toProductImage` (`src/lib/data/mappers.ts`), junto a `discardedAt`:

```ts
    adSequence: row.ad_sequence ?? undefined,
```

- [ ] **Paso 6: Comprobar**

Ejecuta: `npx tsc --noEmit && npm run lint`
Esperado: sin errores.

- [ ] **Paso 7: Commit**

```bash
git add supabase/migrations/20260816000500_nombre_de_creatividad.sql src/types/database.ts src/types/visuals.ts src/lib/data/mappers.ts
git commit -m "El correlativo de una creatividad dentro de su anuncio, y lo ya creado arreglado"
```

---

### Tarea 2: El módulo del nombre

**Ficheros:**
- Crear: `src/lib/nombre-de-creatividad.ts`
- Crear: `src/lib/nombre-de-creatividad.test.ts`

**Interfaces:**
- Produce: `buildAdImageName({ adName, sequence }): string` y
  `siguienteSecuencia(maximoActual: number | null): number`. Los consume la
  tarea 3.

- [ ] **Paso 1: Escribir la prueba que falla**

`src/lib/nombre-de-creatividad.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAdImageName, siguienteSecuencia } from "./nombre-de-creatividad.ts";

const AD = "Ad48_Beneficios_Todo_Lo_Que_Cambia_En_8_Semanas";

test("el nombre es el del anuncio más el correlativo a dos dígitos", () => {
  assert.equal(buildAdImageName({ adName: AD, sequence: 1 }), `${AD}_01`);
  assert.equal(buildAdImageName({ adName: AD, sequence: 12 }), `${AD}_12`);
});

test("pasado el 99 crece en vez de recortarse", () => {
  // Recortar daría `_00` para la 100, que choca con nada y confunde con la 1.
  assert.equal(buildAdImageName({ adName: AD, sequence: 100 }), `${AD}_100`);
});

test("el nombre del anuncio entra tal cual, sin pasar por slugify", () => {
  /*
   * Es la razón de ser de este módulo. El nombre de imagen de siempre pone todo
   * en minúsculas y con guiones, y así el archivo dejaba de parecerse al
   * anuncio que hay que escribir en el gestor.
   */
  const nombre = buildAdImageName({ adName: AD, sequence: 3 });
  assert.ok(nombre.startsWith(AD), `«${nombre}» debería empezar por «${AD}»`);
  assert.ok(!nombre.includes("-"), "no debería llevar guiones");
});

test("un nombre de anuncio con espacios o acentos se normaliza", () => {
  // No debería llegar así —`buildAdName` ya limpia— pero un anuncio editado a
  // mano sí puede, y un espacio en el nombre de archivo rompe la descarga.
  assert.equal(buildAdImageName({ adName: "Ad9 Diseño Ñu", sequence: 1 }), "Ad9_Diseno_Nu_01");
});

test("el siguiente correlativo sale del máximo, no de la cuenta", () => {
  // Es el fallo de hoy visto de frente: con `count`, descartar una imagen hace
  // retroceder el contador y dos archivos acaban llamándose igual.
  assert.equal(siguienteSecuencia(null), 1);
  assert.equal(siguienteSecuencia(3), 4);
  assert.equal(siguienteSecuencia(7), 8);
});
```

- [ ] **Paso 2: Ejecutarla para ver que falla**

Ejecuta: `npm test 2>&1 | grep -A3 "nombre-de-creatividad"`
Esperado: FALLA con «Cannot find module './nombre-de-creatividad.ts'».

- [ ] **Paso 3: Escribir el módulo**

```ts
/**
 * El nombre de una creatividad de anuncio.
 *
 * Un anuncio ya no tiene una sola imagen —el lote genera varias y «Rehacer»
 * añade más— y **cada una es un anuncio distinto en el gestor de Facebook**. Así
 * que el archivo que te bajas tiene que llamarse como lo vas a llamar allí: el
 * nombre del anuncio, y un correlativo al final tras un guion bajo.
 *
 * Aparte de `buildImageName`, que sigue sirviendo a todo lo que no cuelga de un
 * anuncio: aquel antepone producto y concepto, y dejaba el nombre del anuncio
 * recortado a la mitad — `…en-8-seman_98`.
 *
 * Puro y sin imports con alias, para poder probarlo desde `node --test`.
 */

/** Sin espacios ni acentos: un espacio en el nombre rompe la descarga. */
function normaliza(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildAdImageName(options: { adName: string; sequence: number }): string {
  // A dos dígitos, pero sin recortar: la 100 es `_100`. Truncar daría `_00`, que
  // se confunde con la primera.
  const sufijo = String(options.sequence).padStart(2, "0");
  return `${normaliza(options.adName)}_${sufijo}`;
}

/**
 * El correlativo siguiente, a partir del **máximo** ya usado.
 *
 * Máximo y no cuenta: un número entregado no vuelve a salir aunque su imagen se
 * descarte o se borre. Contar es exactamente lo que hace hoy el generador, y por
 * eso hay nombres repetidos en la base.
 */
export function siguienteSecuencia(maximoActual: number | null): number {
  return (maximoActual ?? 0) + 1;
}
```

- [ ] **Paso 4: Ejecutar las pruebas**

Ejecuta: `npm test`
Esperado: las cinco nuevas pasan y el resto del proyecto sigue verde.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/nombre-de-creatividad.ts src/lib/nombre-de-creatividad.test.ts
git commit -m "El nombre de una creatividad de anuncio, en un módulo que se puede probar"
```

---

### Tarea 3: El número y el nombre, al guardar

**Ficheros:**
- Modificar: `src/lib/data/images.ts`

**Interfaces:**
- Consume: `buildAdImageName`, `siguienteSecuencia` (tarea 2); la columna y el
  índice (tarea 1).
- Produce: `uploadGeneratedImage` guardando `ad_sequence` y el nombre correcto
  cuando le llega `adId`. Su firma **no cambia**.

Va aquí y no en quien la llama porque es el único punto por el que entra una
imagen generada: los tres caminos de hoy —el lote, el botón de un anuncio suelto
y «Rehacer»— salen iguales, y el cuarto que se añada también.

- [ ] **Paso 1: El ayudante que pide el máximo**

Al principio de `src/lib/data/images.ts`, junto a los demás ayudantes privados:

```ts
/**
 * Cómo se llamará la creatividad de un anuncio, y qué lugar ocupa.
 *
 * Dos consultas y no una: el nombre del anuncio vive en `short_ads` y el máximo
 * en `product_images`. Se piden con `order` + `limit 1`, que es como pide el
 * máximo el resto del proyecto (`nextNumbers`, en `campaigns.ts`).
 *
 * **Se cuentan también las descartadas**: un número entregado no vuelve a salir
 * aunque su imagen se haya escondido.
 */
async function nombreParaAnuncio(
  supabase: Awaited<ReturnType<typeof requireContext>>["supabase"],
  adId: string,
): Promise<{ name: string; sequence: number } | null> {
  const [ad, ultima] = await Promise.all([
    supabase.from("short_ads").select("name").eq("id", adId).maybeSingle(),
    supabase
      .from("product_images")
      .select("ad_sequence")
      .eq("ad_id", adId)
      .not("ad_sequence", "is", null)
      .order("ad_sequence", { ascending: false })
      .limit(1),
  ]);

  // Sin anuncio no hay nombre que heredar. Puede pasar: `ad_id` es
  // `on delete set null`, así que una imagen sobrevive a su anuncio.
  if (!ad.data?.name) return null;

  const sequence = siguienteSecuencia(ultima.data?.[0]?.ad_sequence ?? null);
  return { name: buildAdImageName({ adName: ad.data.name, sequence }), sequence };
}
```

Con su import arriba:

```ts
import { buildAdImageName, siguienteSecuencia } from "@/lib/nombre-de-creatividad";
```

- [ ] **Paso 2: Usarlo al insertar, con reintento**

Dentro de `uploadGeneratedImage`, **después** de subir el archivo al bucket y
**antes** del `insert` que ya existe:

```ts
  /*
   * El nombre de una creatividad de anuncio no es negociable desde fuera: es lo
   * que se escribe en el gestor de anuncios. El `name` que llegue por parámetro
   * se ignora cuando hay `adId`.
   */
  let bautizo = input.adId ? await nombreParaAnuncio(supabase, input.adId) : null;
```

Sustituye el `insert` actual por esta versión, que reintenta una vez:

```ts
  // Se intenta dos veces como mucho. El índice único `(ad_id, ad_sequence)` hace
  // fallar con 23505 si otra pestaña se llevó el mismo número entre la consulta
  // y la inserción; entonces se recalcula el máximo y se vuelve a probar. Sin el
  // índice no fallaría nada: se guardarían dos imágenes con el mismo nombre.
  let data: Tables<"product_images"> | null = null;
  let error: { code?: string; message: string } | null = null;

  for (let intento = 0; intento < 2; intento += 1) {
    const respuesta = await supabase
      .from("product_images")
      .insert({
        user_id: userId,
        product_id: input.productId,
        market_id: imageMarket(input.pattern, input.marketId),
        pattern: input.pattern,
        name: bautizo?.name ?? input.name,
        ad_sequence: bautizo?.sequence ?? null,
        storage_path: path,
        storage_bucket: BUCKET,
        mime_type: contentType,
        size_bytes: bytes.byteLength,
        // Vacío, no nulo: las columnas son NOT NULL y una imagen subida
        // sencillamente no tiene prompt ni modelo.
        prompt: input.prompt ?? "",
        model_id: input.modelId ?? "",
        is_primary: input.isPrimary ?? false,
        source: input.source ?? "generada",
        copy_id: input.copyId ?? null,
        ad_id: input.adId ?? null,
        landing_id: input.landingId ?? null,
        concept: input.concept ?? null,
        origin_label: input.originLabel ?? null,
      })
      .select("*")
      .single();

    if (!respuesta.error) {
      data = respuesta.data;
      error = null;
      break;
    }

    error = respuesta.error;

    // Solo se reintenta el choque de correlativo. Cualquier otro error se
    // propaga tal cual: reintentarlo sería esconderlo.
    const chocoElCorrelativo = respuesta.error.code === "23505" && Boolean(input.adId);
    if (!chocoElCorrelativo || intento === 1) break;

    bautizo = await nombreParaAnuncio(supabase, input.adId as string);
  }

  if (error || !data) {
    // Sin fila, el archivo sería basura que nadie puede ver ni borrar.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`No se pudo registrar la imagen: ${error?.message ?? "sin fila"}`);
  }
```

El bloque de `replacesImageId` y el de firmar la URL, que van justo después, **no
cambian**: siguen usando `data`.

- [ ] **Paso 3: Comprobar que compila**

Ejecuta: `npx tsc --noEmit && npm run lint && npm test`
Esperado: sin errores; los 1622 tests siguen pasando.

Si `Tables` no estuviera importado en `images.ts`, añádelo:
`import type { Tables } from "@/types/database";`

- [ ] **Paso 4: Commit**

```bash
git add src/lib/data/images.ts
git commit -m "Una creatividad de anuncio se bautiza al guardarse, y el número no se repite"
```

---

### Tarea 4: Descargar todas las de una campaña o un conjunto

**Ficheros:**
- Crear: `src/app/products/[id]/campaign-download.tsx`
- Modificar: `src/app/products/[id]/campaign-structure.tsx`

**Interfaces:**
- Consume: `useImageDownload()` de `@/components/image-downloads`, que ya
  devuelve `{ download, downloadMany, busy }`.
- Produce: `<CampaignDownload ads images label />`.

- [ ] **Paso 1: El componente**

```tsx
"use client";

import { Button } from "@/components/ui";
import { useImageDownload } from "@/components/image-downloads";
import type { ShortAd } from "@/types/campaign";
import type { ProductImage } from "@/types/visuals";

/**
 * Baja de una vez todas las creatividades de una campaña o de un conjunto.
 *
 * Antes había que abrir cada anuncio y pulsar «Descargar todas» dentro de cada
 * uno. Con doce anuncios eso son doce paneles abiertos y doce clics.
 *
 * Van de una en una con una pausa, que es lo que ya hace `downloadMany`: los
 * navegadores bloquean las descargas múltiples cuando llegan de golpe, y sin la
 * pausa baja la primera y **las demás se pierden en silencio**.
 */
export function CampaignDownload({
  ads,
  images,
  label,
}: {
  /** Los anuncios cortos de la campaña o del conjunto. */
  ads: ShortAd[];
  /** Todas las del producto; aquí se filtran las de estos anuncios. */
  images: ProductImage[];
  /** «esta campaña» o «este conjunto», para el aviso de cuando no hay nada. */
  label: string;
}) {
  const { downloadMany, busy } = useImageDownload();

  const ids = new Set(ads.map((ad) => ad.id));
  const suyas = images.filter((image) => image.adId && ids.has(image.adId));

  if (suyas.length === 0) return null;

  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={() => downloadMany(suyas)}
      title={`Cada archivo se llama como su anuncio en el gestor. Van de una en una: ${label} tarda unos ${Math.ceil(suyas.length * 0.35)} segundos.`}
    >
      {busy ? "Descargando…" : `Descargar las ${suyas.length}`}
    </Button>
  );
}
```

- [ ] **Paso 2: Ponerlo en la cabecera de la campaña**

En `campaign-structure.tsx`, dentro del `<div className="mt-4 flex flex-wrap
items-center gap-3">` que ya contiene `<CampaignBatch … label="esta campaña" />`,
justo después de ese componente:

```tsx
                <CampaignDownload
                  ads={adsDeLaCampana}
                  images={images}
                  label="la campaña entera"
                />
```

- [ ] **Paso 3: Y en la de cada conjunto**

En el bloque del conjunto, dentro del `<div className="mt-3">` que ya contiene
`<CampaignBatch … label="este conjunto" />`, envuelve los dos en una fila:

```tsx
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <CampaignBatch
                          productId={productId}
                          ads={node.ads}
                          images={images}
                          label="este conjunto"
                        />
                        <CampaignDownload
                          ads={node.ads}
                          images={images}
                          label="el conjunto"
                        />
                      </div>
```

Con su import arriba:

```tsx
import { CampaignDownload } from "@/app/products/[id]/campaign-download";
```

- [ ] **Paso 4: Comprobar**

Ejecuta: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Esperado: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add "src/app/products/[id]/campaign-download.tsx" "src/app/products/[id]/campaign-structure.tsx"
git commit -m "Bajar de una vez todas las creatividades de una campaña o un conjunto"
```

---

### Tarea 5: La comprobación a mano

**Ficheros:** ninguno.

El paso 3 de la tarea 1 ya comprobó lo ya creado contra la base. Esto comprueba
lo que viene, que es lo que no se puede deducir leyendo código.

- [ ] **Paso 1: Levantar**

Ejecuta: `npm run dev` y abre un producto con campañas, pestaña Ads.

- [ ] **Paso 2: Los cinco**

1. Un anuncio sin imágenes: generar tres con el botón del conjunto. Salen `_01`,
   `_02` y `_03`, **cada una en su anuncio**.
2. Descartar la `_02` y rehacer: la nueva es `_04`. **La `_02` no vuelve.**
3. «Descargar las N» en la campaña: los archivos caen con el nombre del anuncio y
   **ninguno pisa a otro**.
4. Abrir uno de los archivos descargados y comprobar que su nombre es exactamente
   lo que escribirías en el gestor de anuncios.
5. Volver a pasar `npm run db:push`: los nombres **no cambian** en la segunda
   pasada. Es lo que prueba que la migración sobrevive a cada despliegue.

- [ ] **Paso 3: Anotar lo que falle**

A `docs/pendiente.md`, sección «Sin confirmar en producción», con lo que se vio y
no con lo que se supone.

- [ ] **Paso 4: Desplegar**

`cd /home/plataforma/plataforma-ia && sudo ./actualizar.sh` en el servidor.
Aplica migraciones, pasa los tests —si fallan aborta sin tocar nada—, compila,
reinicia y comprueba que la aplicación responde.
