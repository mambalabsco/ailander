/**
 * Pixel de Shopify para completar el embudo de las pruebas A/B.
 *
 * Se pega en la tienda: Ajustes → Eventos de clientes → Añadir pixel
 * personalizado. Cambia SOLO la constante de abajo por tu dominio.
 *
 * **Por qué hace falta.** El servidor ya cuenta las visitas y Shopify sabe de
 * los pedidos, pero los dos pasos del medio —carrito y pasarela— solo existen
 * en el navegador: la API de pedidos no sabe nada de ellos. Sin este pixel, el
 * embudo tiene el primer y el último escalón, y un hueco donde está justamente
 * la fuga que se puede arreglar.
 *
 * **Qué NO hace.** No identifica a nadie ni manda datos personales: solo el
 * identificador anónimo que la propia landing puso en una cookie.
 */

const PLATAFORMA = "https://TU-DOMINIO.com";

/*
 * El sandbox del pixel corre aislado del resto de la página, así que no puede
 * leer `document.cookie` directamente: hay que pedírselo a la API `browser`,
 * que es asíncrona.
 */
async function contexto() {
  const [visitante, variante] = await Promise.all([
    browser.cookie.get("lp_v"),
    browser.localStorage.getItem("lp_variant"),
  ]);

  // Sin variante, la visita no vino de una prueba: no hay nada que medir.
  if (!visitante || !variante) return null;

  const experimento = await browser.localStorage.getItem("lp_experiment");
  return { visitante, variante, experimento };
}

async function avisar(paso, valor, moneda) {
  const datos = await contexto();
  if (!datos) return;

  // `keepalive` para que el aviso salga aunque la página se esté cerrando, que
  // es exactamente lo que pasa al pasar a la pasarela.
  fetch(`${PLATAFORMA}/api/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      experiment: datos.experimento,
      variant: datos.variante,
      visitor: datos.visitante,
      kind: paso,
      value: valor,
      currency: moneda,
    }),
  }).catch(() => {});
}

analytics.subscribe("product_added_to_cart", () => {
  avisar("carrito");
});

analytics.subscribe("checkout_started", () => {
  avisar("pasarela");
});

analytics.subscribe("checkout_completed", (evento) => {
  const total = evento?.data?.checkout?.totalPrice;
  avisar("compra", total?.amount, total?.currencyCode);
});
