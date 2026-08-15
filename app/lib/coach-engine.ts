import type {
  TradingDay,
  TradingSetup,
  TradingTrade,
} from "@/app/lib/domain/trading";

import {
  calculatePerformanceMetrics,
  calculateProcessAdherence,
  filterEvaluatedTradingDays,
  isProcessAdherent,
  calculateStreaks,
  calculateExecutionAverage,
  calculateMaxDrawdown as calculateMaxDrawdownMetric,
} from "@/app/lib/metrics";

export type CoachTrade =
  Omit<
    TradingTrade,
    | "id"
    | "trade_date"
    | "instrument"
    | "r"
    | "direction"
    | "setup_quality"
    | "execution_quality"
    | "emotion"
    | "close_type"
    | "setup_id"
    | "trading_day_id"
  > & {
    id: string;
    trade_date: string;
    instrument: string;
    direction: string | null;
    setup_quality: string | null;
    execution_quality: string | null;
    emotion: string | null;
    close_type: string | null;
    r: number;
    setup_id: string | null;
    trading_day_id: string | null;
  };

export type CoachTradingDay =
  Omit<
    TradingDay,
    | "id"
    | "date"
    | "mental_state"
    | "waited_for_setup"
    | "only_one_trade"
    | "did_not_recover_losses"
    | "session_finished"
    | "notes"
  > & {
    id: string;
    date: string;
    mental_state: string | null;
    waited_for_setup: boolean;
    only_one_trade: boolean;
    did_not_recover_losses: boolean;
    session_finished: boolean;
    notes: string | null;
  };

export type CoachSetup =
  Omit<
    TradingSetup,
    | "id"
    | "name"
    | "category"
    | "active"
  > & {
    id: string;
    name: string;
    category: string | null;
    active: boolean;
  };

export type CoachPeriod = {
  type: "week" | "month" | "custom";
  start: string;
  end: string;
};

export type SetupEvidence =
  | "insuficiente"
  | "inicial"
  | "en_desarrollo"
  | "establecida";

export type SetupAnalysis = {
  setupId: string | null;
  setupName: string;

  trades: number;
  winners: number;
  losers: number;

  winRate: number;
  totalR: number;
  expectancy: number;

  averageWin: number;
  averageLoss: number;

  profitFactor: number | null;

  aPlusRate: number;

  evidence: SetupEvidence;

  hasPositiveExpectancy: boolean;
  hasWinningTrade: boolean;

  eligibleForBestSetup: boolean;
};

export type BehaviorAnalysis = {
  overtradingDays: number;
  overtradingTrades: number;

  recoveryAttempts: number;

  fomoTrades: number;
  impulsiveTrades: number;

  invalidTrades: number;

  emotionalTrades: number;

  daysWithProcessBreak: number;

  observations: string[];
};

export type CoachMetrics = {
  period: CoachPeriod;

  trades: number;
  tradingDays: number;

  winners: number;
  losers: number;

  winRate: number;

  totalR: number;
  expectancy: number;

  averageWin: number;
  averageLoss: number;

  profitFactor: number | null;

  maxDrawdownR: number;

  adherence: number;
  executionScore: number;
  identityScore: number;

  adherentDays: number;

  currentWinningStreak: number;
  bestWinningStreak: number;

  currentAdherenceStreak: number;
  bestAdherenceStreak: number;

  setupAnalyses: SetupAnalysis[];

  bestSetup: SetupAnalysis | null;
  worstSetup: SetupAnalysis | null;

  behavior: BehaviorAnalysis;
};

export type PeriodComparison = {
  previousPeriod: CoachPeriod;

  current: {
    totalR: number;
    expectancy: number;
    winRate: number;
    adherence: number;
    executionScore: number;
    identityScore: number;
  };

  previous: {
    totalR: number;
    expectancy: number;
    winRate: number;
    adherence: number;
    executionScore: number;
    identityScore: number;
  };

  changes: {
    totalR: number;
    expectancy: number;
    winRate: number;
    adherence: number;
    executionScore: number;
    identityScore: number;
  };
};

