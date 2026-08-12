# Un producto en varios mercados — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementarlo tarea a tarea. Los pasos van
> con casilla (`- [ ]`) para poder marcarlos.

**Objetivo:** que un producto sirva a varios mercados y se trabaje una vez, con
un modo general sin precio y un modo de país con moneda, precio y publicación.

**Arquitectura:** una tabla `product_markets` pasa a ser la verdad sobre en qué
países vive un producto y a qué precio en cada uno; `products.market_id` se
queda como mercado base. El modo se elige en la URL. Toda la lógica que se puede
probar —la cascada del precio, el redondeo, el filtro, el slug— vive en módulos
**puros y sin imports de valor**, porque el corredor de Node no resuelve el alias
`@/`. Las pantallas y las acciones de servidor solo llaman a esos módulos.

**Tecnología:** Next.js 16 (App Router, componentes de servidor), React 19,
Supabase con RLS por espacio de trabajo, TypeScript, `node --test` con
`--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-12-producto-multimercado-design.md`

## Restricciones globales

Salen de `AGENTS.md` y de la propia spec. Se aplican a **todas** las tareas.

- **Nunca ejecutes prettier.** No hay configuración y reformatea a 80 columnas
  cuando el código está a 100: deja un diff ilegible sobre todo el árbol.
- **Los tests importan con ruta relativa** —`./cosa.ts`, no `@/lib/cosa`— y solo
  prueban módulos puros. Un módulo con un `import` **de valor** usando `@/` no se
  puede cargar desde un test; los `import type` sí, porque se borran al compilar.
  `money.ts` y `fx.ts` son puros y se pueden probar; `copy-prompts.ts`,
  `research-prompts.ts` y `visual-prompts.ts` **no**.
- **`create policy` no admite `if not exists`.** Las migraciones se reejecutan en
  cada despliegue: cada política nueva lleva delante su `drop policy if exists` o
  el segundo despliegue aborta y se lleva todo lo que venga detrás.
- **Toda tabla nueva** necesita `workspace_id`, su política con
  `public.mis_espacios()` y el disparador `poner_espacio`.
- **No añadas `.eq("user_id", …)`** a ninguna consulta de lectura. La política ya
  acota; ese filtro no falla, devuelve cero filas y a quien invitas le aparece la
  plataforma vacía.
- **Comentarios en español**, explicando **por qué** y no qué. Los que valen
  cuentan el fallo que evitan.
- Comprobaciones: `npx tsc --noEmit`, `npm run lint`, `npm test`.
- Migraciones: `npm run db:push`; tipos: `npm run db:types`.
- Cada tarea acaba en commit. En este repositorio, tras el commit se hace `git
  push origin main`: el despliegue del servidor hace `git pull`.

---

### Tarea 1: La cascada del precio, en un módulo puro

El corazón del cambio y lo único que decide si un número se puede publicar. Va
primero porque no depende de nada y todo lo demás lo usa.

**Ficheros:**
- Crear: `src/lib/market-price.ts`
- Test: `src/lib/market-price.test.ts`

**Interfaces:**
- Consume: nada. Sin imports, como `fx.ts`.
- Produce:
  - `type PriceSource = "manual" | "convertido" | "ninguno"`
  - `interface MarketPrice { marketId: string; price: number | null; source: PriceSource; fxDay: string | null; fxRate: number | null }`
  - `type Selection = { kind: "general" } | { kind: "market"; marketId: string }`
  - `interface ResolvedPrice { amount: number; source: "manual" | "convertido" }`
  - `resolvePrice(selection: Selection, prices: MarketPrice[]): ResolvedPrice | null`
  - `canPublish(price: ResolvedPrice | null): boolean`
  - `commercialRounding(amount: number, currency: string): number | null`
  - `isStale(fxDay: string | null, today: string, days?: number): boolean`
  - `priceLine(label: string, price: ResolvedPrice | null, currency: string): string`

- [ ] **Paso 1: Escribe el test que falla**

Crea `src/lib/market-price.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canPublish,
  commercialRounding,
  isStale,
  priceLine,
  resolvePrice,
} from "./market-price.ts";
import type { MarketPrice } from "./market-price.ts";

const manual: MarketPrice = {
  marketId: "cl",
  price: 9990,
  source: "manual",
  fxDay: null,
  fxRate: null,
};

const convertido: MarketPrice = {
  marketId: "mx",
  price: 10847,
  source: "convertido",
  fxDay: "2026-07-01",
  fxRate: 18.2,
};

const vacio: MarketPrice = {
  marketId: "pe",
  price: null,
  source: "ninguno",
  fxDay: null,
  fxRate: null,
};

/* ------------------------------ La cascada ---------------------------------- */

test("en general no hay precio, aunque los mercados tengan uno", () => {
  assert.equal(resolvePrice({ kind: "general" }, [manual, convertido]), null);
});

test("el precio escrito a mano es el que sale", () => {
  const found = resolvePrice({ kind: "market", marketId: "cl" }, [manual, convertido]);

  assert.deepEqual(found, { amount: 9990, source: "manual" });
});

test("el convertido sale, pero diciendo que es convertido", () => {
  const found = resolvePrice({ kind: "market", marketId: "mx" }, [manual, convertido]);

  assert.deepEqual(found, { amount: 10847, source: "convertido" });
});

test("un mercado sin precio no inventa el de otro mercado", () => {
  assert.equal(resolvePrice({ kind: "market", marketId: "pe" }, [manual, vacio]), null);
});

test("un mercado que no está en la lista no hereda nada", () => {
  assert.equal(resolvePrice({ kind: "market", marketId: "co" }, [manual]), null);
});

/* --------------------------- Qué se puede publicar --------------------------- */

test("solo lo escrito a mano se publica", () => {
  assert.equal(canPublish({ amount: 9990, source: "manual" }), true);
  assert.equal(canPublish({ amount: 10847, source: "convertido" }), false);
  assert.equal(canPublish(null), false);
});

/* ------------------------------- El redondeo -------------------------------- */

test("en pesos se propone la terminación 990", () => {
  assert.equal(commercialRounding(10847, "CLP"), 10990);
  assert.equal(commercialRounding(10847, "COP"), 10990);
});

test("en euros y dólares se propone la terminación ,99", () => {
  assert.equal(commercialRounding(48.4, "EUR"), 48.99);
  assert.equal(commercialRounding(48.4, "USD"), 48.99);
});

test("una moneda sin regla no propone nada, en vez de inventarse una", () => {
  assert.equal(commercialRounding(1234, "JPY"), null);
});

test("no propone el mismo número que ya hay: sería un botón que no hace nada", () => {
  assert.equal(commercialRounding(10990, "CLP"), null);
});

/* ------------------------------- La caducidad ------------------------------- */

test("una conversión de hace más de un mes se marca vieja", () => {
  assert.equal(isStale("2026-07-01", "2026-08-12"), true);
  assert.equal(isStale("2026-08-01", "2026-08-12"), false);
});

test("sin día de cambio no hay nada que caducar", () => {
  assert.equal(isStale(null, "2026-08-12"), false);
});

/* ------------------------- La línea de los encargos -------------------------- */

test("sin precio, la línea del encargo desaparece entera", () => {
  assert.equal(priceLine("Precio", null, "CLP"), "");
});

test("con precio, la línea lleva el importe y la moneda", () => {
  assert.equal(priceLine("Precio", { amount: 9990, source: "manual" }, "CLP"), "Precio: 9990 CLP");
});
```

- [ ] **Paso 2: Ejecuta el test y comprueba que falla**

```bash
npm test -- --test-name-pattern="precio"
```

Esperado: falla al no encontrar `./market-price.ts`.

- [ ] **Paso 3: Escribe el módulo**

Crea `src/lib/market-price.ts`:

