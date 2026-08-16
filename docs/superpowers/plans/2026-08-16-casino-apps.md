# Las apps de casino — plan

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA:
> `superpowers:subagent-driven-development` o `superpowers:executing-plans`.

**Objetivo:** que dentro de un producto de casino haya apps con su enfoque, que
los ángulos puedan ser suyos o generales, que los copys se escriban para una app,
y que una foto de producto sea un teléfono con **esa** app en pantalla.

**Arquitectura:** una tabla `apps` colgando del producto y un `app_id` **nulable**
en `angles`, `copies` y `product_images`. Nulo significa «general» en los tres, y
es el mismo significado que ya tiene `market_id` en esas tablas.

**Spec:** `docs/superpowers/specs/2026-08-16-casino-apps-design.md`

## Restricciones globales

- **Nunca ejecutes prettier.**
- **Toda tabla nueva lleva `workspace_id`, su política y el disparador
  `poner_espacio`.** Sin eso no la ve nadie, o la ve todo el mundo.
- **`create policy` no admite `if not exists`**: cada política lleva delante su
  `drop policy if exists`, porque las migraciones se reejecutan en cada
  despliegue.
- **No añadas `.eq("user_id", …)`** a ninguna consulta de lectura.
- **`database.ts` está escrito a mano.**
- **Comentarios en español**, explicando **por qué**.
- Comprobaciones: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.

---

### Tarea 1: La tabla `apps` y su pantalla

**Ficheros:** `supabase/migrations/20260816000300_apps_de_casino.sql`,
`src/types/database.ts`, `src/types/app.ts` (nuevo), `src/lib/data/apps.ts`
(nuevo), `src/app/products/[id]/tab-apps.tsx` (nuevo),
`src/app/products/[id]/app-actions.ts` (nuevo), `page.tsx`

- [ ] **Paso 1: La migración**, con la tabla, su índice, RLS por espacio y el
  disparador, siguiendo el patrón de `product_markets`.
- [ ] **Paso 2: `npm run db:push && npm run db:verify`**
- [ ] **Paso 3: `AppRow` en `database.ts`** y el tipo `CasinoApp` en `types/app.ts`.
- [ ] **Paso 4: `listApps`, `saveApp`, `deleteApp`** en `src/lib/data/apps.ts`.
- [ ] **Paso 5: La pestaña**, visible solo en el vertical de casino.
- [ ] **Paso 6:** comprobar y comitear.

---

### Tarea 2: Un ángulo es de una app o es general

**Ficheros:** la misma migración, `src/types/copy.ts`, `src/lib/data/copy.ts`,
`src/app/products/[id]/tab-angles.tsx`

- [ ] **Paso 1: El test que falla**, en `src/lib/apps-alcance.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { anglesForApp } from "./apps-alcance.ts";

const generales = [{ id: "g1", appId: undefined }];
const deApp = [{ id: "a1", appId: "app-1" }];

test("un ángulo general se ofrece para cualquier app", () => {
  assert.deepEqual(anglesForApp([...generales, ...deApp], "app-2").map((a) => a.id), ["g1"]);
});

test("el de una app se ofrece con los generales, solo en la suya", () => {
  assert.deepEqual(
    anglesForApp([...generales, ...deApp], "app-1").map((a) => a.id),
    ["g1", "a1"],
  );
});

test("sin app elegida se ven todos, que es la lista completa del producto", () => {
  assert.equal(anglesForApp([...generales, ...deApp], "").length, 2);
});
```

- [ ] **Paso 2: Ejecuta y comprueba que falla.**
- [ ] **Paso 3: El módulo puro `src/lib/apps-alcance.ts`.**
- [ ] **Paso 4: `angles.app_id`** en la migración, `database.ts`, `MarketingAngle`
  y el mapeador, más el selector en la pantalla de ángulos.
- [ ] **Paso 5:** comprobar y comitear.

---

### Tarea 3: El copy se escribe para una app

**Ficheros:** la misma migración, `src/types/copy.ts`, `src/lib/data/copy.ts`,
`src/lib/copy-prompts.ts`, `src/app/products/[id]/tab-copys.tsx`

- [ ] **Paso 1: `copies.app_id`** en migración, tipos y mapeador.
- [ ] **Paso 2: El bloque de la app en el encargo**, con su nombre, su enfoque y
  su enlace de descarga, dentro de `buildProductContext`.
- [ ] **Paso 3: El selector de app** en la pantalla de copys, que filtra los
  ángulos con `anglesForApp`.
- [ ] **Paso 4:** comprobar y comitear.

---

### Tarea 4: El método del testimonio

**Ficheros:** `src/types/copy.ts`

- [ ] **Paso 1: El método nuevo**, con sus seis partes, su narrador, su rango de
  palabras y su `whenToUse`, siguiendo la forma de `advertorial-trial`.
- [ ] **Paso 2:** comprobar y comitear.

---

### Tarea 5: El teléfono con la app

**Ficheros:** la misma migración, `src/types/visuals.ts`,
`src/app/products/[id]/image-generate-actions.ts:88`

- [ ] **Paso 1: `product_images.app_id`** y el patrón `captura-app`.
- [ ] **Paso 2: Los dos patrones** `app-en-movil` y `app-en-mano`, con su ficha.
- [ ] **Paso 3: La referencia sale de la app**: `readReferenceBytes` acepta un
  `appId` y devuelve su captura cuando la hay.
- [ ] **Paso 4:** comprobar y comitear.

## Lo que este plan deja fuera

- Adaptar un ángulo general a una app con una llamada.
- Reutilizar una app entre países.
- Medir qué app rinde.
