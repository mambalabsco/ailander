// Relativos y con extensión: son imports **de valor**, y con el alias `@/` el
// corredor de Node no los resuelve. `types/campaign.ts` solo tiene imports de
// tipo, así que se puede cargar desde un test; si algún día le añaden uno de
// valor, este módulo deja de poder probarse y hay que traerse las etapas aquí.
import { NIVELES } from "./nivel-de-copia.ts";
import { FUNNEL_STAGES } from "../types/campaign.ts";
import type { NivelDeCopia } from "./nivel-de-copia.ts";
import type { FunnelStage } from "../types/campaign.ts";

/**
 * El plan de una tanda que nadie configuró.
 *
 * Probado en `plan-automatico.test.ts`.
 *
 * ## Por qué dos llamadas y no una
 *
 * Esta elige y la de siempre genera. Así la elección **queda escrita** en el
 * resumen —que es lo que separa un botón de una caja negra— y la tanda la
 * escribe el código ya probado, en vez de una segunda ruta que se desincroniza
 * en cuanto se arregle algo en la primera.
 */

export interface PlanDeTanda {
  fuente: "angulo" | "material";
  id: string;
  /** Vacío cuando la fuente es un ángulo. */
  nivel: NivelDeCopia | "";
  etapa: FunnelStage;
  cuantos: number;
  porQue: string;
}

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    fuente: { type: "string", enum: ["angulo", "material"] },
    id: { type: "string" },
    nivel: { type: "string", enum: ["", "mismo", "ampliado", "referencia"] },
    etapa: { type: "string", enum: ["TOFU", "MOFU", "BOFU"] },
    cuantos: { type: "integer" },
    porQue: { type: "string" },
  },
  required: ["fuente", "id", "nivel", "etapa", "cuantos", "porQue"],
  additionalProperties: false,
} as const;

/**
 * Lo que devolvió el modelo, comprobado contra lo que de verdad existe.
 *
 * Un identificador inventado **da error**. Lo que no puede hacer es caer en
 * silencio al primer ángulo: saldría una tanda correcta, cobrada, y con la
 * sensación de que salió del material que se quería. Un esquema con `enum` no
 * cubre esto: el modelo puede devolver un uuid con la forma correcta y que no
 * sea de este producto.
 */
export function validarPlan(
  devuelto: unknown,
  disponible: { angulos: string[]; anatomias: string[] },
): PlanDeTanda {
  const raw = (devuelto ?? {}) as Record<string, unknown>;
  const fuente = raw.fuente === "material" ? "material" : "angulo";
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const nivel = typeof raw.nivel === "string" ? raw.nivel.trim() : "";
  const porQue = typeof raw.porQue === "string" ? raw.porQue.trim() : "";

  const lista = fuente === "material" ? disponible.anatomias : disponible.angulos;
  if (!id || !lista.includes(id)) {
    throw new Error(
      `El plan eligió ${
        fuente === "material" ? "un material" : "un ángulo"
      } que no existe (${id || "sin identificador"}). Vuelve a intentarlo: no se ha generado nada.`,
    );
  }

  if (fuente === "material" && !NIVELES.some((item) => item.id === nivel)) {
    throw new Error("El plan no dijo con qué cercanía copiar el material. Vuelve a intentarlo.");
  }

  if (!porQue) {
    throw new Error("El plan no dijo por qué eligió eso. Vuelve a intentarlo.");
  }

  const etapa = (FUNNEL_STAGES as readonly string[]).includes(String(raw.etapa))
    ? (raw.etapa as FunnelStage)
    : "TOFU";

  return {
    fuente,
    id,
    nivel: fuente === "material" ? (nivel as NivelDeCopia) : "",
    etapa,
    // Acotado y no rechazado: cuántos anuncios salen no cambia de dónde sale la
    // idea, y tumbar la tanda por un número raro sería tirar la llamada ya
    // pagada del plan.
    cuantos: Math.min(20, Math.max(1, Math.round(Number(raw.cuantos) || 5))),
    porQue,
  };
}

/**
 * El encargo de elegir.
 *
 * Se le pide que **evite lo último generado**: un modo automático que converge
 * en la misma tanda cada vez deja de servir a la tercera, y no da ningún error
 * — simplemente deja de aportar, que es más difícil de notar.
 */
export function buildPlanPrompt(input: {
  angulos: { id: string; name: string; targetAudience: string }[];
  anatomias: { id: string; promesa: string; deseo: string }[];
  ultimasTandas: string[];
}): string {
  return `## Con qué se puede tirar

### Ángulos

${
  input.angulos.map((item) => `- \`${item.id}\` — ${item.name} (${item.targetAudience})`).join("\n") ||
  "- (ninguno)"
}

### Anuncios que ya funcionaron, analizados

${
  input.anatomias
    .map((item) => `- \`${item.id}\` — promete: ${item.promesa}. Deseo: ${item.deseo}`)
    .join("\n") || "- (ninguno)"
}

${
  input.ultimasTandas.length > 0
    ? `## Lo último que se generó, que conviene no repetir\n\n${input.ultimasTandas
        .map((item) => `- ${item}`)
        .join("\n")}`
    : ""
}

## Qué tienes que hacer

Elige **una** cosa con la que sacar la siguiente tanda de anuncios y di por qué.

Copia el identificador **tal cual** de las listas de arriba: si te lo inventas, la
tanda no se genera.

Si eliges un material, di con qué cercanía copiarlo:

${NIVELES.map((item) => `- \`${item.id}\` — ${item.nombre}: ${item.explicacion}`).join("\n")}

Elige lo que **menos se parezca** a lo último generado: lo que hace útil a esto es
cubrir lo que falta, no repetir lo que ya está.`;
}