```ts
/**
 * El precio de un producto en un mercado.
 *
 * Sin imports, probado en `market-price.test.ts`.
 *
 * ## La cascada, y por qué el orden importa
 *
 * Manda el primero que exista: el precio escrito a mano, el convertido, y nada.
 * Redondear a `9.990` en Chile no sale de ninguna conversión, así que una
 * conversión no puede pisar nunca un precio escrito a mano. Aquí no es una
 * preferencia de la interfaz: el conversor filtra por `source`, y lo que es
 * `manual` no entra.
 *
 * ## Por qué un convertido no se publica
 *
 * Porque `$10.847` en una página se lee como un error de la tienda, no como un
 * precio. El convertido sirve para lo de dentro —comparar, el P&L, la gráfica— y
 * para ahorrar teclear; para salir a la calle hay que confirmarlo, y confirmarlo
 * lo vuelve manual.
 */

export type PriceSource = "manual" | "convertido" | "ninguno";

export interface MarketPrice {
  marketId: string;
  price: number | null;
  source: PriceSource;
  /** El día del cambio con el que se convirtió, congelado. */
  fxDay: string | null;
  /** La tasa usada, congelada. Se guarda para poder explicar el número. */
  fxRate: number | null;
}

/** En qué modo se está mirando el producto. */
export type Selection = { kind: "general" } | { kind: "market"; marketId: string };

export interface ResolvedPrice {
  amount: number;
  source: "manual" | "convertido";
}

export function resolvePrice(selection: Selection, prices: MarketPrice[]): ResolvedPrice | null {
  // En general no hay precio. No es que se enseñe vacío: no existe, porque no
  // hay uno solo y enseñar el de un país en la página de otro es peor que no
  // enseñar ninguno.
  if (selection.kind === "general") return null;

  const found = prices.find((item) => item.marketId === selection.marketId);
  if (!found || found.price === null || found.source === "ninguno") return null;

  return { amount: found.price, source: found.source };
}

/** Solo lo escrito a mano sale a la calle. */
export function canPublish(price: ResolvedPrice | null): boolean {
  return price?.source === "manual";
}

/*
 * Las terminaciones que se usan de verdad en cada moneda.
 *
 * La lista es corta a propósito: cubre los mercados con los que se trabaja en
 * vez de fingir que cubre el mundo. Una moneda que no está no propone nada, y
 * eso es mejor que proponer un redondeo inventado sobre una divisa que nadie
 * aquí sabe cómo se escribe en una tienda.
 */
const ENDINGS: Record<string, { step: number; ending: number }> = {
  CLP: { step: 1000, ending: 990 },
  COP: { step: 1000, ending: 990 },
  MXN: { step: 100, ending: 99 },
  ARS: { step: 1000, ending: 990 },
  EUR: { step: 1, ending: 0.99 },
  USD: { step: 1, ending: 0.99 },
  GBP: { step: 1, ending: 0.99 },
};

/**
 * El redondeo comercial más cercano hacia arriba, como **propuesta**.
 *
 * Nunca se aplica solo. Un redondeo automático que nadie mira es cómo `9.990` se
 * convierte en `10.000` en la página de alguien.
 */
export function commercialRounding(amount: number, currency: string): number | null {
  const rule = ENDINGS[currency.trim().toUpperCase()];
  if (!rule || !Number.isFinite(amount) || amount <= 0) return null;

  const floor = Math.floor(amount / rule.step) * rule.step;
  const candidate = floor + rule.ending;
  const rounded = candidate >= amount ? candidate : candidate + rule.step;
  const clean = Number(rounded.toFixed(2));

  // Proponer el número que ya hay sería un botón que no hace nada.
  return clean === amount ? null : clean;
}

/** Si la conversión es lo bastante vieja como para avisar de que lo es. */
export function isStale(fxDay: string | null, today: string, days = 30): boolean {
  if (!fxDay) return false;

  const from = Date.parse(`${fxDay}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return false;

  return (to - from) / 86_400_000 > days;
}

/**
 * La línea del precio para un encargo, o nada.
 *
 * Devuelve la cadena vacía cuando no hay precio para que el llamante la filtre y
 * la línea **desaparezca entera**. Escribir «Precio: 0» le está diciendo al
 * modelo que el producto es gratis.
 */
export function priceLine(label: string, price: ResolvedPrice | null, currency: string): string {
  if (!price) return "";
  return `${label}: ${price.amount} ${currency}`;
}
```

- [ ] **Paso 4: Ejecuta los tests y comprueba que pasan**

```bash
npm test
npx tsc --noEmit
npm run lint
```

Esperado: todo en verde.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/market-price.ts src/lib/market-price.test.ts
git commit -m "Precio por mercado: la cascada, en un módulo puro"
git push origin main
```

---

### Tarea 2: El selector y el filtro, en un módulo puro

También sin dependencias. Con las tareas 1 y 2 hechas, todo lo demás es
fontanería alrededor de estas dos.

**Ficheros:**
- Crear: `src/lib/market-selection.ts`
- Test: `src/lib/market-selection.test.ts`

**Interfaces:**
- Consume: `type Selection` de `./market-price.ts` (import de tipo, se borra al
  compilar, así que el test sigue pudiendo cargarlo).
- Produce:
  - `parseSelection(raw: string | undefined, marketIds: string[]): Selection`
  - `showSelector(marketIds: string[]): boolean`
  - `visibleIn(selection: Selection, pieceMarketId: string | null): boolean`
  - `stampFor(selection: Selection): string | null`
  - `marketLines(selection: Selection, market: MarketBrief | null, fallbackLanguage: string): string[]`
  - `interface MarketBrief { countryName: string; languageName: string }`
  - `SELECTION_PARAM = "mercado"`

- [ ] **Paso 1: Escribe el test que falla**

Crea `src/lib/market-selection.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  marketLines,
  parseSelection,
  showSelector,
  stampFor,
  visibleIn,
} from "./market-selection.ts";

/* ------------------------------ El selector --------------------------------- */

test("con un solo mercado no hay selector y siempre se está en él", () => {
  assert.equal(showSelector(["cl"]), false);
  assert.deepEqual(parseSelection(undefined, ["cl"]), { kind: "market", marketId: "cl" });
});

test("con un solo mercado, pedir general no lleva a general", () => {
  // La función no existe todavía para ese producto: dejarla entrar enseñaría una
  // ficha sin precio a quien no ha pedido varios mercados.
  assert.deepEqual(parseSelection("general", ["cl"]), { kind: "market", marketId: "cl" });
});

test("con varios mercados se empieza en general", () => {
  assert.equal(showSelector(["cl", "mx"]), true);
  assert.deepEqual(parseSelection(undefined, ["cl", "mx"]), { kind: "general" });
});

test("se puede elegir un mercado concreto", () => {
  assert.deepEqual(parseSelection("mx", ["cl", "mx"]), { kind: "market", marketId: "mx" });
});

test("un mercado que ya no existe cae a general, no a otro país", () => {
  // Se borra un mercado y queda un enlace viejo. Caer al primero de la lista
  // enseñaría el precio de Chile bajo el nombre de México.
  assert.deepEqual(parseSelection("borrado", ["cl", "mx"]), { kind: "general" });
});

test("sin mercados, general", () => {
  assert.equal(showSelector([]), false);
  assert.deepEqual(parseSelection("mx", []), { kind: "general" });
});

/* -------------------------------- El filtro --------------------------------- */

test("en general solo se ve lo general", () => {
  assert.equal(visibleIn({ kind: "general" }, null), true);
  assert.equal(visibleIn({ kind: "general" }, "mx"), false);
});

test("en un mercado se ve lo suyo y lo general", () => {
  const mx = { kind: "market", marketId: "mx" } as const;

  assert.equal(visibleIn(mx, "mx"), true);
  assert.equal(visibleIn(mx, null), true);
  assert.equal(visibleIn(mx, "cl"), false);
});

/* --------------------------- El sello al generar ---------------------------- */

test("lo generado en general se guarda sin mercado", () => {
  assert.equal(stampFor({ kind: "general" }), null);
});

test("lo generado en un mercado se guarda con su mercado", () => {
  assert.equal(stampFor({ kind: "market", marketId: "mx" }), "mx");
});

/* ------------------- El país y el idioma de los encargos --------------------- */

const mexico = { countryName: "México", languageName: "Español" };

test("en un mercado, el encargo lleva su país y su idioma", () => {
  assert.deepEqual(marketLines({ kind: "market", marketId: "mx" }, mexico, "Español"), [
    "País: México",
    "Idioma de salida: Español",
  ]);
});

test("en general no hay país, y se dice que no lo nombre", () => {
  // No basta con callarlo: sin instrucción, el modelo se inventa un país al
  // escribir —«aquí en Chile»— y el texto deja de valer para los demás.
  assert.deepEqual(marketLines({ kind: "general" }, null, "Español"), [
    "País: varios (NO nombres ningún país, ciudad ni moneda: este texto vale para todos)",
    "Idioma de salida: Español",
  ]);
});

- [ ] **Paso 2: Ejecuta el test y comprueba que falla**

```bash
npm test -- --test-name-pattern="mercado|selector|general"
```

Esperado: falla al no encontrar `./market-selection.ts`.

- [ ] **Paso 3: Escribe el módulo**

Crea `src/lib/market-selection.ts`:

```ts
import type { Selection } from "@/lib/market-price";

