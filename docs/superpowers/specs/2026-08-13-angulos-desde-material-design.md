# Ángulos desde material que ya funcionó

Escrito el 13 de agosto de 2026.

Pedido: poder darle a la plataforma un copy que funciona —con las imágenes y los
vídeos que se lanzaron con él— para que lo analice a fondo y saque de ahí varios
ángulos con sus directrices, que después alimenten copys largos de Facebook y
vídeos.

La frase que ordena todo esto: **«no apliques las restricciones que tenga el
producto; toma la idea de la base para extender más el enfoque»**.

## De dónde se parte

Comprobado en el código, no recordado:

- `swipe_copies` guarda copys que funcionaron, con `source`, `format`, `note` y
  un `product_id` **nulable** a propósito —«un copy de otro producto sirve como
  referencia general»— (`20260728000800_landings.sql:58`).
- `VideoAnalysis` ya extrae de un anuncio en vídeo el gancho, la promesa, la voz,
  los *beats*, el ritmo de plano, el momento del producto, el cierre y por qué
  funciona (`video/analysis.ts:89`). `analyzeVideoAction` hace los fotogramas y
  la transcripción.
- `analyses` es una tabla genérica con `kind`, `summary` y `payload` JSON
  (`database.ts:422`). Sirve para guardar un artefacto nuevo sin migración.
- `angles` cuelga de un producto —`product_id not null`— y ya tiene arco
  narrativo, mecanismo del problema, mecanismo de la solución y momento
  emocional. Todo lo demás tiene valor por defecto.
- `generateStructured` acepta imágenes y un `context` cacheable aparte del
  prompt.

Y lo que no existe: **nada junta un copy con sus imágenes y sus vídeos para sacar
ángulos.** Los de hoy salen de la investigación, no de material que ya rindió.

## Las decisiones

1. **El material puede ser tuyo o ajeno, y se dice cuál.** De lo tuyo se puede
   heredar una promesa concreta y sus datos; de lo ajeno, solo la construcción.
2. **De un material salen varios ángulos**, entre tres y cinco.
3. **Las directrices son del material, comunes a todos sus ángulos.**
4. **El material cuelga de un producto**, como los ángulos.
5. **Dos pasadas**: primero la anatomía, después los ángulos.

## Alcance

**Dentro:** subir el material, analizar sus vídeos con lo que ya existe, escribir
la anatomía, poder corregirla, y sacar ángulos que se guardan como ángulos
normales.

**Fuera:** rehacer el archivo de copys, tocar el pipeline de vídeo, y cualquier
biblioteca de material compartida entre productos. Un material analizado sirve al
producto desde el que se analizó; reutilizarlo en otro es otro trabajo, con su
pantalla y su tabla.

## El modelo

### El material

`swipe_copies` recibe una columna:

```sql
alter table public.swipe_copies
  add column if not exists ownership text not null default 'ajeno'
    check (ownership in ('propio', 'ajeno'));
```

No es cosmética y por eso es una columna y no una nota: **decide qué se puede
heredar**. De un anuncio propio, una promesa concreta y sus cifras son datos
comprobados y pueden pasar al ángulo. De uno ajeno, una cifra es algo que dijo
otro sobre otro producto, y heredarla es afirmar lo que nadie ha comprobado. El
valor por defecto es `ajeno` porque es el lado seguro.

Los vídeos del material se analizan con `analyzeVideoAction` y quedan como
referencias de vídeo, que ya se guardan hoy. **El vídeo no se conserva**, como
ya decidió `video_references`: se guarda la construcción, no la obra.

Las imágenes van al análisis y no se guardan. Lo que importa de ellas es lo que
enseñan, y ya queda escrito en la anatomía; guardarlas sería pagar almacenamiento
por una copia de algo ajeno.

### La anatomía

Una fila de `analyses` con `kind = 'anatomia'`, su `product_id`, el `summary`
para la lista y el JSON en `payload`:

```ts
interface Anatomia {
  swipeId: string;
  /** Cómo entra: la primera frase y por qué para el scroll. */
  entrada: string;
  /** Qué promete, dicho como lo diría el anuncio. */
  promesa: string;
  /** A quién le habla, en sus términos y no en los nuestros. */
  publico: string;
  /** El deseo que explota. Es lo que después ancla cada ángulo. */
  deseo: string;
  /** Cómo se cuenta: orden de las partes y qué hace cada una. */
  estructura: { parte: string; papel: string }[];
  /** Ritmo y tono: quién parece que habla y a qué velocidad. */
  ritmo: string;
  /** Qué se enseña y cuándo, incluido el producto. */
  queEnsena: string;
  /** Las objeciones que toca y cómo las resuelve. */
  objeciones: { objecion: string; comoLaResuelve: string }[];
  /** Cómo cierra y qué pide. */
  cierre: string;
  /** Por qué funciona, en una frase que se pueda discutir. */
  porQueFunciona: string;
}
```

Es **editable antes de sacar ángulos**, y esa es la mitad del valor del diseño:
corregir aquí una lectura equivocada del anuncio cuesta un minuto; descubrirla
en cinco ángulos ya escritos cuesta cinco, más lo que se pagó por escribirlos.

### Los ángulos

Ángulos normales, en `angles`. Se les añade de dónde vienen:

