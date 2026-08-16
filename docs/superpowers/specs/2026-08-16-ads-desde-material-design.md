# Anuncios desde material, y un modo que no pregunta

Escrito el 16 de agosto de 2026.

Pedido: en la sección Ads de cada producto, poder pasarle una referencia —texto,
imagen y vídeo— y pedirle más anuncios parecidos, sin que la idea salga solo del
ángulo; que esos parecidos se saquen de las **anatomías** que ya se escriben al
analizar anuncios en la sección de Ángulos, con **tres niveles** de cercanía; y
una última versión que genere más anuncios **sin preguntar nada**.

## De dónde se parte

Comprobado en el código, no recordado:

- La pestaña Ads tiene **un solo camino**: etapa, ángulo (o deseo si no hay
  ángulos), destino y cuántos, y una llamada arma campaña, conjuntos y anuncios
  numerados (`tab-ads.tsx`, `generateShortAdsAction` en
  `generate-actions.ts:598`).
- El encargo es `buildShortAdBatchPrompt` (`short-ad-prompts.ts:55`). El ángulo
  entra como un bloque opcional del prompt, no como su columna vertebral: se
  puede sustituir sin tocar el resto.
- El guardado ya reparte la tanda en **una campaña con varios conjuntos**, cada
  uno con su etapa, y guarda por conjunto para que un fallo a la mitad no se
  lleve lo ya pagado (`generate-actions.ts:759`).
- **`adsets.angle_id`** existe desde el principio, con `on delete set null`
  (`20260727000100_schema.sql:428`). Es donde la plataforma ya anota de qué
  salió una tanda.
- Las **anatomías** existen y hay dos escritas: `analyses` con `kind =
  'anatomia'`, leídas con `listAnatomias(productId)`
  (`lib/data/anatomias.ts:69`).
- **`inheritanceRule(ownership)`** ya dice qué se puede heredar de un material
  según sea propio o ajeno (`lib/material-herencia.ts`), y `swipe_copies` guarda
  ese `ownership`.
- Los vídeos analizados se leen con `listVideoReferences()`
  (`lib/data/video-references.ts:114`) y **guardan sus fotogramas**, no solo la
  descripción.
- `matchByPosition` (`lib/angulos-vuelta.ts`) ya existe para contar lo que
  volvió de verdad.

Y lo que no existe: **nada alimenta una tanda de anuncios con algo que no sea un
ángulo**, y no hay forma de pedir «más de estos» sobre un anuncio concreto.

## Las decisiones

1. **La fuente de una tanda se hace explícita.** Hoy es implícita —siempre el
   ángulo—; pasa a ser una de tres: ángulo, material o automático.
2. **El material puede ser nuevo o ya analizado, y se elige en el mismo sitio.**
   No hay una segunda biblioteca de material en Ads.
3. **El nivel es un mando, no un reparto.** Eliges uno y toda la tanda sale con
   él.
4. **El material pegado en Ads pasa por su anatomía**, no directo al anuncio.
5. **El automático elige primero y genera después**, en dos llamadas.
6. **El origen se anota en el conjunto**, junto a `angle_id`.

## Alcance

**Dentro:** las tres fuentes sobre el generador que ya existe, los tres niveles
con su cruce con `ownership`, pegar material en Ads, el plan del modo
automático, el vídeo nuevo analizándose aparte, y la anotación del origen.

**Fuera:** reutilizar un material entre productos, generar las imágenes de los
anuncios —sigue el camino de hoy—, y aprender de qué tanda rindió. Lo último no
es pereza: sin métricas de vuelta, una tanda nacida de un ganador y una nacida
de un fracaso se ven exactamente igual en la lista.

## Los tres niveles, y por qué se cruzan con `ownership`

Módulo puro `src/lib/nivel-de-copia.ts`, al lado de `material-herencia.ts` y por
el mismo motivo: es una regla que decide qué se publica y saltársela **no da
ningún error**.

