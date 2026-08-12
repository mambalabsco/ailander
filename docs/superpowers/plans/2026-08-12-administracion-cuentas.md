# Administración de cuentas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que quien manda en un espacio pueda mandarle a otra persona el enlace de recuperación, fijarle la contraseña cuando ya no tiene acceso, y proponerle un correo nuevo que confirma ella — y que administrar personas deje de ser global para pasar a ser por espacio.

**Architecture:** Las reglas de quién puede tocar a quién son puras y viven en `roles.ts`, al lado de `canAssign`. La base de datos las repite por debajo con `mando_sobre(persona)`, una función `security definer` hermana de `manda_en`. La clave de servicio se usa en **una sola llamada de todo el trabajo** —fijar una contraseña— porque el cambio de correo lo confirma la persona desde su propia sesión y el enlace de recuperación lo manda `resetPasswordForEmail`.

**Tech Stack:** Next.js 16 (acciones de servidor), Supabase (Postgres + Auth + RLS), `@supabase/supabase-js` 2.110.9, TypeScript, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-12-administracion-cuentas-design.md`

## Global Constraints

- **Comentarios en español, explicando por qué y no qué.** Los que valen cuentan el fallo que evitan. Mirar los que ya hay antes de escribir los tuyos.
- **Nunca ejecutar prettier.** El proyecto no tiene configuración y reformatea a 80 columnas cuando el código está a 100.
- **Los tests importan con ruta relativa** (`./roles.ts`), no con el alias `@/lib/roles`: el corredor de Node no resuelve el alias. Y solo se prueban módulos puros: lo que importa `server-only` no se puede cargar desde un test.
- **`create policy` no admite `if not exists`**: cada una lleva su `drop policy if exists` delante.
- **La longitud mínima de contraseña es 8**, que es lo que declara `minimum_password_length` en `supabase/config.toml`. No inventar otro número.
- **La contraseña no entra nunca en `audit_log`.**
- Comandos: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run db:push`.
- Tras cada commit, `git push origin main`: el despliegue del servidor hace `git pull`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/roles.ts` (modificar) | `canManageAccount`: puro, mismas reglas y mismo `RANK` que `canAssign`. |
| `src/lib/account-rules.ts` (crear) | Puro: `passwordProblem` y `emailProblem`. Aparte de `roles.ts` porque no habla de permisos sino de formatos. |
| `supabase/migrations/20260812000300_personas_por_espacio.sql` (crear) | `mando_sobre`, `comparte_espacio`, y las políticas de `profiles` y `audit_log` que hoy son globales. |
| `supabase/migrations/20260812000400_correo_propuesto.sql` (crear) | La tabla `pending_email_changes` y el disparador que sincroniza `profiles.email`. |
| `src/types/database.ts` (modificar) | La fila nueva y la función `mando_sobre` para poder llamarla con `rpc`. |
| `src/lib/data/people-admin.ts` (crear) | La única capa que toca `createAdminClient()`. Una función: `setPassword`. |
| `src/lib/data/email-changes.ts` (crear) | Las propuestas de correo, con el cliente de sesión y RLS. |
| `src/app/admin/actions.ts` (modificar) | Las tres acciones del admin. |
| `src/app/cuenta/actions.ts` (crear) | Las dos de la persona: confirmar y rechazar. Aparte de las del admin porque la frontera es justo esa —lo que uno hace con su cuenta contra lo que hacen con la de otro— y mezclarlas invita a copiar una comprobación donde no vale. |
| `src/components/person-access.tsx` (crear) | El bloque «Acceso» de cada fila. Fuera de `admin-people.tsx` para que ese archivo no se convierta en el que lo hace todo. |
| `src/components/pending-email-notice.tsx` (crear) | El aviso de `/cuenta`. |
| `src/app/admin/page.tsx`, `src/components/admin-people.tsx`, `src/app/cuenta/page.tsx` (modificar) | Montar lo anterior. |
| `docs/pendiente.md`, `docs/equipo-compartido.md` (modificar) | Lo que deja de faltar, y lo que la sonda descubrió de paso. |

---

### Task 1: Las reglas puras

**Files:**
- Modify: `src/lib/roles.ts` (después de `canDisable`, sobre la línea 247)
- Modify: `src/lib/roles.test.ts`
- Create: `src/lib/account-rules.ts`
- Create: `src/lib/account-rules.test.ts`

**Interfaces:**
- Consumes: `Member`, `RANK`, `can` — ya existen en `roles.ts`.
- Produces:
  - `canManageAccount(actor: Member, target: Member): { ok: true } | { ok: false; reason: string }`
  - `passwordProblem(value: string): string | null`
  - `emailProblem(value: string, actual: string): string | null`
  - Las tres devuelven el motivo en español, listo para enseñar.

- [ ] **Step 1: Write the failing test**

Añadir al final de `src/lib/roles.test.ts`:

```ts
/* --------------------- Administrar la cuenta de otro ----------------------- */

test("a uno mismo no se le administra la cuenta: para eso está /cuenta", () => {
  const yo = { id: "a", role: "admin" as const };

  const result = canManageAccount(yo, yo);

  assert.equal(result.ok, false);
});

test("al dueño no le administra la cuenta ni un admin", () => {
  // Es la cuenta que no se puede perder: si un admin pudiera fijarle la
  // contraseña, un admin equivocado se queda con la plataforma.
  const result = canManageAccount({ id: "a", role: "admin" }, { id: "b", role: "dueño" });

  assert.equal(result.ok, false);
});

test("nadie administra la cuenta de alguien de rango mayor", () => {
  const result = canManageAccount({ id: "a", role: "editor" }, { id: "b", role: "admin" });

  assert.equal(result.ok, false);
});

test("sin el permiso de personas, no", () => {
  const result = canManageAccount({ id: "a", role: "redactor" }, { id: "b", role: "editor" });

  assert.equal(result.ok, false);
});

test("un admin sí administra la cuenta de un editor", () => {
  const result = canManageAccount({ id: "a", role: "admin" }, { id: "b", role: "editor" });

  assert.equal(result.ok, true);
});

