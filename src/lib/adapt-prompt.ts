import "server-only";
import type { MarketContext } from "@/lib/market-selection";

import { buildProductContext } from "@/lib/copy-prompts";
import { lengthBrief } from "@/lib/word-count";
import type { CopyMethod } from "@/types/copy";
import type { Product } from "@/types";
import type { AwarenessLevel, ProductResearch } from "@/types/research";
import type { Store } from "@/types/store";
import { AWARENESS_LABELS } from "@/types/research";

/**
 * Prompt para adaptar un copy ajeno a este producto.
 *
 * **Adaptar no es reescribir con otras palabras, y tampoco es traducir.** Lo que
 * hace bueno a un copy que ya convirtió es su estructura: por dónde entra, en
 * qué orden revela, dónde coloca la objeción, cuánto tarda en nombrar el
 * producto. Eso se conserva. Lo que cambia es todo lo demás.
 *
 * El riesgo real de este formato es arrastrar afirmaciones del producto
 * original —un ingrediente, un estudio, una cifra— que este no puede sostener.
 * Por eso el prompt insiste en que cada afirmación tenga respaldo en la
 * investigación propia.
 */
export function buildAdaptPrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  marketContext: MarketContext;
  method: CopyMethod;
  awarenessLevel: AwarenessLevel;
  sourceText: string;
  sourceNote?: string;
  /** Lo cerca que hay que quedarse del original. */
  fidelity: "calcado" | "inspirado";
}): string {
  const { product, research, store, method, awarenessLevel, sourceText, fidelity } = options;

  const fidelityBlock =
    fidelity === "calcado"
      ? `**Sigue el original de cerca.** Mantén su estructura, su orden y su longitud casi punto por punto. Cambia el producto, el problema, el mecanismo, los nombres, los datos y los ejemplos por los de esta investigación; conserva el esqueleto y el ritmo.`
      : `**Úsalo como patrón, no como plantilla.** Quédate con lo que lo hace funcionar —por dónde entra, cómo escala la tensión, dónde coloca la prueba y la objeción— y escribe una pieza nueva para este producto. No debe poder reconocerse el original leyéndolo.`;

  return `${buildProductContext(product, research, store, options.marketContext)}

## Antes de empezar: la longitud

${lengthBrief(method.wordRange)}

Está aquí arriba y no al final a propósito. Es una restricción de la pieza entera y hay que tenerla en cuenta **al planificarla**; como nota al pie se cumple mal, y el resultado son adaptaciones que se quedan en un tercio de lo pedido.

## El copy de partida

${options.sourceNote ? `Contexto: ${options.sourceNote}\n\n` : ""}---

${sourceText}

---

## Tarea

Adáptalo a **${product.name}**, con el marco **${method.name}** y para el nivel de conciencia **${AWARENESS_LABELS[awarenessLevel]}**.

${fidelityBlock}

### Lo que no puedes arrastrar

Este es el punto donde una adaptación se estropea, así que revísalo antes de dar por buena cada frase:

1. **Ninguna afirmación del producto original.** Si el original decía que su fórmula lleva un ingrediente, o cita un estudio, o da una cifra de resultados, **eso era suyo**. Solo se queda si esta investigación lo sostiene para este producto.
2. **Ningún nombre de marca, persona o lugar del original.** Se sustituyen por los de este mercado.
3. **Ninguna promesa que la investigación no respalde.** Un copy adaptado que promete lo que el producto no hace es peor que no tener copy: convierte una vez y devuelve el pedido.
4. Si el original menciona un mecanismo que aquí no aplica, **cámbialo por el mecanismo real de este producto**. No lo dejes «parecido».

### Forma

Nivel de lectura: ${method.readingLevel}. Recuerda la longitud del principio: entre ${method.wordRange[0]} y ${method.wordRange[1]} palabras.

Devuelve también el **título** y la **descripción** que exige el gestor de anuncios de Meta.

Escribe en el español de ${product.country || "México"}.`;
}