| Nivel | Qué conserva | Cuándo se usa |
|---|---|---|
| `mismo` | Promesa, mecanismo y público. Cambia la ejecución: otro gancho, otra entrada, otro formato | El anuncio ya está ganando y se quiere escalar sin romper lo que funciona |
| `ampliado` | El mecanismo y el deseo, y añade entradas nuevas: otras objeciones, otro momento emocional, un público adyacente | Funciona, y se quiere buscar dónde más funciona |
| `referencia` | Solo la construcción —cómo entra, cómo ordena, con qué ritmo, cómo cierra—. El contenido sale entero de la investigación | El anuncio es de otro producto y lo que sirve es su forma |

**El nivel y `ownership` no son lo mismo y hay que cruzarlos.** El nivel dice
cuánto se acerca **la forma**; `ownership` dice si **el contenido** puede
viajar. La esquina peligrosa es `mismo` sobre material `ajeno`: copiar la
promesa de otro anuncio es afirmar aquí lo que nadie ha comprobado aquí.

La regla, entonces:

```
nivel × ownership → instrucción
```

- `propio`: el nivel manda tal cual. Las cifras están comprobadas y pueden
  viajar.
- `ajeno`: el nivel sigue mandando sobre la forma, y encima va la restricción de
  `inheritanceRule("ajeno")`. `mismo` sobre ajeno significa *misma construcción
  y misma clase de promesa, **con nuestros datos***, nunca sus cifras.

Es una función de dos entradas y seis salidas, sin imports. Se prueba de verdad,
y lo que se prueba es lo que importa: que ninguna de las tres combinaciones
`ajeno` deja de llevar la prohibición, y que las seis son distintas entre sí —si
dos coinciden, uno de los dos mandos no está haciendo nada—.

## El material pegado en Ads

Un botón para quien lo usa; dos llamadas por dentro: **escribe la anatomía y
después genera**. No hay atajo que salte la anatomía, aunque sería una llamada
menos, por dos motivos:

- **La anatomía es donde se corrige.** Una lectura equivocada del anuncio cuesta
  un minuto de corrección ahí y diez anuncios escritos con ella si se descubre
  después.
- **Queda guardada.** La segunda tanda desde el mismo material ya no la paga, y
  aparece en Ángulos como cualquier otra anatomía, corregible allí.

Saltarse la anatomía además crearía la segunda biblioteca de material que esta
decisión existe para evitar.

## El modo automático

Dos llamadas, no una:

1. **El plan.** Corta y barata. Recibe la investigación, los ángulos y las
   anatomías del producto, y devuelve: qué fuente, cuál en concreto, qué nivel,
   qué etapa de entrada, cuántos anuncios, y **por qué**.
2. **La generación.** El camino normal, con ese plan puesto.

Por qué así y no una sola llamada que lo escriba todo:

- **La elección queda escrita.** El resumen dice qué eligió y por qué, y eso es
  lo que separa «un botón que hace algo» de una caja negra.
- **No hay una segunda ruta de generación.** La tanda la escribe el mismo código
  ya probado. Dos rutas paralelas se desincronizan: se arregla una y la otra
  sigue rota.

**El plan se valida contra los identificadores reales antes de usarlo.** Si el
modelo devuelve una anatomía que no existe, la acción **falla diciéndolo**. Lo
que no puede hacer es caer en silencio al ángulo por defecto: saldría una tanda
correcta, cobrada, y con la sensación de que se generó desde el material que se
quería.

## El vídeo

En el formulario de material de Ads se pueden marcar los vídeos **ya
analizados** y, además, subir uno nuevo. El nuevo se pone a analizar en segundo
plano por el camino que ya existe (`analyzeVideoAction`) y **la tanda no lo
espera**: analizar son minutos y bloquear el botón por ello es lo que hace que
se pulse dos veces.

Lo que no puede quedar callado es que la tanda salió sin él:

> Generado sin «vídeo del testimonio», que sigue analizándose. Vuelve a generar
> cuando termine si quieres que entre.

Un trabajo que acaba bien sin haber mirado lo que le diste es indistinguible de
uno que sí lo miró.

## El modelo

Una migración, dos columnas, en el **conjunto** y no en el anuncio: el origen es
de la tanda, y `adsets` es donde ya vive `angle_id`.