/**
 * En qué mercado se está mirando un producto, y qué se ve desde ahí.
 *
 * Probado en `market-selection.test.ts`. El `import type` de arriba se borra al
 * compilar, así que el módulo se sigue pudiendo cargar desde un test.
 *
 * ## Por qué el modo vive en la URL
 *
 * Porque sobrevive a la recarga, se puede enlazar y lo leen los componentes de
 * servidor sin cliente de por medio. En estado de React se perdería en cada
 * navegación entre pestañas de la ficha.
 *
 * ## Por qué con un solo mercado no aparece
 *
 * Porque el modo general es «lo que vale en todos los países» y con un país eso
 * es el país. Enseñar el selector ahí sería ofrecer una ficha sin precio a quien
 * no ha pedido varios mercados: toda la plataforma existente empeoraría para que
 * funcionara un caso que todavía no tiene.
 */

export const SELECTION_PARAM = "mercado";

const GENERAL = "general";

export function showSelector(marketIds: string[]): boolean {
  return marketIds.length > 1;
}

export function parseSelection(raw: string | undefined, marketIds: string[]): Selection {
  if (!showSelector(marketIds)) {
    // Con un solo mercado siempre se está en él, se pida lo que se pida.
    return marketIds[0] ? { kind: "market", marketId: marketIds[0] } : { kind: "general" };
  }

  if (!raw || raw === GENERAL) return { kind: "general" };

  /*
   * Un mercado desconocido cae a general y **no** al primero de la lista.
   *
   * Pasa con un enlace viejo a un mercado borrado. Caer al primero enseñaría el
   * precio de un país bajo el nombre de otro, que es el fallo caro de todo esto;
   * caer a general no enseña ningún precio, que es incómodo pero cierto.
   */
  return marketIds.includes(raw) ? { kind: "market", marketId: raw } : { kind: "general" };
}

/** Si una pieza se ve desde el modo actual. `null` en la pieza es «vale en todos». */
export function visibleIn(selection: Selection, pieceMarketId: string | null): boolean {
  if (selection.kind === "general") return pieceMarketId === null;
  return pieceMarketId === null || pieceMarketId === selection.marketId;
}

/** Con qué mercado se sella lo que se genere ahora. */
export function stampFor(selection: Selection): string | null {
  return selection.kind === "general" ? null : selection.marketId;
}

export interface MarketBrief {
  countryName: string;
  languageName: string;
}

/**
 * El país y el idioma que ve un encargo.
 *
 * En general no hay país, y **no basta con callarlo**: sin decir nada, el modelo
 * se inventa uno al escribir —«aquí en Chile el invierno»— y el texto deja de
 * valer para los demás mercados, que era justo el propósito del modo. Así que en
 * general se escribe la prohibición explícita.
 *
 * El idioma sí existe siempre: es el del mercado, o el del producto cuando se
 * escribe en general. Un idioma en blanco haría que el modelo eligiera, y elige
 * inglés.
 */
export function marketLines(
  selection: Selection,
  market: MarketBrief | null,
  fallbackLanguage: string,
): string[] {
  if (selection.kind === "market" && market) {
    return [`País: ${market.countryName}`, `Idioma de salida: ${market.languageName}`];
  }

  return [
    "País: varios (NO nombres ningún país, ciudad ni moneda: este texto vale para todos)",
    `Idioma de salida: ${fallbackLanguage}`,
  ];
}
```

- [ ] **Paso 4: Ejecuta los tests y comprueba que pasan**

```bash
npm test
npx tsc --noEmit
npm run lint
```

- [ ] **Paso 5: Commit**

```bash
git add src/lib/market-selection.ts src/lib/market-selection.test.ts
git commit -m "Selector de mercado y filtro, en un módulo puro"
git push origin main
```

---

### Tarea 3: La migración del modelo

**Ficheros:**
- Crear: `supabase/migrations/20260812000500_producto_multimercado.sql`
- Modificar: `src/types/database.ts` (regenerado, no a mano)

**Interfaces:**
- Consume: nada.
- Produce: la tabla `public.product_markets` y la columna
  `public.products.research_shared`.

- [ ] **Paso 1: Escribe la migración**

Crea `supabase/migrations/20260812000500_producto_multimercado.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Un producto en varios mercados.
--
-- Hasta ahora un producto vivía en **un** mercado y el mismo producto en dos
-- países eran dos productos. Para una parte del catálogo eso deja de ser cierto.
--
-- La membresía y el precio de cada país viven **solo aquí**. `products.price` y
-- `products.currency` se quedan como el precio base, y `products.market_id` pasa
-- a significar «mercado base». Tener la moneda en dos sitios es la puerta a que
-- los dos discrepen, y cuando discrepan el que se publica es el equivocado.
-- ---------------------------------------------------------------------------

create table if not exists public.product_markets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  market_id uuid not null references public.store_markets (id) on delete cascade,

  price numeric(12, 2) check (price >= 0),
  -- De dónde salió el número. 'manual' gana siempre, y no por educación: el
  -- conversor filtra por esta columna, así que no puede pisarlo.
  price_source text not null default 'ninguno'
    check (price_source in ('manual', 'convertido', 'ninguno')),
  -- El cambio con el que se convirtió, congelado al fijarlo. Nulos cuando el
  -- precio es manual. Se guardan para poder explicar el número meses después.
  price_fx_day date,
  price_fx_rate numeric check (price_fx_rate > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un producto no puede estar dos veces en el mismo mercado: serían dos precios
  -- para la misma página y ganaría el que devolviera antes la consulta.
  unique (product_id, market_id)
);

create index if not exists product_markets_product_id_idx
  on public.product_markets (product_id);
create index if not exists product_markets_market_id_idx
  on public.product_markets (market_id);

drop trigger if exists product_markets_touch on public.product_markets;
create trigger product_markets_touch
  before update on public.product_markets
  for each row execute function public.touch_updated_at();

drop trigger if exists poner_espacio on public.product_markets;
create trigger poner_espacio before insert on public.product_markets
  for each row execute function public.poner_espacio();

alter table public.product_markets enable row level security;

-- `drop policy if exists` delante de cada una: estas migraciones se reejecutan
-- en cada despliegue y `create policy` no admite `if not exists`, así que sin
-- esto el segundo despliegue aborta y se lleva lo que venga detrás.
drop policy if exists "product_markets_lectura" on public.product_markets;
create policy "product_markets_lectura" on public.product_markets
  for select to authenticated
  using (workspace_id in (select public.mis_espacios()));

drop policy if exists "product_markets_escritura" on public.product_markets;
create policy "product_markets_escritura" on public.product_markets
  for all to authenticated
  using (workspace_id in (select public.mis_espacios()))
  with check (workspace_id in (select public.mis_espacios()));

-- ---------------------------------------------------------------------------
-- Lo que ya existe entra sin cambiar de estado.
--
-- Cada producto con mercado pasa a tener ese mercado con su precio marcado como
-- 'manual', porque es la verdad: alguien lo escribió. Marcarlo 'convertido'
-- haría que la plataforma pidiera confirmar precios que llevan meses publicados.
-- ---------------------------------------------------------------------------

insert into public.product_markets
  (user_id, workspace_id, product_id, market_id, price, price_source)
select p.user_id, p.workspace_id, p.id, p.market_id, p.price,
       case when p.price > 0 then 'manual' else 'ninguno' end
from public.products p
where p.market_id is not null
on conflict (product_id, market_id) do nothing;

-- ---------------------------------------------------------------------------
-- El interruptor de la investigación.
--
-- Apagado —por mercado— también para lo existente. El público de Chile y el de
-- México no son el mismo, y ese era el motivo original de duplicar productos.
-- Encenderlo es un acto explícito que dice «esta investigación viaja».
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists research_shared boolean not null default false;

comment on column public.products.research_shared is
  'Si los seis documentos valen para todos los mercados del producto.';

comment on column public.products.market_id is
  'Mercado base: el del precio de products.price. Los demás, en product_markets.';
```

- [ ] **Paso 2: Aplícala y comprueba que el traspaso dejó lo que tenía que dejar**

```bash
npm run db:push
```

Después, en el editor SQL de Supabase, comprueba que ningún producto con mercado
se quedó fuera. Tiene que devolver **cero filas**:

```sql
select p.id, p.name
from public.products p
left join public.product_markets pm
  on pm.product_id = p.id and pm.market_id = p.market_id
where p.market_id is not null and pm.id is null;
```

Y que ninguna fila quedó sin espacio de trabajo, que sería invisible para todos:

```sql
select count(*) from public.product_markets where workspace_id is null;
```

- [ ] **Paso 3: Regenera los tipos**

```bash
npm run db:types
npx tsc --noEmit
```

Esperado: `src/types/database.ts` incluye `product_markets` y
`products.research_shared`. Todavía no compila nada nuevo, así que `tsc` sigue
limpio.

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/20260812000500_producto_multimercado.sql src/types/database.ts
git commit -m "Migración: product_markets y el interruptor de investigación"
git push origin main
```