export type CoachEngineResult = {
  metrics: CoachMetrics;
  comparison: PeriodComparison | null;
};

type RawData = {
  trades: CoachTrade[];
  tradingDays: CoachTradingDay[];
  setups: CoachSetup[];
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function round(value: number, decimals = 2): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number): string {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

function getPreviousPeriod(
  period: CoachPeriod,
): CoachPeriod {
  const start = toDate(period.start);
  const end = toDate(period.end);

  const duration =
    Math.floor(
      (end.getTime() - start.getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;

  return {
    type: period.type,
    start: addDays(period.start, -duration),
    end: addDays(period.start, -1),
  };
}

function isBetween(
  date: string,
  start: string,
  end: string,
): boolean {
  return date >= start && date <= end;
}

/* -------------------------------------------------------------------------- */
/* Execution scoring                                                          */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Setup quality                                                              */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Behavioral detection                                                       */
/* -------------------------------------------------------------------------- */

function isFomo(value: string | null): boolean {
  const normalized = normalize(value);

  return (
    normalized.includes("fomo") ||
    normalized.includes("impuls") ||
    normalized.includes("miedo") ||
    normalized.includes("ansiedad")
  );
}

function isInvalid(value: string | null): boolean {
  const normalized = normalize(value);

  return (
    normalized.includes("no valido") ||
    normalized.includes("invalido") ||
    normalized.includes("invalid") ||
    normalized.includes("fomo")
  );
}

function isImpulsive(value: string | null): boolean {
  const normalized = normalize(value);

  return (
    normalized.includes("impuls") ||
    normalized.includes("venganza") ||
    normalized.includes("revenge") ||
    normalized.includes("tilt")
  );
}

/* -------------------------------------------------------------------------- */
/* Drawdown                                                                   */
/* -------------------------------------------------/* -------------------------------------------------------------------------- */
/* Streaks                                                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Setup analysis                                                             */
/* -------------------------------------------------------------------------- */

function getEvidence(
  trades: number,
): SetupEvidence {
  if (trades < 3) {
    return "insuficiente";
  }

  if (trades < 5) {
    return "inicial";
  }

  if (trades < 10) {
    return "en_desarrollo";
  }

  return "establecida";
}

function analyzeSetups(
  trades: CoachTrade[],
  setups: CoachSetup[],
): SetupAnalysis[] {
  const setupMap = new Map<
    string,
    CoachTrade[]
  >();

  for (const trade of trades) {
    if (!trade.setup_id) continue;

    const existing =
      setupMap.get(trade.setup_id) ?? [];

    existing.push(trade);
    setupMap.set(trade.setup_id, existing);
  }

  const setupNameMap = new Map(
    setups.map((setup) => [
      setup.id,
      setup.name,
    ]),
  );

  const result: SetupAnalysis[] = [];

  for (const [setupId, setupTrades] of setupMap) {
    const performance =
      calculatePerformanceMetrics(
        setupTrades,
      );

    const evidence =
      getEvidence(setupTrades.length);

    const eligibleForBestSetup =
      setupTrades.length >= 3 &&
      performance.wins > 0 &&
      performance.expectancy > 0;

    result.push({
      setupId,
      setupName:
        setupNameMap.get(setupId) ??
        "Setup sin nombre",

      trades: setupTrades.length,
      winners: performance.wins,
      losers: performance.losses,

      winRate: performance.winRate,

      totalR: performance.netR,

      expectancy: performance.expectancy,

      averageWin: performance.averageWin,

      averageLoss: performance.averageLoss,

      profitFactor:
        performance.profitFactor,

      aPlusRate:
        performance.aPlusRate,

      evidence,

      hasPositiveExpectancy:
        performance.expectancy > 0,

      hasWinningTrade:
        performance.wins > 0,

      eligibleForBestSetup,
    });
  }

  return result.sort((a, b) => {
    if (
      a.eligibleForBestSetup !==
      b.eligibleForBestSetup
    ) {
      return a.eligibleForBestSetup
        ? -1
        : 1;
    }

    if (a.eligibleForBestSetup) {
      return (
        b.expectancy -
        a.expectancy
      );
    }

    return b.totalR - a.totalR;
  });
}

/* -------------------------------------------------------------------------- */
/* Behavior analysis                                                          */
/* -------------------------------------------------------------------------- */

function analyzeBehavior(
  trades: CoachTrade[],
  tradingDays: CoachTradingDay[],
  setups: CoachSetup[],
): BehaviorAnalysis {
  const tradesByDay = new Map<
    string,
    CoachTrade[]
  >();

  for (const trade of trades) {
    const key =
      trade.trading_day_id ??
      trade.trade_date;

    const existing =
      tradesByDay.get(key) ?? [];

    existing.push(trade);
    tradesByDay.set(key, existing);
  }

  const setupNameById = new Map(
    setups.map((setup) => [
      setup.id,
      setup.name,
    ]),
  );

  let overtradingDays = 0;
  let overtradingTrades = 0;

  for (const dayTrades of tradesByDay.values()) {
    if (dayTrades.length > 1) {
      overtradingDays += 1;
      overtradingTrades +=
        dayTrades.length - 1;
    }
  }

  /*
   * FOMO:
   *
   * We inspect both the trade-level fields and the
   * actual setup name. This allows a setup such as
   * "No válido / FOMO" to be detected correctly.
   */
  const fomoTrades = trades.filter(
    (trade) => {
      const setupName = normalize(
        trade.setup_id
          ? setupNameById.get(
              trade.setup_id,
            )
          : null,
      );

      return (
        isFomo(trade.emotion) ||
        isFomo(trade.setup_quality) ||
        setupName.includes("fomo")
      );
    },
  ).length;

  const impulsiveTrades = trades.filter(
    (trade) =>
      isImpulsive(trade.emotion),
  ).length;

  /*
   * Invalid trades:
   *
   * Detect them from both the trade-level
   * setup_quality and the actual setup name.
   */
  const invalidTrades = trades.filter(
    (trade) => {
      const setupName = normalize(
        trade.setup_id
          ? setupNameById.get(
              trade.setup_id,
            )
          : null,
      );

      return (
        isInvalid(trade.setup_quality) ||
        setupName.includes("no valido") ||
        setupName.includes("invalido")
      );
    },
  ).length;

  const emotionalTrades = trades.filter(
    (trade) =>
      isFomo(trade.emotion) ||
      isImpulsive(trade.emotion),
  ).length;

  /*
   * A recovery attempt is counted when:
   *
   * - the day says the trader DID recover losses
   * - and there was a negative trade during that day
   *
   * We do not assume that every false value automatically
   * means revenge trading.
   */
  let recoveryAttempts = 0;

  for (const day of tradingDays) {
    if (day.did_not_recover_losses) {
      continue;
    }

    const dayTrades =
      tradesByDay.get(day.id) ?? [];

    if (
      dayTrades.some(
        (trade) =>
          Number(trade.r) < 0,
      )
    ) {
      recoveryAttempts += 1;
    }
  }

  const processBreakDays =
    tradingDays.filter(
      (day) =>
        !day.waited_for_setup ||
        !day.only_one_trade ||
        !day.did_not_recover_losses ||
        !day.session_finished,
    ).length;

  const observations: string[] = [];

  if (overtradingDays > 0) {
    observations.push(
      `${overtradingDays} jornada(s) con más de un trade.`,
    );
  }

  if (recoveryAttempts > 0) {
    observations.push(
      `${recoveryAttempts} jornada(s) con intento de recuperación después de una pérdida.`,
    );
  }

  if (fomoTrades > 0) {
    observations.push(
      `${fomoTrades} trade(s) asociados a FOMO o impulsividad.`,
    );
  }

  if (invalidTrades > 0) {
    observations.push(
      `${invalidTrades} trade(s) clasificados como inválidos.`,
    );
  }

  if (processBreakDays === 0) {
    observations.push(
      "No se detectaron rupturas del proceso en las jornadas analizadas.",
    );
  }

  return {
    overtradingDays,
    overtradingTrades,

    recoveryAttempts,

    fomoTrades,
    impulsiveTrades,

    invalidTrades,

    emotionalTrades,

    daysWithProcessBreak:
      processBreakDays,

    observations,
  };
}

/* -------------------------------------------------------------------------- */
/* Core metrics                                                               */
/* -------------------------------------------------------------------------- */

export function calculateCoachMetrics(
  data: RawData,
  period: CoachPeriod,
): CoachMetrics {
  const trades = data.trades
    .filter((trade) =>
      isBetween(
        trade.trade_date,
        period.start,
        period.end,
      ),
    )
    .sort((a, b) =>
      a.trade_date.localeCompare(
        b.trade_date,
      ),
    );

  const tradingDays = data.tradingDays
    .filter((day) =>
      isBetween(
        day.date,
        period.start,
        period.end,
      ),
    )
    .sort((a, b) =>
      a.date.localeCompare(b.date),
    );

  const performance =
    calculatePerformanceMetrics(
      trades,
    );

  const evaluatedTradingDays =
    filterEvaluatedTradingDays(
      tradingDays,
      trades,
    );

  const adherence =
    calculateProcessAdherence(
      evaluatedTradingDays,
    );

  const executionScore =
    calculateExecutionAverage(
      trades,
    );

  /*
   * Identity deliberately ignores monetary result.
   *
   * 60% process adherence
   * 40% execution quality
   */
  const identityScore = round(
    adherence * 0.6 +
      executionScore * 0.4,
  );

  const streaks =
    calculateStreaks({
      trades,
      tradingDays,
    });

  const adherentDays =
    evaluatedTradingDays.filter(
      isProcessAdherent,
    ).length;

  const setupAnalyses =
    analyzeSetups(
      trades,
      data.setups,
    );

  const eligibleSetups =
    setupAnalyses.filter(
      (setup) =>
        setup.eligibleForBestSetup,
    );

  /*
   * If no setup satisfies the positive-evidence
   * requirements, bestSetup remains null.
   */
  const bestSetup =
    eligibleSetups.length > 0
      ? [...eligibleSetups].sort(
          (a, b) =>
            b.expectancy -
            a.expectancy,
        )[0]
      : null;

  const setupsWithNegativeExpectancy =
    setupAnalyses.filter(
      (setup) =>
        setup.trades >= 3 &&
        setup.expectancy < 0,
    );

  const worstSetup =
    setupsWithNegativeExpectancy.length >
    0
      ? [...setupsWithNegativeExpectancy].sort(
          (a, b) =>
            a.expectancy -
            b.expectancy,
        )[0]
      : null;

  const behavior =
    analyzeBehavior(
      trades,
      tradingDays,
      data.setups,
    );

  return {
    period,

    trades: trades.length,
    tradingDays: tradingDays.length,

    winners: performance.wins,
    losers: performance.losses,

    winRate: performance.winRate,

    totalR: performance.netR,

    expectancy: performance.expectancy,

    averageWin: performance.averageWin,

    averageLoss: performance.averageLoss,

    profitFactor:
      performance.profitFactor,

    maxDrawdownR:
      calculateMaxDrawdownMetric(trades),

    adherence,

    executionScore,

    identityScore,

    adherentDays,

    currentWinningStreak:
      streaks.currentWinning,

    bestWinningStreak:
      streaks.bestWinning,

    currentAdherenceStreak:
      streaks.currentAdherence,

    bestAdherenceStreak:
      streaks.bestAdherence,

    setupAnalyses,

    bestSetup,

    worstSetup,

    behavior,
  };
}

/* -------------------------------------------------------------------------- */
/* Period comparison                                                          */
/* -------------------------------------------------------------------------- */

function compareMetrics(
  current: CoachMetrics,
  previous: CoachMetrics,
): PeriodComparison {
  return {
    previousPeriod:
      previous.period,

    current: {
      totalR: current.totalR,
      expectancy: current.expectancy,
      winRate: current.winRate,
      adherence: current.adherence,
      executionScore:
        current.executionScore,
      identityScore:
        current.identityScore,
    },

    previous: {
      totalR: previous.totalR,
      expectancy:
        previous.expectancy,
      winRate: previous.winRate,
      adherence:
        previous.adherence,
      executionScore:
        previous.executionScore,
      identityScore:
        previous.identityScore,
    },

    changes: {
      totalR: round(
        current.totalR -
          previous.totalR,
      ),

      expectancy: round(
        current.expectancy -
          previous.expectancy,
      ),

      winRate: round(
        current.winRate -
          previous.winRate,
      ),

      adherence: round(
        current.adherence -
          previous.adherence,
      ),

      executionScore: round(
        current.executionScore -
          previous.executionScore,
      ),

      identityScore: round(
        current.identityScore -
          previous.identityScore,
      ),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public engine                                                              */
/* -------------------------------------------------------------------------- */

export function runCoachEngine(
  data: RawData,
  period: CoachPeriod,
): CoachEngineResult {
  const metrics =
    calculateCoachMetrics(
      data,
      period,
    );

  const previousPeriod =
    getPreviousPeriod(period);

  const previousMetrics =
    calculateCoachMetrics(
      data,
      previousPeriod,
    );

  const hasPreviousData =
    previousMetrics.trades > 0 ||
    previousMetrics.tradingDays > 0;

  return {
    metrics,

    comparison: hasPreviousData
      ? compareMetrics(
          metrics,
          previousMetrics,
        )
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Weekly helper                                                              */
/* -------------------------------------------------------------------------- */

export function getWeeklyPeriod(
  endDate: string,
): CoachPeriod {
  const end = toDate(endDate);

  const dayOfWeek =
    end.getUTCDay();

  /*
   * JS:
   * Sunday = 0
   * Monday = 1
   * ...
   * Saturday = 6
   */

  const daysFromMonday =
    dayOfWeek === 0
      ? 6
      : dayOfWeek - 1;

  const start = new Date(end);

  start.setUTCDate(
    start.getUTCDate() -
      daysFromMonday,
  );

  return {
    type: "week",
    start: formatDate(start),
    end: formatDate(end),
  };
}

/* -------------------------------------------------------------------------- */
/* Serialization helper for GPT                                              */
/* -------------------------------------------------------------------------- */

export function buildCoachSnapshot(
  result: CoachEngineResult,
) {
  const {
    metrics,
    comparison,
  } = result;

  return {
    period: metrics.period,

    performance: {
      trades: metrics.trades,
      tradingDays:
        metrics.tradingDays,

      winners: metrics.winners,
      losers: metrics.losers,

      winRate: metrics.winRate,

      totalR: metrics.totalR,
      expectancy:
        metrics.expectancy,

      averageWin:
        metrics.averageWin,

      averageLoss:
        metrics.averageLoss,

      profitFactor:
        metrics.profitFactor,

      maxDrawdownR:
        metrics.maxDrawdownR,
    },

    process: {
      adherence:
        metrics.adherence,

      executionScore:
        metrics.executionScore,

      identityScore:
        metrics.identityScore,

      adherentDays:
        metrics.adherentDays,

      currentAdherenceStreak:
        metrics.currentAdherenceStreak,

      bestAdherenceStreak:
        metrics.bestAdherenceStreak,
    },

    consistency: {
      currentWinningStreak:
        metrics.currentWinningStreak,

      bestWinningStreak:
        metrics.bestWinningStreak,
    },

    setups: {
      bestSetup:
        metrics.bestSetup,

      worstSetup:
        metrics.worstSetup,

      all:
        metrics.setupAnalyses,
    },

    behavior:
      metrics.behavior,

    comparison,
  };
}