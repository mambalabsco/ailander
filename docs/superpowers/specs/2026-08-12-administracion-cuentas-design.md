# Administrar la cuenta de otra persona

Escrito el 12 de agosto de 2026. Es la mitad que faltaba del punto 6 de
`pendiente.md`: los accesos independientes del papel ya están hechos, y esto es
lo otro — cambiarle a alguien la contraseña, el correo y la recuperación.

## Lo que se pidió y lo que significa

Pedido: «editar los datos de una persona, cambiarle la contraseña, el correo o
la recuperación». Aclarado en el diseño:

- **Contraseña**: por defecto se le manda un enlace de recuperación; fijarla a
  mano queda como excepción visible, para cuando esa persona ya no tiene acceso
  a su buzón.
- **Correo**: con confirmación del buzón nuevo. Un correo mal tecleado deja la
  cuenta apuntando a un buzón ajeno, y quien lo tenga puede pedir recuperación y
  quedársela: aquí un error de escritura es una pérdida de cuenta.
- **Recuperación**: era el enlace de «restablecer contraseña», no un segundo
  buzón de respaldo.

## Lo que hace la API de verdad

Comprobado el 12 de agosto contra el proyecto real con un usuario de usar y
tirar, creado y borrado en la misma sonda. No es lo que dice la documentación:
es lo que devolvió.

| Llamada | Qué hace |
|---|---|
| `updateUserById({ email })` | Cambia el correo **al instante** y conserva `email_confirmed_at`. La administración **se salta** `double_confirm_changes`, que en `config.toml` está a `true`. |
| `generateLink('email_change_new')` | Deja `email` como estaba, pone `new_email` y sella `email_change_sent_at`. Devuelve `action_link`, pero **entregarlo es cosa nuestra**. |
| `generateLink('recovery')` | Devuelve enlace. Tampoco lo entrega. |
| `deleteUser(id)` | **Falla siempre**: `workspaces_created_by_fkey` no tiene cascada, porque al registrarse se crea un espacio. Y el error llega a supabase-js como `{}`, sin mensaje. |

De la primera línea sale toda la forma de este diseño: **la API de
administración no sabe pedir confirmación**. Si el admin cambia el correo, el
correo queda cambiado.

## La forma, y por qué la clave de servicio casi no aparece

El cambio de correo lo confirma **la persona desde su propia sesión**: el admin
lo *propone*, y quien llama a `supabase.auth.updateUser({ email })` es ella. Eso
dispara el flujo nativo de Supabase —correo al buzón viejo y al nuevo, que es lo
que hace `double_confirm_changes`— sin que la plataforma tenga que mandar ningún
correo ni el admin llegue a tener el enlace en la mano.

Y el enlace de recuperación ya lo manda `resetPasswordForEmail`, que es lo que
usa `/auth/recuperar` hoy en producción.

Así que de todo este trabajo **la clave de servicio se usa en una sola llamada**:
fijar una contraseña a mano. Ese es el trozo peligroso, y ahora es de tres
líneas y se lee de una sentada.

### Por qué una capa aparte y no dentro de `profiles.ts`

Porque en un mismo módulo convivirían el cliente de sesión —al que le protege
RLS— y el de servicio —al que no le protege nada—, y entonces la seguridad de
cada función depende de cuál eligió quien la escribió. Es la misma decisión que
en el autopiloto, donde la consecuencia era una fuga entre espacios de trabajo;
aquí sería quedarse con la cuenta de otro.

Una ruta `/api/admin` tampoco: no aporta nada sobre una acción de servidor y
añade una superficie pública más que proteger.

## Las cuatro piezas

| Pieza | Qué hace |
|---|---|
| `canManageAccount` en `roles.ts` | Puro y probado, al lado de `canAssign`, con el mismo `RANK`. Tres reglas: sobre uno mismo no —para eso está `/cuenta`—, al dueño no lo toca nadie, y nadie administra a alguien de rango mayor. |
| `mando_sobre(persona uuid)` en SQL | `security definer`, hermana de `manda_en`: «¿soy dueño o admin en algún espacio donde esta persona es miembro?». La usan la acción **y** la política, así que no hay dos verdades que puedan separarse. |
| `src/lib/data/people-admin.ts` | La única capa que toca `createAdminClient()`. Una función, `setPassword(userId, password)`, que recibe el id ya autorizado y no decide permisos. |
| `pending_email_changes` | Una fila por propuesta: de quién, qué correo nuevo, quién lo pidió y cuándo. Con RLS: la ve la persona a quien afecta y quien manda sobre ella, y nadie más. |

`mando_sobre` tiene que ser `security definer` por lo mismo que `mis_espacios`:
una política de `profiles` que consultara `workspace_members` sin saltarse RLS
entraría por la puerta que está definiendo. Está escrito en
`20260811000700_workspace_sin_recursion.sql` lo que costó descubrirlo.

## Las tres operaciones

### 1. Mandar enlace de recuperación

`resetPasswordForEmail(correo, { redirectTo: /auth/nueva-clave })` con el cliente
de servidor normal. Sin clave de servicio. Es el botón por defecto: resuelve el
caso real —«no puedo entrar»— sin que el admin llegue a saber la contraseña de
nadie, y por tanto sin poder entrar como esa persona.

### 2. Fijar la contraseña a mano

`updateUserById(id, { password })`. Plegada detrás de un aviso que dice lo que
es: quien la fija puede entrar en esa cuenta y leerlo todo como ella.

Antes de llamar: `requireCapability("personas")`, `canManageAccount`,
`mando_sobre`, y la longitud mínima **8**, que es la que declara
`minimum_password_length` en `supabase/config.toml` — no un número elegido aquí,
que se separaría del real el día que se cambie allí.

