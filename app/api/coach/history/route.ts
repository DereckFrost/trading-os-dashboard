import { NextResponse } from "next/server";
import { supabaseServerFetch } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

type Period = "day" | "week" | "month" | "all";

type Snapshot = {
  period: {
    type: Period | string;
    start: string;
    end: string;
  };

  performance: {
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
  };

  process: {
    adherence: number;
    executionScore: number;
    identityScore: number;
    adherentDays: number;
    currentAdherenceStreak: number;
    bestAdherenceStreak: number;
  };

  consistency: {
    currentWinningStreak: number;
    bestWinningStreak: number;
  };

  setups: {
    bestSetup: unknown;
    worstSetup: unknown;
    all: unknown[];
  };

  behavior: {
    overtradingDays: number;
    overtradingTrades: number;
    recoveryAttempts: number;
    fomoTrades: number;
    impulsiveTrades: number;
    invalidTrades: number;
    emotionalTrades: number;
    daysWithProcessBreak: number;
    observations: string[];
    [key: string]: unknown;
  };

  comparison?: {
    changes?: {
      totalR?: number;
      expectancy?: number;
      winRate?: number;
      adherence?: number;
      executionScore?: number;
      identityScore?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  } | null;
};

type HistoryRow = {
  id: string;
  period_type: Period | string;
  period_start: string;
  period_end: string;
  ai_model: string;
  snapshot: Snapshot;
  ai_analysis: unknown;
  created_at: string;
  updated_at?: string;
};

type EvolutionPoint = {
  id: string;
  periodType: Period | string;
  periodStart: string;
  periodEnd: string;

  totalR: number;
  expectancy: number;
  adherence: number;
  executionScore: number;
  identityScore: number;

  trades: number;
  tradingDays: number;

  currentAdherenceStreak: number;
  bestAdherenceStreak: number;

  currentWinningStreak: number;
  bestWinningStreak: number;

  overtradingDays: number;
  overtradingTrades: number;
  recoveryAttempts: number;
  fomoTrades: number;
  impulsiveTrades: number;
  invalidTrades: number;
  emotionalTrades: number;
  daysWithProcessBreak: number;

  createdAt: string;
};

type HistoryResponse = {
  success: boolean;
  history: HistoryRow[];
  evolution: EvolutionPoint[];
  count: number;
};

async function supabaseFetch<T>(query: string): Promise<T> {
  return supabaseServerFetch<T>("coach_analysis_history", { query });
}

function safeNumber(
  value: unknown,
  fallback = 0,
): number {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function getBehaviorValue(
  behavior: Snapshot["behavior"] | undefined,
  key: keyof Snapshot["behavior"],
): number {
  if (!behavior) {
    return 0;
  }

  return safeNumber(
    behavior[key],
    0,
  );
}

function buildEvolutionPoint(
  row: HistoryRow,
): EvolutionPoint {
  const snapshot = row.snapshot;

  const performance =
    snapshot?.performance;

  const process =
    snapshot?.process;

  const consistency =
    snapshot?.consistency;

  const behavior =
    snapshot?.behavior;

  return {
    id: row.id,

    periodType:
      row.period_type,

    periodStart:
      row.period_start,

    periodEnd:
      row.period_end,

    totalR: safeNumber(
      performance?.totalR,
    ),

    expectancy: safeNumber(
      performance?.expectancy,
    ),

    adherence: safeNumber(
      process?.adherence,
    ),

    executionScore: safeNumber(
      process?.executionScore,
    ),

    identityScore: safeNumber(
      process?.identityScore,
    ),

    trades: safeNumber(
      performance?.trades,
    ),

    tradingDays: safeNumber(
      performance?.tradingDays,
    ),

    currentAdherenceStreak:
      safeNumber(
        process?.currentAdherenceStreak,
      ),

    bestAdherenceStreak:
      safeNumber(
        process?.bestAdherenceStreak,
      ),

    currentWinningStreak:
      safeNumber(
        consistency?.currentWinningStreak,
      ),

    bestWinningStreak:
      safeNumber(
        consistency?.bestWinningStreak,
      ),

    overtradingDays:
      getBehaviorValue(
        behavior,
        "overtradingDays",
      ),

    overtradingTrades:
      getBehaviorValue(
        behavior,
        "overtradingTrades",
      ),

    recoveryAttempts:
      getBehaviorValue(
        behavior,
        "recoveryAttempts",
      ),

    fomoTrades:
      getBehaviorValue(
        behavior,
        "fomoTrades",
      ),

    impulsiveTrades:
      getBehaviorValue(
        behavior,
        "impulsiveTrades",
      ),

    invalidTrades:
      getBehaviorValue(
        behavior,
        "invalidTrades",
      ),

    emotionalTrades:
      getBehaviorValue(
        behavior,
        "emotionalTrades",
      ),

    daysWithProcessBreak:
      getBehaviorValue(
        behavior,
        "daysWithProcessBreak",
      ),

    createdAt:
      row.created_at,
  };
}

function sortHistory(
  rows: HistoryRow[],
): HistoryRow[] {
  return [...rows].sort(
    (a, b) => {
      const startComparison =
        a.period_start.localeCompare(
          b.period_start,
        );

      if (startComparison !== 0) {
        return startComparison;
      }

      const endComparison =
        a.period_end.localeCompare(
          b.period_end,
        );

      if (endComparison !== 0) {
        return endComparison;
      }

      return a.created_at.localeCompare(
        b.created_at,
      );
    },
  );
}

export async function GET() {
  try {
    const query =
      "?select=" +
      [
        "id",
        "period_type",
        "period_start",
        "period_end",
        "ai_model",
        "snapshot",
        "ai_analysis",
        "created_at",
        "updated_at",
      ].join(",") +
      "&order=period_start.asc,period_end.asc,created_at.asc";

    const rows =
      await supabaseFetch<HistoryRow[]>(
        query,
      );

    const history =
      sortHistory(rows ?? []);

    const evolution =
      history.map(
        buildEvolutionPoint,
      );

    const response: HistoryResponse = {
      success: true,
      history,
      evolution,
      count: history.length,
    };

    return NextResponse.json(
      response,
    );
  } catch (error) {
    console.error(
      "Coach history GET error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        history: [],
        evolution: [],
        count: 0,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el historial del Coach.",
      },
      {
        status: 500,
      },
    );
  }
}