---

### Tarea 4: La capa de datos de los mercados de un producto

**Ficheros:**
- Crear: `src/lib/data/product-markets.ts`
- Modificar: `src/lib/data/mappers.ts` (añadir `research_shared` a `toProduct` y
  `fromProduct`), `src/types/index.ts` (campo `researchShared` en `Product`)

**Interfaces:**
- Consume: `MarketPrice` de `@/lib/market-price`.
- Produce:
  - `listProductMarkets(productId: string): Promise<MarketPrice[]>`
  - `addProductMarket(productId: string, marketId: string): Promise<void>`
  - `removeProductMarket(productId: string, marketId: string): Promise<void>`
  - `setManualPrice(productId: string, marketId: string, price: number): Promise<void>`
  - `setConvertedPrice(productId: string, marketId: string, value: { price: number; fxDay: string; fxRate: number }): Promise<void>`
  - `Product.researchShared: boolean`

- [ ] **Paso 1: Añade el campo al tipo y a los dos sentidos del mapeador**

En `src/types/index.ts`, dentro de `interface Product`, junto a `marketId`:

```ts
  /**
   * Si la investigación vale para todos sus mercados.
   *
   * Apagado significa por mercado, y es el valor inicial: el público de Chile y
   * el de México no son el mismo.
   */
  researchShared: boolean;
```

En `src/lib/data/mappers.ts`, dentro de `toProduct`, junto a `marketId`:

```ts
    researchShared: row.research_shared,
```

Y en `fromProduct`, junto a los demás `assign`:

```ts
  assign("research_shared", product.researchShared);
```

- [ ] **Paso 2: Comprueba que el compilador enumera lo que falta**

```bash
npx tsc --noEmit
```

Esperado: errores en los sitios que construyen un `Product` a mano —los
generadores de datos de ejemplo, `mock-data.ts`, `product-duplication.ts`—.
Arréglalos poniendo `researchShared: false`, que es el valor inicial.

- [ ] **Paso 3: Escribe la capa de datos**

Crea `src/lib/data/product-markets.ts`:

```ts
import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { MarketPrice, PriceSource } from "@/lib/market-price";

/**
 * En qué mercados vive un producto y a qué precio en cada uno.
 *
 * Sin `.eq("user_id", …)` en ninguna lectura: la política ya acota por espacio de
 * trabajo, y ese filtro no falla —devuelve cero filas y a quien invitas le
 * aparece la ficha sin mercados—.
 */

export async function listProductMarkets(productId: string): Promise<MarketPrice[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("product_markets")
    .select("market_id, price, price_source, price_fx_day, price_fx_rate")
    .eq("product_id", productId);

  if (error) throw new Error(`No se pudieron leer los mercados del producto: ${error.message}`);

  return (data ?? []).map((row) => ({
    marketId: row.market_id,
    // `numeric` llega como número o como cadena según el driver; se normaliza.
    price: row.price === null ? null : Number(row.price),
    source: row.price_source as PriceSource,
    fxDay: row.price_fx_day ? String(row.price_fx_day).slice(0, 10) : null,
    fxRate: row.price_fx_rate === null ? null : Number(row.price_fx_rate),
  }));
}

export async function addProductMarket(productId: string, marketId: string): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase
    .from("product_markets")
    .insert({ product_id: productId, market_id: marketId, user_id: userId })
    // Añadir dos veces el mismo mercado es un doble clic, no un error que
    // merezca una pantalla roja.
    .select()
    .maybeSingle();

  if (error && !error.message.includes("duplicate key")) {
    throw new Error(`No se pudo añadir el mercado: ${error.message}`);
  }
}

export async function removeProductMarket(productId: string, marketId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_markets")
    .delete()
    .eq("product_id", productId)
    .eq("market_id", marketId);

  if (error) throw new Error(`No se pudo quitar el mercado: ${error.message}`);
}

/**
 * El precio escrito a mano. Borra el rastro de la conversión a propósito: si se
 * quedara, la pantalla seguiría diciendo «convertido el 1 de julio» sobre un
 * número que escribió una persona hoy.
 */
export async function setManualPrice(
  productId: string,
  marketId: string,
  price: number,
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_markets")
    .update({ price, price_source: "manual", price_fx_day: null, price_fx_rate: null })
    .eq("product_id", productId)
    .eq("market_id", marketId);

  if (error) throw new Error(`No se pudo guardar el precio: ${error.message}`);
}

/**
 * El precio convertido, con su cambio congelado.
 *
 * **No toca las filas manuales.** El filtro por `price_source` no es una
 * comodidad: es lo que impide que recalcular los cambios de una tienda entera se
 * lleve por delante los precios redondeados a mano de cada país.
 */
export async function setConvertedPrice(
  productId: string,
  marketId: string,
  value: { price: number; fxDay: string; fxRate: number },
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_markets")
    .update({
      price: value.price,
      price_source: "convertido",
      price_fx_day: value.fxDay,
      price_fx_rate: value.fxRate,
    })
    .eq("product_id", productId)
    .eq("market_id", marketId)
    .neq("price_source", "manual");

  if (error) throw new Error(`No se pudo guardar la conversión: ${error.message}`);
}
```

- [ ] **Paso 4: Que un producto nuevo entre en su propio mercado**

La migración metió a los productos que ya existían. Sin este paso, **los que se
creen a partir de ahora nacen sin ninguna fila** en `product_markets`: el
selector no aparecería nunca y la pestaña de precios saldría vacía para siempre.
Es el hueco que hace que la función funcione hoy y deje de funcionar mañana.

En `src/app/products/actions.ts`, después de crear el producto (alrededor de la
línea 94, donde ya se resuelve el mercado principal) y también donde una
actualización cambia `marketId`:

```ts
  // El mercado base tiene que estar entre los mercados del producto. Es la
  // invariante de la que cuelga todo lo demás: sin ella, un producto tiene un
  // precio base que no pertenece a ningún sitio.
  if (created.marketId) await addProductMarket(created.id, created.marketId);
```

En `src/lib/product-duplication.ts`, después de `saveProduct(duplicate)`, lo
mismo con `market.id`.

- [ ] **Paso 5: Comprueba**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Crea un producto desde la interfaz y comprueba en la base que nació con su
mercado:

```sql
select pm.market_id, pm.price, pm.price_source
from public.product_markets pm
join public.products p on p.id = pm.product_id
order by pm.created_at desc limit 5;
```

- [ ] **Paso 6: Commit**

```bash
git add src/lib/data/product-markets.ts src/lib/data/mappers.ts src/types/index.ts src/app/products/actions.ts src/lib/product-duplication.ts
git commit -m "Capa de datos de los mercados de un producto"
git push origin main
```

---

### Tarea 5: El selector en la ficha del producto

**Ficheros:**
- Crear: `src/app/products/[id]/market-switcher.tsx`
- Modificar: `src/app/products/[id]/page.tsx:79-83` (los `searchParams`)

**Interfaces:**
- Consume: `parseSelection`, `showSelector`, `SELECTION_PARAM` de
  `@/lib/market-selection`; `listProductMarkets` de `@/lib/data/product-markets`.
- Produce: la constante `selection` disponible en `page.tsx` para pasarla a las
  pestañas, y el componente `<MarketSwitcher>`.

- [ ] **Paso 1: Escribe el componente**

Crea `src/app/products/[id]/market-switcher.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SELECTION_PARAM } from "@/lib/market-selection";

/**
 * Elegir entre «general» y un mercado.
 *
 * Escribe en la URL y no en estado: así el modo sobrevive a la recarga, se puede
 * enlazar, y las pestañas —que son componentes de servidor— lo leen sin que haya
 * que pasarlo por props a través de toda la ficha.
 */
export function MarketSwitcher({
  markets,
  current,
}: {
  markets: { id: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(SELECTION_PARAM, value);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground" htmlFor="mercado">
        Mercado
      </label>
      <select
        id="mercado"
        className="rounded-md border px-2 py-1 text-sm"
        value={current}
        onChange={(event) => go(event.target.value)}
      >
        <option value="general">General (sin precio)</option>
        {markets.map((market) => (
          <option key={market.id} value={market.id}>
            {market.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Paso 2: Léelo en la página**

En `src/app/products/[id]/page.tsx`, cambia el tipo de `searchParams`:

```ts
  searchParams: Promise<{ tab?: string; mercado?: string }>;
```

y la línea que los desempaqueta:

```ts
  const [{ id }, { tab, mercado }] = await Promise.all([params, searchParams]);