test("cada negativa dice por qué, y no la misma frase", () => {
  // Un «no puedes» sin motivo obliga a adivinar cuál de las tres reglas saltó.
  const yo = { id: "a", role: "admin" as const };
  const motivos = new Set(
    [
      canManageAccount(yo, yo),
      canManageAccount(yo, { id: "b", role: "dueño" }),
      canManageAccount({ id: "c", role: "redactor" }, { id: "b", role: "editor" }),
    ].map((result) => (result.ok ? "" : result.reason)),
  );

  assert.equal(motivos.size, 3);
});
```

Y añadir `canManageAccount` a la lista de importaciones de la cabecera del archivo (la que ya trae `canAssign`, `canDisable`…).

Crear `src/lib/account-rules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { emailProblem, passwordProblem } from "./account-rules.ts";

test("la contraseña corta se rechaza con el número que dice config.toml", () => {
  assert.match(passwordProblem("1234567") ?? "", /8/);
});

test("ocho caracteres justos valen", () => {
  assert.equal(passwordProblem("12345678"), null);
});

test("la contraseña vacía no es «corta», es que falta", () => {
  // El mensaje importa: «debe tener 8 caracteres» ante un campo vacío hace
  // pensar que se envió algo y no era suficiente.
  assert.match(passwordProblem("") ?? "", /escribe/i);
});

test("los espacios de los extremos no cuentan como longitud", () => {
  assert.notEqual(passwordProblem("  1234  "), null);
});

test("un correo sin arroba no vale", () => {
  assert.notEqual(emailProblem("pedro.ejemplo.com", "pedro@ejemplo.com"), null);
});

test("proponer el correo que ya tiene no es un cambio", () => {
  assert.notEqual(emailProblem("pedro@ejemplo.com", "pedro@ejemplo.com"), null);
});

test("el mismo correo con otras mayúsculas tampoco es un cambio", () => {
  // Supabase guarda el correo en minúsculas; sin normalizar, «Pedro@…»
  // parecería un cambio, se propondría, y al confirmar no cambiaría nada.
  assert.notEqual(emailProblem("Pedro@Ejemplo.com", "pedro@ejemplo.com"), null);
});

