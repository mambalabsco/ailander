# La sección Ads: orden, lote y rehacer — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementarlo tarea a tarea. Los pasos van
> con casilla (`- [ ]`).

**Objetivo:** que las campañas de un producto se puedan ordenar en carpetas y
archivar, que entren plegadas, que las imágenes de una campaña o de un conjunto
se generen de una tacada, y que una imagen suelta se pueda rehacer desde la
propia miniatura.

**Arquitectura:** dos columnas y una tabla. `campaigns.folder_id` dice dónde
vive, `campaigns.archived_at` si está guardada, y `product_images.discarded_at`
esconde lo que se rehízo. El lote no toca el motor de generación —que ya acepta
`adId` por creatividad— sino que le pasa la lista que arma un módulo puro nuevo.

**Tecnología:** Next.js 16 (App Router), React 19, Supabase con RLS por espacio
de trabajo, TypeScript, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-16-carpetas-y-archivo-de-campanas-design.md`

## Restricciones globales

De `AGENTS.md` y de la spec. Aplican a **todas** las tareas.

- **Nunca ejecutes prettier.** El proyecto no tiene configuración y reformatea a
  80 columnas cuando el código está a 100.
- **Los tests solo cargan módulos puros, con ruta relativa y extensión** —
  `./tanda-de-imagenes.ts`, no `@/lib/tanda-de-imagenes`. Un `import` **de valor**
  con alias `@/` impide cargar el módulo desde un test; los `import type` sí
  valen, porque se borran al compilar.
- **No añadas `.eq("user_id", …)`** a ninguna consulta de lectura: la política ya
  acota por espacio de trabajo y ese filtro devuelve cero filas sin dar error.
- **`create policy` no admite `if not exists`**: cada política lleva delante su
  `drop policy if exists`, porque estas migraciones se reejecutan en cada
  despliegue y la segunda vez abortarían.
- **Toda tabla nueva lleva `workspace_id`, su política y el disparador
  `poner_espacio`.** Sin eso no la ve nadie, o la ve todo el mundo.
- **`database.ts` está escrito a mano** a partir de las migraciones: las columnas
  nuevas se añaden ahí también, y van **opcionales** en el `Insertable` de su
  tabla.
- **Los dos almacenes tienen dos ramas.** `campaign-store.ts` e `image-store.ts`
  envuelven Supabase **y** un respaldo local en JSON. Todo filtro nuevo va en las
  dos, o el respaldo se comporta distinto y el fallo solo sale en una máquina.
- **Comentarios en español**, explicando **por qué** y no qué.
- Comprobaciones: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Cada tarea acaba en commit.

## Estructura de archivos

**Nuevos:**

| Archivo | De qué responde |
|---|---|
| `supabase/migrations/20260816000400_carpetas_y_archivo_de_campanas.sql` | La tabla, las tres columnas, políticas y disparadores |
| `src/lib/tanda-de-imagenes.ts` | Módulo **puro**: qué anuncios necesitan imagen y qué se manda |
| `src/lib/tanda-de-imagenes.test.ts` | Sus pruebas |
| `src/lib/data/campaign-folders.ts` | Lectura y escritura de carpetas contra Supabase |
| `src/app/products/[id]/folder-actions.ts` | Acciones de servidor: carpetas, mover, archivar |
| `src/app/products/[id]/campaign-batch.tsx` | El botón de lote con su casilla |
| `src/app/products/[id]/folder-bar.tsx` | La barra de pestañas de carpetas |

**Modificados:**

| Archivo | Qué cambia |
|---|---|
| `src/types/database.ts` | `CampaignFolderRow`, tres columnas, tres `Insertable` |
| `src/types/campaign.ts` | `CampaignFolder`, `ArchivedCampaign`, `Campaign.folderId` |
| `src/types/visuals.ts` | `ProductImage.discardedAt` |
| `src/lib/data/campaigns.ts` | Filtro de archivado, `readArchivedCampaigns`, mover y archivar |
| `src/lib/campaign-store.ts` | Las mismas, en las dos ramas |
| `src/lib/data/images.ts` | Filtro de descartadas, descartar, recuperar, `replacesImageId` |
| `src/lib/image-store.ts` | El filtro en las dos ramas y la opción |
| `src/app/products/[id]/image-generate-actions.ts` | `replacesImageId` por creatividad; contar con descartadas |
| `src/app/products/[id]/image-actions.ts` | Descartar y recuperar |
| `src/components/image-downloads.tsx` | «Rehacer» sobre la miniatura y el pie de descartadas |
| `src/app/products/[id]/ad-visuals.tsx` | Pasa `productId` a su rejilla, o rehacer no sale en Copys |
| `src/components/ad-visual-sender.tsx` | `replacesImageId` en `Visual` |
| `src/app/products/[id]/campaign-structure.tsx` | Cajas plegadas, cabecera con resumen, botones |
| `src/app/products/[id]/tab-ads.tsx` | La barra de carpetas por encima |
| `src/app/products/[id]/page.tsx` | Lee carpetas y archivadas y las pasa |

---

### Tarea 1: La migración y los tipos

**Ficheros:**
- Crear: `supabase/migrations/20260816000400_carpetas_y_archivo_de_campanas.sql`
- Modificar: `src/types/database.ts`

**Interfaces:**
- Produce: la tabla `campaign_folders`; `campaigns.folder_id`,
  `campaigns.archived_at`, `product_images.discarded_at`; y en `database.ts` el
  tipo `CampaignFolderRow` con la entrada `campaign_folders` en `Tables`.

- [ ] **Paso 1: Escribir la migración**

```sql
-- ---------------------------------------------------------------------------
-- Carpetas y archivo de campañas, y el descarte de una imagen rehecha.
--
-- La pestaña Ads de un producto acaba con decenas de campañas abiertas a la vez.
-- Esto da las tres cosas que la ordenan: dónde vive una campaña, si está
-- guardada, y esconder la imagen que se rehízo sin borrarla.
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,

  name text not null,
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_folders_product_id_idx
  on public.campaign_folders (product_id);

drop trigger if exists campaign_folders_touch on public.campaign_folders;
create trigger campaign_folders_touch
  before update on public.campaign_folders
  for each row execute function public.touch_updated_at();

drop trigger if exists poner_espacio on public.campaign_folders;
create trigger poner_espacio before insert on public.campaign_folders
  for each row execute function public.poner_espacio();

alter table public.campaign_folders enable row level security;

-- `drop policy if exists` delante de cada una: estas migraciones se reejecutan
-- en cada despliegue y `create policy` no admite `if not exists`.
drop policy if exists "campaign_folders_lectura" on public.campaign_folders;
create policy "campaign_folders_lectura" on public.campaign_folders
  for select to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop policy if exists "campaign_folders_escritura" on public.campaign_folders;
create policy "campaign_folders_escritura" on public.campaign_folders
  for all to authenticated
  using (workspace_id in (select public.mis_espacios()))
  with check (workspace_id in (select public.mis_espacios()));

-- ---------------------------------------------------------------------------
-- Dónde vive una campaña, y si está archivada.
--
-- `set null` y no `cascade`: borrar una carpeta no puede llevarse las campañas
-- que había dentro. Pierden el sitio, que es lo que sobra, no el trabajo.
--
-- `archived_at` es fecha y no booleano. Un booleano dice que está archivada; la
-- fecha dice **cuándo**, y ordenar «Archivadas» por lo último sale gratis.
-- ---------------------------------------------------------------------------

alter table public.campaigns
  add column if not exists folder_id uuid
    references public.campaign_folders (id) on delete set null;

alter table public.campaigns
  add column if not exists archived_at timestamptz;

create index if not exists campaigns_archived_at_idx
  on public.campaigns (product_id, archived_at);

