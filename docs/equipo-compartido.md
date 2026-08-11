# Espacio de trabajo compartido

Estado: **decidido, sin empezar.** Escrito el 11 de agosto de 2026.

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

## Lo que hay que decidir al empezar

- **Qué pasa al invitar a alguien que ya tiene datos suyos.** ¿Se mueven a su
  espacio nuevo o se quedan? Mover datos entre espacios es irreversible sin
  copia de seguridad.
- **Si un producto puede estar en dos espacios.** Decir que no simplifica todo;
  decir que sí obliga a una tabla intermedia y a decidir quién manda.
- **Qué ve el dueño de un espacio del gasto de los demás.** Hoy el panel de
  gasto es por usuario; en equipo, lo natural es que sea del espacio.

## El orden, y por qué

1. **Tablas y columna, sin cambiar políticas.** Todo sigue funcionando igual.
2. **Rellenar `workspace_id` de lo existente**, comprobando que no queda ninguna
   fila sin espacio. Una fila huérfana con las políticas nuevas es una fila que
   no ve nadie: se pierde sin borrarse, que es la peor forma de perder algo.
3. **Cambiar las políticas**, tabla por tabla, con una prueba por cada una que
   confirme dos cosas: que un miembro ve lo del espacio y que alguien de fuera
   no ve nada. Las dos, siempre — una política que deja pasar todo también
   supera la primera mitad de la prueba.
4. **La pantalla de invitar y repartir.** Va la última: sin lo anterior, invitar
   a alguien lo mete en un espacio que todavía no filtra nada.

## Riesgos, dichos antes

- Una política mal escrita **enseña datos ajenos**, y no da ningún error. Por eso
  la prueba de «alguien de fuera no ve nada» es obligatoria en cada tabla.
- El paso 3 no se puede hacer a medias: con la mitad de las tablas migradas, un
  producto se ve y sus copys no. Va entero o no va.
- Hay que probarlo con **dos usuarios de verdad**, no con uno: casi todo esto
  funciona perfectamente hasta que hay un segundo.