```

Después de tener `product` y `stores`, añade:

```ts
  const productMarkets = await listProductMarkets(product.id);
  const marketIds = productMarkets.map((item) => item.marketId);
  const selection = parseSelection(mercado, marketIds);

  // El mercado base sigue viviendo en el producto: es el del precio de
  // `products.price` y el que usan las pantallas que todavía no saben de esto.
  const store = product.storeId ? stores.find((item) => item.id === product.storeId) : undefined;
  const marketOptions = (store?.markets ?? [])
    .filter((market) => marketIds.includes(market.id))
    .map((market) => ({ id: market.id, label: marketLabel(market) }));
```

Con sus imports:

```ts
import { listProductMarkets } from "@/lib/data/product-markets";
import { parseSelection, showSelector } from "@/lib/market-selection";
import { marketLabel } from "@/types/store";
import { MarketSwitcher } from "@/app/products/[id]/market-switcher";
```

Y en la cabecera de la ficha, junto al `StatusPill`:

```tsx
        {showSelector(marketIds) ? (
          <MarketSwitcher
            markets={marketOptions}
            current={selection.kind === "general" ? "general" : selection.marketId}
          />
        ) : null}
```

- [ ] **Paso 3: Comprueba a mano que un producto de siempre no cambia**

```bash
npm run dev
```

Abre un producto con un solo mercado: **no** tiene que aparecer el selector, y la
ficha tiene que verse exactamente igual que antes, con su precio. Añade una fila
en `product_markets` para un segundo mercado de ese producto desde el editor SQL
y recarga: ahora aparece el selector y arranca en general.

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit
npm run lint
git add src/app/products/\[id\]/market-switcher.tsx src/app/products/\[id\]/page.tsx
git commit -m "Selector de mercado en la ficha, con general como estado inicial"
git push origin main
```

---

### Tarea 6: Ocultar el precio en modo general

La tarea que evita el error caro. Va antes que los precios por país porque no
depende de ellos.

**Ficheros:**
- Modificar: `src/lib/money.ts` (añadir `moneyForMarket`)
- Modificar: `src/lib/copy-prompts.ts:78`, `src/lib/copy-prompts.ts:596`,
  `src/lib/research-prompts.ts:58`, `src/lib/visual-prompts.ts:349`
- Modificar: `src/app/products/[id]/tab-info.tsx:77`,
  `src/app/products/[id]/tab-panel.tsx:74`, `src/app/products/[id]/tab-offer.tsx`

**Interfaces:**
- Consume: `resolvePrice`, `priceLine`, `ResolvedPrice` de `@/lib/market-price`.
- Produce: `moneyForMarket(market: StoreMarket): { currency: string; locale: string }`
  en `money.ts`; el parámetro **obligatorio** `price: ResolvedPrice | null` en
  los cuatro constructores de encargo.

- [ ] **Paso 1: Añade la moneda de un mercado suelto a `money.ts`**

En `src/lib/money.ts`, después de `currencyOf`:

```ts
/**
 * Moneda y configuración regional de un mercado concreto.
 *
 * `marketMoney` las saca del mercado **del producto**, que con varios mercados
 * ya no es una pregunta con una sola respuesta. Esta las saca del mercado que se
 * está mirando, que es lo que ahora decide cómo se escribe un importe.
 */
export function moneyForMarket(market: {
  currency: string;
  languageCode: string;
  countryCode: string;
}): { currency: string; locale: string } {
  return {
    currency: market.currency || DEFAULT_CURRENCY,
    locale: `${market.languageCode}-${market.countryCode}`,
  };
}
```

- [ ] **Paso 2: Haz obligatorio el precio en los cuatro encargos**

El parámetro es **obligatorio y no tiene valor por defecto**. Es deliberado: así
`tsc` enumera todos los sitios que hay que revisar. Un valor por defecto que
cayera a `product.price` dejaría que una acción olvidada escribiera el precio del
país base dentro de un encargo general, que es un fallo silencioso.

En `src/lib/copy-prompts.ts`, sustituye la línea 78:

```ts
    `Precio: ${product.price} ${currencyOf(product, store)}`,
```

por una entrada que puede desaparecer. Cambia el array `lines` para filtrar
vacíos al final —`lines.filter(Boolean)`, como ya hace `research-prompts.ts`— y
pon:

```ts
    // Vacío en modo general: no hay un precio que valga para todos los países, y
    // escribir «Precio: 0» le dice al modelo que el producto es gratis.
    priceLine("Precio", price, currency),
```

donde `price: ResolvedPrice | null` y `currency: string` son parámetros nuevos de
`buildProductContext`. Lo mismo en `buildCompetitorSearchPrompt`
(`copy-prompts.ts:596`), con la etiqueta `Precio de referencia`.

En `src/lib/research-prompts.ts:58`, sustituye:

```ts
    product.price > 0 ? `Precio de venta: ${product.price}` : "",
```

por:

```ts
    priceLine("Precio de venta", price, currency),
```

En el mismo `lines` de `copy-prompts.ts`, sustituye las dos líneas siguientes:

```ts
    `País: ${product.country}`,
    `Idioma de salida: ${product.language}`,
```

por las que devuelve el módulo puro, que en general prohíben nombrar país:

```ts
    ...marketLines(selection, market, product.language),
```

Haz lo mismo en `research-prompts.ts` con `País objetivo` e `Idioma del cliente`.
Sin esto, el precio desaparece del encargo general pero el modelo sigue leyendo
«País: Chile» y escribe para Chile: el texto seguiría sin valer para los demás
mercados, que era el propósito entero del modo.

En `src/lib/visual-prompts.ts:349`, el patrón `pack-oferta` nombra el precio
dentro de la instrucción. En general no puede: cambia esa entrada por

```ts
    "pack-oferta": price
      ? `${product.name} en pack sobre fondo limpio, con el precio (${price.amount} ${currency}) en tipografía grande y jerarquía clara. Mucho aire alrededor.`
      // Sin precio la composición sigue teniendo sentido: es el hueco donde iría.
      : `${product.name} en pack sobre fondo limpio, con espacio libre y limpio en la parte inferior para poner después el precio. Mucho aire alrededor.`,
```

- [ ] **Paso 3: Deja que el compilador enumere los llamantes**

```bash
npx tsc --noEmit
```

Esperado: una lista de errores, uno por cada acción de servidor que construye un
encargo. En cada una, resuelve el precio con lo que ya tienes:

```ts
const prices = await listProductMarkets(product.id);
const price = resolvePrice(selection, prices);
const currency = market ? moneyForMarket(market).currency : "";
```

Ve una por una hasta que `tsc` quede limpio. **No** pongas un valor por defecto
para acallarlo: la lista es el trabajo.

- [ ] **Paso 4: Oculta el precio en las tres pantallas**

En `tab-info.tsx:77`, `tab-panel.tsx:74` y los escalones de `tab-offer.tsx`,
envuelve lo que pinta importes en `selection.kind === "market" ? … : null`. En la
ficha, en lugar del precio, en general se enseña una línea explicando por qué no
está:

```tsx
<p className="text-sm text-muted-foreground">
  Sin precio: en general no hay uno solo. Elige un mercado para verlo.
</p>
```

- [ ] **Paso 5: Comprueba a mano las dos caras**

```bash
npm run dev
```

Con un producto de dos mercados: en general no hay precio en ninguna pestaña, ni
en la gráfica de comparación del panel, ni en los escalones de la oferta. Al
elegir un mercado, vuelve. Genera un copy en general y **lee el encargo** en el
registro de ejecuciones: la línea del precio no puede estar.

- [ ] **Paso 6: Comprueba y comitea**

```bash
npx tsc --noEmit
npm run lint
npm test
git add -A
git commit -m "En modo general no hay precio, ni en pantalla ni en los encargos"
git push origin main
```

---

### Tarea 7: Precios por mercado y conversión congelada

**Ficheros:**
- Crear: `src/app/products/[id]/tab-precios.tsx`
- Crear: `src/app/products/[id]/price-actions.ts`
- Modificar: `src/app/products/[id]/page.tsx` (pestaña nueva en `TABS`)

**Interfaces:**
- Consume: `setManualPrice`, `setConvertedPrice`, `listProductMarkets` de
  `@/lib/data/product-markets`; `commercialRounding`, `isStale` de
  `@/lib/market-price`; `ensureRates`, `readRates` de `@/lib/data/fx-rates`;
  `convert`, `pickRate` de `@/lib/fx`.
- Produce: `saveManualPriceAction(formData)`, `convertPriceAction(formData)`.

- [ ] **Paso 1: Escribe las acciones**