-- ---------------------------------------------------------------------------
-- La imagen que se rehízo.
--
-- No se borra: se esconde. La generación va por la cola y puede fallar, así que
-- la vieja solo se descarta **cuando la nueva ya está guardada**. Y si la nueva
-- sale peor, se recupera.
-- ---------------------------------------------------------------------------

alter table public.product_images
  add column if not exists discarded_at timestamptz;

comment on column public.campaigns.folder_id is
  'En qué carpeta se ve. Nulo = sin carpeta, que es donde nacen todas.';
comment on column public.campaigns.archived_at is
  'Cuándo se archivó. Nulo = activa. La carpeta se conserva para devolverla a ella.';
comment on column public.product_images.discarded_at is
  'Cuándo se descartó al rehacerla. Nulo = vigente. No borra el archivo.';
```

- [ ] **Paso 2: Aplicarla y comprobarla**

Ejecuta: `npm run db:push && npm run db:verify`
Esperado: termina sin error y `campaign_folders` aparece entre las tablas.

- [ ] **Paso 3: El tipo de la fila nueva en `database.ts`**

Junto a `AppRow` (línea 184), con la misma forma:

```ts
type CampaignFolderRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  product_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Paso 4: Las tres columnas nuevas en sus filas**

En `CampaignRow` (línea 301), después de `focus`:

```ts
  /** En qué carpeta se ve. Nulo es «sin carpeta». */
  folder_id: string | null;
  /** Cuándo se archivó. Nulo es activa. */
  archived_at: string | null;
```

En `ProductImageRow` (línea 400), al final del tipo:

```ts
  /** Cuándo se descartó al rehacerla. Nulo es vigente. */
  discarded_at: string | null;
```

- [ ] **Paso 5: Registrarlas en `Tables`**

Junto a `campaigns` (línea 1336), añade la tabla nueva y amplía los dos
`Insertable`. Las tres columnas van **opcionales**: ninguna se escribe al crear.

```ts
      campaign_folders: Table<
        CampaignFolderRow,
        Insertable<
          CampaignFolderRow,
          Exclude<keyof CampaignFolderRow, "user_id" | "product_id" | "name">
        >
      >;
      campaigns: Table<
        CampaignRow,
        Insertable<
          CampaignRow,
          | "market_id"
          | "stage"
          | "country_code"
          | "theme"
          | "focus"
          | "folder_id"
          | "archived_at"
        >
      >;
```

Y en `product_images` (línea 1390), añade `| "discarded_at"` al final de la lista
de opcionales, después de `"origin_label"`.

- [ ] **Paso 6: Comprobar que compila**

Ejecuta: `npx tsc --noEmit`
Esperado: sin errores.

- [ ] **Paso 7: Commit**

```bash
git add supabase/migrations/20260816000400_carpetas_y_archivo_de_campanas.sql src/types/database.ts
git commit -m "Carpetas, archivo de campañas y descarte de imágenes: la migración"
```

---

### Tarea 2: El módulo puro que decide qué generar

**Ficheros:**
- Crear: `src/lib/tanda-de-imagenes.ts`
- Crear: `src/lib/tanda-de-imagenes.test.ts`

**Interfaces:**
- Produce: `tandaDeImagenes(anuncios, imagenes)` → `{ faltan, yaEstan }`, y el
  tipo `VisualDeAnuncio`. Lo consumen las tareas 6 y 8.

Este es el único módulo con pruebas automáticas, y por eso va **sin
`server-only` y sin imports con alias**: el corredor de Node no resuelve `@/`.

- [ ] **Paso 1: Escribir la prueba que falla**

`src/lib/tanda-de-imagenes.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { tandaDeImagenes } from "./tanda-de-imagenes.ts";

const anuncio = (id: string, imagePrompt = `prompt de ${id}`) => ({
  id,
  name: `AD_${id}`,
  imagePrompt,
  format: "prueba-social",
});

test("separa los que no tienen imagen de los que ya tienen", () => {
  const { faltan, yaEstan } = tandaDeImagenes(
    [anuncio("a"), anuncio("b")],
    [{ adId: "a" }],
  );

  assert.deepEqual(faltan.map((v) => v.adId), ["b"]);
  assert.deepEqual(yaEstan.map((v) => v.adId), ["a"]);
});

test("cada visual lleva el adId de su anuncio, no el del primero", () => {
  const { faltan } = tandaDeImagenes([anuncio("a"), anuncio("b")], []);

  assert.deepEqual(faltan.map((v) => v.adId), ["a", "b"]);
  assert.equal(faltan[1].prompt, "prompt de b");
  assert.equal(faltan[1].title, "AD_b");
});

test("un anuncio sin prompt no entra en ninguna de las dos listas", () => {
  // Contarlo como «falta» daría un botón que promete dos y genera una.
  const { faltan, yaEstan } = tandaDeImagenes([anuncio("a"), anuncio("b", "")], []);

  assert.deepEqual(faltan.map((v) => v.adId), ["a"]);
  assert.deepEqual(yaEstan, []);
});

test("las imágenes sueltas, sin anuncio, no cuentan como suyas", () => {
  // Las de un copy o de una landing llegan con adId vacío: si contaran, un
  // anuncio sin imagen propia parecería tenerla y el botón lo saltaría.
  const { faltan } = tandaDeImagenes([anuncio("a")], [{ adId: undefined }]);

  assert.deepEqual(faltan.map((v) => v.adId), ["a"]);
});
```

- [ ] **Paso 2: Ejecutarla para ver que falla**

Ejecuta: `npm test -- --test-name-pattern="separa los que"`
Esperado: FALLA, «Cannot find module './tanda-de-imagenes.ts'».

- [ ] **Paso 3: Escribir el módulo**

`src/lib/tanda-de-imagenes.ts`:

```ts
/**
 * Qué imágenes faltan en un conjunto o en una campaña.
 *
 * El motor de generación ya acepta una tanda con `adId` **por creatividad**
 * (`image-generate-actions.ts`), así que generar toda una campaña es una sola
 * llamada. Lo que faltaba era decidir qué entra en ella, y eso es lo que hace
 * este módulo — aparte y puro, para poder probarlo sin base de datos.
 */

/** Lo que espera `generateAdVisualsAction` por cada creatividad. */
export interface VisualDeAnuncio {
  title: string;
  prompt: string;
  aspectRatio: string;
  concept: string;
  origin: string;
  adId: string;
}

export interface TandaDeImagenes {
  /** Anuncios sin ninguna imagen todavía. */
  faltan: VisualDeAnuncio[];
  /** Los que ya tienen al menos una. Solo se generan si se pide. */
  yaEstan: VisualDeAnuncio[];
}

interface AnuncioCorto {
  id: string;
  name: string;
  imagePrompt: string;
  format: string;
}

export function tandaDeImagenes(
  anuncios: AnuncioCorto[],
  imagenes: { adId?: string }[],
): TandaDeImagenes {
  // Solo las que cuelgan de un anuncio. Las de un copy o una landing llegan con
  // `adId` vacío, y contarlas haría parecer que el anuncio ya tiene la suya.
  const conImagen = new Set(
    imagenes.map((imagen) => imagen.adId).filter((id): id is string => Boolean(id)),
  );

  const faltan: VisualDeAnuncio[] = [];
  const yaEstan: VisualDeAnuncio[] = [];

  for (const anuncio of anuncios) {
    // Sin prompt no hay nada que generar. Contarlo daría un botón que promete
    // siete y hace seis, que es peor que no ofrecerlo.
    if (!anuncio.imagePrompt.trim()) continue;

    const visual: VisualDeAnuncio = {
      title: anuncio.name,
      prompt: anuncio.imagePrompt,
      // Los anuncios de Meta se montan en cuadrado; es lo que ya hacía la fila.
      aspectRatio: "1:1",
      concept: anuncio.format,
      // El nombre del anuncio da nombre al archivo: es lo que lo hace
      // reconocible cuando te bajas veinte de una carpeta.
      origin: anuncio.name,
      adId: anuncio.id,
    };

    if (conImagen.has(anuncio.id)) yaEstan.push(visual);
    else faltan.push(visual);
  }

  return { faltan, yaEstan };
}
```

