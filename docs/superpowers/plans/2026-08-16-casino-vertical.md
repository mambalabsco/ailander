# Casino online: el vertical y la investigación por país — plan

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementarlo tarea a tarea. Los pasos van
> con casilla (`- [ ]`).

**Objetivo:** que un producto pueda ser «casino online en un país», con su
investigación de nueve documentos, sin que nada cambie para los productos de
e-commerce que ya existen.

**Arquitectura:** una columna `vertical` en `products` decide tres cosas y solo
tres: qué documentos tiene la investigación, con qué encargo se escribe cada uno,
y qué pestañas se ven. Como en casino **un producto es el país**, los documentos
ya salen por país sin mover la investigación de sitio.

**Tecnología:** Next.js 16 (App Router), React 19, Supabase con RLS por espacio
de trabajo, TypeScript, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-16-casino-vertical-design.md`

## Restricciones globales

- **Nunca ejecutes prettier.**
- **Los tests solo cargan módulos puros, con ruta relativa y extensión.**
  `src/types/research.ts` **no tiene ni un import**, así que se puede cargar;
  `src/lib/research-prompts.ts` importa con alias y no.
- **`alter type … add value` lleva `if not exists`**: estas migraciones se
  reejecutan en cada despliegue y sin él la segunda vez aborta.
- **No añadas `.eq("user_id", …)`** a ninguna consulta de lectura.
- **`database.ts` está escrito a mano**; las columnas con valor por defecto van
  marcadas como opcionales en el `Insertable` de su tabla.
- **Comentarios en español**, explicando **por qué** y no qué.
- **Nada de lo que ya existe puede cambiar de comportamiento.** `ecommerce` es el
  valor por defecto y el camino de siempre.
- Comprobaciones: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Cada tarea acaba en commit y `git push origin main`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/research.ts` | `Vertical`, `documentsFor`, la meta de los nueve documentos y los tipos de los tres nuevos |
| `src/types/research.test.ts` (nuevo) | Que un vertical nunca vea los documentos del otro |
| `src/lib/research-prompts.ts` | Los encargos, ahora ramificados por vertical |
| `src/lib/research-casino-prompts.ts` (nuevo) | Los encargos de casino, aparte de los de e-commerce |
| `src/lib/research-schemas.ts` | Los esquemas de los tres documentos nuevos |
| `src/lib/data/research.ts` | `DATA_KEY` con las tres claves nuevas |
| `supabase/migrations/20260816000200_vertical_casino.sql` (nuevo) | La columna y los tres valores del enum |

---

### Tarea 1: Los tres documentos nuevos y qué ve cada vertical

Va primero porque es **lo que protege lo que ya funciona**: mientras esto no
exista, añadir documentos de casino se los enseña a los productos de suplementos.

Los identificadores y `documentsFor` van **en la misma tarea** y no en dos: la
función los nombra, así que separarlos deja la primera sin compilar.

**Ficheros:**
- Modificar: `src/types/research.ts:41-48` (ids y meta)
- Test: `src/types/research.test.ts` (crear)

**Interfaces:**
- Produce: `type Vertical = "ecommerce" | "casino"`,
  `documentsFor(vertical: Vertical): ResearchDocumentId[]`, y los identificadores
  `regulation`, `payments`, `casino-landscape` con su entrada en
  `RESEARCH_DOCUMENT_META`.

- [ ] **Paso 1: Escribe el test que falla**

