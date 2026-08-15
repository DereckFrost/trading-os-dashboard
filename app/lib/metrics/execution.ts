import {
  canonicalExecutionQuality,
} from "@/app/lib/sop";

export type ExecutionQuality =
  | "Excelente"
  | "Buena"
  | "Regular"
  | "Mala";

export function executionQualityScore(
  value: string | null | undefined,
): number | null {
  switch (canonicalExecutionQuality(value)) {
    case "Excelente":
      return 100;
    case "Buena":
      return 75;
    case "Regular":
      return 50;
    case "Mala":
      return 0;
    default:
      return null;
  }
}

export function calculateExecutionAverage(
  trades: Array<{ execution_quality?: string | null }>,
): number {
  const scores = trades
    .map((trade) => executionQualityScore(trade.execution_quality))
    .filter((score): score is number => score !== null);

  if (!scores.length) return 0;

  return Math.round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
}

export function calculateExecutionDistribution(
  trades: Array<{ execution_quality?: string | null }>,
) {
  const distribution: Record<ExecutionQuality, number> = {
    Excelente: 0,
    Buena: 0,
    Regular: 0,
    Mala: 0,
  };

  for (const trade of trades) {
    const quality = canonicalExecutionQuality(trade.execution_quality);
    if (quality in distribution) {
      distribution[quality as ExecutionQuality] += 1;
    }
  }

  return distribution;
}