- [ ] **Paso 4: Ejecutar las pruebas**

Ejecuta: `npm test`
Esperado: las cuatro pasan, y el resto del proyecto sigue en verde.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/tanda-de-imagenes.ts src/lib/tanda-de-imagenes.test.ts
git commit -m "Qué imágenes le faltan a una campaña, en un módulo que se puede probar"
```

---

### Tarea 3: Carpetas y archivo en la capa de datos

**Ficheros:**
- Crear: `src/lib/data/campaign-folders.ts`
- Modificar: `src/types/campaign.ts`, `src/lib/data/campaigns.ts`,
  `src/lib/campaign-store.ts`

**Interfaces:**
- Consume: la tabla y las columnas de la tarea 1.
- Produce, todo exportado desde `@/lib/campaign-store` (que es de donde tira
  `page.tsx`):
  - `readCampaignFolders(productId): Promise<CampaignFolder[]>`
  - `saveCampaignFolder({ id?, productId, name, position? }): Promise<CampaignFolder>`
  - `deleteCampaignFolder(id): Promise<void>`
  - `readArchivedCampaigns(productId): Promise<ArchivedCampaign[]>`
  - `setCampaignFolder(campaignId, folderId: string | null): Promise<void>`
  - `setCampaignArchived(campaignId, archived: boolean): Promise<void>`
  - y `readCampaignTrees` devolviendo **solo lo activo**.

- [ ] **Paso 1: Los tipos**

En `src/types/campaign.ts`, junto a `Campaign` (línea 277). Añade `folderId` a
`Campaign`, después de `focus`:

```ts
  /** En qué carpeta se ve. Vacío es «sin carpeta». */
  folderId?: string;
```

Y los dos tipos nuevos, antes de `CampaignTree`:

```ts
/** Una carpeta para ordenar las campañas de un producto. */
export interface CampaignFolder {
  id: string;
  productId: string;
  name: string;
  position: number;
  createdAt: string;
}

/**
 * Una campaña archivada, **sin su árbol**.
 *
 * En «Archivadas» no se abre nada ni se genera nada: se ve qué hay y se pulsa
 * «Devolver». Traer sus conjuntos y anuncios sería cargar en cada visita todo lo
 * que se archivó para no enseñarlo, y eso crece sin tope.
 */
export interface ArchivedCampaign {
  id: string;
  name: string;
  stage: FunnelStage;
  folderId?: string;
  archivedAt: string;
  adsets: number;
  ads: number;
}
```

- [ ] **Paso 2: La capa de datos de las carpetas**

`src/lib/data/campaign-folders.ts`, con la forma de `src/lib/data/apps.ts`:

```ts
import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { CampaignFolder } from "@/types/campaign";
import type { Tables } from "@/types/database";

/**
 * Carpetas para ordenar las campañas de un producto.
 *
 * Sin `.eq("user_id", …)` en las lecturas: la política ya acota por espacio de
 * trabajo, y ese filtro estrecharía a una persona lo que es del equipo sin dar
 * ningún error — devolvería cero filas y la barra saldría vacía.
 */

function toFolder(row: Tables<"campaign_folders">): CampaignFolder {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
  };
}

export async function readCampaignFolders(productId: string): Promise<CampaignFolder[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("campaign_folders")
    .select("*")
    .eq("product_id", productId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las carpetas: ${error.message}`);
  return (data ?? []).map(toFolder);
}

export async function saveCampaignFolder(input: {
  id?: string;
  productId: string;
  name: string;
  position?: number;
}): Promise<CampaignFolder> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId,
    name: input.name,
    position: input.position ?? 0,
  };

  const query = input.id
    ? supabase.from("campaign_folders").update(row).eq("id", input.id)
    : supabase.from("campaign_folders").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`No se pudo guardar la carpeta: ${error.message}`);
  return toFolder(data);
}

/**
 * Borra una carpeta.
 *
 * Las campañas que había dentro **no se van con ella**: su `folder_id` queda a
 * nulo, que es lo que dice la migración. Vuelven a «Sin carpeta».
 */
export async function deleteCampaignFolder(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("campaign_folders").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar la carpeta: ${error.message}`);
}
```

- [ ] **Paso 3: El filtro de archivado y lo archivado, en `data/campaigns.ts`**

En `toCampaign` (línea 88), añade el campo:

```ts
    folderId: row.folder_id ?? undefined,
```

En `readCampaignTrees` (línea 146), añade el filtro a la consulta, justo después
del `.eq("product_id", productId)`:

```ts
      // Solo lo activo. Lo archivado se lee aparte y plano: traer su árbol sería
      // cargar en cada visita todo lo que se guardó para no enseñarlo.
      .is("archived_at", null)
```

Y al final del archivo, las tres funciones nuevas:

```ts
/**
 * Las campañas archivadas, **sin su árbol**.
 *
 * Los contadores salen de un `count` anidado en vez de traerse las filas: en
 * «Archivadas» no se abre nada, así que los conjuntos y los anuncios no hacen
 * falta y son lo que pesa.
 */
