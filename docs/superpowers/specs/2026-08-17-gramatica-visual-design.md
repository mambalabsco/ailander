# La gramática visual de una creatividad

Escrito el 17 de agosto de 2026, después de comparar catorce creatividades hechas
a mano con lo que la plataforma produce hoy.

Pedido: que las imágenes de los anuncios dejen de salir básicas.

## El diagnóstico, y no es el que parecía

**No es falta de detalle.** El prompt que la plataforma genera hoy tiene 912
caracteres bien escritos —la media de los 58 anuncios es 1.075—. Este es literal,
del último anuncio generado:

> *Clean price-comparison infographic on a deep dark green background. **Four
> equal boxes in a horizontal row.** Boxes 1 to 3 in muted desaturated grey with
> small flat icons… Box 4 highlighted with a bright lime-green border…*

Está bien escrito y sale plano porque describe **muebles colocados**. Cuatro
cajas en fila es una diapositiva, no un anuncio.

## Lo que tienen las referencias y el encargo no pide

Seis cosas. Ninguna es «más detalle»:

1. **Un dispositivo de confrontación.** Las catorce tienen uno: el rayo que parte
   el lienzo, la cara dividida por la mitad, la cadena con un eslabón roto en
   rojo, la cápsula contra el gotero, la lista tachada. El encargo pide rejillas
   y filas — reparto, no tensión.
2. **El titular de negación-corrección.** «No es tu **GENÉTICA.** ¡Es el selenio
   que Chile no tiene!», «No comes **DEMASIADO.** ¡Tu T3 está bloqueada!», «No
   estás **FALLANDO.**» Está en ocho de las catorce y **el encargo no lo menciona
   en ninguna parte**.
3. **Jerarquía tipográfica brutal.** Una palabra ocupando un cuarto del alto. El
   encargo dice «very large white price text»: «grande» es relativo, y un modelo
   lo interpreta como grandecito.
4. **Dos insignias.** Roja con ✗ para el mito, verde con ✓ para la causa real,
   arriba. Repetidas y reconocibles de una tanda a otra.
5. **Paleta bloqueada.** Es el peor síntoma medido: los tres últimos prompts
   piden, respectivamente, «deep dark green background», «**Light background**
   with deep green accents» y «vertical gradient in deep green fading to **soft
   mint**». Tres anuncios del mismo producto, tres marcas distintas.
6. **Barra inferior idéntica.** `Naturox · 30% OFF Hoy · Prueba Por 30 Días` en
   las catorce. En la plataforma cada anuncio se inventa la suya.

Y dos de propina: el encargo pide **cinco** viñetas donde las referencias ponen
**tres**, y pide «tiny grey fine print», que un generador convierte en papilla.

## Lo que queda fuera, decidido

**La identidad visual no pasa a ser un dato.** Nada de tabla de marca con paleta,
envase y barra de oferta. Se descartó a propósito: lo que se arregla aquí es el
encargo, que es texto y sale gratis. La consecuencia es honesta y conviene
decirla — con dos productos distintos, cada uno seguirá teniendo la paleta que el
modelo decida para él, y solo dentro de cada tanda estará bloqueada.

## La gramática

Módulo puro nuevo, `src/lib/gramatica-visual.ts`, que exporta un bloque de texto.
Va **una sola vez** en el encargo, antes de la lista de formatos, y no repetido en
cada uno: repetirlo diez veces gastaría contexto y rompería la caché de prefijo.

Las siete reglas:

1. **Un dispositivo, siempre.** Cada creatividad se organiza alrededor de **una**
   tensión visual: un rayo que parte el lienzo en dos, una cara dividida por la
   mitad, una cadena con un eslabón roto, dos paneles enfrentados, una lista
   tachada. **Prohibida la rejilla neutra** de tarjetas o cajas repartidas: eso
   es una diapositiva.
2. **Tres alturas de texto, y solo tres.** Antetítulo de dos a cuatro palabras
   → **una sola palabra** en mayúsculas ocupando **un cuarto del alto del
   lienzo** → subtitular de una línea en el color de acento. La medida va escrita
   en el prompt, no como «grande».
3. **Tres viñetas. Nunca cinco.** Con casilla marcada, de cuatro a seis palabras
   cada una.
4. **Una sola paleta en toda la tanda.** El primer anuncio la fija —fondo, acento
   y tipografía— y los nueve siguientes la repiten **literalmente**. El rojo se
   reserva para el lado equivocado y no se usa para nada más.
