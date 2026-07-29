import type { AwarenessLevel, AwarenessResearch, DesireValidation } from "@/types/research";
import { AWARENESS_LABELS } from "@/types/research";
import type { CopyDriver, CopyFormat, GeneratedCopy, MarketingAngle } from "@/types/copy";

/**
 * Cobertura de combinaciones de copy.
 *
 * Una combinación es un origen (deseo o ángulo) cruzado con un nivel de
 * conciencia. Saber cuáles están hechas evita duplicar trabajo; saber cuáles
 * faltan **y en qué orden atacarlas** evita escribir la que menos rinde.
 *
 * La prioridad sale de dos datos que ya están en la investigación:
 * - la cuota de mercado del nivel de conciencia, del documento 1;
 * - la posición del deseo en el ranking del documento 6.
 *
 * No es una heurística inventada: es el peso real del segmento multiplicado por
 * la fuerza del deseo.
 */

export interface CopyCombination {
  key: string;
  driver: CopyDriver;
  /** Texto del deseo o id del ángulo. */
  driverKey: string;
  driverLabel: string;
  awarenessLevel: AwarenessLevel;
  awarenessLabel: string;
  /** Copys ya escritos para esta combinación, por formato. */
  usedBy: { copyId: string; format: CopyFormat; methodId: string }[];
  used: boolean;
  /** 0-100. Cuanto más alto, antes conviene escribirla. */
  priority: number;
  priorityReason: string;
}

const AUDIENCE_FALLBACK = 10;

function audienceShare(awareness: AwarenessResearch | null, level: AwarenessLevel): number {
  const stage = awareness?.stageBreakdown.find((item) => item.level === level);
  return stage?.percentage ?? AUDIENCE_FALLBACK;
}

/** El primer deseo del ranking pesa 1; cada posición siguiente pesa menos. */
function desireWeight(validation: DesireValidation | null, desire: string): number {
  const index = validation?.ranking.indexOf(desire) ?? -1;
  if (index < 0) return 0.5;
  return 1 - index * 0.15;
}

/**
 * Construye la matriz de combinaciones para los niveles y orígenes relevantes.
 *
 * Se limita a los niveles que el documento 1 marca con peso real: escribir para
 * un nivel que concentra el 7% del mercado casi nunca es lo siguiente que toca.
 */
export function buildCopyCoverage(options: {
  awareness: AwarenessResearch | null;
  validation: DesireValidation | null;
  angles: MarketingAngle[];
  copies: GeneratedCopy[];
  /** Cuota mínima para que un nivel entre en la matriz. */
  minimumShare?: number;
}): CopyCombination[] {
  const { awareness, validation, angles, copies, minimumShare = 10 } = options;

  const levels = (awareness?.stageBreakdown ?? [])
    .filter((stage) => stage.percentage >= minimumShare)
    .map((stage) => stage.level);

  if (levels.length === 0 || !validation) return [];

  // Índice de lo ya escrito, para no recorrer la lista por cada celda.
  const used = new Map<string, { copyId: string; format: CopyFormat; methodId: string }[]>();
  for (const copy of copies) {
    const driverKey = copy.driver === "angle" ? (copy.angleId ?? copy.driverLabel) : copy.driverLabel;
    const key = `${copy.driver}::${driverKey}::${copy.awarenessLevel}`;
    const list = used.get(key) ?? [];
    list.push({ copyId: copy.id, format: copy.format, methodId: copy.methodId });
    used.set(key, list);
  }

  const combinations: CopyCombination[] = [];

  const push = (
    driver: CopyDriver,
    driverKey: string,
    driverLabel: string,
    desireForWeight: string,
    level: AwarenessLevel,
  ) => {
    const key = `${driver}::${driverKey}::${level}`;
    const share = audienceShare(awareness, level);
    const weight = desireWeight(validation, desireForWeight);
    const priority = Math.round(share * weight);
    const usedBy = used.get(key) ?? [];

    combinations.push({
      key,
      driver,
      driverKey,
      driverLabel,
      awarenessLevel: level,
      awarenessLabel: AWARENESS_LABELS[level],
      usedBy,
      used: usedBy.length > 0,
      priority,
      priorityReason: `${AWARENESS_LABELS[level]} concentra el ${share}% del mercado y el deseo está en la posición ${(validation.ranking.indexOf(desireForWeight) ?? 0) + 1} del ranking.`,
    });
  };

  for (const level of levels) {
    for (const desire of validation.top5) {
      push("desire", desire, desire, desire, level);
    }
    for (const angle of angles) {
      push("angle", angle.id, angle.name, angle.desire, level);
    }
  }

  return combinations.sort((a, b) => b.priority - a.priority);
}

/** Combinaciones sin escribir, de mayor a menor prioridad. */
export function pendingCombinations(coverage: CopyCombination[], limit = 5): CopyCombination[] {
  return coverage.filter((combination) => !combination.used).slice(0, limit);
}

/** Índice rápido para marcar las opciones de un selector. */
export function coverageIndex(coverage: CopyCombination[]): Map<string, CopyCombination> {
  return new Map(coverage.map((combination) => [combination.key, combination]));
}

export function combinationKey(
  driver: CopyDriver,
  driverKey: string,
  level: AwarenessLevel,
): string {
  return `${driver}::${driverKey}::${level}`;
}