export async function readArchivedCampaigns(productId: string): Promise<ArchivedCampaign[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, stage, folder_id, archived_at, adsets(count), adsets:adsets(short_ads(count))")
    .eq("product_id", productId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las archivadas: ${error.message}`);

  type Fila = {
    id: string;
    name: string;
    stage: FunnelStage;
    folder_id: string | null;
    archived_at: string;
    adsets: { count: number }[] | { short_ads: { count: number }[] }[];
  };

  return ((data ?? []) as unknown as Fila[]).map((row) => {
    const nodos = (row.adsets ?? []) as { count?: number; short_ads?: { count: number }[] }[];
    return {
      id: row.id,
      name: row.name,
      stage: row.stage,
      folderId: row.folder_id ?? undefined,
      archivedAt: row.archived_at,
      adsets: nodos.length,
      ads: nodos.reduce((sum, nodo) => sum + (nodo.short_ads?.[0]?.count ?? 0), 0),
    };
  });
}

/** Mueve una campaña de carpeta. Nulo la deja «sin carpeta». */
export async function setCampaignFolder(
  campaignId: string,
  folderId: string | null,
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("campaigns")
    .update({ folder_id: folderId })
    .eq("id", campaignId);

  if (error) throw new Error(`No se pudo mover la campaña: ${error.message}`);
}

/**
 * Archiva o devuelve una campaña.
 *
 * Devolverla **no toca `folder_id`**: por eso vuelve a la carpeta donde estaba,
 * que es lo que se espera de un archivador y no de una papelera.
 */
export async function setCampaignArchived(
  campaignId: string,
  archived: boolean,
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("campaigns")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", campaignId);

  if (error) throw new Error(`No se pudo archivar la campaña: ${error.message}`);
}
```

Acuérdate de ampliar el `import type` de la cabecera con `ArchivedCampaign` y
`FunnelStage`.

**Si el `select` anidado con dos `count` diera error de PostgREST**, cámbialo por
la versión simple —`select("id, name, stage, folder_id, archived_at, adsets(id, short_ads(id))")`—
y cuenta en memoria. Los contadores son informativos; lo que no se negocia es no
traer las filas de texto de los anuncios.

- [ ] **Paso 4: Las dos ramas de `campaign-store.ts`**

En `readCampaignTrees` (línea 104), la rama local también filtra:

```ts
  return campaigns
    // El mismo filtro que la rama de Supabase, o el respaldo enseña archivadas.
    .filter((campaign) => !campaign.archivedAt)
    .map((campaign) => ({
```

Para eso, `Campaign` gana también `archivedAt?: string` en `types/campaign.ts`
—junto a `folderId`— porque en la rama local la campaña **es** el objeto guardado
y no hay fila que consultar.

Y al final del archivo, los envoltorios. El respaldo local guarda las carpetas en
`data/campaign-folders.json`, con la misma forma que las demás entidades:

```ts
/* ---------------------------- Carpetas y archivo ------------------------------- */

const foldersPath = path.join(dataRoot, "campaign-folders.json");

export async function readCampaignFolders(productId: string): Promise<CampaignFolder[]> {
  if (isSupabaseConfigured()) {
    return (await import("@/lib/data/campaign-folders")).readCampaignFolders(productId);
  }

  const stored = await readJson<CampaignFolder[]>(foldersPath, []);
  return stored.filter((folder) => folder.productId === productId);
}

export async function saveCampaignFolder(input: {
  id?: string;
  productId: string;
  name: string;
  position?: number;
}): Promise<CampaignFolder> {
  if (isSupabaseConfigured()) {
    return (await import("@/lib/data/campaign-folders")).saveCampaignFolder(input);
  }

  const stored = await readJson<CampaignFolder[]>(foldersPath, []);
  const folder: CampaignFolder = {
    id: input.id || crypto.randomUUID(),
    productId: input.productId,
    name: input.name,
    position: input.position ?? 0,
    createdAt: new Date().toISOString(),
  };
  const index = stored.findIndex((item) => item.id === folder.id);
  if (index >= 0) stored[index] = folder;
  else stored.push(folder);
  await writeJson(foldersPath, stored);
  return folder;
}

export async function deleteCampaignFolder(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    return (await import("@/lib/data/campaign-folders")).deleteCampaignFolder(id);
  }

  const stored = await readJson<CampaignFolder[]>(foldersPath, []);
  await writeJson(foldersPath, stored.filter((folder) => folder.id !== id));

  // Las campañas que estaban dentro vuelven a «sin carpeta», igual que hace el
  // `on delete set null` de la migración.
  const campaigns = await readJson<Campaign[]>(paths.campaigns, []);
  await writeJson(
    paths.campaigns,
    campaigns.map((item) => (item.folderId === id ? { ...item, folderId: undefined } : item)),
  );
}

export async function readArchivedCampaigns(productId: string): Promise<ArchivedCampaign[]> {
  if (isSupabaseConfigured()) {
    return (await import("@/lib/data/campaigns")).readArchivedCampaigns(productId);
  }

  const { campaigns, adsets, ads } = await readEntities(productId);
  return campaigns
    .filter((campaign) => Boolean(campaign.archivedAt))
    .map((campaign) => {
      const propios = adsets.filter((adset) => adset.campaignId === campaign.id);
      const ids = new Set(propios.map((adset) => adset.id));
      return {
        id: campaign.id,
        name: campaign.name,
        stage: campaign.stage,
        folderId: campaign.folderId,
        archivedAt: campaign.archivedAt as string,
        adsets: propios.length,
        ads: ads.filter((ad) => ids.has(ad.adsetId)).length,
      };
    });
}

export async function setCampaignFolder(
  campaignId: string,
  folderId: string | null,
): Promise<void> {
  if (isSupabaseConfigured()) {
    return (await import("@/lib/data/campaigns")).setCampaignFolder(campaignId, folderId);
  }

  await patchCampaign(campaignId, { folderId: folderId ?? undefined });
}

export async function setCampaignArchived(
  campaignId: string,
  archived: boolean,
): Promise<void> {
  if (isSupabaseConfigured()) {
    return (await import("@/lib/data/campaigns")).setCampaignArchived(campaignId, archived);
  }

  await patchCampaign(campaignId, {
    archivedAt: archived ? new Date().toISOString() : undefined,
  });
}

/** Cambia unos campos de una campaña guardada en el respaldo local. */
async function patchCampaign(campaignId: string, patch: Partial<Campaign>): Promise<void> {
  const stored = await readJson<Campaign[]>(paths.campaigns, []);
  await writeJson(
    paths.campaigns,
    stored.map((item) => (item.id === campaignId ? { ...item, ...patch } : item)),
  );
}
```

Amplía el `import type` de la cabecera con `ArchivedCampaign` y `CampaignFolder`.

- [ ] **Paso 5: Comprobar**

Ejecuta: `npx tsc --noEmit && npm run lint && npm test`
Esperado: sin errores; las pruebas de la tarea 2 siguen pasando.

- [ ] **Paso 6: Commit**

```bash
git add src/types/campaign.ts src/lib/data/campaign-folders.ts src/lib/data/campaigns.ts src/lib/campaign-store.ts
git commit -m "Una campaña sabe en qué carpeta vive y si está archivada"
```

---

### Tarea 4: Descartar y recuperar imágenes

**Ficheros:**
- Modificar: `src/types/visuals.ts`, `src/lib/data/images.ts`,
  `src/lib/image-store.ts`, `src/app/products/[id]/image-generate-actions.ts`,
  `src/components/ad-visual-sender.tsx`

**Interfaces:**
- Consume: `product_images.discarded_at` de la tarea 1.
- Produce:
  - `readProductImages(productId, { incluirDescartadas?: boolean })`
  - `discardProductImage(imageId): Promise<void>`
  - `restoreProductImage(imageId): Promise<void>`
  - `uploadGeneratedImage({ …, replacesImageId?: string })`
  - `Visual.replacesImageId?: string` en `ad-visual-sender.tsx`

- [ ] **Paso 1: El campo en el tipo**

En `src/types/visuals.ts`, dentro de `ProductImage` (línea 354):

```ts
  /** Cuándo se descartó al rehacerla. Sin valor, está vigente. */
  discardedAt?: string;
```

Y en `toProductImage` de `src/lib/data/images.ts`, añade
`discardedAt: row.discarded_at ?? undefined`.

- [ ] **Paso 2: El filtro y las dos escrituras, en `data/images.ts`**

`listProductImages` (línea 99) acepta la opción y filtra en el SQL:

```ts
export async function listProductImages(
  productId: string,
  opciones: { incluirDescartadas?: boolean } = {},
): Promise<ProductImage[]> {
  const { supabase } = await requireContext();

  let query = supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId);

  // Filtrar en el SQL y no después: traer las descartadas para tirarlas es
  // pagar la firma de cada URL de algo que no se va a enseñar.
  if (!opciones.incluirDescartadas) query = query.is("discarded_at", null);

  const { data, error } = await query.order("created_at", { ascending: true });
```

El resto de la función no cambia.

Y al final del archivo:

```ts
/**
 * Esconde una imagen sin borrarla.
 *
 * Es lo que hace «Rehacer»: la anterior deja de verse pero el archivo sigue, por
 * si la nueva sale peor. Borrar de verdad es otro botón.
 */
export async function discardProductImage(imageId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_images")
    .update({ discarded_at: new Date().toISOString() })
    .eq("id", imageId);

  if (error) throw new Error(`No se pudo descartar la imagen: ${error.message}`);
}

export async function restoreProductImage(imageId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_images")
    .update({ discarded_at: null })
    .eq("id", imageId);

  if (error) throw new Error(`No se pudo recuperar la imagen: ${error.message}`);
}
```

- [ ] **Paso 3: Descartar la vieja al guardar la nueva**

En `uploadGeneratedImage` (línea 225), añade el parámetro a la firma:

```ts
  /**
   * La imagen que ésta reemplaza, si viene de «Rehacer».
   *
   * Se descarta **aquí y no al pulsar**: la generación va por la cola y puede
   * fallar. Marcándola antes, un fallo dejaría el anuncio sin ninguna imagen
   * visible y sin forma de saber cuál era.
   */
  replacesImageId?: string;
```

Y justo después del `insert` que ya existe, cuando ya no hay error —después del
bloque `if (error) { … }` de la línea 318 y antes de firmar la URL—:

```ts
  if (input.replacesImageId) {
    await supabase
      .from("product_images")
      .update({ discarded_at: new Date().toISOString() })
      .eq("id", input.replacesImageId);
  }
```

- [ ] **Paso 4: Las dos ramas de `image-store.ts`**

`readProductImages` (línea 31) pasa la opción a las dos:

```ts
export async function readProductImages(
  productId: string,
  opciones: { incluirDescartadas?: boolean } = {},
): Promise<ProductImage[]> {
  if (isSupabaseConfigured()) return storage.listProductImages(productId, opciones);

  const all = await readAll();
  return all.filter(
    (image) =>
      image.productId === productId &&
      // El mismo filtro que la rama de Supabase, o el respaldo enseña descartes.
      (opciones.incluirDescartadas || !image.discardedAt),
  );
}
```

- [ ] **Paso 5: Que el generador siga contando las descartadas**

En `src/app/products/[id]/image-generate-actions.ts`, las dos llamadas que
numeran archivos —línea 236 y línea 435, las que van seguidas de
`let index = existing.length`— piden el total **con** descartadas:

```ts
  /*
   * Con las descartadas.
   *
   * El nombre del archivo se numera con `existing.length`. Si las descartadas
   * dejaran de contar, el contador retrocedería: descartas tres de diez y la
   * siguiente vuelve a llamarse `…_08`, que ya existe. En el bucket no chocan
   * —la ruta lleva sufijo aleatorio— pero te bajas dos archivos con el mismo
   * nombre y uno pisa al otro.
   */
  const existing = await readProductImages(productId, { incluirDescartadas: true });
```

**La de la línea 103 no se toca**: busca la captura que viaja de referencia, y
una imagen descartada no debe ser la referencia de nada.

- [ ] **Paso 6: Que `replacesImageId` viaje por la acción**

En `src/components/ad-visual-sender.tsx`, dentro de `interface Visual`:

```ts
  /** La imagen que ésta rehace, si sale del botón de una miniatura. */
  replacesImageId?: string;
```

En `image-generate-actions.ts`, dentro del `.map` que normaliza cada visual
(junto a `adId: readText(visual.adId)`, línea 382):

```ts
        replacesImageId: readText(visual.replacesImageId),
```

Y en la llamada a `uploadGeneratedImage` del bucle (línea 459):

```ts
        replacesImageId: visual.replacesImageId || undefined,
```

**Solo en ese bucle.** El archivo tiene otra llamada a `uploadGeneratedImage`
—alrededor de la línea 264, la del generador de imágenes por patrón— y esa
**no** lo lleva: «Rehacer» siempre pasa por `AdVisualSender`, que llama a
`generateAdVisualsAction`, que es el bucle de la 459. Añadirlo también allí sería
código muerto que hay que mantener. Confírmalo con
`grep -n "uploadGeneratedImage" "src/app/products/[id]/image-generate-actions.ts"`.

- [ ] **Paso 7: Comprobar**

Ejecuta: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Esperado: sin errores.

- [ ] **Paso 8: Commit**

```bash
git add src/types/visuals.ts src/lib/data/images.ts src/lib/image-store.ts src/components/ad-visual-sender.tsx "src/app/products/[id]/image-generate-actions.ts"
git commit -m "Rehacer una imagen esconde la anterior, y solo cuando la nueva ya está"
```

---

### Tarea 5: Las acciones de servidor

**Ficheros:**
- Crear: `src/app/products/[id]/folder-actions.ts`
- Modificar: `src/app/products/[id]/image-actions.ts`

**Interfaces:**
- Consume: lo que exportan las tareas 3 y 4.
- Produce, todas devolviendo `{ ok: boolean; message: string }`:
  `saveFolderAction`, `deleteFolderAction`, `moveCampaignAction`,
  `archiveCampaignAction`, `discardImageAction`, `restoreImageAction`.

- [ ] **Paso 1: Las acciones de carpetas y archivo**

`src/app/products/[id]/folder-actions.ts`, con la forma de `app-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  deleteCampaignFolder,
  saveCampaignFolder,
  setCampaignArchived,
  setCampaignFolder,
} from "@/lib/campaign-store";

/**
 * Carpetas de campañas, mover y archivar.
 *
 * Son formularios normales y no generaciones: no cuestan dinero y no pasan por
 * `runInBackground`.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function saveFolderAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const name = readText(raw.name);

  if (!productId) return { ok: false, message: "Falta el producto." };
  if (!name) return { ok: false, message: "La carpeta necesita un nombre." };

  const folder = await saveCampaignFolder({
    id: readText(raw.id) || undefined,
    productId,
    name,
    position: Number(raw.position) || 0,
  });

  revalidatePath(`/products/${productId}`);
  return { ok: true, message: `«${folder.name}» guardada.` };
}

export async function deleteFolderAction(
  id: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const folderId = readText(id);
  const product = readText(productId);

  if (!folderId || !product) return { ok: false, message: "Falta la carpeta." };

  await deleteCampaignFolder(folderId);
  revalidatePath(`/products/${product}`);

  // Se dice lo que sobrevive: sin esto parece que borrar la carpeta se lleva las
  // campañas que había dentro.
  return {
    ok: true,
    message: "Carpeta borrada. Las campañas que tenía siguen ahí, sin carpeta.",
  };
}

export async function moveCampaignAction(
  campaignId: unknown,
  folderId: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const campaign = readText(campaignId);
  const product = readText(productId);

  if (!campaign || !product) return { ok: false, message: "Falta la campaña." };

  // Vacío es «sin carpeta», no «no cambiar»: es lo que elige el desplegable.
  await setCampaignFolder(campaign, readText(folderId) || null);
  revalidatePath(`/products/${product}`);

  return { ok: true, message: readText(folderId) ? "Movida." : "Ahora está sin carpeta." };
}

export async function archiveCampaignAction(
  campaignId: unknown,
  archived: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const campaign = readText(campaignId);
  const product = readText(productId);

  if (!campaign || !product) return { ok: false, message: "Falta la campaña." };

  await setCampaignArchived(campaign, archived === true);
  revalidatePath(`/products/${product}`);

  return {
    ok: true,
    message: archived === true ? "Archivada." : "Devuelta a su carpeta.",
  };
}
```

- [ ] **Paso 2: Descartar y recuperar una imagen**

Al final de `src/app/products/[id]/image-actions.ts`:

```ts
/**
 * Esconde una imagen, o la devuelve.
 *
 * Borrar de verdad ya existe y es otro botón: descartar es reversible a
 * propósito, porque la imagen que rehaces puede ser la mejor de las dos.
 */
export async function discardImageAction(
  imageId: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(imageId);
  const product = readText(productId);
  if (!id || !product) return { ok: false, message: "Falta la imagen." };

  const { discardProductImage } = await import("@/lib/data/images");
  await discardProductImage(id);
  revalidatePath(`/products/${product}`);

  return { ok: true, message: "Descartada. Está en el pie, por si la quieres de vuelta." };
}

export async function restoreImageAction(
  imageId: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(imageId);
  const product = readText(productId);
  if (!id || !product) return { ok: false, message: "Falta la imagen." };

  const { restoreProductImage } = await import("@/lib/data/images");
  await restoreProductImage(id);
  revalidatePath(`/products/${product}`);

  return { ok: true, message: "Recuperada." };
}
```

Si `image-actions.ts` no tuviera ya `readText` ni `revalidatePath` importados,
añádelos con la misma forma que en `folder-actions.ts`.

- [ ] **Paso 3: Comprobar**

Ejecuta: `npx tsc --noEmit && npm run lint`
Esperado: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add "src/app/products/[id]/folder-actions.ts" "src/app/products/[id]/image-actions.ts"
git commit -m "Las acciones de carpetas, archivo y descarte"
```

---

### Tarea 6: El botón de generar en lote

**Ficheros:**
- Crear: `src/app/products/[id]/campaign-batch.tsx`
- Modificar: `src/app/products/[id]/campaign-structure.tsx`

**Interfaces:**
- Consume: `tandaDeImagenes` (tarea 2), `AdVisualSender` y
  `generateAdVisualsAction` (ya existentes).
- Produce: `<CampaignBatch productId ads images label />`, usable en la cabecera
  de una campaña y en la de un conjunto.

- [ ] **Paso 1: El componente**

`src/app/products/[id]/campaign-batch.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useHiggsfieldModels } from "@/components/model-picker";
import { generateAdVisualsAction } from "@/app/products/[id]/image-generate-actions";
import { tandaDeImagenes } from "@/lib/tanda-de-imagenes";
import type { ShortAd } from "@/types/campaign";
import type { ProductImage } from "@/types/visuals";

/**
 * Genera de una tacada las imágenes que le faltan a una campaña o a un conjunto.
 *
 * El motor ya aceptaba la tanda con `adId` por creatividad; lo que no había era
 * forma de pedirla, así que había que abrir anuncio por anuncio. Van en **una
 * sola llamada**: el bucle del servidor las lanza de una en una porque
 * Higgsfield solo admite cuatro simultáneas.
 */
export function CampaignBatch({
  productId,
  ads,
  images,
  label,
}: {
  productId: string;
  /** Los anuncios cortos de la campaña o del conjunto. */
  ads: ShortAd[];
  /** Todas las del producto: lo que decide qué falta. */
  images: ProductImage[];
  /** «esta campaña» o «este conjunto», para el texto de cuando no falta nada. */
  label: string;
}) {
  const router = useRouter();
  const catalog = useHiggsfieldModels();
  const [isPending, startTransition] = useTransition();
  /*
   * Desmarcada al abrir y **no se recuerda**.
   *
   * Es la única defensa contra pagar dos veces la misma tanda: si la casilla
   * sobreviviera a la pulsación, el siguiente clic regeneraría todo sin avisar.
   */
  const [incluirHechas, setIncluirHechas] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { faltan, yaEstan } = tandaDeImagenes(
    ads.map((ad) => ({
      id: ad.id,
      name: ad.name,
      imagePrompt: ad.imagePrompt,
      format: ad.format,
    })),
    images,
  );

  const aGenerar = incluirHechas ? [...faltan, ...yaEstan] : faltan;

  const run = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const outcome = await generateAdVisualsAction({
          productId,
          modelSlug: catalog.slug,
          visuals: aGenerar,
        });
        setNotice(
          outcome.started
            ? `${aGenerar.length} en marcha. Puedes cerrar la pestaña: el progreso sale en Trabajos.`
            : outcome.message,
        );
        router.refresh();
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "No se pudo generar.");
      }
    });
  };

  if (faltan.length === 0 && yaEstan.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        onClick={run}
        disabled={isPending || aGenerar.length === 0 || !catalog.slug}
        title={
          aGenerar.length === 0
            ? `Todos los anuncios de ${label} tienen ya su imagen.`
            : undefined
        }
      >
        {isPending
          ? "Lanzando…"
          : aGenerar.length === 0
            ? "No falta ninguna"
            : `Generar ${aGenerar.length === 1 ? "la que falta" : `las ${aGenerar.length} que faltan`}`}
      </Button>

      {yaEstan.length > 0 ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={incluirHechas}
            onChange={(event) => setIncluirHechas(event.target.checked)}
            className="size-3.5 accent-violet-600"
          />
          rehacer también {yaEstan.length === 1 ? "la que ya está" : `las ${yaEstan.length} que ya están`}
        </label>
      ) : null}

      {notice ? <p className="text-xs text-slate-600 dark:text-slate-300">{notice}</p> : null}
      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Paso 2: Comprobar que compila y que el catálogo se carga**