`src/types/research.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { RESEARCH_DOCUMENT_META, documentsFor } from "./research.ts";

test("e-commerce ve exactamente los seis de siempre", () => {
  // Es la prueba que protege todo lo que ya funciona: si esta se rompe, a un
  // producto de suplementos le ha aparecido un documento de casino.
  assert.deepEqual(documentsFor("ecommerce"), [
    "awareness",
    "competitors",
    "avatars",
    "master",
    "desire-extraction",
    "desire-validation",
  ]);
});

test("casino ve los seis y los tres suyos", () => {
  const ids = documentsFor("casino");

  assert.equal(ids.length, 9);
  for (const id of documentsFor("ecommerce")) {
    assert.ok(ids.includes(id), `casino perdió el documento ${id}`);
  }
});

test("los de casino no se cuelan en e-commerce", () => {
  for (const id of ["regulation", "payments", "casino-landscape"] as const) {
    assert.ok(
      !documentsFor("ecommerce").includes(id),
      `${id} le aparece a un producto de e-commerce`,
    );
  }
});

test("cada documento de la lista viene ordenado por su orden", () => {
  // La pantalla los pinta en este orden y las dependencias lo asumen: uno que
  // dependa de otro no puede salir antes.
  for (const vertical of ["ecommerce", "casino"] as const) {
    const orders = documentsFor(vertical).map((id) => RESEARCH_DOCUMENT_META[id].order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b), `desordenado en ${vertical}`);
  }
});

test("todo documento de la lista depende solo de documentos de su lista", () => {
  // Una dependencia hacia fuera del vertical deja el documento bloqueado para
  // siempre: espera a otro que en esa pantalla no existe y no da ningún error.
  for (const vertical of ["ecommerce", "casino"] as const) {
    const ids = documentsFor(vertical);
    for (const id of ids) {
      for (const need of RESEARCH_DOCUMENT_META[id].dependsOn) {
        assert.ok(ids.includes(need), `${id} depende de ${need}, que no está en ${vertical}`);
      }
    }
  }
});
```

- [ ] **Paso 2: Ejecuta y comprueba que falla**

```bash
npm test
```

Esperado: `does not provide an export named 'documentsFor'`.

- [ ] **Paso 3: Añade los tres identificadores y su meta**

En `src/types/research.ts`, a `RESEARCH_DOCUMENT_IDS`:

```ts
  "regulation",
  "payments",
  "casino-landscape",
```

Y a `RESEARCH_DOCUMENT_META`:

```ts
  regulation: {
    order: 7,
    title: "Regulación y legalidad",
    description: "Qué se puede decir y qué no al anunciar juego en este país.",
    /*
     * Sin dependencias a propósito: es lo que **acota** lo que los demás pueden
     * prometer, así que tiene que poder escribirse el primero.
     */
    dependsOn: [],
  },
  payments: {
    order: 8,
    title: "Pagos y retiros",
    description: "Métodos locales para depositar y cobrar, y qué tarda cada uno.",
    dependsOn: [],
  },
  "casino-landscape": {
    order: 9,
    title: "Panorama de casinos",
    description: "Los casinos que ya operan en el país, sus bonos y su posicionamiento.",
    dependsOn: [],
  },
```

Añadirlos aquí **todavía no se los enseña a nadie**: quien decide qué se ve es
`documentsFor`, que es lo del paso siguiente.

- [ ] **Paso 4: Escribe el tipo y la función**

En `src/types/research.ts`, después de `RESEARCH_DOCUMENT_IDS`:

```ts
/**
 * En qué negocio está un producto.
 *
 * `ecommerce` es lo de siempre y el valor por defecto: todo lo que existía antes
 * de agosto de 2026 es de aquí y no cambia de comportamiento.
 */
export type Vertical = "ecommerce" | "casino";

/** Los seis de e-commerce, que son los que había cuando no había verticales. */
const ECOMMERCE_DOCS: ResearchDocumentId[] = [
  "awareness",
  "competitors",
  "avatars",
  "master",
  "desire-extraction",
  "desire-validation",
];

/**
 * Qué documentos tiene la investigación de un producto.
 *
 * **La lista dejó de ser una constante global** y este es el motivo: antes
 * `researchWaves()` recorría todo `RESEARCH_DOCUMENT_META`, así que añadir los
 * documentos de casino se los habría enseñado también a un producto de
 * suplementos — que se pondría a pedir un informe de regulación del juego.
 *
 * Vive aquí y no en `research-prompts.ts` porque este archivo no tiene ni un
 * import y por eso se puede cargar desde un test. Lo que hay que poder comprobar
 * —que un vertical nunca ve los documentos del otro— tiene que estar donde se
 * pueda probar.
 */
export function documentsFor(vertical: Vertical): ResearchDocumentId[] {
  if (vertical === "casino") {
    return [...ECOMMERCE_DOCS, "regulation", "payments", "casino-landscape"].sort(
      (a, b) => RESEARCH_DOCUMENT_META[a].order - RESEARCH_DOCUMENT_META[b].order,
    );
  }

  return [...ECOMMERCE_DOCS];
}
```