test("un correo nuevo y bien escrito pasa", () => {
  assert.equal(emailProblem("nuevo@ejemplo.com", "pedro@ejemplo.com"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test 2>&1 | tail -20
```

Esperado: falla al importar `./account-rules.ts` (no existe) y `canManageAccount` no está exportado.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/roles.ts`, justo después de `canDisable`:

```ts
/**
 * Si alguien puede administrar la **cuenta** de otro: su contraseña y su correo.
 *
 * Son las mismas tres reglas que `canAssign` porque protegen lo mismo, solo que
 * aquí lo que está en juego es mayor: quien fija una contraseña puede entrar en
 * esa cuenta y leerlo todo como esa persona.
 *
 * Sobre uno mismo devuelve que no, y no es una limitación: cambiar lo de uno se
 * hace en `/cuenta`, donde Supabase pide la contraseña actual. Permitirlo aquí
 * sería un camino para saltarse esa comprobación.
 */
export function canManageAccount(
  actor: Member,
  target: Member,
): { ok: true } | { ok: false; reason: string } {
  if (!can(actor.role, "personas")) {
    return { ok: false, reason: "No tienes permiso para gestionar personas." };
  }

  if (actor.id === target.id) {
    return { ok: false, reason: "Lo tuyo se cambia en «Tu cuenta»." };
  }

  if (target.role === "dueño") {
    return { ok: false, reason: "Al dueño no se le administra la cuenta." };
  }

  if (RANK[target.role] > RANK[actor.role]) {
    return { ok: false, reason: "No puedes administrar la cuenta de alguien por encima de ti." };
  }

  return { ok: true };
}
```

Crear `src/lib/account-rules.ts`:

```ts
/**
 * Lo que hay que comprobar antes de tocar la cuenta de alguien.
 *
 * Sin imports y sin base de datos, para poder probarlo entero. Devuelven el
 * motivo en español o `null` cuando no hay problema — así quien llama escribe
 * `const problema = passwordProblem(x); if (problema) return …` y no se le
 * olvida ninguna rama.
 */

/**
 * El mínimo son 8 y no es un número elegido aquí: es el que declara
 * `minimum_password_length` en `supabase/config.toml`. Si allí sube y aquí no,
 * el aviso se da tarde —lo daría Supabase, con su mensaje en inglés.
 */
export const MINIMO_CONTRASENA = 8;

export function passwordProblem(value: string): string | null {
  const limpia = value.trim();

  if (!limpia) return "Escribe la contraseña nueva.";

  if (limpia.length < MINIMO_CONTRASENA) {
    return `La contraseña necesita ${MINIMO_CONTRASENA} caracteres o más.`;
  }

  return null;
}

/**
 * El correo propuesto, contra el que ya tiene.
 *
 * No valida el formato a fondo a propósito: la comprobación que de verdad
 * importa la hace el buzón al recibir el enlace. Aquí solo se para lo que es
 * seguro que no va a llegar a ningún sitio.
 */
export function emailProblem(value: string, actual: string): string | null {
  const nuevo = value.trim().toLowerCase();

  if (!nuevo) return "Escribe el correo nuevo.";
  if (!nuevo.includes("@") || nuevo.startsWith("@") || nuevo.endsWith("@")) {
    return "Ese correo no parece un correo.";
  }
  if (nuevo === actual.trim().toLowerCase()) return "Es el correo que ya tiene.";

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test 2>&1 | tail -8
npx tsc --noEmit
```

Esperado: todos en verde y `tsc` sin salida.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts src/lib/account-rules.ts src/lib/account-rules.test.ts
git commit -m "Quién puede administrar la cuenta de otro, y qué es una contraseña válida"
git push origin main
```

---

### Task 2: Administrar personas pasa a ser por espacio

**Files:**
- Create: `supabase/migrations/20260812000300_personas_por_espacio.sql`
- Modify: `src/types/database.ts` (el bloque `Functions:`, línea 1503)

**Interfaces:**
- Produces: `public.mando_sobre(persona uuid) → boolean` y `public.comparte_espacio(persona uuid) → boolean`, ejecutables por `authenticated`. Las usan las políticas y, desde el código, `supabase.rpc("mando_sobre", { persona })`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260812000300_personas_por_espacio.sql`:

```sql
-- Administrar personas deja de ser global y pasa a ser por espacio.
--
-- Las políticas de `profiles` se escribieron antes de que existieran los
-- espacios de trabajo y se quedaron preguntando por el papel a secas
-- (`current_role_name() in ('dueño','admin')`). La consecuencia es que un
-- administrador del espacio A puede leer y editar el perfil de alguien del
-- espacio B, que no es lo que promete `equipo-compartido.md` ni lo que espera
-- nadie que invita a un cliente a su equipo.
--
-- ## Por qué `security definer`
--
-- Igual que `mis_espacios()` y `manda_en()`: una política de `profiles` que
-- consultara `workspace_members` con RLS puesta entraría por la puerta que está
-- definiendo. Lo que costó descubrirlo está escrito en
-- `20260811000700_workspace_sin_recursion.sql`.

create or replace function public.mando_sobre(persona uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mio
    join public.workspace_members suyo on suyo.workspace_id = mio.workspace_id
    where mio.user_id = (select auth.uid())
      and mio.role in ('dueño', 'admin')
      and suyo.user_id = persona
  );
$$;

grant execute on function public.mando_sobre(uuid) to authenticated;

create or replace function public.comparte_espacio(persona uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mio
    join public.workspace_members suyo on suyo.workspace_id = mio.workspace_id
    where mio.user_id = (select auth.uid())
      and suyo.user_id = persona
  );
$$;

grant execute on function public.comparte_espacio(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Las políticas de `profiles`
-- ---------------------------------------------------------------------------

-- Ver a los del equipo, no a todo el mundo. La de «lee el suyo» se queda como
-- está: sin ella, quien todavía no está en ningún espacio no vería ni su papel.
drop policy if exists "profiles_read_all_for_managers" on public.profiles;
drop policy if exists "profiles: los del espacio se ven" on public.profiles;
create policy "profiles: los del espacio se ven" on public.profiles
  for select to authenticated
  using (public.comparte_espacio(id));

drop policy if exists "profiles_write_for_managers" on public.profiles;
drop policy if exists "profiles: quien manda escribe" on public.profiles;
create policy "profiles: quien manda escribe" on public.profiles
  for update to authenticated
  using (public.mando_sobre(id))
  with check (public.mando_sobre(id));

-- El disparador que impide que uno se suba el papel a sí mismo preguntaba por
-- lo mismo, así que si se deja como estaba, la política nueva no sirve de nada:
-- un admin de otro espacio seguiría pasando por aquí.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mando_sobre(new.id) then
    return new;
  end if;

  -- Nadie se sube el papel, el límite ni se reactiva a sí mismo.
  if new.role is distinct from old.role
     or new.monthly_limit_usd is distinct from old.monthly_limit_usd
     or new.disabled is distinct from old.disabled then
    raise exception 'Solo un administrador de tu espacio puede cambiar el papel, el límite o el estado.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Y el registro, que tenía el mismo agujero
-- ---------------------------------------------------------------------------

-- Quien manda lee el registro **de su espacio**. Las filas antiguas sin espacio
-- solo las ve quien las escribió: es preferible a enseñárselas a todos los
-- administradores de todos los equipos.
drop policy if exists "audit_read_all_for_managers" on public.audit_log;
drop policy if exists "audit_log: quien manda lee el de su espacio" on public.audit_log;
create policy "audit_log: quien manda lee el de su espacio" on public.audit_log
  for select to authenticated
  using (workspace_id is not null and public.manda_en(workspace_id));

-- ---------------------------------------------------------------------------
-- Que no quede ninguna política preguntando por el papel global
-- ---------------------------------------------------------------------------

do $$
declare
  restantes integer;
begin
  select count(*) into restantes
  from pg_policies
  where schemaname = 'public'
    and tablename in ('profiles', 'audit_log')
    and coalesce(qual, '') || coalesce(with_check, '') like '%current_role_name%';

  if restantes > 0 then
    raise exception 'Quedan % políticas preguntando por el papel global', restantes;
  end if;
end;
$$;
```

- [ ] **Step 2: Aplicarla y comprobar que quedó**

```bash
npm run db:push
```

Esperado: aplica el archivo sin error. Si el bloque `do` lanza, es que quedó una política vieja sin sustituir — hay que mirar cuál con:

```bash
npm run db:verify
```

- [ ] **Step 3: Declarar la función para poder llamarla desde el código**

En `src/types/database.ts`, sustituir la línea 1503 (`Functions: { [_ in never]: never };`) por:

```ts
    Functions: {
      /*
       * `mando_sobre` se llama desde el código además de usarse en las
       * políticas, porque la capa de servicio se salta RLS: allí esta pregunta
       * es la única comprobación que queda en pie.
       */
      mando_sobre: { Args: { persona: string }; Returns: boolean };
    };
```

- [ ] **Step 4: Comprobar tipos**

```bash
npx tsc --noEmit
```

Esperado: sin salida.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260812000300_personas_por_espacio.sql src/types/database.ts
git commit -m "Administrar personas es del espacio, no de la plataforma entera"
git push origin main
```

---

### Task 3: La propuesta de correo, y el correo que se quedaba viejo

**Files:**
- Create: `supabase/migrations/20260812000400_correo_propuesto.sql`
- Modify: `src/types/database.ts` (fila nueva y entrada en `Tables`)

**Interfaces:**
- Produces: tabla `public.pending_email_changes (user_id, nuevo_email, pedido_por, created_at)` y el tipo `PendingEmailChangeRow` con esos cuatro campos, todos `string`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260812000400_correo_propuesto.sql`:

```sql
-- El correo que un administrador propone y confirma la persona.
--
-- ## Por qué una propuesta y no un cambio
--
-- Comprobado contra la API el 12 de agosto de 2026: `updateUserById({ email })`
-- cambia el correo **al instante** y conserva `email_confirmed_at`, o sea que la
-- vía de administración se salta el `double_confirm_changes` que está puesto en
-- `config.toml`. Un correo mal tecleado dejaría la cuenta apuntando a un buzón
-- ajeno, y quien lo tuviera podría pedir recuperación y quedársela.
--
-- Así que el administrador propone, y quien llama a `updateUser` es la propia
-- persona desde su sesión: eso dispara el flujo nativo, con su correo al buzón
-- viejo y al nuevo.
--
-- ## Por qué no lleva `workspace_id`
--
-- Porque quién puede verla no se decide por el espacio de la fila sino por la
-- persona a la que afecta, y eso ya lo contesta `mando_sobre`. Una columna que
-- rellena un disparador y que nadie consulta es una que algún día se lee por
-- error creyendo que significa algo.
create table if not exists public.pending_email_changes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nuevo_email text not null,
  pedido_por uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.pending_email_changes enable row level security;

drop policy if exists "correo propuesto: la persona y quien manda" on public.pending_email_changes;
create policy "correo propuesto: la persona y quien manda" on public.pending_email_changes
  for select to authenticated
  using (user_id = (select auth.uid()) or public.mando_sobre(user_id));

-- `pedido_por` es quien lo pide, comprobado por la base: si lo pusiera solo el
-- código, una fila con el nombre de otro sería indistinguible de una legítima
-- justo en el registro que sirve para saber quién pidió qué.
drop policy if exists "correo propuesto: lo pide quien manda" on public.pending_email_changes;
create policy "correo propuesto: lo pide quien manda" on public.pending_email_changes
  for insert to authenticated
  with check (public.mando_sobre(user_id) and pedido_por = (select auth.uid()));

drop policy if exists "correo propuesto: se puede rehacer" on public.pending_email_changes;
create policy "correo propuesto: se puede rehacer" on public.pending_email_changes
  for update to authenticated
  using (public.mando_sobre(user_id))
  with check (public.mando_sobre(user_id) and pedido_por = (select auth.uid()));

-- La borra quien la pidió al rehacerla, y la persona al confirmar o rechazar.
drop policy if exists "correo propuesto: la quita la persona o quien manda" on public.pending_email_changes;
create policy "correo propuesto: la quita la persona o quien manda" on public.pending_email_changes
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.mando_sobre(user_id));

-- ---------------------------------------------------------------------------
-- El correo de `profiles`, que se quedaba con el viejo para siempre
-- ---------------------------------------------------------------------------
--
-- `profiles.email` lo rellena un disparador **al registrarse** y no había
-- ninguno para cuando cambia. Con el cambio confirmándose desde el buzón de la
-- persona —minutos u horas después, sin código nuestro delante— la columna se
-- quedaría con el correo antiguo. No es cosmético: `addMemberByEmail` busca por
-- ella, y es lo que enseña el registro donde si no habría un identificador.

create or replace function public.sincronizar_correo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.sincronizar_correo();
```

- [ ] **Step 2: Aplicarla**

```bash
npm run db:push
```

Esperado: aplicada sin error.

- [ ] **Step 3: Los tipos**

En `src/types/database.ts`, junto a los demás tipos de fila (por ejemplo después de `AuditLogRow`, sobre la línea 938):

```ts
/** El correo que un administrador propuso y la persona todavía no ha confirmado. */
type PendingEmailChangeRow = {
  user_id: string;
  nuevo_email: string;
  pedido_por: string;
  created_at: string;
};
```

Y dentro de `Tables:`, al lado de `audit_log` (sobre la línea 1404):

```ts
      pending_email_changes: Table<PendingEmailChangeRow, Insertable<PendingEmailChangeRow>>;
```

`Insertable` ya deja `created_at` opcional por su cuenta —`Generated` es
`"id" | "created_at" | "updated_at"`—, así que no hay que repetirlo.

- [ ] **Step 4: Comprobar tipos**

```bash
npx tsc --noEmit
```

Esperado: sin salida.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260812000400_correo_propuesto.sql src/types/database.ts
git commit -m "El correo se propone y lo confirma quien lo va a usar"
git push origin main
```

---

### Task 4: Las dos capas de datos

**Files:**
- Create: `src/lib/data/people-admin.ts`
- Create: `src/lib/data/email-changes.ts`

**Interfaces:**
- Consumes: `createAdminClient()` de `@/lib/supabase/admin`, `requireContext()` de `@/lib/supabase/session`, la tabla y la función de las tareas 2 y 3.
- Produces:
  - `setPassword(userId: string, password: string): Promise<void>`
  - `mandoSobre(userId: string): Promise<boolean>`
  - `interface PendingEmailChange { userId: string; nuevoEmail: string; pedidoPor: string; createdAt: string }`
  - `pendingEmailChanges(): Promise<PendingEmailChange[]>`
  - `myPendingEmailChange(): Promise<PendingEmailChange | null>`
  - `proposeEmailChange(userId: string, nuevoEmail: string): Promise<void>`
  - `dropEmailChange(userId: string): Promise<void>`

- [ ] **Step 1: La capa con la clave de servicio**

Crear `src/lib/data/people-admin.ts`:

```ts
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lo único de toda la administración de cuentas que necesita la clave de
 * servicio: fijarle a alguien la contraseña.
 *
 * ## Por qué este archivo tiene una sola función
 *
 * Porque aquí no hay RLS que proteja nada: quien llama es responsable de haber
 * comprobado a quién está tocando. Cuanto más corto sea, más difícil es que se
 * cuele una función nueva que se salte esa comprobación sin que se note al
 * leerlo. El resto de la administración —el enlace de recuperación y el cambio
 * de correo— no pasa por aquí a propósito.
 *
 * Quien llame tiene que haber comprobado antes `canManageAccount` **y**
 * `mandoSobre`. No se comprueba dentro porque haría falta el cliente de sesión,
 * y mezclar los dos en el mismo archivo es justo lo que se quiere evitar.
 */
export async function setPassword(userId: string, password: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, { password });

  /*
   * El mensaje se rescata a mano porque esta API no siempre lo trae.
   *
   * Comprobado el 12 de agosto: al fallar un borrado por una clave foránea, el
   * error llegó a supabase-js como `{}` — sin `message` y sin `code`. Sin este
   * rescate, la pantalla diría «no se pudo» y no habría por dónde empezar.
   */
  if (error) {
    throw new Error(
      error.message || `Supabase rechazó el cambio sin decir por qué (${error.status ?? "sin código"}).`,
    );
  }
}
```

- [ ] **Step 2: La capa de sesión**

Crear `src/lib/data/email-changes.ts`:

```ts
import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * Las propuestas de correo, con el cliente de sesión.
 *
 * Aquí sí protege RLS: aunque se colara un `userId` ajeno, la política de
 * `pending_email_changes` no dejaría ni verlo ni escribirlo. Por eso vive
 * aparte de `people-admin.ts`, donde no hay nada que ampare.
 */

export interface PendingEmailChange {
  userId: string;
  nuevoEmail: string;
  pedidoPor: string;
  createdAt: string;
}

const toPending = (row: {
  user_id: string;
  nuevo_email: string;
  pedido_por: string;
  created_at: string;
}): PendingEmailChange => ({
  userId: row.user_id,
  nuevoEmail: row.nuevo_email,
  pedidoPor: row.pedido_por,
  createdAt: row.created_at,
});

/**
 * Si quien mira manda sobre esa persona, preguntándoselo a la base.
 *
 * Se pregunta aquí y no se deduce del papel porque el papel es de la plataforma
 * y el mando es del espacio: un administrador de otro equipo tiene el papel y no
 * manda sobre esta persona. Y porque es la **misma** función que usan las
 * políticas, así que no puede haber dos respuestas distintas a la misma
 * pregunta.
 */
export async function mandoSobre(userId: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase.rpc("mando_sobre", { persona: userId });

  // Ante la duda, no. Un fallo de red no puede convertirse en un permiso.
  if (error) return false;

  return data === true;
}

/** Las que se ven desde `/admin`: las de la gente sobre la que se manda. */
export async function pendingEmailChanges(): Promise<PendingEmailChange[]> {
  const { supabase } = await requireContext();

  const { data } = await supabase.from("pending_email_changes").select("*");

  return (data ?? []).map(toPending);
}

/** La propia, para el aviso de `/cuenta`. */
export async function myPendingEmailChange(): Promise<PendingEmailChange | null> {
  const { supabase, userId } = await requireContext();

  const { data } = await supabase
    .from("pending_email_changes")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return data ? toPending(data) : null;
}

export async function proposeEmailChange(userId: string, nuevoEmail: string): Promise<void> {
  const { supabase, userId: actorId } = await requireContext();

  /*
   * `upsert` y no `insert`: proponer otro correo encima de una propuesta sin
   * contestar es lo normal —se tecleó mal la primera vez— y con `insert` daría
   * un error de clave duplicada que no significa nada para quien lo lee.
   */
  const { error } = await supabase.from("pending_email_changes").upsert({
    user_id: userId,
    nuevo_email: nuevoEmail.trim().toLowerCase(),
    pedido_por: actorId,
  });

  if (error) throw new Error(error.message);
}

export async function dropEmailChange(userId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("pending_email_changes").delete().eq("user_id", userId);

  if (error) throw new Error(error.message);
}
```

- [ ] **Step 3: Comprobar tipos y que nada importa lo que no debe**

```bash
npx tsc --noEmit
npm run lint
grep -n "createAdminClient" src/lib/data/*.ts src/app/**/*.ts
```

Esperado: `tsc` y `lint` sin quejas, y el `grep` devuelve **solo** `src/lib/data/people-admin.ts`. Si aparece en cualquier otro archivo de este trabajo, hay una segunda puerta sin vigilar y hay que cerrarla antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/people-admin.ts src/lib/data/email-changes.ts
git commit -m "La capa que se salta RLS, de una función, y la que no"
git push origin main
```

---

### Task 5: Las tres acciones del administrador

**Files:**
- Modify: `src/app/admin/actions.ts` (añadir al final, antes de `setOwnNameAction`)

**Interfaces:**
- Consumes: `canManageAccount` (Task 1), `passwordProblem`/`emailProblem` (Task 1), `mandoSobre`/`proposeEmailChange` (Task 4), `setPassword` (Task 4), y lo que ya existe: `requireCapability`, `record`, `findProfile`, `siteOrigin`.
- Produces:
  - `sendRecoveryAction(userId: unknown): Promise<{ ok: boolean; message: string }>`
  - `setPasswordAction(userId: unknown, password: unknown): Promise<{ ok: boolean; message: string }>`
  - `proposeEmailAction(userId: unknown, email: unknown): Promise<{ ok: boolean; message: string }>`

- [ ] **Step 1: Escribir las tres acciones**

Añadir a `src/app/admin/actions.ts`. Primero, ampliar las importaciones de la cabecera:

```ts
import { canAssign, canDisable, canManageAccount, isRole, type Role } from "@/lib/roles";
import { findProfile, updateProfile, type Profile } from "@/lib/data/profiles";
import { emailProblem, passwordProblem } from "@/lib/account-rules";
import { mandoSobre, proposeEmailChange } from "@/lib/data/email-changes";
import { setPassword } from "@/lib/data/people-admin";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-url";
```

Y después de `setDisabledAction`:

```ts
/* ------------------------- La cuenta de otra persona ------------------------ */

/**
 * Lo que hay que comprobar antes de tocar la cuenta de alguien, en un sitio.
 *
 * Son dos preguntas distintas y las dos hacen falta: `canManageAccount` dice si
 * el papel de quien pide alcanza, y `mandoSobre` si además esa persona está en
 * alguno de sus espacios. Sin la segunda, un administrador podría fijarle la
 * contraseña a alguien de otro equipo — que es el agujero que este trabajo
 * cierra.
 */
async function autorizar(
  id: string,
): Promise<{ ok: true; target: Profile } | { ok: false; message: string }> {
  const actor = await requireCapability("personas");
  const target = await findProfile(id);

  if (!target) return { ok: false, message: "Esa persona ya no existe." };

  const allowed = canManageAccount(actor, target);
  if (!allowed.ok) return { ok: false, message: allowed.reason };

  if (!(await mandoSobre(id))) {
    return { ok: false, message: "Esa persona no está en ninguno de tus espacios." };
  }

  return { ok: true, target };
}

/**
 * Mandarle el enlace para que se ponga la contraseña ella.
 *
 * Es el botón por defecto y no necesita la clave de servicio: es el mismo camino
 * que `/auth/recuperar`, así que quien lo pulsa no llega a saber ninguna
 * contraseña y no puede entrar como esa persona.
 */
export async function sendRecoveryAction(userId: unknown): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  if (!id) return { ok: false, message: "Falta la persona." };

  try {
    const permiso = await autorizar(id);
    if (!permiso.ok) return { ok: false, message: permiso.message };

    const target = permiso.target;
    const supabase = await createClient();

    await supabase.auth.resetPasswordForEmail(target.email, {
      redirectTo: `${await siteOrigin()}/auth/callback?next=/auth/nueva-clave`,
    });

    await record("cuenta.recuperacion", target.email || id, {});

    revalidatePath("/admin");
    return { ok: true, message: `Enlace enviado a ${target.email}. Caduca en una hora.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo enviar." };
  }
}

/**
 * Fijarle la contraseña a mano.
 *
 * Es la única llamada de toda la administración de cuentas que usa la clave de
 * servicio, y la única que deja a quien la pulsa **pudiendo entrar en esa
 * cuenta**. Existe para cuando la persona ya no tiene acceso a su buzón, que es
 * cuando el enlace de recuperación no sirve de nada.
 */
export async function setPasswordAction(
  userId: unknown,
  password: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  if (!id) return { ok: false, message: "Falta la persona." };

  const clave = typeof password === "string" ? password : "";
  const problema = passwordProblem(clave);
  if (problema) return { ok: false, message: problema };

  try {
    const permiso = await autorizar(id);
    if (!permiso.ok) return { ok: false, message: permiso.message };

    const target = permiso.target;
    await setPassword(id, clave.trim());

    // Se anota que se cambió, quién y a quién. La contraseña, nunca.
    await record("cuenta.clave", target.email || id, {});

    revalidatePath("/admin");
    return { ok: true, message: `Contraseña cambiada. Dísela por un canal que no sea el correo.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo cambiar." };
  }
}

/**
 * Proponerle un correo nuevo, que confirma ella.
 *
 * Aquí no cambia nada todavía: la propuesta espera a que la persona entre y la
 * acepte, y es entonces cuando Supabase manda sus dos correos.
 */
export async function proposeEmailAction(
  userId: unknown,
  email: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  if (!id) return { ok: false, message: "Falta la persona." };

  try {
    const permiso = await autorizar(id);
    if (!permiso.ok) return { ok: false, message: permiso.message };

    const target = permiso.target;
    const nuevo = readText(email).toLowerCase();

    const problema = emailProblem(nuevo, target.email);
    if (problema) return { ok: false, message: problema };

    /*
     * Se mira si ya hay alguien con ese correo entre los que se ven.
     *
     * No alcanza a las cuentas de otros espacios —RLS no las deja ver, y está
     * bien que no las deje—, así que este aviso caza el caso corriente y el
     * resto lo caza Supabase al confirmar. Vale la pena igual: es la diferencia
     * entre enterarse ahora y que se entere la otra persona cuando pulse.
     */
    const supabase = await createClient();
    const { data: ocupado } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", nuevo)
      .maybeSingle();

    if (ocupado) return { ok: false, message: "Ya hay una cuenta con ese correo." };

    await proposeEmailChange(id, nuevo);
    await record("cuenta.correo.propuesto", target.email || id, { a: nuevo });

    revalidatePath("/admin");
    return {
      ok: true,
      message: `Propuesto. ${target.email} lo verá al entrar y tendrá que confirmarlo desde su correo.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo proponer." };
  }
}
```

- [ ] **Step 2: Comprobar tipos y lint**

```bash
npx tsc --noEmit
npm run lint
npm test 2>&1 | tail -6
```

Esperado: los tres limpios.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/actions.ts
git commit -m "Las tres acciones sobre la cuenta de otro, con las dos comprobaciones"
git push origin main
```

---

### Task 6: Lo que hace la persona con su propia cuenta

**Files:**
- Create: `src/app/cuenta/actions.ts`
- Create: `src/components/pending-email-notice.tsx`
- Modify: `src/app/cuenta/page.tsx`

**Interfaces:**
- Consumes: `myPendingEmailChange`, `dropEmailChange` (Task 4).
- Produces:
  - `confirmEmailChangeAction(): Promise<{ ok: boolean; message: string }>`
  - `rejectEmailChangeAction(): Promise<{ ok: boolean; message: string }>`
  - `<PendingEmailNotice nuevoEmail={string} />`

- [ ] **Step 1: Las dos acciones**

Crear `src/app/cuenta/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { dropEmailChange, myPendingEmailChange } from "@/lib/data/email-changes";
import { record, requireProfile } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Lo que una persona hace con su propia cuenta.
 *
 * Va aparte de `/admin/actions.ts` porque la frontera es justo esa: allí se toca
 * la cuenta de otro y hay que comprobar el mando; aquí se toca la propia y lo
 * que protege es la sesión. Juntas, se copia una comprobación de una a otra
 * donde no vale — y el día que eso pase, no dará ningún error.
 */

/**
 * Aceptar el correo que propuso un administrador.
 *
 * Quien llama a `updateUser` es esta persona con **su** sesión, y por eso
 * Supabase manda su correo al buzón viejo y al nuevo: es un cambio de correo
 * normal, no una operación de administración. Comprobado el 12 de agosto que la
 * vía de administración se los salta.
 */
export async function confirmEmailChangeAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const yo = await requireProfile();
    const propuesta = await myPendingEmailChange();

    if (!propuesta) return { ok: false, message: "No hay ningún correo propuesto." };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ email: propuesta.nuevoEmail });

    if (error) {
      /*
       * El caso corriente es que ese correo ya tenga cuenta, y el mensaje de
       * Supabase viene en inglés. Se traduce el que se sabe y se deja pasar el
       * resto tal cual, que es lo que hace útil un mensaje raro.
       */
      const yaExiste = /already|registered|exists/i.test(error.message);

      return {
        ok: false,
        message: yaExiste ? "Ya hay una cuenta con ese correo." : error.message,
      };
    }

    /*
     * La propuesta se borra ya, y eso **no** significa que el correo sea el
     * nuevo: significa que esta persona dijo que sí. Lo que queda —pulsar los
     * dos enlaces— es de Supabase. Mantenerla hasta verlo cambiado dejaría el
     * aviso pegado en la pantalla de quien decida no pulsar.
     */
    await dropEmailChange(yo.id);
    await record("cuenta.correo.confirmado", yo.email, { a: propuesta.nuevoEmail });

    revalidatePath("/cuenta");
    return {
      ok: true,
      message: "Mira tu correo: hay que pulsar el enlace en el buzón viejo y en el nuevo.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function rejectEmailChangeAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const yo = await requireProfile();
    const propuesta = await myPendingEmailChange();

    if (!propuesta) return { ok: false, message: "No hay ningún correo propuesto." };

    await dropEmailChange(yo.id);
    await record("cuenta.correo.rechazado", yo.email, { era: propuesta.nuevoEmail });

    revalidatePath("/cuenta");
    return { ok: true, message: "Descartado. Tu correo se queda como está." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}
```

- [ ] **Step 2: El aviso**

Crear `src/components/pending-email-notice.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { confirmEmailChangeAction, rejectEmailChangeAction } from "@/app/cuenta/actions";

/**
 * El aviso de que alguien propuso cambiarte el correo.
 *
 * Va arriba del todo y con las dos salidas a la vista. Un cambio de correo que
 * no se pidió es la primera señal de que alguien está intentando quedarse con la
 * cuenta: enterrarlo debajo del gasto del mes sería el sitio exacto donde no
 * hay que ponerlo.
 */
export function PendingEmailNotice({ nuevoEmail }: { nuevoEmail: string }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
        Un administrador de tu equipo propone cambiar tu correo a <strong>{nuevoEmail}</strong>.
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
        Si aceptas, te llegarán dos correos —al de siempre y al nuevo— y el cambio no será real
        hasta que pulses los dos enlaces. Si no lo has pedido tú, descártalo.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await confirmEmailChangeAction();
              setMessage(result.message);
            })
          }
        >
          Aceptar y recibir los correos
        </Button>
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await rejectEmailChangeAction();
              setMessage(result.message);
            })
          }
        >
          Descartar
        </Button>
      </div>

      {message ? (
        <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">{message}</p>
      ) : null}
    </div>
  );
}
```

`Button` acepta `variant` entre `"primary" | "secondary" | "danger" | "ghost"`
(comprobado en `src/components/ui.tsx:34`), y por defecto es `secondary`. No
inventar una variante nueva: `buttonVariants` es un `Record` cerrado y `tsc`
lo rechazaría.

- [ ] **Step 3: Montarlo en la página**

En `src/app/cuenta/page.tsx`, añadir la importación y la lectura, y pintarlo justo después de `<header>`:

```tsx
import { myPendingEmailChange } from "@/lib/data/email-changes";
import { PendingEmailNotice } from "@/components/pending-email-notice";
```

```tsx
  const propuesta = await myPendingEmailChange().catch(() => null);
```

```tsx
      {propuesta ? <PendingEmailNotice nuevoEmail={propuesta.nuevoEmail} /> : null}
```

El `.catch(() => null)` es a propósito: si la consulta falla, la pantalla de la cuenta tiene que seguir abriéndose. Un aviso que no se puede leer no vale una página en blanco.

- [ ] **Step 4: Comprobar tipos y lint**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: los dos limpios.

- [ ] **Step 5: Commit**

```bash
git add src/app/cuenta/actions.ts src/components/pending-email-notice.tsx src/app/cuenta/page.tsx
git commit -m "El correo lo acepta quien lo va a usar, y lo ve al entrar"
git push origin main
```

---

### Task 7: El bloque «Acceso» en la pantalla de administración

**Files:**
- Create: `src/components/person-access.tsx`
- Modify: `src/components/admin-people.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `sendRecoveryAction`, `setPasswordAction`, `proposeEmailAction` (Task 5); `pendingEmailChanges` (Task 4).
- Produces: `<PersonAccess personId={string} email={string} pendingEmail={string | null} onMessage={(m: string) => void} />`, y `PersonView` gana el campo `pendingEmail: string | null`.

- [ ] **Step 1: El bloque**

Crear `src/components/person-access.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { proposeEmailAction, sendRecoveryAction, setPasswordAction } from "@/app/admin/actions";

/**
 * Entrar en la cuenta de alguien: el enlace, el correo y la contraseña.
 *
 * ## Por qué el enlace va primero y la contraseña plegada
 *
 * Porque resuelven el mismo problema con consecuencias muy distintas. El enlace
 * lo pone esa persona y nadie más lo sabe; una contraseña fijada por otro deja a
 * ese otro pudiendo entrar y leerlo todo. Poner los dos botones al lado, del
 * mismo tamaño, haría de la segunda la opción cómoda.
 */
export function PersonAccess({
  personId,
  email,
  pendingEmail,
  onMessage,
}: {
  personId: string;
  email: string;
  pendingEmail: string | null;
  onMessage: (message: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [correo, setCorreo] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Acceso</p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await sendRecoveryAction(personId);
              onMessage(result.message);
            })
          }
        >
          Mandarle enlace para cambiar su contraseña
        </Button>

        <div className="flex gap-2">
          <input
            value={correo}
            onChange={(event) => setCorreo(event.target.value)}
            placeholder="correo nuevo"
            inputMode="email"
            className="w-52 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await proposeEmailAction(personId, correo);
                onMessage(result.message);
                if (result.ok) setCorreo("");
              })
            }
          >
            Proponer
          </Button>
        </div>
      </div>

      {pendingEmail ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Pendiente: propuesto <strong>{pendingEmail}</strong>, esperando a que {email} lo acepte.
        </p>
      ) : null}

      {abierto ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-xs text-rose-900 dark:text-rose-200">
            Si le fijas la contraseña, podrás entrar en su cuenta y ver todo lo suyo. Úsalo solo si
            ya no tiene acceso a su correo, y díselo por otro canal. Queda anotado en el registro.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={clave}
              onChange={(event) => setClave(event.target.value)}
              placeholder="contraseña nueva"
              type="text"
              className="w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <Button
              variant="danger"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setPasswordAction(personId, clave);
                  onMessage(result.message);
                  if (result.ok) {
                    setClave("");
                    setAbierto(false);
                  }
                })
              }
            >
              Fijar contraseña
            </Button>
            <Button disabled={isPending} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="mt-2 text-xs text-slate-500 underline dark:text-slate-400"
        >
          O fijarle la contraseña a mano
        </button>
      )}
    </div>
  );
}
```

El campo de la contraseña es `type="text"` a propósito: quien la fija tiene que dictarla después, y un campo de puntos obliga a escribirla dos veces a ciegas.

- [ ] **Step 2: Enchufarlo a la lista**

En `src/components/admin-people.tsx`:

1. Añadir la importación: `import { PersonAccess } from "@/components/person-access";`
2. Añadir a `PersonView` el campo `pendingEmail: string | null;`
3. Justo antes de la etiqueta de cierre `</li>` (después del párrafo con `ROLE_DESCRIPTIONS`), añadir:

```tsx
              {/*
                Sobre uno mismo no se dibuja. La acción lo rechazaría igual
                —`canManageAccount` no deja—, pero un botón que siempre falla es
                peor que ninguno: hace dudar de si el fallo es el permiso o la
                pantalla.
              */}
              {person.isMe || person.role === "dueño" ? null : (
                <PersonAccess
                  personId={person.id}
                  email={person.email}
                  pendingEmail={person.pendingEmail}
                  onMessage={setMessage}
                />
              )}