Ejecuta: `npx tsc --noEmit && npm run lint`
Esperado: sin errores. Si `useHiggsfieldModels` no exportara `slug`, míralo en
`src/components/model-picker.tsx` y usa el nombre real — `AdVisualSender` lo usa
igual en su línea 92.

- [ ] **Paso 3: Commit**

```bash
git add "src/app/products/[id]/campaign-batch.tsx"
git commit -m "Un botón que genera las imágenes que le faltan a la campaña"
```

---

### Tarea 7: Rehacer sobre la miniatura, y el pie de descartadas

**Ficheros:**
- Modificar: `src/components/image-downloads.tsx`

**Interfaces:**
- Consume: `Visual.replacesImageId` (tarea 4), `discardImageAction` y
  `restoreImageAction` (tarea 5).
- Produce: `<ImageDownloads images title productId discarded />` — los dos
  últimos **opcionales**, para no romper las llamadas que ya existen en
  `ad-visuals.tsx` y `campaign-structure.tsx`.

- [ ] **Paso 1: Ampliar las props sin romper a quien ya lo usa**

```tsx
export function ImageDownloads({
  images,
  title = "Imágenes generadas",
  productId,
  discarded = [],
}: {
  images: ProductImage[];
  title?: string;
  /** Sin él no salen «Rehacer» ni el pie: es lo que hace opcional lo nuevo. */
  productId?: string;
  /** Las descartadas de este mismo grupo, para el pie. */
  discarded?: ProductImage[];
}) {
```