- [ ] **Paso 5: Ejecuta y comprueba que pasa**

```bash
npm test
```

Esperado: los cinco en verde. Si el de «e-commerce ve exactamente los seis»
falla, `documentsFor` está devolviendo los de casino a todo el mundo y no se
puede seguir: es justo el fallo que esta tarea existe para impedir.

- [ ] **Paso 6: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add src/types/research.ts src/types/research.test.ts
git commit -m "Cada vertical tiene sus documentos, y no ve los del otro"
git push origin main
```

---

### Tarea 2: La columna del vertical

**Ficheros:**
- Crear: `supabase/migrations/20260816000200_vertical_casino.sql`
- Modificar: `src/types/database.ts` (`ProductRow` y su `Insertable`),
  `src/types/index.ts:75`, `src/lib/data/products.ts`, `src/app/products/new/page.tsx`

**Interfaces:**
- Produce: `Product.vertical: Vertical`, guardado y leído.

- [ ] **Paso 1: Escribe la migración**

```sql
-- ---------------------------------------------------------------------------
-- En qué negocio está un producto.
--
-- `ecommerce` por defecto, y ese defecto es la compatibilidad entera: todo lo
-- que existe hoy nace en el vertical de siempre y no cambia de comportamiento.
--
-- Decide tres cosas y solo tres: qué documentos tiene la investigación, con qué
-- encargo se escribe cada uno, y qué pestañas se ven.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists vertical text not null default 'ecommerce'
    check (vertical in ('ecommerce', 'casino'));

comment on column public.products.vertical is
  'ecommerce = lo de siempre. casino = el producto es el país, y las apps van dentro.';

-- ---------------------------------------------------------------------------
-- Los tres documentos que no tienen equivalente en e-commerce.
--
-- `if not exists` **no es opcional**: estas migraciones se reejecutan en cada
-- despliegue y sin él la segunda vez aborta y se lleva lo que venga detrás.
-- ---------------------------------------------------------------------------

alter type public.research_document_id add value if not exists 'regulation';
alter type public.research_document_id add value if not exists 'payments';
alter type public.research_document_id add value if not exists 'casino-landscape';
```

- [ ] **Paso 2: Aplícala**

```bash
npm run db:push && npm run db:verify
```

Esperado: `db:verify` termina en «Todo correcto».

- [ ] **Paso 3: Los tipos, a mano**

En `src/types/database.ts`, dentro de `ProductRow`:

```ts
  /** 'ecommerce' | 'casino'. Ver `Vertical` en `types/research.ts`. */
  vertical: string;
```

Y `"vertical"` a la lista de opcionales del `Insertable` de `products`: tiene
valor por defecto y todo el código que ya inserta productos sin ella tiene que
seguir compilando.

En `src/types/index.ts`, dentro de `Product`, junto a `researchShared`:

```ts
  /**
   * En qué negocio está.
   *
   * En `casino` el producto **es el país**: su investigación son los documentos
   * de quién juega allí, y las apps cuelgan de él.
   */
  vertical: Vertical;
```

Con `import type { Vertical } from "@/types/research";` arriba.

- [ ] **Paso 4: Léelo y guárdalo**

En `src/lib/data/products.ts`, en el mapeador de fila a `Product`:

```ts
    // Sin vertical, e-commerce: es lo que era todo antes de que hubiera verticales.
    vertical: row.vertical === "casino" ? "casino" : "ecommerce",
```

Y en el insert/update, `vertical: input.vertical ?? "ecommerce"`.

- [ ] **Paso 5: Elegirlo al crear**

En `src/app/products/new/page.tsx`, un selector con las dos opciones y
`ecommerce` marcado. Debajo, esta línea, que es lo que evita que alguien elija
casino sin saber lo que implica:

```tsx
<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
  En casino el producto es el <strong>país</strong>, no la app: su investigación es la de quién
  juega allí, y las apps van dentro. No tiene precio, ni envío, ni tienda.
