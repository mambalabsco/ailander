import type { Product } from "@/types";
import type { ProductResearch } from "@/types/research";
import type { GeneratedCopy, MarketingAngle } from "@/types/copy";
import type { ShortAd } from "@/types/campaign";
import type { AnglePerformance, PerformanceRecord } from "@/types/performance";
import { formatMeta } from "@/types/campaign";
import { buildProductContext } from "@/lib/copy-prompts";
import type { Store } from "@/types/store";

/**
 * Ideas nuevas a partir de lo que ya se ha probado.
 *
 * La diferencia con generar ángulos desde cero está en la entrada: aquí el
 * modelo recibe qué ganó, qué perdió y **por qué**, escrito por quien lo vio.
 * Esa nota es lo que más pesa: una tasa de conversión dice que algo funcionó,
 * la nota dice qué parte funcionó, y eso es lo que se puede trasladar a otro
 * ángulo.
 *
 * Los perdedores entran con el mismo peso que los ganadores. Saber por dónde no
 * ir acota igual de rápido que saber por dónde sí.
 */
export function buildIdeasPrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  angles: MarketingAngle[];
  copies: GeneratedCopy[];
  shortAds: ShortAd[];
  records: PerformanceRecord[];
  anglePerformance: AnglePerformance[];
  /** Qué se quiere de vuelta. */
  target: "angulos" | "anuncios" | "publirreportajes";
  count?: number;
}): string {
  const {
    product,
    research,
    angles,
    copies,
    shortAds,
    records,
    anglePerformance,
    target,
    count = 5,
  } = options;

  const byId = new Map(records.map((record) => [`${record.targetType}::${record.targetId}`, record]));

  const describeCopy = (copy: GeneratedCopy) => {
    const record = byId.get(`copy::${copy.id}`);
    if (!record || record.rating === "sin-probar") return null;
    const angle = angles.find((item) => item.id === copy.angleId);
    return [
      `- **${record.rating.toUpperCase()}** · ${copy.format} · titular: «${copy.content.headline}»`,
      angle ? `  Ángulo: ${angle.name} (UMP: ${angle.problemMechanism})` : `  Origen: ${copy.driverLabel}`,
      record.note ? `  Lectura del equipo: ${record.note}` : "",
      record.metrics.roas !== undefined ? `  ROAS: ${record.metrics.roas}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const describeAd = (ad: ShortAd) => {
    const record = byId.get(`short-ad::${ad.id}`);
    if (!record || record.rating === "sin-probar") return null;
    return [
      `- **${record.rating.toUpperCase()}** · formato ${formatMeta(ad.format).name} · «${ad.content.headline}»`,
      record.note ? `  Lectura del equipo: ${record.note}` : "",
      record.metrics.roas !== undefined ? `  ROAS: ${record.metrics.roas}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const evidence = [
    ...copies.map(describeCopy).filter(Boolean),
    ...shortAds.map(describeAd).filter(Boolean),
  ];

  const angleSummary = anglePerformance
    .filter((item) => item.tested > 0)
    .map(
      (item) =>
        `- ${item.angleName} — puntuación ${item.score} sobre ${item.tested} piezas probadas. ${item.verdict}${
          item.winningFormats.length ? ` Formatos ganadores: ${item.winningFormats.join(", ")}.` : ""
        }`,
    );

  const targetInstruction: Record<typeof target, string> = {
    angulos: `Propón ${count} **ángulos nuevos**, con la misma estructura que los existentes: nombre, público, arco argumental, mecanismo único del problema, mecanismo único de solución y momento emotivo clave.`,
    anuncios: `Propón ${count} **ideas de anuncio corto**, cada una con: formato recomendado, gancho de apertura, qué se ve en la imagen y por qué debería funcionar según la evidencia.`,
    publirreportajes: `Propón ${count} **ideas de publirreportaje**, cada una con: marco narrativo recomendado, narrador, apertura y el mecanismo que revela.`,
  };

  return `${buildProductContext(product, research, options.store)}

## Lo que ya se ha probado

${
  evidence.length > 0
    ? evidence.join("\n\n")
    : "Todavía no hay piezas marcadas como ganadoras ni perdedoras."
}

${
  angleSummary.length > 0
    ? `### Rendimiento por ángulo\n\n${angleSummary.join("\n")}`
    : ""
}

## Tarea

${targetInstruction[target]}

### Cómo usar la evidencia

- **Parte de lo que ganó, no lo repitas.** Identifica *qué* de cada ganador funcionó — el momento, el mecanismo, el formato, el tono — y traslada esa pieza a un contexto distinto. Repetir el ganador con otras palabras no es una idea nueva.
- **Trata los perdedores como información, no como descarte.** Si un ángulo falló, di explícitamente qué hipótesis queda invalidada y por qué tu propuesta no vuelve a caer en ella.
- **No propongas nada que ya esté probado.** Revisa la lista antes: si tu idea se solapa con una existente, cámbiala.
- Si la evidencia es escasa, dilo abiertamente y marca qué propuestas son exploratorias en vez de presentarlas como fundamentadas.

Para cada propuesta añade una línea final: **«Por qué esto y no otra cosa»**, conectando explícitamente con la evidencia de arriba.

Escribe en ${product.language}.`;
}
