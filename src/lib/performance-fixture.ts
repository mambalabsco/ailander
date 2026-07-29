import type { PerformanceRecord } from "@/types/performance";

/**
 * Rendimiento de ejemplo para el producto de demostración.
 *
 * Está repartido a propósito: un ángulo con dos ganadores, otro con un perdedor
 * claro y otros sin probar. Así el agregado por ángulo tiene algo que ordenar y
 * el generador de ideas tiene material real del que partir.
 */

const updatedAt = "2026-07-25T10:00:00.000Z";
const productId = "own-1";

export const performanceFixture: PerformanceRecord[] = [
  {
    id: "perf-1",
    productId,
    targetType: "copy",
    targetId: "copy-demo-1",
    rating: "ganador",
    metrics: { spend: 1840, roas: 3.1, ctr: 2.4, cpa: 18 },
    note: "El gesto de tocarse la cara a media tarde es lo que engancha. En los comentarios la gente lo repite con sus palabras, señal de que reconoce el momento antes de entender el mecanismo.",
    updatedAt,
  },
  {
    id: "perf-2",
    productId,
    targetType: "short-ad",
    targetId: "ad-1",
    rating: "ganador",
    metrics: { spend: 960, roas: 2.8, ctr: 3.1 },
    note: "El formato cuaderno frena el scroll porque no parece anuncio. Funciona con el gancho de la tarde, no con el de la composición.",
    updatedAt,
  },
  {
    id: "perf-3",
    productId,
    targetType: "short-ad",
    targetId: "ad-3",
    rating: "prometedor",
    metrics: { spend: 420, roas: 1.9, ctr: 1.8 },
    note: "La comparativa de precio por día convierte bien pero necesita más recorrido para confirmarlo.",
    updatedAt,
  },
  {
    id: "perf-4",
    productId,
    targetType: "copy",
    targetId: "copy-demo-2",
    rating: "perdedor",
    metrics: { spend: 730, roas: 0.6, ctr: 0.9 },
    note: "El ángulo de la etiqueta y la concentración interesa a quien ya compara activos, pero en frío no significa nada: el lector no sabe todavía por qué debería importarle un porcentaje.",
    updatedAt,
  },
  {
    id: "perf-5",
    productId,
    targetType: "short-ad",
    targetId: "ad-4",
    rating: "prometedor",
    metrics: { spend: 310, ctr: 2.2 },
    note: "El diagrama del mecanismo retiene bien en frío, aunque el clic a la prelanding todavía está por debajo de lo esperado.",
    updatedAt,
  },
];