- [ ] **Paso 2: El botón sobre cada miniatura**

Dentro del `figcaption`, junto al botón «Descargar» que ya está (línea 143):

```tsx
              {/*
                Rehacer, sobre la propia imagen.
                Es donde se toma la decisión —mirándola— y antes había que
                subir al panel del anuncio y relanzar la tanda entera.
                Sin `prompt` no aparece: las subidas no las hizo ningún modelo.
              */}
              {productId && image.prompt ? (
                <AdVisualSender
                  productId={productId}
                  adId={image.adId}
                  copyId={image.copyId}
                  landingId={image.landingId}
                  visuals={[
                    {
                      title: image.name,
                      prompt: image.prompt,
                      aspectRatio: "1:1",
                      concept: image.concept,
                      origin: image.originLabel ?? image.name,
                      // La vieja se descarta sola cuando ésta se guarde.
                      replacesImageId: image.id,
                    },
                  ]}
                  label="Rehacer"
                  compact
                />
              ) : null}
```

Añade arriba `import { AdVisualSender } from "@/components/ad-visual-sender";`.

- [ ] **Paso 3: El pie de descartadas**

Al final del componente, después de la rejilla:

```tsx
      {productId && discarded.length > 0 ? (
        <details className="mt-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
            {discarded.length} descartada{discarded.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {discarded.map((image) => (
              <figure key={image.id} className="overflow-hidden rounded-xl border border-slate-200 opacity-60 dark:border-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.name} className="aspect-square w-full object-cover" />
                <figcaption className="p-1.5">
                  <RecoverButton imageId={image.id} productId={productId} />
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      ) : null}
```

Y el botón, al final del archivo:

```tsx
/** Devuelve una descartada a la vista. */
function RecoverButton({ imageId, productId }: { imageId: string; productId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await restoreImageAction(imageId, productId);
          router.refresh();
        })
      }
      className="text-xs text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
    >
      {isPending ? "…" : "Recuperar"}
    </button>
  );
}
```

Con sus imports: `useRouter` de `next/navigation`, `useTransition` de `react`, y
`restoreImageAction` de `@/app/products/[id]/image-actions`.

- [ ] **Paso 4: Comprobar**

Ejecuta: `npx tsc --noEmit && npm run lint && npm run build`
Esperado: sin errores. Las llamadas viejas a `ImageDownloads` siguen valiendo
porque las dos props nuevas son opcionales.

- [ ] **Paso 5: Commit**

```bash
git add src/components/image-downloads.tsx
git commit -m "Rehacer una imagen desde la propia imagen, y recuperar las descartadas"
```

---

### Tarea 8: Las cajas plegadas y la barra de carpetas

**Ficheros:**
- Crear: `src/app/products/[id]/folder-bar.tsx`
- Modificar: `src/app/products/[id]/campaign-structure.tsx`,
  `src/app/products/[id]/tab-ads.tsx`, `src/app/products/[id]/page.tsx`

