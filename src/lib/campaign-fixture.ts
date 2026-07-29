import type { AdSet, Campaign, Prelanding, ShortAd } from "@/types/campaign";

/**
 * Estructura de campaña de ejemplo para el producto de demostración.
 *
 * Reproduce la forma real de `short.md` — una campaña BOFU con un conjunto que
 * apunta a la página de producto y cinco anuncios numerados correlativamente —
 * y añade un segundo conjunto TOFU que apunta a una prelanding, para poder ver
 * los dos tipos de destino en el mismo árbol.
 */

const createdAt = "2026-07-23T09:00:00.000Z";
const productId = "own-1";

export const campaignFixture: {
  campaigns: Campaign[];
  adsets: AdSet[];
  ads: ShortAd[];
  prelandings: Prelanding[];
} = {
  prelandings: [
    {
      id: "pre-1",
      productId,
      name: "Test tirantez en 3 preguntas",
      url: "https://example.com/pre/test-tirantez",
      description:
        "Cuestionario de tres preguntas que devuelve un diagnóstico de por qué la piel sigue tirante y lleva a la ficha con el resultado.",
      createdAt,
    },
  ],

  campaigns: [
    {
      id: "camp-1",
      productId,
      name: "[ES]_Piel_Tirante_BOFU_Oferta_Precio",
      countryCode: "ES",
      theme: "Piel tirante",
      stage: "BOFU",
      focus: "Oferta y precio",
      createdAt,
    },
    {
      id: "camp-2",
      productId,
      name: "[ES]_Piel_Tirante_TOFU_Mecanismo",
      countryCode: "ES",
      theme: "Piel tirante",
      stage: "TOFU",
      focus: "Mecanismo",
      createdAt,
    },
  ],

  adsets: [
    {
      id: "adset-1",
      productId,
      campaignId: "camp-1",
      number: 1,
      name: "ADSET1_BOFU_Oferta_Precio_Urgencia",
      stage: "BOFU",
      focus: "Oferta, precio y urgencia",
      destination: { type: "producto", url: "https://example.com/revital-serum" },
      angleId: "angle-demo-1",
      audience: "Retargeting: visitaron la ficha, vieron la prelanding, similares a compradores",
      objective: "Conversiones, con prioridad en el pack de 3",
      offerStack: [
        "1 unidad: 48 € (precio de referencia)",
        "Pack 2: 42 € por unidad",
        "Pack 3: 38 € por unidad ← el más elegido",
      ],
      alwaysInclude: [
        "Concentración de activos publicada",
        "Envío gratis",
        "60 días para devolverlo",
        "Formulado para piel reactiva",
      ],
      createdAt,
    },
    {
      id: "adset-2",
      productId,
      campaignId: "camp-2",
      number: 2,
      name: "ADSET2_TOFU_Mecanismo_Educacion",
      stage: "TOFU",
      focus: "Mecanismo y educación",
      destination: { type: "prelanding", prelandingId: "pre-1" },
      angleId: "angle-demo-4",
      audience: "Frío: interés en cuidado facial, mujeres 28-50, España",
      objective: "Tráfico cualificado a la prelanding",
      offerStack: [],
      alwaysInclude: ["Sin promesas de plazo", "Nada de lenguaje médico"],
      createdAt,
    },
    {
      id: "adset-3",
      productId,
      campaignId: "camp-2",
      number: 3,
      name: "ADSET3_MOFU_Comparativa",
      stage: "MOFU",
      focus: "Comparativa frente a la crema",
      // Todavía no existe: se planifica y se asignará cuando se cree.
      destination: { type: "prelanding-pendiente", plannedNote: "Comparativa serum vs crema" },
      angleId: "angle-demo-5",
      audience: "Interactuaron con los anuncios TOFU en los últimos 30 días",
      objective: "Consideración",
      offerStack: [],
      alwaysInclude: ["Conceder qué hace bien la crema antes de comparar"],
      createdAt,
    },
  ],

  ads: [
    {
      id: "ad-1",
      productId,
      adsetId: "adset-1",
      number: 1,
      name: "Ad1_Cuaderno_Busco_10_Mujeres",
      format: "cuaderno-manuscrito",
      imagePrompt: `Handwritten notebook style Facebook ad. Realistic spiral notebook on a wooden table, warm morning light, authentic handmade feel.

ON THE NOTEBOOK PAGE, handwritten text in mixed pen colors:
Line 1 blue pen: "Busco 10 mujeres"
Line 2 blue: "que lleven años con la"
Line 3 HIGHLIGHTED YELLOW: "piel tirante a media tarde"
Line 5 blue: "Pensé que era ponerme poca crema."
Line 6 HIGHLIGHTED PINK: "No era eso."
Line 8 blue: "En 2 semanas dejé de tocarme"
Line 9 HIGHLIGHTED GREEN: "la cara sin darme cuenta"
Line 11 RED LARGE: "PACK 3"
Line 12 RED LARGER: "38 € POR FRASCO"
Line 13 GREEN: "+ENVÍO GRATIS"

ON THE RIGHT SIDE: amber glass serum bottle leaning on the notebook, label visible, realistic product composite.

Style: authentic and personal, NOT corporate. Mixed pen colors, highlighters on key phrases, large red offer at the bottom.
NO URL on image.`,
      content: {
        primaryText: `Busco 10 mujeres que lleven años notando la piel tirante a media tarde.

Durante tres años pensé que me ponía poca crema.

Me ponía más. Compré una más espesa. Me llevé un bote a la oficina.

Y a las cinco seguía tocándome la cara.

Hasta que una dermatóloga me preguntó cuántas horas pasaba con el aire acondicionado 👇

No era cuánta crema me ponía. Era que se evaporaba antes de llegar a la tarde.

A las 2 semanas:
✅ Dejé de tocarme la cara sin darme cuenta
✅ La piel aguantaba hasta la noche
✅ Me quité el bote de la oficina

🎁 PACK 3 → 38 € por frasco
🚚 Envío gratis
✅ 60 días para devolverlo
🔬 Concentración publicada en la etiqueta

Formulado para piel que ya ha reaccionado a otras cosas.

👇 Haz clic abajo

https://example.com/revital-serum`,
        headline: "Busco 10 mujeres con la piel tirante",
        description: "Revital · Pack 3 · Envío gratis",
      },
      createdAt,
    },
    {
      id: "ad-2",
      productId,
      adsetId: "adset-1",
      number: 2,
      name: "Ad2_Beneficios_Resultados_Cara",
      format: "beneficios-flotantes",
      imagePrompt: `Clean professional Facebook ad. Soft neutral gradient background.

MAIN VISUAL: Spanish woman, 42, genuine smile, holding an amber serum bottle at chest level, looking at camera. Natural, not a model. Softly blurred home background.

TOP TEXT bold white large: "PACK 3"
HUGE BOLD WHITE: "38 €"
Bold white below: "POR FRASCO"

FLOATING BUBBLE LABELS (white pill shapes, dark text) around her face:
LEFT: "Sin tirantez a las 17h" · "Sin retoque a media tarde"
RIGHT: "Piel con luz" · "Sin reacción" · "Un paso por la mañana"

BOTTOM BAR: dark rounded rectangle, bold white text: "QUIERO ESOS RESULTADOS"
NO URL on image.`,
        content: {
        primaryText: `Sin tirantez a las cinco de la tarde. Sin retoque en el baño de la oficina. 💚

Llevaba años con la misma rutina.

Limpiador, crema, protector. Todo bien hecho.

Y a media tarde, la piel tirante otra vez.

El problema no era la rutina 👇

Era que lo que me ponía trabajaba en superficie, y el aire seco de la oficina se lo llevaba en unas horas.

6 semanas después:
✅ Sin tirantez al final del día
✅ Sin bote de crema en el cajón de la oficina
✅ Piel con luz en las fotos de las cinco
✅ Ninguna reacción, y tengo la piel reactiva

🔥 PACK 3 — 38 € por frasco
~~48 €~~ → **38 €**

✅ Concentración publicada
✅ Envío gratis
✅ 60 días para devolverlo

*Los resultados pueden variar.

👇 Elige tu pack abajo

https://example.com/revital-serum`,
        headline: "Sin tirantez a las 5 de la tarde 💚",
        description: "Revital · Pack 3 38 € · Envío gratis · 60 días",
      },
      createdAt,
    },
    {
      id: "ad-3",
      productId,
      adsetId: "adset-1",
      number: 3,
      name: "Ad3_Comparativa_Precio_Por_Dia",
      format: "comparativa-precio",
      imagePrompt: `Clean price comparison infographic. Dark neutral background with warm accents.

TITLE top center bold white: "¿CUÁNTO CUESTA DEJAR DE PROBAR?"

FOUR COMPARISON BOXES side by side:
BOX 1 grey muted: "Café diario" — "☕" — "1,80 €/día" — red X
BOX 2 grey muted: "Crema que no aguanta" — "🧴" — "0,90 €/día" — red X
BOX 3 grey muted: "Revital 1 frasco" — "💧" — "1,60 €/día" — neutral
BOX 4 BRIGHT highlighted WINNER: "⭐ PACK 3" — amber dropper icon — "1,26 €/día" — green check "MEJOR PRECIO ✓"

BELOW: bold white "Por 1,26 € al día." Accent line: "Y dejas de comprar el siguiente que tampoco funciona."
NO URL on image.`,
      content: {
        primaryText: `Gastas más en café al día que lo que cuesta el pack de 3 por día. ☕

Hagamos los números 👇

☕ Café diario: ~1,80 €
→ Dura dos horas.

🧴 La crema que no aguanta la tarde: ~0,90 €/día
→ Y te la vuelves a poner a las cinco.

💧 Pack 3: 1,26 € al día
→ Concentración publicada. Un paso por la mañana.

Lo caro no es el frasco.

Lo caro es el cajón lleno de frascos a medio usar.

🔥 PACK 3 — 38 € por frasco
✅ Envío gratis
✅ 60 días para devolverlo

👇 Elige tu pack abajo

https://example.com/revital-serum`,
        headline: "Cuesta menos que tu café diario ☕",
        description: "Revital · Desde 1,26 €/día · Envío gratis",
      },
      createdAt,
    },
    {
      id: "ad-4",
      productId,
      adsetId: "adset-2",
      number: 4,
      name: "Ad4_Mecanismo_Por_Que_Se_Evapora",
      format: "mecanismo-explicado",
      imagePrompt: `Clean explanatory diagram on a light background, three simple steps with minimal icons and arrows.

STEP 1: "Te pones la crema" — icon of a cream jar
STEP 2: "Trabaja en la superficie" — icon of a thin layer over skin
STEP 3: "El aire seco se lleva el agua" — icon of an air vent with arrows

BELOW, a fourth step in the accent color, breaking the chain:
"El activo que se queja debajo" — amber dropper icon

Large legible typography, no jargon. Plenty of white space.
NO URL on image.`,
      content: {
        primaryText: `Si tu piel sigue tirante después de la crema, el problema no es cuánta te pones 👇

Es dónde se queda.

Una crema convencional trabaja arriba, en la superficie. Aporta agua y forma una película.

Funciona. Notas la piel bien al salir de casa.

Pero el aire seco de la oficina evapora esa agua durante el día. Va tirando de ella hora tras hora.

A media tarde ya no queda casi nada de lo que te pusiste por la mañana.

Por eso el retoque dura una hora.

Estás volviendo a poner algo en el mismo sitio del que se va a evaporar otra vez.

Te dejamos un test de tres preguntas para saber si es tu caso 👇

https://example.com/pre/test-tirantez`,
        headline: "El problema no es cuánta crema te pones",
        description: "Revital · Test de 3 preguntas",
      },
      createdAt,
    },
    {
      id: "ad-5",
      productId,
      adsetId: "adset-2",
      number: 5,
      name: "Ad5_Pregunta_Te_Tocas_La_Cara",
      format: "pregunta-directa",
      imagePrompt: `Flat saturated color background. One single question in very large typography filling almost the entire frame:

"¿Te tocas la cara a media tarde sin darte cuenta?"

Small amber serum bottle in the bottom right corner. Nothing else in the composition: the question is the creative.
NO URL on image.`,
      content: {
        primaryText: `¿Te tocas la cara a media tarde sin darte cuenta?

Ese gesto con el dorso de la mano, para comprobar algo que ya sabes.

No es un tic.

Es tu piel avisando de que lo que te pusiste por la mañana ya no está.

Y no tiene que ver con cuánta crema te pones 👇

https://example.com/pre/test-tirantez`,
        headline: "¿Te tocas la cara a media tarde?",
        description: "Revital · Test de 3 preguntas",
      },
      createdAt,
    },
  ],
};