```sql
alter table public.angles
  add column if not exists source_analysis_id uuid
    references public.analyses (id) on delete set null;
```

`on delete set null` y no `cascade`: borrar la anatomía no puede llevarse ángulos
que ya se están usando en copys y en vídeos. Pierden la referencia, que es lo
que sobra, no el trabajo.

Guardarlos como ángulos normales es lo que hace que esto no sea una isla: los
copys largos, los anuncios cortos y los vídeos ya consumen ángulos, y no hay que
tocar nada de eso.

## El flujo

En la ficha del producto, donde ya vive el archivo de copys:

1. **Pegas el copy**, marcas si es tuyo o ajeno, y adjuntas imágenes y vídeos.
2. **Los vídeos se analizan uno a uno**, con su avance dicho —son minutos, y un
   botón girando sin decir por dónde va es lo que hace que se pulse dos veces.
3. **Una llamada escribe la anatomía**, con el copy, las imágenes y los análisis
   de vídeo delante. La lees y la corriges si hace falta.
4. **Otra llamada saca los ángulos**, entre tres y cinco, desde la anatomía y la
   investigación del producto.

Dos cosas que vienen de fallos de ayer y no se repiten:

- Los ángulos vuelven **numerados y en el mismo orden**, y por tandas si no caben.
  Pedirle al modelo que repita identificadores largos es pedirle que se equivoque
  en lo que no aporta nada, y una respuesta larga se corta por longitud sin
  fallar: devuelve JSON incompleto y se pierde la vuelta entera, ya pagada.
- El resumen dice **cuántos ángulos se guardaron de verdad**, no cuántos devolvió
  el modelo. Un trabajo que acaba bien sin haber hecho nada es indistinguible de
  uno que no arrancó.

## Las restricciones, que es lo delicado

**La anatomía y los ángulos no se acotan por lo que el producto puede prometer.**
Se extrae la idea y se extiende, que es lo pedido: un anuncio que funciona lo hace
por un mecanismo —un miedo, un atajo, una identidad— y ese mecanismo es
reutilizable aunque el producto de origen sea otro y prometa otra cosa.

Lo que sí se mantiene, y no es lo mismo: **el encargo del copy sigue sin poder
afirmar que el producto hace lo que no hace.** Esa regla ya está escrita en varios
sitios de la plataforma —los ingredientes deducidos van marcados, «nada de
promesas que la investigación no sostenga»— y no se toca aquí. La diferencia es
la que separa una idea de una afirmación: el ángulo puede ir tan lejos como haga
falta; la frase que se publica, no.

Cuando un ángulo pida una promesa que la investigación no sostiene, **sale
marcado, no censurado**: se guarda con un aviso para que se decida a mano. Un
ángulo silenciado es un ángulo que no se puede discutir, y esto existe
precisamente para poder discutirlos.

## Los encargos

Dos, y los dos con el contexto del producto como prefijo cacheable aparte del
prompt: se usan varias veces por material, y pegarlo dentro haría pagar la ficha
y la investigación enteras en cada llamada.

**El de la anatomía** recibe el copy entero, las imágenes y los análisis de vídeo
ya hechos. Pide describir, no juzgar ni mejorar: lo que se busca es cómo está
construido. Si el material es ajeno, se le dice que no atribuya al producto
propio ninguna cifra ni promesa del anuncio.

**El de los ángulos** recibe la anatomía y la investigación. Pide entre tres y
cinco entradas **distintas entre sí** —no la misma idea reformulada— y para cada
una el arco, los dos mecanismos y el momento emocional, que es lo que el resto de
la plataforma espera de un ángulo.

## Pruebas

Puro y por tanto probado de verdad:

- El troceado y el casado por posición de los ángulos que vuelven.
- El contador de lo guardado frente a lo devuelto.
- La regla de herencia según `ownership`: de un material ajeno, una cifra del
  anuncio no puede acabar en el ángulo.

No es puro y se comprueba a mano, con lista: subir un material con dos vídeos y
ver el avance de cada uno; corregir la anatomía y comprobar que los ángulos salen
con lo corregido; y que un ángulo guardado se puede usar ya en un copy largo y en
un vídeo sin tocar nada más.

## Orden de construcción

1. La columna `ownership`, el alta del material y el análisis de sus vídeos con lo
   que ya existe.
2. La anatomía: encargo, guardado en `analyses` y pantalla para leerla y
   corregirla.
3. Los ángulos: encargo, tandas, contador de guardados y la marca de origen.
4. El aviso de promesa no sostenida.

Cada paso deja algo usable: con el primero ya tienes el material y sus vídeos
analizados; con el segundo, una anatomía que se lee aunque no saques ángulos.

## Lo que este diseño deja pendiente

- **Reutilizar un material en otro producto.** Hoy cuelga del producto desde el
  que se analizó.
- **Directrices propias de cada ángulo.** Se decidió que sean comunes al
  material; si al usarlas se ve que un ángulo necesita las suyas, es un añadido
  natural sobre esto.
- **Aprender de lo que rinde.** Nada de esto mira todavía qué ángulo funcionó
  después. Sin métricas de vuelta, un ángulo nacido de un ganador y uno nacido de
  un fracaso se ven igual en la lista.
