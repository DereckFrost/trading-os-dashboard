import {
  calculatePerformanceMetrics,
  type MetricTrade,
  type PerformanceMetrics,
} from "./performance";

import {
  calculateExecutionAverage,
  calculateExecutionDistribution,
  type ExecutionQuality,
} from "./execution";

import {
  buildEquityCurve,
  calculateCurrentDrawdown,
  calculateMaxDrawdown,
  type EquityPoint,
} from "./drawdown";

import {
  calculateProcessAdherence,
  filterEvaluatedTradingDays,
  isProcessAdherent,
  type TradingDayForMetrics,
} from "./process";

/* -------------------------------------------------------------------------- */
/* PERFORMANCE                                                                */
/* -------------------------------------------------------------------------- */

export {
  parseR,
  roundMetric,
  validTrades,
  calculateNetR,
  calculateWinLoss,
  calculateWinRate,
  calculateWinsLossesRatio,
  calculateGrossProfit,
  calculateGrossLoss,
  calculateAverageWin,
  calculateAverageLoss,
  calculateExpectancy,
  calculateProfitFactor,
  calculateAPlusTrades,
  calculateAPlusRate,
  calculatePerformanceMetrics,
} from "./performance";

/* -------------------------------------------------------------------------- */
/* EXECUTION                                                                  */
/* -------------------------------------------------------------------------- */

export {
  executionQualityScore,
  calculateExecutionAverage,
  calculateExecutionDistribution,
} from "./execution";

/* -------------------------------------------------------------------------- */
/* DRAWDOWN                                                                   */
/* -------------------------------------------------------------------------- */

export {
  buildEquityCurve,
  calculateMaxDrawdown,
  calculateCurrentDrawdown,
} from "./drawdown";

/* -------------------------------------------------------------------------- */
/* PROCESS                                                                    */
/* -------------------------------------------------------------------------- */

export {
  isProcessAdherent,
  calculateProcessAdherence,
  filterEvaluatedTradingDays,
  calculateSopCompletion,
  calculateSopSessionCompletion,
  calculateProcessMetrics,
  getSopCompletedSteps,
} from "./process";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type {
  MetricTrade,
  PerformanceMetrics,
} from "./performance";

export type {
  ExecutionQuality,
} from "./execution";

export type {
  EquityPoint,
} from "./drawdown";

export type {
  TradingDayForMetrics,
  SopSessionForMetrics,
  TradeForProcessMetrics,
  ProcessMetrics,
} from "./process";

/* -------------------------------------------------------------------------- */
/* DOMAIN TYPES                                                               */
/* -------------------------------------------------------------------------- */

export type {
  TradingTrade,
  TradingDay,
  TradingSetup,
  SopSession,
} from "@/app/lib/domain/trading";

/* -------------------------------------------------------------------------- */
/* STREAKS                                                                    */
/* -------------------------------------------------------------------------- */

export type StreakMetrics = {
  currentAdherence: number;
  bestAdherence: number;
  currentWinning: number;
  bestWinning: number;
};

export function calculateStreaks({
  trades,
  tradingDays = [],
}: {
  trades: MetricTrade[];
  tradingDays?: TradingDayForMetrics[];
}): StreakMetrics {
  const sortedDays =
    filterEvaluatedTradingDays(
      tradingDays,
      trades,
    )
      .filter(
        (day) =>
          Boolean(day.date),
      )
      .sort((a, b) =>
        String(a.date).localeCompare(
          String(b.date),
        ),
      );

  let currentAdherence = 0;
  let bestAdherence = 0;
  let runningAdherence = 0;

  for (const day of sortedDays) {
    if (isProcessAdherent(day)) {
      runningAdherence += 1;
      bestAdherence = Math.max(
        bestAdherence,
        runningAdherence,
      );
    } else {
      runningAdherence = 0;
    }
  }

  for (
    let index =
      sortedDays.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (
      isProcessAdherent(
        sortedDays[index],
      )
    ) {
      currentAdherence += 1;
    } else {
      break;
    }
  }

  const sortedTrades =
    [...trades]
      .filter((trade) =>
        Number.isFinite(
          Number(trade.r),
        ),
      )
      .sort((a, b) => {
        const dateA =
          `${a.trade_date}T${
            a.created_at ??
            "00:00:00"
          }`;

        const dateB =
          `${b.trade_date}T${
            b.created_at ??
            "00:00:00"
          }`;

        return dateA.localeCompare(
          dateB,
        );
      });

  let currentWinning = 0;
  let bestWinning = 0;
  let runningWinning = 0;

  for (const trade of sortedTrades) {
    if (Number(trade.r) > 0) {
      runningWinning += 1;
      bestWinning = Math.max(
        bestWinning,
        runningWinning,
      );
    } else {
      runningWinning = 0;
    }
  }

  for (
    let index =
      sortedTrades.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (
      Number(
        sortedTrades[index].r,
      ) > 0
    ) {
      currentWinning += 1;
    } else {
      break;
    }
  }

  return {
    currentAdherence,
    bestAdherence,
    currentWinning,
    bestWinning,
  };
}

