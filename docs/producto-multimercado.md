# Un producto en varios mercados

Estado: **especificado, sin empezar.** Escrito el 12 de agosto de 2026.

## Lo que cambia

Hoy el modelo dice, y está escrito en la pantalla de Tiendas: *«el producto vive
en un mercado concreto; el mismo producto en dos países son dos productos que se
crean duplicando, porque su investigación de mercado no es la misma»*.

Eso deja de ser cierto para una parte del catálogo. Un producto puede servir a
varios mercados y hay que poder trabajarlo **una vez**, con dos modos:

- **General**: vale para todos sus mercados. **No se enseña precio**, porque no
  hay uno solo y enseñar el de un país en la página de otro es peor que no
  enseñar ninguno.
- **De un país**: se elige mercado y entonces sí hay moneda, precio, acento y
  todo lo que dependa del sitio.

El selector es lo que cambia entre los dos, y **las herramientas funcionan en los
dos**: copys, landings, vídeos, Instagram. Lo que cambia es qué se puede decir.

## El precio, que es el nudo

Tres caminos, y el orden importa porque el primero que exista manda:

1. **Precio propio de ese mercado**, escrito a mano. Es el que gana siempre:
   redondear a `9.990` en Chile no sale de ninguna conversión.
2. **Convertido**, desde el precio base y el tipo de cambio. Ya existe la tabla
   `fx_rates`.
3. **Sin precio**, en modo general.

Lo que **no** debe pasar: que una conversión pise un precio escrito a mano, ni
que un precio convertido se enseñe como si fuera el definitivo. Un precio
convertido y sin redondear —«$10.847»— se lee como un error de la tienda.

## Lo que hay que decidir antes de escribir

- **La investigación, ¿es una o por mercado?** El público de Chile y el de
  México no son el mismo, y ese era el motivo original de duplicar productos. Si
  se comparte, hay que decir en el encargo para qué mercado se escribe cada
  pieza. Si no, deja de ser un producto y vuelven a ser dos.
- **Qué pasa con lo ya escrito.** Un copy generado para un mercado, ¿vale en modo
  general? Probablemente no si nombra el precio o el envío.
- **De dónde sale el tipo de cambio y cuándo se congela.** Un precio que cambia
  solo cada día es un precio que baila en la página. Lo razonable: convertir al
  fijarlo y guardar el resultado, no al pintarlo.
- **Si una landing publicada es una por mercado o una sola.** En Shopify, un
  mercado es un dominio o una ruta distinta: probablemente una por mercado, y
  entonces el modo general sirve para escribirla y el de país para publicarla.

## Por dónde empezar

1. Que un producto pueda apuntar a **varios** mercados en vez de a uno.
2. El **selector** en la ficha del producto, con «general» como estado inicial:
   es el que no puede decir nada que no sea cierto en todos.
3. **Ocultar el precio en general**, en todas las pantallas y en todos los
   encargos. Esto es lo que evita el error caro: una landing publicada con el
   precio de otro país.
4. Los precios por mercado y la conversión, con el orden de arriba.