La contraseña **no entra nunca en `audit_log`**. Se anota que se cambió, quién y
a quién.

### 3. Proponer el correo nuevo

El admin escribe el correo. Se comprueba que no exista ya una cuenta con él
—porque si existe, la persona confirmaría y se encontraría un error suyo por una
decisión de otro— y se guarda la propuesta. **Nada cambia todavía.**

La persona entra y en `/cuenta` le espera: «tu admin pide cambiar tu correo a X.
Confirmar / Rechazar». Al confirmar, una acción de servidor llama a
`supabase.auth.updateUser({ email })` con **su** sesión, y Supabase manda sus dos
correos. El cambio no es real hasta que se pulsan. La propuesta se borra al
confirmar o al rechazar.

Borrarla al confirmar **no significa que el correo ya sea el nuevo**: significa
que la persona dijo que sí y lo que queda está en manos de Supabase. Mantenerla
hasta ver el correo cambiado obligaría a preguntarle a `auth.users` cada vez que
se pinta `/cuenta`, y dejaría una propuesta pegada en la pantalla de quien
decidió no pulsar el enlace.

Esto **no sirve si esa persona ya no puede entrar**. Es una limitación aceptada:
para ese caso están la recuperación y, en último término, la contraseña a mano.

## El hueco de `profiles`, que se cierra aquí

Las políticas de `profiles` nunca se migraron al modelo de espacios: siguen
siendo `current_role_name() in ('dueño','admin')`
(`20260801000600_profiles.sql`). Hoy un admin del espacio A puede leer y editar
el perfil de alguien del espacio B, que no es lo que dice
`equipo-compartido.md` ni lo que esperaría nadie.

Pasan a `comparte_espacio(id)` —la segunda función `security definer` que hay
que escribir, «¿esta persona está en alguno de mis espacios?»— para leer, y a
`mando_sobre(id)` para escribir. Las
acciones de `/admin` no cambian de forma —`requireCapability("personas")`, regla
pura, `record()`—; lo que cambia es que la base deja de ser más permisiva que
ellas.

### El disparador que falta, y lo que rompe

`profiles.email` se rellena con un disparador **al registrarse** y no hay
ninguno para cuando cambia. Con el correo confirmándose desde el buzón de la
persona —minutos u horas después, sin código nuestro delante— `profiles.email`
se quedaría con el viejo para siempre.

No es cosmético: `addMemberByEmail` busca por esa columna, y el registro de
`audit_log` la usa para poner un nombre donde si no hay un identificador. Hace
falta un disparador `after update of email on auth.users` que la copie.

## La pantalla

En `/admin`, dentro de cada fila de `AdminPeople` y junto a lo que ya hay (papel,
tope, desactivar), un bloque **«Acceso»**: el botón de recuperación, el correo
propuesto con su estado si lo hay, y la contraseña a mano plegada tras su aviso.

Sobre uno mismo el bloque no se dibuja. `canManageAccount` lo rechazaría igual
—la protección está en la acción, no en el dibujo—, pero un botón que siempre
falla es peor que ninguno.

En `/cuenta`, el aviso de la propuesta pendiente, arriba del todo.

## Cuando falla

Nada de esto es una tanda: cada acción devuelve `{ ok, message }` como el resto
de `/admin`. Lo que se cuida es que el mensaje diga la verdad —«ya hay una
cuenta con ese correo», «la contraseña necesita 8 caracteres», «al dueño no se le
administra la cuenta»— y no «no se pudo», que obliga a adivinar.

`record()` sigue sin fallar hacia fuera: perder una línea del registro no puede
tumbar un cambio que ya ocurrió.

Lo anotado: `cuenta.recuperacion`, `cuenta.clave`, `cuenta.correo.propuesto`,
`cuenta.correo.confirmado`, `cuenta.correo.rechazado`. Con quién, a quién y —en
el correo— de qué a qué.

## Pruebas

Puras, con `node --test`, que es lo que hay y lo único que puede probar módulos
que no importan `server-only`:

- `canManageAccount`: sobre uno mismo, sobre el dueño, sobre alguien de rango
  mayor, sin el permiso «personas», y el caso bueno.
- La validación de la contraseña: corta, vacía, justo de 8.
- La validación del correo: formato, y que no sea el que ya tiene.

Las políticas no se prueban con el corredor. Se comprueban con una consulta
dentro de la propia migración, que es donde se puede.

## Lo que hay que ver antes de darlo por hecho

1. Un admin manda el enlace de recuperación y llega el correo.
2. Un admin propone un correo; la persona lo ve al entrar, confirma, y le llegan
   los dos correos de Supabase. Hasta pulsarlos, entra con el viejo.
3. Tras confirmar, `profiles.email` es el nuevo — o el disparador no está.
4. Un admin del espacio A **no** puede tocar a alguien del espacio B.
5. Nadie puede administrarse a sí mismo ni al dueño.

## Fuera, con su motivo

- **Cerrar las sesiones de otra persona.** `admin.signOut` pide el JWT de esa
  persona, que no tenemos. No hay forma con esta API: es otro ciclo y otra
  investigación.
- **Borrar una cuenta.** Imposible hoy por `workspaces_created_by_fkey` sin
  cascada. Queda anotado en `pendiente.md` con lo que la sonda averiguó.
- **Emisor de correo propio** (SMTP/Resend). Con este diseño no hace falta, y
  además sacaría los correos de autenticación del emisor de pruebas de Supabase
  — que es una mejora real, pero de otro ciclo.
- **Un segundo correo de respaldo.** Supabase no lo usa: su recuperación va
  siempre al correo de la cuenta, así que habría que construir el flujo entero.