```

- [ ] **Step 3: Llevarle el dato desde la página**

En `src/app/admin/page.tsx`, añadir la importación:

```tsx
import { pendingEmailChanges } from "@/lib/data/email-changes";
```

Antes del `Promise.all` que arma `withSpend`:

```tsx
  /*
   * Las propuestas se leen de una vez y se reparten por persona. Una consulta
   * por fila multiplicaría por el número de personas algo que cabe en una.
   */
  const propuestas = new Map(
    (await pendingEmailChanges().catch(() => [])).map((one) => [one.userId, one.nuevoEmail]),
  );
```

Y dentro del `map` que arma cada persona, añadir el campo:

```tsx
      pendingEmail: propuestas.get(person.id) ?? null,
```

- [ ] **Step 4: Comprobar tipos y lint**

```bash
npx tsc --noEmit
npm run lint
npm test 2>&1 | tail -6
```

Esperado: los tres limpios. Si `tsc` se queja de `pendingEmail` faltando en algún sitio, es que hay otro punto que construye `PersonView` — hay que darle el campo, no aflojar el tipo.

- [ ] **Step 5: Verlo funcionar**

```bash
npm run dev
```

Con dos cuentas de las que ya existen, comprobar en `/admin`:

1. En la propia fila **no** aparece el bloque «Acceso».
2. «Mandarle enlace» dice que se envió y el correo llega.
3. Proponer un correo mal escrito (sin arroba) da el motivo, no «no se pudo».
4. Proponer uno bueno deja el aviso «Pendiente: …» en la fila.
5. Entrando con esa otra cuenta, `/cuenta` enseña el aviso arriba del todo.

- [ ] **Step 6: Commit**

```bash
git add src/components/person-access.tsx src/components/admin-people.tsx src/app/admin/page.tsx
git commit -m "El bloque de acceso: el enlace delante, la contraseña detrás de su aviso"
git push origin main
```

---

### Task 8: Lo que queda escrito

**Files:**
- Modify: `docs/pendiente.md` (punto 6)
- Modify: `docs/equipo-compartido.md`

- [ ] **Step 1: Reescribir el punto 6 de `docs/pendiente.md`**

Sustituir todo el apartado «6. Administración de usuarios» por:

```markdown
## 6. Administración de usuarios