```sql
-- De qué material salió una tanda, cuando no salió de un ángulo.
--
-- Va en el conjunto y no en cada anuncio porque es una propiedad de la tanda:
-- repetirla en las veinte filas es la misma verdad escrita veinte veces, y
-- `angle_id` —lo mismo para el otro camino— ya está aquí.
--
-- `set null` y no `cascade`: borrar la anatomía no puede llevarse una campaña
-- que está corriendo. Pierde la referencia, que es lo que sobra.
alter table public.adsets
  add column if not exists source_analysis_id uuid
    references public.analyses (id) on delete set null;

-- Con qué cercanía se copió. Vacío = no salió de un material.
alter table public.adsets
  add column if not exists source_level text not null default ''
    check (source_level in ('', 'mismo', 'ampliado', 'referencia'));
```

`database.ts` está escrito a mano: las dos columnas se añaden a `AdsetRow` y se
marcan opcionales en su `Insertable`, porque todo el código que ya inserta
conjuntos sin ellas tiene que seguir compilando.

## El flujo

En la pestaña Ads, sobre el mismo generador:

1. **Eliges la fuente**: Ángulo, Material o Automático.
2. **Ángulo** — exactamente lo de hoy. No se toca.
3. **Material** — eliges una anatomía existente o pegas material nuevo (copy,
   imágenes, vídeos ya analizados y, si quieres, uno nuevo). Eliges el nivel.
   Lo demás —destino, prelanding, cuántos— es común.
4. **Automático** — un botón. El resumen dice qué eligió.

Lo común a las tres, y es lo que hace que esto no sea una isla: el destino, la
numeración correlativa y la estructura de campaña. Un anuncio nacido de un
material se ve, se numera y se sube igual que cualquier otro.

**El generador sale de `tab-ads.tsx` a su propio componente.** Ese archivo son
520 líneas y la mitad es la tarjeta de generar; meterle tres fuentes dentro lo
deja en un tamaño en el que ya no se lee. No es refactor de paso: es que sin
sacarlo, lo que hay que escribir no cabe.

## Los encargos

**El de la tanda desde material** sustituye el bloque del ángulo por la anatomía
y el par nivel × `ownership`. El contexto del producto sigue yendo **aparte como
prefijo cacheable**: se usa en todas las tandas del producto y meterlo dentro
del prompt haría pagar la ficha y la investigación enteras cada vez.

**El del plan automático** recibe la lista de ángulos y de anatomías con su
identificador y una línea de cada uno, y devuelve la elección con su motivo. Se
le pide que elija **lo que menos se parezca a lo último generado**, porque un
modo automático que converge en la misma tanda cada vez deja de servir a la
tercera.

## Pruebas

Puro, y por tanto probado de verdad:

- Las seis combinaciones de nivel × `ownership`: que las tres de `ajeno` llevan
  la prohibición de heredar cifras, y que las seis son distintas.
- La validación del plan automático contra identificadores reales: que un
  identificador inventado da error y **no** cae al ángulo por defecto.
- El recuento de lo guardado frente a lo devuelto, con `matchByPosition`, que ya
  existe.

No es puro y se comprueba a mano, con lista: pegar un material con un vídeo
nuevo y ver que la tanda sale avisando de que no lo esperó; generar el mismo
material en los tres niveles y comprobar que se notan distintos; y que el modo
automático dice en el resumen qué eligió.

## Orden de construcción

1. `nivel-de-copia.ts` con sus tests. Es la regla que sostiene lo demás y no
   depende de nada.
2. La migración y el origen en el conjunto.
3. La fuente **Material** desde una anatomía **ya existente**: es el camino
   corto y deja algo usable —ya hay dos anatomías escritas—.
4. Pegar material nuevo en Ads, con su anatomía y su vídeo aparte.
5. El modo automático.

Cada paso deja algo usable por su cuenta. El tercero es el que más rinde por lo
que cuesta.

## Lo que este diseño deja pendiente

- **Reutilizar un material entre productos.** Sigue colgando del producto desde
  el que se analizó.
- **Generar las imágenes de la tanda.** El anuncio trae su instrucción de
  imagen, como hoy; generarlas sigue siendo el camino de hoy.
- **Aprender de lo que rindió.** Con el origen anotado en el conjunto, el día
  que haya métricas de vuelta se podrá preguntar qué material produjo las
  tandas que funcionaron. Hoy no se puede, y anotarlo es la mitad barata de
  poder hacerlo.
