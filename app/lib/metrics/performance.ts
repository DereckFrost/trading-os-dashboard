import type { TradingTrade } from "@/app/lib/domain/trading";

export type MetricTrade = TradingTrade;

export type PerformanceMetrics = {
  totalTrades: number;

  netR: number;

  wins: number;
  losses: number;
  breakeven: number;

  winRate: number;
  winsLossesRatio: number | null;

  expectancy: number;

  grossProfit: number;
  grossLoss: number;

  averageWin: number;
  averageLoss: number;

  profitFactor: number | null;

  aPlusTrades: number;
  aPlusRate: number;
};

export function parseR(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

export function roundMetric(
  value: number,
  decimals = 2,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;

  return (
    Math.round(
      (value + Number.EPSILON) * factor,
    ) / factor
  );
}

/**
 * Solo considera operaciones con un R numéricamente válido.
 *
 * Esto evita que null, strings vacíos o valores inválidos
 * contaminen las métricas.
 */
export function validTrades(
  trades: MetricTrade[],
): MetricTrade[] {
  return trades.filter(
    (trade) => parseR(trade.r) !== null,
  );
}

/**
 * R acumulado.
 */
export function calculateNetR(
  trades: MetricTrade[],
): number {
  return roundMetric(
    validTrades(trades).reduce(
      (sum, trade) =>
        sum + (parseR(trade.r) ?? 0),
      0,
    ),
  );
}

/**
 * Distribución W / L / BE.
 */
export function calculateWinLoss(
  trades: MetricTrade[],
) {
  const values = validTrades(trades)
    .map((trade) => parseR(trade.r))
    .filter(
      (value): value is number =>
        value !== null,
    );

  return {
    wins: values.filter(
      (value) => value > 0,
    ).length,

    losses: values.filter(
      (value) => value < 0,
    ).length,

    breakeven: values.filter(
      (value) => value === 0,
    ).length,
  };
}

/**
 * Win Rate.
 *
 * Los break-even forman parte del denominador,
 * pero no cuentan como wins.
 */
export function calculateWinRate(
  trades: MetricTrade[],
): number {
  const {
    wins,
    losses,
    breakeven,
  } = calculateWinLoss(trades);

  const total =
    wins +
    losses +
    breakeven;

  if (!total) {
    return 0;
  }

  return roundMetric(
    (wins / total) * 100,
    0,
  );
}

/**
 * Relación entre operaciones ganadoras y perdedoras.
 */
export function calculateWinsLossesRatio(
  trades: MetricTrade[],
): number | null {
  const {
    wins,
    losses,
  } = calculateWinLoss(trades);

  if (!losses) {
    return wins ? null : 0;
  }

  return roundMetric(
    wins / losses,
  );
}

/**
 * Gross Profit en R.
 */
export function calculateGrossProfit(
  trades: MetricTrade[],
): number {
  return roundMetric(
    validTrades(trades).reduce(
      (sum, trade) => {
        const r =
          parseR(trade.r) ?? 0;

        return r > 0
          ? sum + r
          : sum;
      },
      0,
    ),
  );
}

/**
 * Gross Loss en valor absoluto de R.
 *
 * Ejemplo:
 * -1R + -2R = 3R de gross loss.
 */
export function calculateGrossLoss(
  trades: MetricTrade[],
): number {
  return roundMetric(
    validTrades(trades).reduce(
      (sum, trade) => {
        const r =
          parseR(trade.r) ?? 0;

        return r < 0
          ? sum + Math.abs(r)
          : sum;
      },
      0,
    ),
  );
}

/**
 * Ganancia promedio por trade ganador.
 */
export function calculateAverageWin(
  trades: MetricTrade[],
): number {
  const {
    wins,
  } = calculateWinLoss(trades);

  if (!wins) {
    return 0;
  }

  return roundMetric(
    calculateGrossProfit(trades) /
      wins,
  );
}

/**
 * Pérdida promedio por trade perdedor.
 *
 * Se devuelve negativa para conservar
 * la convención natural de R.
 */
export function calculateAverageLoss(
  trades: MetricTrade[],
): number {
  const {
    losses,
  } = calculateWinLoss(trades);

  if (!losses) {
    return 0;
  }

  return roundMetric(
    -(
      calculateGrossLoss(trades) /
      losses
    ),
  );
}

/**
 * Expectancy por trade.
 */
export function calculateExpectancy(
  trades: MetricTrade[],
): number {
  const valid =
    validTrades(trades);

  if (!valid.length) {
    return 0;
  }

  return roundMetric(
    calculateNetR(valid) /
      valid.length,
  );
}

/**
 * Profit Factor.
 *
 * Si no existen pérdidas pero sí ganancias,
 * devuelve null para representar infinito.
 */
export function calculateProfitFactor(
  trades: MetricTrade[],
): number | null {
  const grossProfit =
    calculateGrossProfit(trades);

  const grossLoss =
    calculateGrossLoss(trades);

  if (grossLoss === 0) {
    return grossProfit > 0
      ? null
      : 0;
  }

  return roundMetric(
    grossProfit /
      grossLoss,
  );
}

/**
 * Cantidad de operaciones A+.
 */
export function calculateAPlusTrades(
  trades: MetricTrade[],
): number {
  return validTrades(trades).filter(
    (trade) =>
      String(
        trade.setup_quality ?? "",
      ).trim() === "A+",
  ).length;
}

/**
 * Porcentaje de trades A+.
 */
export function calculateAPlusRate(
  trades: MetricTrade[],
): number {
  const valid =
    validTrades(trades);

  if (!valid.length) {
    return 0;
  }

  return roundMetric(
    (
      calculateAPlusTrades(valid) /
      valid.length
    ) * 100,
    0,
  );
}

/**
 * Paquete oficial de métricas de performance.
 *
 * Cualquier pantalla que necesite métricas
 * de resultados debe consumir esta función
 * en lugar de recalcularlas manualmente.
 */
export function calculatePerformanceMetrics(
  trades: MetricTrade[],
): PerformanceMetrics {
  const valid =
    validTrades(trades);

  const {
    wins,
    losses,
    breakeven,
  } =
    calculateWinLoss(valid);

  return {
    totalTrades:
      valid.length,

    netR:
      calculateNetR(valid),

    wins,
    losses,
    breakeven,

    winRate:
      calculateWinRate(valid),

    winsLossesRatio:
      calculateWinsLossesRatio(valid),

    expectancy:
      calculateExpectancy(valid),

    grossProfit:
      calculateGrossProfit(valid),

    grossLoss:
      calculateGrossLoss(valid),

    averageWin:
      calculateAverageWin(valid),

    averageLoss:
      calculateAverageLoss(valid),

    profitFactor:
      calculateProfitFactor(valid),

    aPlusTrades:
      calculateAPlusTrades(valid),

    aPlusRate:
      calculateAPlusRate(valid),
  };
}