**Interfaces:**
- Consume: `CampaignBatch` (tarea 6), las acciones de la tarea 5,
  `readCampaignFolders` y `readArchivedCampaigns` (tarea 3).

- [ ] **Paso 1: Que la página lea lo nuevo y lo pase**

En `src/app/products/[id]/page.tsx`, amplía el `Promise.all` de la línea 132:

```ts
  const [trees, prelandings, counters, performanceRecords, stores, folders, archived] =
    await Promise.all([
      readCampaignTrees(id),
      readPrelandings(id),
      nextNumbers(id),
      readPerformance(id, selection),
      listStores(),
      readCampaignFolders(id),
      readArchivedCampaigns(id),
    ]);
```

Amplía el import de la línea 32 con `readCampaignFolders` y
`readArchivedCampaigns`.

- [ ] **Paso 1b: Que las descartadas lleguen a la página**

`readProductImages` ahora las esconde, así que el pie de «2 descartadas» se
quedaría siempre vacío. En la línea 126, pídelas **todas** y sepáralas aquí — una
consulta y no dos:

```ts
      readProductImages(id, { incluirDescartadas: true }),
```

Y justo después del `Promise.all` de la línea 120, parte la lista:

```ts
  /*
   * Las vigentes y las descartadas, de una sola lectura.
   *
   * Todo lo que ya existía —la galería, las landings, los vídeos— sigue
   * recibiendo `images` sin descartes; las descartadas solo viajan a la pestaña
   * de Ads, que es la única que las enseña, y plegadas.
   */
  const images = todasLasImagenes.filter((image) => !image.discardedAt);
  const discardedImages = todasLasImagenes.filter((image) => image.discardedAt);
```

Renombra la variable del `Promise.all` a `todasLasImagenes` y deja `images` como
la calculada, para que ninguno de los usos que ya hay cambie de significado.

Pasa a `<AdsTab>` (línea 639) las tres nuevas: `folders={folders}`,
`archived={archived}` y `discardedImages={discardedImages}`.

- [ ] **Paso 2: La barra de carpetas**

`src/app/products/[id]/folder-bar.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { deleteFolderAction, saveFolderAction } from "@/app/products/[id]/folder-actions";
import type { CampaignFolder } from "@/types/campaign";

/**
 * Las pestañas de carpetas de la sección Ads.
 *
 * El filtrado es de aquí y no del servidor: la barra necesita el número de
 * campañas de cada carpeta, así que ya tiene todas las activas delante y
 * pedirlas otra vez al cambiar de pestaña sería una ida y vuelta por clic.
 */
export function FolderBar({
  productId,
  folders,
  counts,
  archivedCount,
  active,
  onChange,
}: {
  productId: string;
  folders: CampaignFolder[];
  /** Cuántas campañas activas hay en cada carpeta, y en «sin carpeta» (""). */
  counts: Record<string, number>;
  archivedCount: number;
  /** `null` es Todas, `"archivadas"` el archivo, y si no el id de la carpeta. */
  active: string | null;
  onChange: (value: string | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const tab = (value: string | null, label: string, count: number) => (
    <button
      key={value ?? "todas"}
      type="button"
      onClick={() => onChange(value)}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        active === value
          ? "bg-violet-600 text-white"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {tab(null, "Todas", total)}
      {folders.map((folder) => (
        <span key={folder.id} className="flex items-center">
          {tab(folder.id, folder.name, counts[folder.id] ?? 0)}
          {/*
            Renombrar y borrar, solo en la carpeta abierta.
            Enseñarlos en las cinco pestañas a la vez llena la barra de iconos y
            hace fácil borrar la de al lado por error.
          */}
          {active === folder.id ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const nuevo = window.prompt("Nombre de la carpeta", folder.name);
                  if (!nuevo?.trim() || nuevo.trim() === folder.name) return;
                  startTransition(async () => {
                    await saveFolderAction({
                      id: folder.id,
                      productId,
                      name: nuevo.trim(),
                      position: folder.position,
                    });
                    router.refresh();
                  });
                }}
                title="Renombrar"
                className="ml-1 text-xs text-slate-400 hover:text-violet-600"
              >
                ✎
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteFolderAction(folder.id, productId);
                    onChange(null);
                    router.refresh();
                  })
                }
                title="Borrar la carpeta. Las campañas que tenga siguen, sin carpeta."
                className="ml-1 text-xs text-slate-400 hover:text-rose-600"
              >
                ×
              </button>
            </>
          ) : null}
        </span>
      ))}

      {/* Siempre está, aunque esté vacía: es donde se busca lo que se archivó, y
          una pestaña que aparece y desaparece no se encuentra. */}
      {tab("archivadas", "Archivadas", archivedCount)}

      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await saveFolderAction({ productId, name });
              setName("");
              setCreating(false);
              router.refresh();
            });
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre de la carpeta"
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Button variant="primary" disabled={isPending || !name.trim()}>
            Crear
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          + Nueva carpeta
        </button>
      )}
    </div>
  );
}
```

- [ ] **Paso 3: La caja plegada, en `campaign-structure.tsx`**

Sustituye el `<div>` de cada campaña (línea 113-131) por un `<details>` cerrado.
Va en el DOM y no en `useState` porque cada generación llama a `router.refresh()`
y con el estado en React habría que reponerlo:

```tsx
          {visibles.map((tree) => {
            const adsDeLaCampana = tree.adsets.flatMap((node) => node.ads);
            const totalAnuncios = tree.adsets.reduce((sum, node) => sum + node.units.length, 0);
            const conImagen = adsDeLaCampana.filter((ad) => (imagesByAd[ad.id] ?? []).length > 0);

            return (
              <details
                key={tree.campaign.id}
                className="group rounded-3xl border border-slate-200 p-5 dark:border-slate-800"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 marker:content-none">
                  <span className="text-violet-600 group-open:hidden">▸</span>
                  <span className="hidden text-violet-600 group-open:inline">▾</span>
                  <code className="font-mono text-sm">{tree.campaign.name}</code>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STAGE_COLORS[tree.campaign.stage]}`}
                  >
                    {FUNNEL_STAGE_META[tree.campaign.stage].label}
                  </span>
                  {/* Lo justo para decidir sin abrir. */}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {tree.adsets.length} conjuntos · {totalAnuncios} anuncios ·{" "}
                    {conImagen.length}/{adsDeLaCampana.length} con imagen
                  </span>
                </summary>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <CampaignBatch
                    productId={productId}
                    ads={adsDeLaCampana}
                    images={images}
                    label="esta campaña"
                  />
                  <CampaignRowActions
                    productId={productId}
                    campaignId={tree.campaign.id}
                    folderId={tree.campaign.folderId}
                    folders={folders}
                  />
                </div>

                {/* Conjuntos, colgando de la campaña con una guía vertical.
                    Este bloque —el `tree.adsets.map(…)` entero, desde el
                    conector horizontal hasta el cierre de la lista de
                    anuncios— se mueve tal cual desde el `<div>` anterior. No
                    cambia nada dentro salvo lo que dice el paso 5. */}
                <div className="mt-4 space-y-5 border-l-2 border-slate-200 pl-5 dark:border-slate-700">
                  {tree.adsets.map((node) => (
                    /* …el contenido actual de las líneas 136-223, sin tocar… */
                  ))}
                </div>
              </details>
            );
          })}
```

`CampaignStructure` gana dos props: `folders: CampaignFolder[]` y
`onlyFolder: string | null`, y filtra los árboles antes de pintarlos:

```tsx
  const visibles = useMemo(
    () =>
      onlyFolder === null
        ? trees
        : trees.filter((tree) => (tree.campaign.folderId ?? "") === onlyFolder),
    [trees, onlyFolder],
  );