**Hecho**, las dos mitades. Los accesos independientes del papel ya estaban;
ahora también se le puede mandar a alguien el enlace de recuperación, fijarle la
contraseña cuando ya no tiene acceso a su buzón, y proponerle un correo nuevo
que confirma ella desde su sesión — que es lo que hace que Supabase mande sus
dos correos, porque la vía de administración se los salta.

Y de paso, administrar personas dejó de ser global: `profiles` y `audit_log`
preguntaban por el papel a secas, así que un administrador del espacio A podía
leer y editar a alguien del B. Ahora preguntan por `mando_sobre` y
`comparte_espacio`.

Ver `docs/superpowers/specs/2026-08-12-administracion-cuentas-design.md`.

**Lo que sigue sin poderse hacer, y por qué:**

- **Cerrar las sesiones de otra persona.** `admin.signOut` pide el JWT de esa
  persona, que no tenemos. No hay forma con esta API.
- **Borrar una cuenta.** Comprobado el 12 de agosto contra el proyecto real:
  falla siempre con `workspaces_created_by_fkey`, porque al registrarse se le
  crea un espacio y esa clave foránea no tiene cascada. Y el error llega a
  supabase-js como `{}`, sin mensaje: quien lo intente verá «no se pudo» y no
  tendrá por dónde empezar. Arreglarlo es decidir qué pasa con el espacio de
  quien se va —se borra con todo lo que hay dentro, o se traspasa— y eso es una
  decisión de negocio antes que una migración.