Crea `src/app/products/[id]/price-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ensureRates } from "@/lib/data/fx-rates";
import { pickRate } from "@/lib/fx";
import { listProductMarkets, setConvertedPrice, setManualPrice } from "@/lib/data/product-markets";

/**
 * Convierte el precio base al de un mercado y **lo congela**.
 *
 * Se guardan el importe, el día y la tasa. Convertir al pintar haría que el
 * precio de la ficha cambiara solo cada mañana, y un número que baila no es un
 * precio: es lo mismo que ya se aprendió con el informe de un mes cerrado.
 *
 * El resultado nace como 'convertido', o sea, **no publicable**. Publicar exige
 * confirmarlo, y confirmarlo lo vuelve manual.
 */
export async function convertPriceAction(input: {
  productId: string;
  marketId: string;
  basePrice: number;
  baseCurrency: string;
  targetCurrency: string;
}): Promise<{ ok: boolean; message: string }> {
  const today = new Date().toISOString().slice(0, 10);

  const rates = await ensureRates([
    { day: today, from: input.baseCurrency, to: input.targetCurrency },
  ]);
  const rate = pickRate(rates, today, input.baseCurrency, input.targetCurrency);

  if (!rate) {
    return {
      ok: false,
      message: `No hay cambio de ${input.baseCurrency} a ${input.targetCurrency}. Escribe el precio a mano.`,
    };
  }

  await setConvertedPrice(input.productId, input.marketId, {
    price: Number((input.basePrice * rate.rate).toFixed(2)),
    fxDay: rate.day,
    fxRate: rate.rate,
  });

  revalidatePath(`/products/${input.productId}`);

  return {
    ok: true,
    message: rate.exact
      ? `Convertido con el cambio del ${rate.day}. Revísalo antes de publicar.`
      : `Convertido con el cambio de hoy aplicado al ${rate.day}: es una aproximación. Revísalo antes de publicar.`,
  };
}

export async function saveManualPriceAction(input: {
  productId: string;
  marketId: string;
  price: number;
}): Promise<{ ok: boolean; message: string }> {
  if (!Number.isFinite(input.price) || input.price < 0) {
    return { ok: false, message: "El precio tiene que ser un número positivo." };
  }

  await setManualPrice(input.productId, input.marketId, input.price);
  revalidatePath(`/products/${input.productId}`);

  return { ok: true, message: "Guardado. Ya se puede publicar en ese mercado." };
}
```

- [ ] **Paso 2: Escribe la pestaña**

Crea `src/app/products/[id]/tab-precios.tsx` con una fila por mercado del
producto. El cuerpo de cada fila:

```tsx
function PriceRow({ market, entry, productId, base }: PriceRowProps) {
  const today = new Date().toISOString().slice(0, 10);
  const rounded =
    entry.price !== null ? commercialRounding(entry.price, market.currency) : null;

  return (
    <div className="flex items-center justify-between gap-4 border-b py-3">
      <div>
        <p className="font-medium">{marketLabel(market)}</p>

        {entry.source === "convertido" ? (
          <p className="text-sm text-muted-foreground">
            {formatMoney(entry.price ?? 0, moneyForMarket(market))} · convertido con el cambio
            del {entry.fxDay}
            {isStale(entry.fxDay, today) ? " — hace más de un mes, conviene rehacerla" : ""}
          </p>
        ) : null}

        {entry.source === "manual" ? (
          <p className="text-sm text-muted-foreground">
            {formatMoney(entry.price ?? 0, moneyForMarket(market))} · escrito a mano
          </p>
        ) : null}

        {entry.source === "ninguno" ? (
          <p className="text-sm text-muted-foreground">Sin precio: este mercado no se puede publicar.</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/*
          Confirmar un convertido es lo que lo vuelve publicable. Se ofrecen los
          dos números —el convertido tal cual y el redondeo comercial— y elige
          una persona: aplicar el redondeo solo es cómo 9.990 se convierte en
          10.000 en la página de alguien.
        */}
        {entry.source === "convertido" && entry.price !== null ? (
          <>
            <ConfirmButton productId={productId} marketId={market.id} price={entry.price}>
              Usar {formatMoney(entry.price, moneyForMarket(market))}
            </ConfirmButton>
            {rounded !== null ? (
              <ConfirmButton productId={productId} marketId={market.id} price={rounded}>
                Redondear a {formatMoney(rounded, moneyForMarket(market))}
              </ConfirmButton>
            ) : null}
          </>
        ) : null}

        {/*
          Sobre un precio manual no se ofrece convertir. El filtro de la consulta
          ya lo impide, pero un botón que no puede hacer nada es peor que no
          tenerlo: invita a pulsarlo y a no entender por qué no pasa nada.
        */}
        {entry.source !== "manual" ? (
          <ConvertButton
            productId={productId}
            marketId={market.id}
            basePrice={base.price}
            baseCurrency={base.currency}
            targetCurrency={market.currency}
          />
        ) : null}

        <ManualPriceField productId={productId} marketId={market.id} value={entry.price} />
      </div>
    </div>
  );
}
```

- Si el origen es `convertido`, la fila lleva un aviso —«convertido con el cambio
  del 1 de julio», y «esta conversión tiene más de un mes» si `isStale` dice que
  sí— y **dos** botones de confirmación: el importe convertido tal cual, y el que
  devuelva `commercialRounding`. Los dos llaman a `saveManualPriceAction`.
  Cuando `commercialRounding` devuelve `null` no se pinta el segundo botón: no
  hay redondeo que proponer y un botón que repite el mismo número es ruido.
- Si el origen es `ninguno`, un campo para escribirlo y un botón de convertir
  desde el base.
- Si es `manual`, el precio y un campo para cambiarlo. **Sin** botón de
  convertir: convertir sobre un precio escrito a mano es justo lo que no puede
  pasar, y quitarlo de la pantalla es más fiable que confiar en el filtro de la
  consulta, aunque el filtro también esté.

Añade `{ id: "precios", label: "Precios" }` a `TABS` en `page.tsx`, después de
`info`. La pestaña solo se enseña cuando `showSelector(marketIds)` es cierto: con
un mercado no hay nada que decidir.

- [ ] **Paso 3: Compruébalo con los tres casos**

```bash
npm run dev
```

En un producto con dos mercados: convierte a uno, comprueba que sale marcado como
convertido y con la fecha; escribe el otro a mano y comprueba que **no** ofrece
convertir. Después vuelve a convertir el primero y comprueba en la base que el
manual sigue intacto:

```sql
select market_id, price, price_source, price_fx_day
from public.product_markets
where product_id = '<id>';
```

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit
npm run lint
npm test
git add -A
git commit -m "Precios por mercado, con la conversión congelada al fijarla"
git push origin main
```

---

### Tarea 8: La migración de las etiquetas

**Ficheros:**
- Crear: `supabase/migrations/20260812000600_mercado_en_piezas.sql`
- Modificar: `src/types/database.ts` (regenerado)

**Interfaces:**
- Consume: `public.product_markets` de la tarea 3.
- Produce: la columna `market_id` en doce tablas.

- [ ] **Paso 1: Escribe la migración**

Crea `supabase/migrations/20260812000600_mercado_en_piezas.sql`:

```sql
-- ---------------------------------------------------------------------------
-- De qué mercado es cada pieza.
--
-- `null` significa **general**: vale en todos los mercados del producto. Con eso
-- el filtro es una sola regla —en un mercado se ve lo suyo y lo general; en
-- general solo lo general— escrita una vez en la capa de datos.
--
-- `on delete set null` y no `cascade`: borrar un mercado no puede llevarse por
-- delante los copys y las landings que se escribieron para él. Quedan como
-- generales, que es discutible, pero perder el trabajo no lo es.
--
-- `instagram_posts` **no** entra: se está construyendo el agente de contenido y
-- tocar su cola ahora es pelearse por el mismo archivo. Queda pendiente.
-- ---------------------------------------------------------------------------

do $$
declare
  tabla text;
  tablas text[] := array[
    'copies', 'angles', 'hooks', 'short_ads', 'landing_pages', 'prelandings',
    'landing_experiments', 'videos', 'product_images', 'performance_records',
    'campaigns', 'research_documents'
  ];
begin
  foreach tabla in array tablas loop
    execute format(
      'alter table public.%I add column if not exists market_id uuid'
      || ' references public.store_markets (id) on delete set null', tabla);

    execute format(
      'create index if not exists %I on public.%I (product_id, market_id)',
      tabla || '_market_idx', tabla);

    -- Lo existente se etiqueta con el mercado que el producto tiene hoy, que es
    -- la verdad de cómo se generó. Dejarlo en `null` lo marcaría como «vale en
    -- todos los países», que es plausible y falso: el peor par.
    execute format(
      'update public.%I t set market_id = p.market_id from public.products p'
      || ' where t.product_id = p.id and t.market_id is null and p.market_id is not null',
      tabla);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- La unicidad de los documentos, que cambia de forma.
