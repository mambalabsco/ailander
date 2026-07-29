# Puesta en marcha de Supabase

Lo que tienes que hacer tú en el panel. El código ya está listo; sin estos pasos
la plataforma arranca en modo local y lo avisa en la cabecera.

## 1. Crear el proyecto

Panel de Supabase → **New project**. Anota la región: cuanto más cerca de tus
usuarios, menos latencia en cada consulta.

## 2. Copiar las claves

**Project Settings → API Keys**. Copia `.env.example` a `.env.local` y rellena:

- `NEXT_PUBLIC_SUPABASE_URL` — la URL del proyecto.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — la publishable (antes «anon»).
- `SUPABASE_SECRET_KEY` — la secreta (antes «service_role»).

`.env.local` está en `.gitignore`. **La secreta no puede ir nunca en una
variable que empiece por `NEXT_PUBLIC_`**: eso la publicaría en el navegador.

## 3. Aplicar las migraciones

Hace falta la **cadena de conexión a Postgres**, que no es ninguna de las claves
del apartado anterior: aquellas son de API y no sirven para crear tablas.

Panel → botón **Connect** (arriba) → pestaña **URI**. Copia la cadena y sustituye
`[YOUR-PASSWORD]` por la contraseña de la base de datos. Usa el **puerto 5432**
(modo sesión), no el 6543: el modo transacción no admite todo lo que hacen estas
migraciones.

**Usa la cadena del pooler, no la directa.** El host directo
(`db.<ref>.supabase.co`) solo tiene dirección IPv6, y la mayoría de conexiones
domésticas y de CI no tienen ruta IPv6: falla con `ENOTFOUND` aunque el DNS
resuelva. El pooler es IPv4 y va siempre. Para este proyecto es:

```
postgresql://postgres.<ref>:<contraseña>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

Si la contraseña lleva `#`, `/` o `?`, hay que sustituirlos por `%23`, `%2F` y
`%3F`: cortan la URL. El `%` también, por `%25`. Los demás signos habituales
(`!`, `$`, `&`, `*`, `+`) van tal cual. Los scripts lo comprueban antes de
conectar y te dicen cuál es el problema, en vez de dejar que Postgres responda
«password authentication failed» con la contraseña correcta.

Añádela a `.env.local` —que ya está en `.gitignore`— y con eso los comandos la
encuentran solos:

```
SUPABASE_DB_URL="postgresql://postgres.TU_REF:CONTRASEÑA@aws-0-<región>.pooler.supabase.com:5432/postgres"
```

```bash
npm run db:push
```

La aplicación **no** usa esta variable: solo `db:push` y `db:verify`. Si prefieres
no dejarla escrita, expórtala en la terminal y funciona igual.

Aplica los tres archivos de `supabase/migrations/` en orden y lleva registro en
`public.schema_migrations`, así que volver a ejecutarlo no repite nada:

1. `20260727000100_schema.sql` — tablas, enumerados y triggers.
2. `20260727000200_rls.sql` — Row Level Security y coherencia entre tablas.
3. `20260727000300_storage.sql` — buckets privados y sus políticas.

Si prefieres no dar la contraseña a la terminal, pega los tres archivos en el
**SQL Editor** del panel, uno detrás de otro y en ese orden.

## 4. Comprobar que quedó bien

```bash
npm run db:verify
```

Revisa las veinte tablas con su RLS, que cada una tenga sus cuatro políticas,
que `provider_configs` **no** tenga la de lectura, que los dos buckets sean
privados y que estén los triggers de coherencia y el de creación de perfil.

Sale con error si algo falla, así que se puede encadenar en un despliegue.

Una tabla sin RLS es legible por cualquier usuario autenticado, y eso **no se
nota usando la aplicación**: funciona igual de bien. Solo aparece cuando hay dos
cuentas y una ve los datos de la otra.

## 5. Autenticación  ← esto sigue pendiente

Las URLs de Auth **no se pueden configurar con la cadena de conexión**: no viven
en una tabla de Postgres, las gestiona la plataforma. Hace falta el panel o un
token personal.

Está declarada en `supabase/config.toml`, así que con token son tres comandos:

```bash
npx supabase login          # abre el navegador una vez
npx supabase link --project-ref TU_REF
npm run auth:push
```

**El último es `npm run auth:push`, no `npx supabase config push` a secas**, y la
diferencia importa. `config.toml` declara `site_url = "env(NEXT_PUBLIC_SITE_URL)"`.
El CLI lee `.env`, pero tus valores están en `.env.local`, que es lo que usa
Next. Si la variable no está en el entorno, **el CLI no avisa**: sube la cadena
literal `env(NEXT_PUBLIC_SITE_URL)` como URL del sitio.