5. **La misma barra inferior en los diez**, con la forma `Marca · Oferta ·
   Garantía`.
6. **Nada de letra pequeña.** Lo que no se lea en una miniatura no entra. «Fine
   print» produce manchas grises ilegibles.
7. **El envase, siempre en el mismo sitio**: abajo, centrado, y descrito igual en
   los diez.

## Los cinco formatos nuevos

Salen de las referencias, y ninguno existe hoy.

Entran por **tres sitios y los tres son obligatorios**, porque el tipo sale del
array: el identificador en `SHORT_AD_FORMATS`, la ficha en `SHORT_AD_FORMAT_META`
—con `origin: "propio"`, que es lo que hace que la pantalla los marque como
«Añadido»— y la instrucción visual en el catálogo. Añadir uno a
`SHORT_AD_FORMAT_META` sin ponerlo en el array **no compila**, porque
`KnownShortAdFormat` se deriva de él; olvidarlo en el catálogo de instrucciones sí
compila y es justo lo que caza la prueba de deriva.

Con eso, `formatsForStage` los reparte por etapa sin tocar nada más.

| Identificador | Qué es | Etapas |
|---|---|---|
| `rayo-de-negacion` | Silueta apagada contra silueta iluminada, un rayo entre las dos. Insignia roja con el mito, verde con la causa real. Titular de negación. | TOFU, MOFU |
| `comparativa-dividida` | Una cara partida por la mitad: el lado que funciona contra «la tuya». Cinco ✓ contra cinco ✗ en píldoras. | MOFU, BOFU |
| `lo-que-probaste` | Columna de lo ya intentado, **tachada**, contra la columna de por qué ninguno llegó. | MOFU |
| `cadena-rota` | Cadena de eslabones encadenados con **uno roto en rojo**, y una flecha desde el producto señalándolo. | MOFU, BOFU |
| `dos-vias` | El camino de siempre contra el del producto, cinco pasos verticales cada uno, en rojo y en verde. | BOFU |

`rayo-de-negacion` no es `antes-despues`. El de antes y después enseña dos
momentos de la misma persona; éste enfrenta **una creencia falsa con una causa
real**, y por eso lleva las dos insignias y el titular de negación.

## Los diez de ahora, reescritos

Mismos identificadores, mismas etapas: nada de lo que ya existe cambia de
comportamiento. Lo que cambia es el texto de cada instrucción, de describir
reparto a describir tensión. El de comparativa de precio, como muestra:

> **Antes:** «Cuatro cajas en fila: tres alternativas cotidianas en gris apagado
> con su coste diario y una X roja, y la cuarta destacada…»
>
> **Después:** «Tres alternativas cotidianas **tachadas** a la izquierda, en gris
> y pequeñas, contra el producto a la derecha ocupando el doble. Entre ambos, el
> coste diario del producto como **titular**, a un cuarto del alto. Tres viñetas
> debajo. Nada más.»

## Las pruebas

**La que importa es de deriva**, y es la misma clase de fallo que el titular
recortado: el encargo y el catálogo separándose sin que nadie lo note.

- **Todo formato conocido tiene su instrucción visual escrita.** Hoy, si añades
  uno y olvidas el brief, el encargo dice literalmente «Decide tú el tratamiento
  visual y descríbelo» y no falla nada — sale una imagen genérica y nadie sabe
  por qué. Esta prueba lo caza al añadir el formato.
- La gramática nombra las siete reglas.
- Pide **tres** viñetas y no cinco.
- Prohíbe la letra pequeña.

`FORMAT_IMAGE_BRIEFS` vive en `short-ad-prompts.ts`, que importa con alias y no se
puede cargar desde un test. Para poder probar la correspondencia, el catálogo de
instrucciones se **mueve** a `gramatica-visual.ts`, que es puro; `short-ad-prompts.ts`
lo importa. Es un traslado, no una reescritura.

**Y lo que no se puede probar solo:** que las imágenes salgan mejor. Eso es una
tanda de generación real y cuesta dinero. Lo único comprobable sin gastar es que
el encargo diga lo que tiene que decir.

## Fuera, a propósito

- **La identidad visual como dato**, ya dicho.
- **Un formato por cada referencia.** Catorce imágenes son cinco arquetipos
  repetidos; convertir cada variante en un formato sería una lista que nadie
  puede repartir por etapa.
- **Tocar el encargo del copy largo.** Este documento es solo la imagen del
  anuncio corto.