--
-- Era `unique (product_id, document_id)`. Al añadir el mercado hace falta
-- `nulls not distinct`: Postgres considera dos `null` distintos entre sí, así
-- que sin eso se pueden crear **dos documentos generales del mismo tipo** y la
-- pantalla enseñaría uno de los dos según el orden de la consulta.
-- ---------------------------------------------------------------------------

alter table public.research_documents
  drop constraint if exists research_documents_product_id_document_id_key;

drop index if exists research_documents_unico;
create unique index research_documents_unico
  on public.research_documents (product_id, document_id, market_id)
  nulls not distinct;
```

- [ ] **Paso 2: Aplícala y comprueba el etiquetado**

```bash
npm run db:push
```

Ninguna pieza de un producto con mercado puede haber quedado sin etiquetar. Tiene
que devolver **cero**:

```sql
select count(*)
from public.copies c
join public.products p on p.id = c.product_id
where p.market_id is not null and c.market_id is null;
```

Repite la comprobación con `landing_pages` y `research_documents`, que son las
tres que más duelen si se quedan en general.

- [ ] **Paso 3: Regenera los tipos y comitea**

```bash
npm run db:types
npx tsc --noEmit
git add supabase/migrations/20260812000600_mercado_en_piezas.sql src/types/database.ts
git commit -m "Migración: cada pieza recuerda para qué mercado se hizo"
git push origin main
```

---

### Tarea 9: El filtro y el sello, en la capa de datos

**Ficheros:**
- Modificar: `src/lib/data/copy.ts` (`angles` en :43, `copies` en :168),
  `src/lib/data/research.ts` (`research_documents` en :49, `hooks` en :167),
  `src/lib/data/performance.ts:47`, `src/lib/data/landings.ts:86`,
  `src/lib/data/videos.ts:106`, `src/lib/data/images.ts:102`,
  `src/lib/data/campaigns.ts` (`prelandings` en :43, `campaigns` en :149,
  `short_ads` en :221), `src/lib/data/experiments.ts:12`
- Crear: `src/lib/market-filter.ts`

**Interfaces:**
- Consume: `Selection` de `@/lib/market-price`.
- Produce: `marketFilter(selection: Selection): string`, para pasarlo a `.or()`
  de Supabase; y el parámetro `selection` en los doce lectores.

- [ ] **Paso 1: Escribe el traductor del filtro**

Crea `src/lib/market-filter.ts`:

```ts
import type { Selection } from "@/lib/market-price";

/**
 * El filtro de mercado, en el idioma de PostgREST.
 *
 * En un mercado se ve lo suyo **y** lo general; en general solo lo general. Vive
 * en un sitio y no en cada lector porque doce copias de una condición son doce
 * sitios donde escribirla al revés, y escrita al revés no falla: enseña de menos
 * o —peor— enseña el copy de otro país.
 */
export function marketFilter(selection: Selection): string {
  if (selection.kind === "general") return "market_id.is.null";
  return `market_id.is.null,market_id.eq.${selection.marketId}`;
}
```

- [ ] **Paso 2: Aplícalo en los doce lectores**

En cada uno, añade `selection: Selection` como parámetro y encadena `.or()` justo
después del `.eq("product_id", …)`. Por ejemplo, en `src/lib/data/copy.ts:168`:

```ts
export async function readCopies(productId: string, selection: Selection): Promise<GeneratedCopy[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("copies")
    .select("*")
    .eq("product_id", productId)
    .or(marketFilter(selection))
    .order("created_at", { ascending: false });
```

Repite el mismo patrón exacto en los once restantes. Deja `tsc` como guía: al
hacer el parámetro obligatorio, enumera todas las pantallas que hay que tocar.

- [ ] **Paso 3: Sella el mercado al generar**

Toda acción que **crea** una pieza recibe el mercado del selector y lo escribe.
El sello sale siempre de `stampFor(selection)`, nunca de `product.marketId`: son
cosas distintas y confundirlas es lo que hace que una pieza escrita en general
acabe marcada con el país base.

En cada acción de `src/app/products/[id]/*-actions.ts` que inserte en una de las
doce tablas, añade al `insert`:

```ts
    market_id: stampFor(selection),
```

Son las acciones de `generate-actions.ts`, `landing-actions.ts`,
`video-actions.ts`, `image-generate-actions.ts`, `research-actions.ts`,
`beats-actions.ts`, `offer-actions.ts`, `performance-actions.ts`,
`swipe-actions.ts`, `agent-actions.ts`, `job-actions.ts` y
`image-actions.ts`. Recorre `tsc` hasta que no quede ninguna.

- [ ] **Paso 4: Compruébalo con los dos modos**

```bash
npm run dev
```

En un producto de dos mercados: genera un gancho en general y otro en México.
En general tiene que verse **solo** el primero; en México, los dos; en Chile,
solo el general. Después, en la base:

```sql
select market_id, count(*) from public.hooks where product_id = '<id>' group by market_id;
```

- [ ] **Paso 5: Comprueba y comitea**

```bash
npx tsc --noEmit
npm run lint
npm test
git add -A
git commit -m "Filtro por mercado en los lectores y sello al generar"
git push origin main
```

---

### Tarea 10: El interruptor de la investigación

La columna existe desde la tarea 3 y nadie la lee todavía. Esta tarea es la que
la conecta, y es la que decide si el modo general puede escribir copys o no.

**Ficheros:**
- Modificar: `src/lib/data/research.ts:49` (lectura), `:104` y `:124` (escritura)
- Modificar: `src/app/products/[id]/edit/edit-product-form.tsx`
- Modificar: `src/app/products/[id]/tab-documents.tsx`

**Interfaces:**
- Consume: `Product.researchShared`, `stampFor`, `marketFilter`.
- Produce: nada nuevo hacia fuera.

- [ ] **Paso 1: Que la escritura respete el interruptor**

En `src/lib/data/research.ts`, donde se guarda un documento (`:124`), el sello no
puede salir del selector a secas:

```ts
      // Con la investigación compartida, los documentos son del producto y se
      // guardan sin mercado. Sellarlos con el país haría que el mismo informe se
      // regenerara —y se pagara— una vez por mercado.
      market_id: product.researchShared ? null : stampFor(selection),
```

Y la lectura (`:49`) usa el mismo criterio: compartida lee siempre lo general,
por mercado usa `marketFilter(selection)`.

```ts
  const filter = product.researchShared ? "market_id.is.null" : marketFilter(selection);
```

- [ ] **Paso 2: Pon el interruptor en el formulario**

En `edit-product-form.tsx`, junto al selector de mercado, una casilla:

```tsx
<label className="flex items-start gap-2 text-sm">
  <input
    type="checkbox"
    checked={form.researchShared}
    onChange={(event) => update("researchShared", event.target.checked)}
  />
  <span>
    La investigación vale para todos los mercados
    <span className="block text-muted-foreground">
      Apagado, cada mercado tiene la suya: el público de Chile y el de México no
      son el mismo. Encendido, se escribe una vez y el modo general puede usarla.
    </span>
  </span>
</label>
```

- [ ] **Paso 3: Di en Documentos por qué no se puede generar en general**

Cuando el interruptor está apagado y el modo es general, la pestaña de documentos
no puede generar nada. En vez de un botón que falla, la explicación:

```tsx
{selection.kind === "general" && !product.researchShared ? (
  <p className="rounded-md border p-3 text-sm text-muted-foreground">
    Este producto tiene una investigación por mercado, así que en general no hay
    ninguna que usar. Elige un mercado, o marca «la investigación vale para todos
    los mercados» en Editar producto.
  </p>
) : null}
```

Lo mismo en las pestañas que dependen de la investigación —Ángulos, Copys y
Landings—, con el botón de generar desactivado y ese mismo texto. Un botón que
falla al pulsarlo cuesta una generación y una explicación; decirlo antes, nada.

- [ ] **Paso 4: Compruébalo en los dos estados**

Con el interruptor apagado, en general: los documentos no se pueden generar y se
explica. Enciéndelo: los documentos existentes —que están sellados con su
mercado— **dejan de verse**, porque ahora se leen los generales, que no hay. Es
correcto y hay que verlo para creerlo; si te resulta inaceptable, es una decisión
de producto que hay que llevar a la spec, no un fallo que tapar aquí.

- [ ] **Paso 5: Comprueba y comitea**

```bash
npx tsc --noEmit
npm run lint
npm test
git add -A
git commit -m "El interruptor de investigación compartida, conectado"
git push origin main
```

---

### Tarea 11: «Vale en todos los mercados»

Sin esto, general es un estado al que no se puede llegar: todo lo que se genera
en un mercado se queda ahí para siempre.

**Ficheros:**
- Crear: `src/app/products/[id]/market-tag-actions.ts`
- Modificar: las pestañas que listan piezas —`tab-copys.tsx`, `tab-hooks.tsx`,
  `tab-images.tsx`, `tab-videos.tsx`, `tab-angles.tsx`

**Interfaces:**
- Consume: nada nuevo.
- Produce: `promoteToGeneralAction(table: string, id: string, productId: string)`.

- [ ] **Paso 1: Escribe la acción**

Crea `src/app/products/[id]/market-tag-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/supabase/session";

/*
 * La lista blanca no es paranoia de seguridad —RLS ya acota—: es que un nombre
 * de tabla que llegue del navegador y no esté aquí falla con un error claro en
 * vez de con un mensaje de PostgREST sobre una relación que no existe.
 */
const TAGGABLE = [
  "copies", "angles", "hooks", "short_ads", "landing_pages", "prelandings",
  "landing_experiments", "videos", "product_images", "campaigns",
] as const;

type Taggable = (typeof TAGGABLE)[number];

/**
 * Marca una pieza como «vale en todos los mercados».
 *
 * Solo se llega a general a propósito, con este botón. Nada nace general por
 * descuido: una pieza mal marcada se publicaría en el país equivocado, y ese es
 * exactamente el error que todo esto existe para evitar.
 *
 * `performance_records` no está en la lista y no puede estarlo: el rendimiento es
 * del mercado donde se midió. Lo que funcionó en Chile es una hipótesis en
 * México, no un dato.
 */
export async function promoteToGeneralAction(
  table: Taggable,
  id: string,
  productId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!TAGGABLE.includes(table)) {
    return { ok: false, message: "Esa lista no lleva mercado." };
  }

  const { supabase } = await requireContext();

  const { error } = await supabase.from(table).update({ market_id: null }).eq("id", id);
  if (error) return { ok: false, message: `No se pudo marcar: ${error.message}` };

  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Marcada como válida en todos los mercados." };
}
```

- [ ] **Paso 2: Enseña la insignia y el botón**

En cada pestaña que lista piezas, junto al título de cada una:

- si `market_id` es `null`, una insignia «General». Estando en un mercado, esa
  insignia va acompañada del botón de **adaptar** que ya existe
  (`adapt-prompt.ts`, `image-adapt.ts`): una pieza general no lleva precio ni
  acento local, así que no puede publicarse tal cual en un país sin pasar por
  ahí;
- si no lo es, la etiqueta del mercado y el botón «Vale en todos los mercados»,
  que llama a `promoteToGeneralAction`.

- [ ] **Paso 3: Compruébalo**

Marca un vídeo sin voz como general estando en México y comprueba que pasa a
verse también desde Chile y desde general.

- [ ] **Paso 4: Comprueba y comitea**

```bash
npx tsc --noEmit
npm run lint
git add -A
git commit -m "Marcar una pieza como válida en todos los mercados"
git push origin main
```

---

### Tarea 12: Publicar por mercado

**Ficheros:**
- Crear: `src/lib/market-slug.ts`
- Test: `src/lib/market-slug.test.ts`
- Modificar: `src/app/products/[id]/landing-actions.ts` (la publicación, alrededor
  de la línea 836 donde se envía `handle: page.slug`)

**Interfaces:**
- Consume: `canPublish`, `resolvePrice` de `@/lib/market-price`.
- Produce: `slugForMarket(baseSlug: string, market: { countryCode: string; languageCode: string }): string`

- [ ] **Paso 1: Escribe el test que falla**

Crea `src/lib/market-slug.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { slugForMarket } from "./market-slug.ts";

