# Caché de prompts

Medido en el panel de Gasto el 11 de agosto: la investigación lleva **73 US$ en
47 llamadas**, con **15,4 millones de tokens de entrada contra 1 de salida**.
Catorce a uno. Ese ratio no dice «escribe mucho»: dice que **el mismo contexto
viaja una y otra vez**.

## Cómo funciona, y por qué eso decide el diseño

La caché es de **prefijo**. Se marca un punto de corte en el mensaje y todo lo
que va **antes** se guarda; la siguiente llamada que empiece **byte a byte igual**
lo reutiliza a una fracción del precio. Un carácter distinto al principio y no
hay caché — no falla, simplemente se paga entero, y nadie se entera.

De ahí salen las tres reglas de esto:

1. **Lo estable va primero y lo variable al final.** Hoy el prompt es una sola
   cadena donde el contexto del producto y la instrucción del documento van
   mezclados. Hay que partirla.
2. **Lo estable tiene que ser idéntico entre llamadas.** Nada de fechas, nada de
   «documento 4 de 6», nada de listas que cambien de orden. Si el nombre del
   documento entra en el prefijo, cada documento tiene su propio prefijo y no se
   comparte nada.
3. **El prefijo tiene que ser largo** para que compense. En investigación lo es
   —son los documentos anteriores enteros—, y en las tandas de textos de una
   copia también.

## El cambio

`generateStructured` acepta hoy `prompt: string`. Pasa a aceptar además un
`context` opcional que va **delante** y lleva el punto de corte:

    generateStructured({
      context: "producto, investigación previa…",   // estable, cacheado
      prompt: "lo que hay que escribir ahora",      // variable
      …
    })

Los constructores afectados son los que ya se identificaron: `buildTextPrompt`,
`buildTemplateCopyPrompt`, `buildClonePrompt` y los de investigación. Cada uno
devuelve dos trozos en vez de uno.

## Cómo se sabe que funciona, que es la parte que se olvida

La respuesta trae `cache_creation_input_tokens` y `cache_read_input_tokens`. **Si
el segundo no crece, la caché no está funcionando** — y sin mirarlo, «hemos
puesto caché» es una creencia. Se guardan en `runs` junto a los otros dos
contadores y salen en el panel de Gasto, en una columna nueva.

Sin eso, este trabajo no se puede dar por hecho: se paga igual y el panel sigue
diciendo lo mismo.

## Antes de esto, dos cosas más baratas

- **Las llamadas fallidas de investigación: 6, y 13,11 US$.** El 18 % de lo que
  cuesta, y no compró nada. Averiguar por qué fallan antes de optimizar lo que
  sí funciona.
- **El modelo.** Sonnet 5 lleva 75 US$ en 56 llamadas y Opus 5 quince en 38: el
  volumen está yendo al caro. Mirar qué documento usa cuál.