</p>
```

Esa pantalla lista hoy los documentos con `RESEARCH_DOCUMENT_IDS`
(`products/new/page.tsx:12`): cámbialo por `documentsFor(vertical)` para que la
lista que enseña sea la del vertical elegido.

- [ ] **Paso 6: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "Un producto dice en qué negocio está"
git push origin main
```

---

### Tarea 3: Dónde vive el JSON de los tres documentos

**Ficheros:**
- Modificar: `src/types/research.ts` (tipos y `emptyProductResearch`),
  `src/lib/research-schemas.ts:270`, `src/lib/data/research.ts:25,38`

**Interfaces:**
- Consume: los identificadores de la tarea 1.
- Produce: `RegulationResearch`, `PaymentsResearch`, `CasinoLandscapeResearch`, y
  sus esquemas en `RESEARCH_SCHEMAS`.

- [ ] **Paso 1: Los tipos de su JSON**

En `src/types/research.ts`:

```ts
export interface RegulationResearch {
  /** Legal, tolerado o prohibido, dicho sin rodeos. */
  estado: string;
  /** Quién regula, si alguien. */
  regulador: string;
  /** Edad mínima para jugar. Entra en cada copy. */
  edadMinima: string;
  /** Lo que un anuncio **no** puede decir en este país. */
  prohibido: string[];
  /** Los avisos que hay que incluir, tal y como deben aparecer. */
  avisosObligatorios: string[];
  /** Qué pide Meta para anunciar juego aquí. */
  requisitosDePlataforma: string;
}

export interface PaymentsResearch {
  /** Cómo deposita la gente, de más usado a menos. */
  metodosDeposito: { nombre: string; cuotaDeUso: string; nota: string }[];
  /** Cómo cobra, que es donde está la desconfianza. */
  metodosRetiro: { nombre: string; plazo: string; nota: string }[];
  /** La objeción de dinero más repetida, en palabras del jugador. */
  objecionPrincipal: string;
}

export interface CasinoLandscapeResearch {
  casinos: {
    nombre: string;
    posicionamiento: string;
    bonoDeBienvenida: string;
    /** Por dónde es débil, que es por donde se entra. */
    brecha: string;
  }[];
  /** Qué bono es el estándar del país: por debajo no se compite. */
  bonoEstandar: string;
}
```

Añade los tres campos a `ProductResearch`:

```ts
  regulation: RegulationResearch | null;
  payments: PaymentsResearch | null;
  casinoLandscape: CasinoLandscapeResearch | null;
```

Y a `emptyProductResearch()`, tanto los tres campos a `null` como sus tres
entradas en `documents` con `emptyDocumentState()`. **El `Record` tiene las nueve
claves siempre**, también en e-commerce: hacerlas opcionales obligaría a
comprobar `undefined` en cada sitio que hoy lee `research.documents[id]`.

- [ ] **Paso 2: Dónde vive su JSON**

En `src/lib/data/research.ts:38`, añade a `DATA_KEY`:

```ts
  regulation: "regulation",
  payments: "payments",
  "casino-landscape": "casinoLandscape",
```

Y los tres identificadores a la lista de arriba del archivo (línea 25).

- [ ] **Paso 3: Los esquemas**

En `src/lib/research-schemas.ts`, antes de `RESEARCH_SCHEMAS`:

```ts
const REGULATION_SCHEMA = {
  type: "object",
  properties: {
    estado: { type: "string" },
    regulador: { type: "string" },
    edadMinima: { type: "string" },
    prohibido: { type: "array", items: { type: "string" } },
    avisosObligatorios: { type: "array", items: { type: "string" } },
    requisitosDePlataforma: { type: "string" },
  },
  required: [
    "estado",
    "regulador",
    "edadMinima",
    "prohibido",
    "avisosObligatorios",
    "requisitosDePlataforma",
  ],
  additionalProperties: false,
} as const;

const PAYMENTS_SCHEMA = {
  type: "object",
  properties: {
    metodosDeposito: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          cuotaDeUso: { type: "string" },
          nota: { type: "string" },
        },
        required: ["nombre", "cuotaDeUso", "nota"],
        additionalProperties: false,
      },
    },
    metodosRetiro: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          plazo: { type: "string" },
          nota: { type: "string" },
        },
        required: ["nombre", "plazo", "nota"],
        additionalProperties: false,
      },
    },
    objecionPrincipal: { type: "string" },
  },
  required: ["metodosDeposito", "metodosRetiro", "objecionPrincipal"],
  additionalProperties: false,
} as const;

const CASINO_LANDSCAPE_SCHEMA = {
  type: "object",
  properties: {
    casinos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          posicionamiento: { type: "string" },
          bonoDeBienvenida: { type: "string" },
          brecha: { type: "string" },
        },
        required: ["nombre", "posicionamiento", "bonoDeBienvenida", "brecha"],
        additionalProperties: false,
      },
    },
    bonoEstandar: { type: "string" },
  },
  required: ["casinos", "bonoEstandar"],
  additionalProperties: false,
} as const;
```