const cl = { countryCode: "CL", languageCode: "es" };
const mx = { countryCode: "MX", languageCode: "es" };

test("el slug lleva el mercado dentro", () => {
  assert.equal(slugForMarket("oferta-verano", cl), "oferta-verano-es-cl");
});

test("dos mercados del mismo producto nunca dan el mismo slug", () => {
  // Es la comprobación que importa: con el mismo slug, publicar en el segundo
  // mercado **pisa la página del primero** sin avisar, porque para Shopify es el
  // mismo `handle`.
  assert.notEqual(slugForMarket("oferta-verano", cl), slugForMarket("oferta-verano", mx));
});

test("publicar dos veces en el mismo mercado da el mismo slug: actualiza, no duplica", () => {
  assert.equal(slugForMarket("oferta-verano", cl), slugForMarket("oferta-verano", cl));
});

test("un slug que ya lleva el sufijo no lo repite", () => {
  assert.equal(slugForMarket("oferta-verano-es-cl", cl), "oferta-verano-es-cl");
});
```

- [ ] **Paso 2: Ejecuta el test y comprueba que falla**

```bash
npm test -- --test-name-pattern="slug"
```

- [ ] **Paso 3: Escribe el módulo**

Crea `src/lib/market-slug.ts`:

```ts
/**
 * El identificador de la página de una landing en un mercado.
 *
 * Sin imports, probado en `market-slug.test.ts`.
 *
 * ## Por qué el mercado va dentro del slug
 *
 * Porque una landing se publica como página de Shopify con `handle: slug`, y si
 * dos mercados publican con el mismo, **la segunda publicación pisa la página de
 * la primera** sin dar ningún error. Es el fallo más caro posible aquí: se pierde
 * una página que estaba vendiendo y nadie se entera hasta que alguien la mira.
 *
 * El sufijo es idioma-país y no el id del mercado: sale en la URL, así que tiene
 * que poder leerlo una persona.
 */
export function slugForMarket(
  baseSlug: string,
  market: { countryCode: string; languageCode: string },
): string {
  const suffix = `${market.languageCode}-${market.countryCode}`.toLowerCase();
  const clean = baseSlug.replace(/\/+$/, "");

  // Republicar no puede ir acumulando sufijos: sería una página nueva cada vez y
  // la anterior quedaría publicada y huérfana.
  return clean.endsWith(`-${suffix}`) ? clean : `${clean}-${suffix}`;
}
```

- [ ] **Paso 4: Ejecuta el test y comprueba que pasa**

```bash
npm test
```

- [ ] **Paso 5: Pon las tres comprobaciones en la publicación**

En `src/app/products/[id]/landing-actions.ts`, al principio de la acción que
publica, antes de subir nada:

```ts
  // 1. Sin mercado no hay dónde publicar: el dominio y el prefijo de ruta salen
  //    de él. Publicar desde general es siempre elegir un mercado antes.
  if (selection.kind === "general") {
    return { ok: false, message: "Elige un mercado antes de publicar: la página se publica en su dominio." };
  }

  // 2. Un precio convertido no sale a la calle. «$10.847» se lee como un error
  //    de la tienda; confirmarlo es un clic y lo vuelve manual.
  const price = resolvePrice(selection, await listProductMarkets(productId));
  if (!canPublish(price)) {
    return {
      ok: false,
      message: price
        ? "El precio de este mercado es convertido. Confírmalo en Precios antes de publicar."
        : "Este mercado no tiene precio. Ponlo en Precios antes de publicar.",
    };
  }
```

Y donde hoy se envía `handle: page.slug` (línea 836), pasa por el módulo:

```ts
        handle: slugForMarket(page.slug, market),
```

La tercera comprobación —que solo se publiquen piezas de ese mercado o
generales— ya la da el filtro de la tarea 9: la publicación lee con la misma
`selection`. Comprueba que la lectura de secciones e imágenes de esta acción pasa
por los lectores filtrados y no por una consulta suelta.

- [ ] **Paso 6: Compruébalo, incluida la parte que tiene que fallar**

```bash
npm run dev
```

Intenta publicar desde general: tiene que negarse con el mensaje. Intenta
publicar en un mercado con precio convertido: tiene que negarse. Confirma el
precio y publica: tiene que subir. Publica el mismo producto en el otro mercado y
comprueba **en Shopify** que hay dos páginas con handles distintos y que la
primera sigue con su contenido.

- [ ] **Paso 7: Comprueba y comitea**

```bash
npx tsc --noEmit
npm run lint
npm test
git add -A
git commit -m "Publicar por mercado: un slug por país y las tres comprobaciones"
git push origin main
```

---

## Lo que este plan deja fuera, a propósito

Está en la spec y se repite aquí para que no se cuele por descuido:

- **Instagram.** `instagram_posts` no recibe etiqueta y la cola no se toca,
  mientras se construye el agente de contenido (`docs/agente-cm.md`).
- **`offer_tiers` por mercado.** En este plan los escalones solo se ocultan en
  general (tarea 6).
- **`product_offers.free_shipping_threshold`**, que es dinero y sigue sin país.
- **Los idiomas de Shopify** (Translate & Adapt): sirven para traducir la misma
  página, y aquí se escribe copy distinto por país.
