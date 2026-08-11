# Espacio de trabajo compartido

Estado: **las cuatro fases hechas y el selector puesto.** Falta una sola cosa,
y no es código: **probarlo con dos cuentas de verdad.** En cada tabla, que un
miembro vea lo del espacio y que alguien de fuera no vea nada. Las dos, siempre.

El selector de espacio vive en `/equipo` y solo decide **qué espacio se
administra**. El resto de la aplicación sigue leyendo de todos los espacios a
los que perteneces, que es lo correcto mientras cada quien esté en uno. Cuando
alguien esté en dos equipos de verdad, habrá que llevar ese mismo espacio activo
al resto de las pantallas. Escrito el 11 de agosto de 2026.

La fase 1 —`20260811000100_workspace_fase1.sql`— crea `workspaces`,
`workspace_members` y la columna `workspace_id` en las 49 tablas de datos, y la
rellena desde `user_id`. **No cambia lo que ve nadie**: las políticas siguen
filtrando por `auth.uid()`. Se puede aplicar hoy sin riesgo.

## Qué se quiere

Que el equipo trabaje sobre **los mismos productos**, y que un admin reparta
qué puede hacer cada uno. Hoy no se puede: las políticas de la base de datos
filtran todas las tablas por `auth.uid()`, así que cada persona ve solo lo suyo.
Dar «admin» concede capacidades —gastar, publicar, ver el dinero— pero nunca
acceso a datos de otro, porque esa idea no existe en el modelo.

No es un fallo: es el requisito con el que se construyó. Cambiarlo es cambiar el
modelo, y por eso va por escrito antes de tocar nada.

## La decisión

**Espacio de trabajo**, no compartir producto a producto. Lo segundo es menos
trabajo y sirve para meter a alguien puntual en un producto; lo que se pide es
un equipo trabajando sobre todo, y ahí compartir de uno en uno se convierte en
mantenimiento manual eterno.

## El cambio

1. Tablas nuevas: `workspaces` y `workspace_members` (usuario, espacio, papel).
2. Columna `workspace_id` en todas las tablas de datos.
3. Las políticas pasan de «eres el dueño» a «eres miembro de este espacio».
4. Migración de lo que ya hay: un espacio por usuario actual, con él de dueño.
   Nadie pierde nada ni ve nada nuevo el día del cambio.
5. Pantalla de administración: invitar, cambiar papel, y **excepciones por
   persona** sobre las capacidades de su papel — que es el «selector» pedido.

## Decidido (11 de agosto)

- **Al invitar a alguien que ya tiene datos, todo pasa a ser de todos.** Sus
  datos entran en el espacio y el equipo entero los ve. Es lo que se pidió y
  simplifica el modelo entero. **Es irreversible sin copia de seguridad**: antes
  de mover datos de nadie, copia.
- **Una persona puede estar en varios espacios.** La tabla de miembros ya lo
  admite; lo que falta es que la aplicación sepa en cuál está trabajando —un
  selector arriba— y que todo lo que lee filtre por ese, no por «el suyo».
- **El panel de gasto es del espacio**, no de la persona. Quien entra ve lo que
  ha costado el equipo.
- **Acceso a productos: todo el equipo ve todo, con excepciones por persona.**
  La tabla `product_exclusions` guarda a quién se le saca de qué. Al revés
  —lista de a qué sí tiene acceso— cada producto nuevo nacería invisible hasta
  que alguien lo repartiera, y acabaría repartiéndose a todos por costumbre.

## El orden, y por qué

1. ~~**Tablas y columna, sin cambiar políticas.**~~ Hecho. Todo sigue igual.
2. ~~**Rellenar `workspace_id` de lo existente.**~~ Hecho en la misma migración.
   **Falta comprobarlo en el servidor**: `select count(*) from products where
   workspace_id is null` en cada tabla, o al menos en las que tengan datos. Una
   fila sin espacio no la ve nadie cuando cambien las políticas — se pierde sin
   borrarse, que es la peor forma de perder algo.
3. ~~**Cambiar las políticas.**~~ Escrita: `20260811000300_workspace_fase3.sql`.
   Va en un bloque generado sobre las 49 tablas, así que o están bien todas o
   están mal todas. Las hijas —planos de un vídeo, líneas de un pedido,
   variantes, gasto— se resuelven por su padre.

   **Sin probar contra dos usuarios de verdad.** Es lo único que falta y no es
   opcional: hay que confirmar en cada tabla que un miembro ve lo del espacio
   **y** que alguien de fuera no ve nada. Las dos, siempre — una política que
   deja pasar todo también supera la primera.
4. ~~**La pantalla de invitar y repartir.**~~ Hecha: `/equipo`. Añadir por
   correo a quien ya tenga cuenta, cambiar papel, sacar del equipo, y por
   persona la lista de productos de los que se la saca, y el selector de espacio
   activo cuando se pertenece a más de uno.

## Cómo se entra a un espacio

Las dos vías, y son distintas a propósito:

- **Invitación por correo**, para quien todavía no tiene cuenta. Se guarda la
  invitación pendiente contra el correo y se convierte en membresía cuando esa
  persona se registra. Sin esto, invitar exige que la otra persona se registre
  primero y avise, que es una coreografía que nadie completa.
- **Asignación directa por un admin**, para quien ya está en la plataforma. Es lo
  normal en un equipo que ya existe: no hay nada que aceptar, se le mete y ya.

Nada de enlaces que valen para cualquiera. Un enlace de invitación se reenvía sin
querer y acaba metiendo en el espacio a quien lo reciba; y con datos de clientes
dentro, eso no se arregla sacándole después: ya lo vio.

## Lo que queda por decidir


- **Qué pasa cuando alguien sale de un equipo**: sus datos ya son del espacio, así
  que se quedan. Conviene decirlo en la pantalla antes de sacar a nadie.

## Riesgos, dichos antes

- Una política mal escrita **enseña datos ajenos**, y no da ningún error. Por eso
  la prueba de «alguien de fuera no ve nada» es obligatoria en cada tabla.
- El paso 3 no se puede hacer a medias: con la mitad de las tablas migradas, un
  producto se ve y sus copys no. Va entero o no va.
- Hay que probarlo con **dos usuarios de verdad**, no con uno: casi todo esto
  funciona perfectamente hasta que hay un segundo.