```

- [ ] **Step 2: Anotarlo en `docs/equipo-compartido.md`**

Leer el documento y añadir, en la sección que hable de las políticas, que
`profiles` y `audit_log` **ya no** son la excepción global que eran, con las dos
funciones nuevas nombradas. Si el documento afirma lo contrario en alguna línea,
corregir esa línea: un documento que describe el modelo antiguo es peor que no
tenerlo, porque se cree.

```bash
grep -n "profiles\|current_role_name\|global" docs/equipo-compartido.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/pendiente.md docs/equipo-compartido.md
git commit -m "Lo que queda de administrar personas, que ya no es lo que decía"
git push origin main
```

---

## Verificación en producción

Nada de esto cuenta hasta verse en el servidor, después de `./actualizar.sh`
—que aplica las dos migraciones, pasa los tests y aborta si falla alguno—:

1. Un administrador manda el enlace de recuperación y el correo llega.
2. Propone un correo; la otra persona lo ve al entrar, acepta, y le llegan los
   dos correos de Supabase. Hasta pulsarlos, entra con el viejo.
3. Después de pulsarlos, `profiles.email` es el nuevo — o el disparador
   `on_auth_user_email_changed` no está puesto.
4. Un administrador del espacio A **no** ve ni puede tocar a alguien del B.
5. Nadie puede administrarse a sí mismo ni al dueño.
6. La contraseña fijada a mano permite entrar, y en el registro aparece
   `cuenta.clave` con quién y a quién — y sin la contraseña.

## Self-review de este plan

- **Cobertura del spec:** las tres operaciones (Tasks 5 y 6), las cuatro piezas
  (Tasks 1, 2, 3 y 4), el hueco de `profiles` y su disparador (Task 2), el
  disparador del correo (Task 3), la pantalla (Tasks 6 y 7), las pruebas
  (Task 1) y lo que queda fuera (Task 8). El spec menciona `audit_log` solo de
  pasada; aquí se cierra su política por el mismo motivo, y queda dicho en la
  migración.
- **Sin marcadores:** ningún paso dice «añadir validación» o «similar a la Task
  N»; el código va entero en cada uno.
- **Nombres:** `mando_sobre` / `mandoSobre`, `pending_email_changes` /
  `PendingEmailChange`, `canManageAccount`, `passwordProblem`, `emailProblem`,
  `sendRecoveryAction`, `setPasswordAction`, `proposeEmailAction`,
  `confirmEmailChangeAction`, `rejectEmailChangeAction`, `PersonAccess`,
  `PendingEmailNotice` — usados igual en todas las tareas.
