import type {
  AwarenessLevel,
  DesireValidation,
  AwarenessResearch,
  HookBatch,
  HookPlan,
  ProductHook,
} from "@/types/research";
import { AWARENESS_LABELS } from "@/types/research";

/**
 * Cuántos ganchos entran en un lote. Un lote es una llamada a la API.
 */
export const HOOKS_PER_BATCH = 10;

/**
 * Un nivel de conciencia entra en la generación automática si concentra al
 * menos esta parte del mercado según el documento 1.
 */
const RELEVANT_LEVEL_THRESHOLD = 10;

/**
 * El documento 6 pide destacar "los 2 ó 3 deseos principales" para publicidad.
 * La generación automática cubre esos tres; el resto quedan disponibles para
 * generar bajo demanda desde la pestaña de hooks.
 */
const AUTOMATIC_DESIRE_COUNT = 3;

/**
 * Deriva el plan de generación a partir de la investigación, en vez de usar una
 * matriz fija: los niveles de conciencia que el documento 1 marca como
 * relevantes, cruzados con los deseos que el documento 6 sitúa arriba del
 * ranking. Un producto cuyo mercado se concentra en dos niveles genera menos
 * ganchos que uno repartido entre cinco, y eso es lo correcto.
 */
export function buildHookPlan(
  awareness: AwarenessResearch | null,
  validation: DesireValidation | null,
  options: { desireCount?: number } = {},
): HookPlan | null {
  if (!awareness || !validation) return null;

  const desireCount = options.desireCount ?? AUTOMATIC_DESIRE_COUNT;

  const relevantLevels = awareness.stageBreakdown
    .filter((stage) => stage.percentage >= RELEVANT_LEVEL_THRESHOLD)
    .sort((a, b) => b.percentage - a.percentage);

  // Si ningún nivel supera el umbral, al menos se cubre el dominante.
  const levels =
    relevantLevels.length > 0
      ? relevantLevels
      : awareness.stageBreakdown.filter((stage) => stage.level === awareness.dominantLevel);

  const desires = validation.top5.slice(0, desireCount);

  if (levels.length === 0 || desires.length === 0) return null;

  const batches: HookBatch[] = levels.flatMap((stage) =>
    desires.map((desire) => ({
      awarenessLevel: stage.level,
      desire,
      hooks: HOOKS_PER_BATCH,
      audienceShare: stage.percentage,
    })),
  );

  const levelNames = levels.map((stage) => AWARENESS_LABELS[stage.level]).join(", ");

  return {
    batches,
    totalHooks: batches.length * HOOKS_PER_BATCH,
    rationale: `${levels.length} ${levels.length === 1 ? "nivel de conciencia concentra" : "niveles de conciencia concentran"} el ${levels.reduce((total, stage) => total + stage.percentage, 0)}% del mercado (${levelNames}), cruzados con los ${desires.length} deseos mejor puntuados de la validación.`,
  };
}

/** Todas las combinaciones posibles, para el generador manual de la pestaña. */
export function buildFullHookMatrix(
  awareness: AwarenessResearch | null,
  validation: DesireValidation | null,
): HookPlan | null {
  if (!awareness || !validation) return null;
  return buildHookPlan(awareness, validation, { desireCount: validation.top5.length });
}

/** Qué combinaciones del plan aún no tienen ganchos generados. */
export function pendingBatches(plan: HookPlan, hooks: ProductHook[]): HookBatch[] {
  const covered = new Set(hooks.map((hook) => `${hook.awarenessLevel}::${hook.desire}`));
  return plan.batches.filter((batch) => !covered.has(`${batch.awarenessLevel}::${batch.desire}`));
}

export function countHooksByLevel(hooks: ProductHook[]): Record<AwarenessLevel, number> {
  return hooks.reduce(
    (totals, hook) => {
      totals[hook.awarenessLevel] = (totals[hook.awarenessLevel] ?? 0) + 1;
      return totals;
    },
    {} as Record<AwarenessLevel, number>,
  );
}