```

Dos detalles que se escapan si no se dicen: los `totals` de la cabecera y el
`EmptyState` de la línea 78 pasan a contar **`visibles`**, no `trees`. Si no, una
carpeta vacía enseña «12 campañas» y ninguna caja, sin decir por qué. El texto
del vacío, cuando hay filtro, es «Esta carpeta está vacía».

- [ ] **Paso 4: El botón de mover y archivar**

Al final de `campaign-structure.tsx`:

```tsx
/** Mover de carpeta y archivar, en la cabecera de la campaña. */
function CampaignRowActions({
  productId,
  campaignId,
  folderId,
  folders,
}: {
  productId: string;
  campaignId: string;
  folderId?: string;
  folders: CampaignFolder[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        value={folderId ?? ""}
        disabled={isPending}
        onChange={(event) =>
          startTransition(async () => {
            await moveCampaignAction(campaignId, event.target.value, productId);
            router.refresh();
          })
        }
        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
      >
        <option value="">Sin carpeta</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await archiveCampaignAction(campaignId, true, productId);
            router.refresh();
          })
        }
        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Archivar
      </button>
    </span>
  );
}
```

Con sus imports arriba: `useRouter`, `useTransition`, `CampaignBatch`,
`archiveCampaignAction`, `moveCampaignAction` y el tipo `CampaignFolder`.

- [ ] **Paso 5: El botón de lote también en cada conjunto**

Dentro del bloque del conjunto, después del `<dl>` de audiencia y objetivo
(línea 175 del original):

```tsx
                      <div className="mt-3">
                        <CampaignBatch
                          productId={productId}
                          ads={node.ads}
                          images={images}
                          label="este conjunto"
                        />
                      </div>
```

- [ ] **Paso 5b: Que «Rehacer» y el pie lleguen a cada anuncio**

`CampaignStructure` gana `discardedImages: ProductImage[]` y las agrupa igual que
las vigentes. Junto a `imagesByAd` (línea 57):

```tsx
  // Las descartadas de cada anuncio, para el pie de su rejilla.
  const discardedByAd = useMemo(() => {
    const map: Record<string, ProductImage[]> = {};
    for (const image of discardedImages) {
      if (!image.adId) continue;
      (map[image.adId] ??= []).push(image);
    }
    return map;
  }, [discardedImages]);
```

`AdRow` recibe `discarded: ProductImage[]` —pásale
`discardedByAd[unit.ad.id] ?? []` donde ya se le pasa `images`— y su
`ImageDownloads` (línea 371) pasa a llevar las dos props nuevas:

```tsx
          <ImageDownloads
            images={images}
            discarded={discarded}
            productId={productId}
            title="Imágenes de este anuncio"
          />
```

Sin `productId` no sale el botón «Rehacer», que es justo lo que se está
añadiendo: es el error fácil de esta tarea.

Haz lo mismo en `ad-visuals.tsx` (línea 141), que es la otra rejilla del
producto: ahí `productId` ya está en las props y `discarded` sale de filtrar
`generated` — o déjalo sin `discarded` si el copy no las necesita, pero
**`productId` va siempre**, o rehacer no existe en la pestaña de Copys.

- [ ] **Paso 6: Juntarlo en `tab-ads.tsx`**

`AdsTab` gana `folders: CampaignFolder[]` y `archived: ArchivedCampaign[]`, un
estado para la pestaña activa, y pinta la barra encima de la tarjeta de
estructura:

```tsx
  const [folder, setFolder] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tree of trees) map[tree.campaign.folderId ?? ""] = (map[tree.campaign.folderId ?? ""] ?? 0) + 1;
    return map;
  }, [trees]);
```

Y dentro de la `SectionCard` de «Estructura de campaña»:

```tsx
        <FolderBar
          productId={product.id}
          folders={folders}
          counts={counts}
          archivedCount={archived.length}
          active={folder}
          onChange={setFolder}
        />

        {folder === "archivadas" ? (
          <ArchivedList productId={product.id} campaigns={archived} />
        ) : (
          <CampaignStructure
            productId={product.id}
            images={images}
            discardedImages={discardedImages}
            trees={trees}
            folders={folders}
            onlyFolder={folder}
            prelandings={prelandings}
            performance={performance}
          />
        )}
```

Y la lista de archivadas, en el mismo archivo:

```tsx
/** Lo archivado: qué hay y el botón de devolverlo. Aquí no se genera nada. */
function ArchivedList({
  productId,
  campaigns,
}: {
  productId: string;
  campaigns: ArchivedCampaign[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (campaigns.length === 0) {
    return (
      <EmptyState
        title="No hay campañas archivadas"
        description="Archivar una campaña la saca de la lista sin borrarla, y vuelve a su carpeta cuando la devuelves."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {campaigns.map((campaign) => (
        <li
          key={campaign.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800"
        >
          <span className="flex flex-wrap items-center gap-3">
            <code className="font-mono text-sm">{campaign.name}</code>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {campaign.adsets} conjuntos · {campaign.ads} anuncios
            </span>
          </span>
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await archiveCampaignAction(campaign.id, false, productId);
                router.refresh();
              })
            }
          >
            Devolver
          </Button>
        </li>
      ))}
    </ul>
  );
}
```

`tab-ads.tsx` pasa a ser un componente de cliente: añade `"use client"` arriba si
no lo tuviera —ya lo tiene, línea 1— y los imports de `useState`, `useMemo`,
`useTransition`, `useRouter`, `Button`, `FolderBar` y `archiveCampaignAction`.

- [ ] **Paso 7: Comprobar entero**

Ejecuta: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Esperado: sin errores.

- [ ] **Paso 8: Commit**

```bash
git add "src/app/products/[id]/folder-bar.tsx" "src/app/products/[id]/campaign-structure.tsx" "src/app/products/[id]/tab-ads.tsx" "src/app/products/[id]/page.tsx"
git commit -m "Las campañas entran plegadas, en carpetas, y se pueden archivar"
```

---

### Tarea 9: La comprobación a mano

**Ficheros:** ninguno. Es la tarea que dice si esto sirve.

Nada de lo anterior se ha visto funcionar contra datos de verdad. Estos nueve
puntos son la spec, y **el 5, el 7 y el 9 son los que no se pueden deducir
leyendo el código**.

- [ ] **Paso 1: Levantar y entrar**

Ejecuta: `npm run dev`, abre un producto con campañas y ve a la pestaña Ads.

- [ ] **Paso 2: Los nueve**

1. Las campañas entran **todas plegadas**, y la cabecera dice conjuntos,
   anuncios y cuántos tienen imagen.
2. Crear una carpeta, mover una campaña, recargar: sigue ahí.
3. Archivar una: desaparece de «Todas». Devolverla: vuelve **a su carpeta**.
4. Borrar una carpeta con campañas dentro: las campañas siguen, sin carpeta.
5. Generar el lote de un conjunto: el botón cuenta bien y **cada imagen cae en su
   anuncio**, no todas en el primero. (Cuesta dinero: hazlo con un conjunto de
   dos.)
6. Rehacer una imagen: al llegar la nueva, la vieja desaparece de la rejilla y
   sale en el pie. Recuperarla la devuelve.
7. Que una generación **fallida no descarte nada**: quita la clave de Higgsfield,
   pulsa «Rehacer», y comprueba que la imagen original sigue visible.
8. La galería del producto, las landings y los flujos no enseñan descartes.
9. Descartar tres imágenes y generar otra: **el nombre nuevo no repite** uno ya
   usado. Es lo que comprueba que el generador sigue contando las descartadas.

- [ ] **Paso 3: Anotar lo que falle**

Lo que no pase va a `docs/pendiente.md`, sección «Sin confirmar en producción»,
con lo que se vio y no lo que se supone.

- [ ] **Paso 4: Desplegar**

Ejecuta `./actualizar.sh` en el servidor. Aplica migraciones, pasa los tests
—si fallan aborta sin tocar nada—, construye, reinicia e imprime la versión.
Hasta que eso ocurra, cualquier prueba mide código viejo.