Y sus tres entradas en `RESEARCH_SCHEMAS`:

```ts
  regulation: REGULATION_SCHEMA,
  payments: PAYMENTS_SCHEMA,
  "casino-landscape": CASINO_LANDSCAPE_SCHEMA,
```

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test
git add -A
git commit -m "Los tres documentos que el e-commerce no tiene: regulación, pagos y casinos"
git push origin main
```


---

### Tarea 4: Los encargos de casino

**Ficheros:**
- Crear: `src/lib/research-casino-prompts.ts`
- Modificar: `src/lib/research-prompts.ts:555`

**Interfaces:**
- Consume: `Product`, `ProductResearch`, `Store`, `ResearchExtras`.
- Produce: `buildCasinoResearchPrompt(id, product, research, store, extras): string | null`
  — `null` cuando el documento no es de casino, para que el `switch` de siempre
  siga mandando.

- [ ] **Paso 1: El archivo de los encargos de casino**

Aparte de `research-prompts.ts` y **no como condicionales dentro de los de hoy**:
un encargo con un `if` cada tres párrafos deja de poder leerse como lo que es, un
texto que alguien escribió con criterio, y cada arreglo de uno arriesga el otro.

```ts
import type { Product } from "@/types";
import type { ProductResearch, ResearchDocumentId } from "@/types/research";
import type { Store } from "@/types/store";

/**
 * Los encargos de investigación cuando el producto es un casino online.
 *
 * El sujeto no es quien compra un producto: es **quien juega en un país**. No
 * hay precio, ni envío, ni recompra; hay depósito, retiro, bono y rollover, y la
 * «compra» es un registro con su primer depósito.
 *
 * Devuelve `null` para los documentos que no son de casino, y entonces manda el
 * `switch` de `research-prompts.ts`. Así los seis de e-commerce siguen saliendo
 * por su camino de siempre incluso si alguien llama aquí por error.
 */
function paisLine(product: Product): string {
  return `**País:** ${product.country} · **Idioma:** ${product.language}`;
}

