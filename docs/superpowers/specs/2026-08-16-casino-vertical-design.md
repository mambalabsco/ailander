# Casino online: el vertical y la investigación por país

Escrito el 16 de agosto de 2026. **Primera de dos partes**; la segunda son las
apps, los ángulos por app y las imágenes.

Pedido: poder trabajar casino online en la misma plataforma. Los documentos se
generan **por país** —quién juega casino online en Chile—, los copys largos son
los mismos que ya hay con otro enfoque de producto, y dentro de cada producto
hay apps con su propio enfoque.

## La decisión que ordena todo lo demás

**En casino, un producto es el país.** «Casino online Chile» es un producto; las
apps —Monticello Online y las demás— cuelgan de él.

De ahí sale gratis lo que se pedía: `research_documents` ya cuelga de
`product_id`, así que **los documentos son por país sin mover la investigación de
sitio**. No hay tabla nueva ni migración de datos para eso.

## De dónde se parte

Comprobado en el código, no recordado:

- Los seis documentos son un **enum de Postgres**, `research_document_id`
  (`20260727000100_schema.sql:71`), y un `Record` en TypeScript:
  `ProductResearch.documents` (`types/research.ts:385`).
- **`researchWaves()` recorre todo `RESEARCH_DOCUMENT_META`**
  (`research-prompts.ts:585`). Añadir documentos ahí sin más se los enseña
  también a los productos de e-commerce.
- `buildResearchPrompt` es un `switch` sobre el identificador
  (`research-prompts.ts:555`): cada documento tiene su constructor.
- `RESEARCH_SCHEMAS` es un `Record` por documento (`research-schemas.ts:270`).
- `research_shared` **no sirve para esto**: significa «vale para todos los
  mercados de este producto», no «para todos los productos del país».
- El generador de imágenes **acepta imágenes de referencia**
  (`higgsfield.ts:96`), y viajan como bytes desde el bucket privado
  (`higgsfield-cli.ts:492`). Es lo que hará falta en la segunda parte.

## El vertical

`products` gana una columna:

```sql
alter table public.products
  add column if not exists vertical text not null default 'ecommerce'
    check (vertical in ('ecommerce', 'casino'));
```

`ecommerce` por defecto **y ese defecto es la compatibilidad entera**: todo lo
que existe hoy nace en el vertical de siempre y no cambia de comportamiento.

Decide tres cosas, y solo tres:

1. **Qué documentos tiene la investigación.**
2. **Con qué encargo se escribe cada uno.**
3. **Qué pestañas se ven.**

### Qué se esconde en casino

Precios, Oferta, y la publicación en Shopify. No tienen sentido sin precio ni
envío, y una pantalla que pide datos que no existen es una pantalla que enseña a
ignorarla.

**No se borra nada ni se hace opcional en la base**: se esconde en la interfaz.
Un producto de casino con `price = 0` es correcto; lo que no puede es pedir que
lo rellenes.

## Los documentos

Los seis de siempre, con el encargo adaptado, más tres que no tienen equivalente:

| Documento | Por qué no cabe en los seis |
|---|---|
| **Regulación y legalidad** | Qué se puede decir y qué no en ese país. Acota lo que el copy puede prometer, igual que la investigación acota las promesas de un suplemento |
| **Pagos y retiros** | Los métodos locales. En casino es la primera objeción, no un detalle de la ficha |
| **Panorama de casinos** | Los competidores reales del país, sus bonos y su posicionamiento |

### La lista deja de ser una constante

Hoy `RESEARCH_DOCUMENT_META` es la lista de todos los documentos y
`researchWaves()` la recorre entera. Pasa a haber **una lista por vertical**, en
`src/types/research.ts`:

```ts
export type Vertical = "ecommerce" | "casino";

export function documentsFor(vertical: Vertical): ResearchDocumentId[];
```

y `researchWaves(vertical)` y `blockedBy(id, research, vertical)` la consultan en
vez de recorrer el `Record` completo.

Va en `types/research.ts` y no en `research-prompts.ts` por un motivo concreto:
ese archivo **no tiene ni un import**, así que se puede cargar desde un test.
`research-prompts.ts` importa con alias y no se puede. Lo que hay que poder
comprobar —que un producto de e-commerce nunca ve un documento de casino— tiene
que estar donde se pueda probar.

Es el cambio con más superficie de toda la spec, y es obligatorio: sin él, un
producto de suplementos empieza a pedir un documento de regulación de juego.

### El `Record` sigue teniendo las nueve claves