A partir de ahí los enlaces de confirmación de los correos apuntan a una URL que
no existe y nadie termina de registrarse. El síntoma aparece en el buzón de un
usuario, lejos de la terminal. Pasó de verdad en este proyecto.

`npm run auth:push` carga `.env.local`, enseña el `site_url` antes de subirlo y
se niega a continuar si falta.

### El 402 de Storage no es un fallo tuyo

Al final verás esto:

```
unexpected status 402: Please upgrade the project to a paid tier to enable vector buckets
```

`config push` intenta configurar *vector buckets*, que son de pago, **después**
de haber subido Auth correctamente. En un plan gratuito falla siempre y no hay
nada que arreglar.

Lo único que no se aplica es el techo global de subida, que se queda en 50 MiB en
vez de 25. Da igual: los límites que de verdad protegen los pone la migración en
cada bucket, y son más estrictos —`product-images` 10 MB y `ad-creatives` 25 MB,
los dos privados y con lista blanca de tipos—. Puedes comprobarlo en
**Storage → Configuration** de cada bucket.

Eso deja el proveedor de correo activo, `site_url` apuntando a
`NEXT_PUBLIC_SITE_URL`, `/auth/callback` en la lista de redirecciones
permitidas y el mínimo de contraseña en 8, que es lo que valida el formulario.

Si prefieres hacerlo a mano, es **Authentication → Providers → Email** activado
y **Authentication → URL Configuration** con el *Site URL* y
`http://localhost:3000/auth/callback` en *Redirect URLs*. Sin esa última, el
enlace de confirmación del correo no vuelve a la aplicación.

La confirmación por correo viene **activada**. Sin ella, cualquiera puede
registrarse con un correo que no es suyo. Mientras pruebas puede molestar —el
SMTP de cortesía de Supabase tiene un límite bajo por hora—; si es el caso, pon
`enable_confirmations = false` en `config.toml` y vuelve a subirlo antes de
producción.

## 6. Storage

Los dos buckets los crea la migración: `product-images` y `ad-creatives`, los
dos **privados**. En **Storage** debes verlos con el candado.

No los hagas públicos. Las imágenes se sirven con URL firmada de una hora,
generada en el servidor; un bucket público significa que cualquiera con el
enlace ve tus creatividades antes de publicarlas.

## 7. Regenerar los tipos

`src/types/database.ts` está escrito a mano a partir de las migraciones. En
cuanto el proyecto esté en marcha conviene regenerarlo para que la fuente de
verdad sea la base de datos:

```bash
export SUPABASE_PROJECT_REF=TU_REF
npm run db:types
```

## 8. Traer lo que tenías en local

Conectar la base hace que la aplicación deje de leer `data/*.json` y
`settings/`. **Los archivos no se borran**, pero nadie los mira, así que parece
que los datos desaparecieron. Para subirlos:

```bash
npm run db:import -- --seco    # enseña qué haría, sin escribir
npm run db:import              # lo hace
```

Sube tiendas, mercados, productos con sus datos de investigación, la biblioteca,
el historial y las claves de API. **Las imágenes se descargan y se suben al
bucket privado**: estaban apuntando al CDN de la tienda y así dejan de depender
de que esa ficha siga existiendo.

Por defecto omite los productos y tiendas de demostración que venían con el
andamiaje; con `--todo` entran también. Lo que se salta lo dice, no lo calla.

Se puede ejecutar dos veces: comprueba por nombre y no duplica.

## 9. Crear tu cuenta

Arranca la aplicación, entra en `/auth/signup` y regístrate. El perfil se crea
solo con un trigger sobre `auth.users` — comprobado con cuentas reales.

Si la confirmación por correo está activa y todavía no has hecho el apartado 5,
el enlace del correo no volverá a la aplicación. Hasta entonces, para probar
puedes crear la cuenta ya confirmada desde **Authentication → Users → Add user**
marcando *Auto Confirm User*.

A partir de ahí la plataforma trabaja contra Postgres: la cabecera deja de
mostrar «Sin conectar a Supabase» y aparece tu correo con el botón de salir.

## Una decisión que conviene que revises

Las claves de API de Anthropic y de Higgsfield se guardan en la tabla
`provider_configs`, **sin política de lectura**: el navegador no puede
obtenerlas ni siquiera siendo tuyas, solo el servidor con la clave secreta. Aun
así quedan en claro en la base de datos, así que quien tenga acceso al panel
puede verlas.

Si eso no te vale, la forma correcta es Supabase Vault: cifra el secreto en
reposo y en la tabla solo queda su identificador. Las columnas
`anthropic_secret_id` y `higgsfield_secret_id` ya están puestas para ese cambio.