export function buildCasinoResearchPrompt(
  id: ResearchDocumentId,
  product: Product,
  research: ProductResearch,
  store: Store | null | undefined,
  extras: { extraNotes?: string },
): string | null {
  switch (id) {
    case "regulation":
      return `${paisLine(product)}

## Qué tienes que averiguar

Cómo está regulado el **juego online** en ${product.country} y qué se puede decir
al anunciarlo.

Necesito, con fuentes:

1. **Estado legal**, dicho sin rodeos: legal y regulado, tolerado, o prohibido.
2. **Quién regula**, si hay alguien.
3. **Edad mínima** para jugar.
4. **Qué no puede decir un anuncio** en este país. Lista concreta.
5. **Qué avisos son obligatorios**, escritos tal y como deben aparecer.
6. **Qué exige Meta** para anunciar juego aquí: permisos, certificaciones o
   restricciones de segmentación.

Esto acota lo que todos los demás documentos pueden prometer, así que **cuando no
lo sepas dilo**: un límite inventado se salta con la misma facilidad que uno real
se incumple.${extras.extraNotes ? `\n\n${extras.extraNotes}` : ""}`;

    case "payments":
      return `${paisLine(product)}

## Qué tienes que averiguar

Cómo deposita y cómo cobra la gente que juega online en ${product.country}.

1. **Métodos de depósito**, del más usado al menos, con qué cuota de uso tiene
   cada uno y qué le pasa a quien lo usa.
2. **Métodos de retiro**, con el **plazo real** de cada uno.
3. **La objeción de dinero más repetida**, en las palabras del jugador y no en
   las nuestras.

El retiro importa más que el depósito: depositar es fácil en todas partes y la
desconfianza está en cobrar.${extras.extraNotes ? `\n\n${extras.extraNotes}` : ""}`;

    case "casino-landscape":
      return `${paisLine(product)}

## Qué tienes que averiguar

Qué casinos online operan ya en ${product.country} y cómo se presentan.

Por cada uno: **cómo se posiciona**, **qué bono de bienvenida ofrece** —con sus
condiciones, no solo la cifra— y **por dónde es débil**.

Y al final, **cuál es el bono estándar del país**: el que todos ofrecen y por
debajo del cual no se compite.

Una brecha solo vale si se puede atacar: «su app es lenta» sirve, «no son muy
conocidos» no.${extras.extraNotes ? `\n\n${extras.extraNotes}` : ""}`;

    default:
      return null;
  }
}
```

`research` y `store` entran en la firma aunque los tres primeros documentos no
los usen: los seis encargos de casino de la tarea 5 sí, y cambiar la firma
después obligaría a tocar la llamada otra vez.

- [ ] **Paso 2: Enchúfalo al `switch`**

En `src/lib/research-prompts.ts`, `buildResearchPrompt` recibe el vertical y
pregunta primero por casino:

```ts
export function buildResearchPrompt(
  id: ResearchDocumentId,
  product: Product,
  research: ProductResearch,
  store: Store | null | undefined,
  extras: ResearchExtras,
): string {
  /*
   * Casino primero, y devolviendo `null` cuando no le toca.
   *
   * Así los seis de e-commerce siguen bajando por el `switch` de siempre sin
   * un solo condicional dentro de sus constructores.
   */
  if (product.vertical === "casino") {
    const casino = buildCasinoResearchPrompt(id, product, research, store, extras);
    if (casino) return casino;
  }

  switch (id) {
    // …lo de hoy, intacto
  }
}
```

Y añade al final del `switch` un `case` por cada documento nuevo que devuelva
cadena vacía: TypeScript exige el `switch` exhaustivo sobre
`ResearchDocumentId`, y ahora son nueve.

```ts
    // Solo existen en casino, y allí los ha devuelto ya `buildCasinoResearchPrompt`.
    case "regulation":
    case "payments":
    case "casino-landscape":
      return "";
```

- [ ] **Paso 3: La lista por vertical, donde se recorre**

Cambia estas cinco llamadas para que usen `documentsFor(product.vertical)` en vez
de la constante:

- `src/lib/research-prompts.ts:585` — `researchWaves(vertical)`
- `src/lib/research-prompts.ts:605` — `blockedBy(id, research, vertical)`
- `src/app/products/[id]/page.tsx` — donde importa `blockedBy` y `researchWaves`
- `src/app/products/[id]/tab-documents.tsx:165,187`
- `src/app/products/[id]/research-actions.ts:43,271`

En `research-actions.ts` la comprobación de identificador válido pasa a ser
contra `documentsFor(product.vertical)` y no contra `RESEARCH_DOCUMENT_IDS`: sin
eso, alguien puede lanzar un documento de casino en un producto de suplementos
llamando a la acción con otro identificador.

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "Los encargos de casino, y la lista de documentos por vertical"
git push origin main
```

---

### Tarea 5: Los seis encargos de casino

**Ficheros:**
- Modificar: `src/lib/research-casino-prompts.ts`

- [ ] **Paso 1: Los seis `case` que faltan**

Añade a `buildCasinoResearchPrompt` un `case` por cada uno de los seis
compartidos, con el mismo esquema de salida que el de e-commerce —los esquemas
**no se tocan**, así que lo que devuelva tiene que encajar en el mismo JSON— y el
sujeto cambiado:

| Documento | Qué cambia respecto al de e-commerce |
|---|---|
| `awareness` | El «mercado» es quien juega casino online en el país. El TAM son jugadores, no compradores |
| `competitors` | Los competidores son casinos, y su «precio» es su bono de bienvenida |
| `avatars` | El avatar es un jugador: qué juega, con cuánto, y qué le pasó la última vez que retiró |
| `master` | Igual que hoy, condensando 1, 2 y 3, más lo que digan regulación y pagos |
| `desire-extraction` | Las «actuaciones» son lo que el casino hace por él: pagar rápido, un bono que se puede liberar, un juego que entiende |
| `desire-validation` | Igual que hoy: puntuar con evidencia real |

Cada uno lleva delante `paisLine(product)` y, cuando el documento dependa de
otros, lo que ya haya en `research`.

- [ ] **Paso 2: Lo que ninguno puede olvidar**

En los seis, al final:

```ts
`
## Límites

Lo que diga el documento de **regulación** manda sobre todo lo demás. Si algo que
ibas a escribir no se puede decir en ${product.country}, no lo escribas y dilo.

Nunca presentes el juego como una forma de ganar dinero ni de resolver un
problema económico.`
```

- [ ] **Paso 3: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "Los seis documentos de siempre, preguntados para casino"
git push origin main
```

---

### Tarea 6: Esconder lo que no aplica, y las reglas del juego

**Ficheros:**
- Modificar: `src/app/products/[id]/page.tsx:64-78` (la lista `TABS`),
  `src/lib/copy-prompts.ts:53` (`buildProductContext`)

- [ ] **Paso 1: Las pestañas**

En `page.tsx`, `TABS` deja de ser una constante y se filtra por vertical:

```tsx
/*
 * En casino no hay precio, ni envío, ni pedidos, ni ficha en Shopify.
 *
 * Se esconden y no se desactivan: una pestaña que pide datos que no existen
 * enseña a ignorar la pantalla, y quien la ignora se salta también las que sí
 * importan.
 */
const SIN_SENTIDO_EN_CASINO = new Set(["precios", "oferta"]);

const tabs = TABS.filter(
  (tab) => product.vertical !== "casino" || !SIN_SENTIDO_EN_CASINO.has(tab.id),
);
```

Y usa `tabs` donde hoy se usa `TABS` para pintar la barra. `resolveTab` sigue
comprobando contra `TABS`: si alguien llega por URL a una pestaña escondida, es
mejor que caiga en el panel que que reviente.

- [ ] **Paso 2: Las reglas del juego, donde vive la regla médica**

En `src/lib/copy-prompts.ts`, dentro de `buildProductContext`, añade al final del
bloque de reglas:

```ts
${
  product.vertical === "casino"
    ? `
## Lo que este copy no puede decir

- **Nunca prometas ganancias** ni presentes el juego como una forma de ganar
  dinero, de pagar deudas o de resolver un problema económico.
- Incluye la **mayoría de edad** y el aviso de **juego responsable** que exija la
  regulación de este país.
- No te dirijas a quien no puede jugar legalmente, ni uses imágenes o lenguaje
  que apunten a menores.
- Lo que diga el documento de regulación manda sobre cualquier cosa de aquí.
`
    : ""
}`;
```

Va **dentro de `buildProductContext`** y no en cada encargo por dos motivos: es
el sitio por el que pasan todos los copys —long copy, anuncios cortos, landings,
Instagram— y es el **prefijo cacheado**, que sigue siendo idéntico para el mismo
producto, así que la caché no se rompe.

- [ ] **Paso 3: Compruébalo a mano**

```bash
npm run dev
```

Crea un producto de casino: no tienen que estar Precios ni Oferta, y Documentos
tiene que enseñar nueve. Abre después uno de e-commerce de los que ya existen:
las pestañas de siempre y **seis** documentos. Si ese enseña nueve, la tarea 1
no está haciendo su trabajo.

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "En casino no se piden precios, y el copy no promete ganancias"
git push origin main
```

---

## Lo que este plan deja fuera

- **Las apps, los ángulos por app y las imágenes con la captura de referencia.**
  Son la segunda parte, y necesitan su propia spec.
- **Compartir un documento entre países.** Hoy cada país es un producto y escribe
  los suyos.
- **Saber qué app rinde.** Sin métricas de vuelta no hay nada que aprender.