`ProductResearch.documents` mantiene una entrada por documento **de los nueve**,
con `emptyDocumentState()` en los que no apliquen. Alternativa descartada: hacer
las claves opcionales, que obliga a comprobar `undefined` en cada sitio que hoy
lee `research.documents[id]` y convierte un cambio acotado en uno que toca todo.

Lo que decide qué se ve y qué se genera es `documentsFor(vertical)`, no la
presencia de la clave.

### El enum, con cuidado

```sql
alter type public.research_document_id add value if not exists 'regulation';
alter type public.research_document_id add value if not exists 'payments';
alter type public.research_document_id add value if not exists 'casino-landscape';
```

**`if not exists` no es opcional**: estas migraciones se reejecutan en cada
despliegue y sin él la segunda vez aborta y se lleva por delante lo que venga
detrás.

## Los encargos

`buildResearchPrompt` ya es un `switch` por documento. Pasa a recibir el vertical
y a elegir entre dos constructores para los seis compartidos:

```
buildAwarenessPrompt(...)          → e-commerce, el de hoy, intacto
buildCasinoAwarenessPrompt(...)    → «quién juega casino online en Chile»
```

**Dos constructores y no uno con condicionales dentro.** Un encargo con `if` cada
tres párrafos deja de poder leerse como lo que es —un texto que alguien escribió
con criterio— y cada arreglo de uno arriesga el otro.

Lo que cambia en el de casino, más allá del sujeto: no hay precio ni envío ni
recompra; hay depósito, retiro, bono y rollover. El «cliente» es un jugador y la
«compra» es un registro con depósito.

## Lo que el copy no puede decir, que no es un detalle

El encargo de copy lleva hoy «nada de promesas médicas ni de resultados
garantizados». **El juego necesita su equivalente y va en el mismo sitio**:

- mayoría de edad y juego responsable donde la regulación lo exija,
- **nunca prometer ganancias** ni presentar el juego como una fuente de ingresos,
- y lo que diga el documento de regulación de ese país, que por eso es un
  documento y no una nota.

Sin esto salen copys que no se pueden publicar, y quien lo descubre es el
revisor de Meta —después de haberlos pagado—.

## Alcance

**Dentro:** la columna `vertical`, la lista de documentos por vertical, los tres
documentos nuevos con su encargo y su esquema, los seis encargos de casino, las
reglas de juego en el encargo de copy, y esconder lo que no aplica.

**Fuera, y va en la segunda parte:** las apps, los ángulos por app, y las
imágenes con la captura como referencia. Fuera del todo: pedidos, ingresos y
cualquier medición de lo que rinde una app.

## El flujo

1. Creas un producto y eliges **Casino online** como vertical.
2. Rellenas país e idioma. No hay precio ni tienda que pedir.
3. La pestaña de Documentos enseña **nueve**, con sus dependencias y su orden.
4. Se generan con el motor de siempre.
5. Los copys largos se escriben como hoy, desde los ángulos y los deseos.

## Pruebas

Puro, y por tanto probado de verdad:

- `documentsFor("ecommerce")` devuelve exactamente los seis de hoy, en su orden.
  Es la prueba de que no se ha roto nada de lo que ya funciona.
- `documentsFor("casino")` devuelve los nueve.
- `researchWaves("casino")` respeta las dependencias y no deja ningún documento
  fuera de ninguna tanda.
- Un producto de e-commerce **nunca** ve un documento de casino, ni al revés.

No es puro y se comprueba a mano: crear un producto de casino y ver que las
pestañas de Precios y Oferta no están, y que el de e-commerce que ya existía
sigue enseñando seis documentos y no nueve.

## Orden de construcción

1. La columna `vertical` y `documentsFor`, con sus tests. Nada visible todavía,
   y los seis de siempre siguen saliendo igual.
2. El enum y los tres documentos nuevos, con su esquema y su encargo.
3. Los seis encargos de casino.
4. Esconder lo que no aplica, y las reglas de juego en el copy.

Cada paso deja algo comprobable. El primero es el que protege lo que ya existe,
y por eso va delante.

## Lo que este diseño deja pendiente

- **Las apps y todo lo que cuelga de ellas.** Segunda parte.
- **Compartir un documento entre países.** Hoy cada país es un producto y escribe
  los suyos. Si dos países se parecen, se duplica trabajo; es un problema real y
  no se resuelve aquí.
- **Saber qué app rinde.** Igual que en el resto de la plataforma: sin métricas
  de vuelta, no hay nada que aprender.