/* -------------------------------------------------------------------------- */
/* DAILY METRICS                                                              */
/* -------------------------------------------------------------------------- */

export type DailyTradingMetrics = {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  netR: number;
  winRate: number;
  execution: number;
  adherence: boolean;
};

export type DailyTradingMetricsInput = {
  trades: MetricTrade[];
  tradingDay?: TradingDayForMetrics | null;
};

export function calculateDailyTradingMetrics({
  trades,
  tradingDay,
}: DailyTradingMetricsInput): DailyTradingMetrics {
  const date =
    tradingDay?.date ??
    trades[0]?.trade_date ??
    "";

  const performance =
    calculatePerformanceMetrics(
      trades,
    );

  return {
    date,
    trades: performance.totalTrades,
    wins: performance.wins,
    losses: performance.losses,
    netR: performance.netR,
    winRate: performance.winRate,
    execution:
      calculateExecutionAverage(
        trades,
      ),
    adherence:
      tradingDay
        ? isProcessAdherent(
            tradingDay,
          )
        : false,
  };
}

/* -------------------------------------------------------------------------- */
/* DAILY METRICS SERIES                                                       */
/* -------------------------------------------------------------------------- */

export function calculateDailyTradingMetricsSeries({
  trades,
  tradingDays = [],
}: {
  trades: MetricTrade[];
  tradingDays?: TradingDayForMetrics[];
}): DailyTradingMetrics[] {
  const tradesByDate =
    new Map<string, MetricTrade[]>();

  for (const trade of trades) {
    const date = trade.trade_date;

    if (!date) {
      continue;
    }

    const current =
      tradesByDate.get(date) ?? [];

    current.push(trade);
    tradesByDate.set(date, current);
  }

  const daysByDate =
    new Map<string, TradingDayForMetrics>();

  for (const day of tradingDays) {
    if (!day.date) {
      continue;
    }

    daysByDate.set(day.date, day);
  }

  const dates = new Set<string>([
    ...tradesByDate.keys(),
    ...daysByDate.keys(),
  ]);

  return [...dates]
    .sort((a, b) =>
      a.localeCompare(b),
    )
    .map((date) =>
      calculateDailyTradingMetrics({
        trades:
          tradesByDate.get(date) ?? [],
        tradingDay:
          daysByDate.get(date) ?? null,
      }),
    );
}

/* -------------------------------------------------------------------------- */
/* UNIFIED METRICS ENGINE                                                     */
/* -------------------------------------------------------------------------- */

export type TradingMetrics = {
  performance: PerformanceMetrics;

  execution: {
    average: number;
    distribution: Record<
      ExecutionQuality,
      number
    >;
  };

  drawdown: {
    max: number;
    current: number;
    equityCurve: EquityPoint[];
  };

  process: {
    adherence: number;
  };
};

export function calculateTradingMetrics({
  trades,
  tradingDays = [],
}: {
  trades: MetricTrade[];
  tradingDays?: TradingDayForMetrics[];
}): TradingMetrics {
  const performance =
    calculatePerformanceMetrics(
      trades,
    );

  const execution = {
    average:
      calculateExecutionAverage(
        trades,
      ),
    distribution:
      calculateExecutionDistribution(
        trades,
      ),
  };

  const equityCurve =
    buildEquityCurve(trades);

  const drawdown = {
    max:
      calculateMaxDrawdown(trades),
    current:
      calculateCurrentDrawdown(trades),
    equityCurve,
  };

  const process = {
    adherence:
      calculateProcessAdherence(
        tradingDays,
        trades,
      ),
  };

  return {
    performance,
    execution,
    drawdown,
    process,
  };
}