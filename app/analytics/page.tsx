"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDailyTradingMetricsSeries,
  calculatePerformanceMetrics,
  calculateStreaks,
  calculateTradingMetrics,
} from "@/app/lib/metrics";
import type {
  DailyTradingMetrics,
  MetricTrade,
  TradingDayForMetrics,
} from "@/app/lib/metrics";

import {
  isDateInPeriod,
  PERIOD_LABELS,
} from "@/app/lib/period";

import type { Period } from "@/app/lib/period";

type Trade = {
  id: string;
  trade_date: string;
  created_at?: string;
  instrument: string;
  direction: string;
  setup_id: string | null;
  setup_quality: string | null;
  execution_quality: string | null;
  emotion: string | null;
  close_type: string | null;
  r: number | null;
};

type Setup = {
  id: string;
  name: string;
  active: boolean;
};

type TradingDay = {
  id: string;
  date: string;
  mental_state: string | null;
  waited_for_setup: boolean;
  only_one_trade: boolean;
  did_not_recover_losses: boolean;
  session_finished: boolean;
};

type SopSession = {
  id: string;
  date: string;
  progress: number;
  completedCount: number;
  totalSteps: number;
};

type AnalyticsInsight = {
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "negative" | "neutral";
};

type EquityPoint = {
  label: string;
  date: string;
  value: number;
  trade: Trade;
};

type DrawdownPoint = {
  label: string;
  date: string;
  equity: number;
  peak: number;
  drawdown: number;
};

type ProcessPoint = {
  label: string;
  date: string;
  adherence: number;
  execution: number;
  tradeCount: number;
  dayR: number;
  sopProgress: number | null;
};

type SetupStat = {
  id: string;
  name: string;
  trades: number;
  wins: number;
  winRate: number;
  expectancy: number;
  r: number;
};

type StreakStats = {
  currentAdherence: number;
  bestAdherence: number;
  currentWinning: number;
  bestWinning: number;
};

type HeatmapDay = {
  date: string;
  dayR: number;
  trades: number;
  wins: number;
  winRate: number;
  adherence: number | null;
};

type HeatmapWeek = {
  days: (HeatmapDay | null)[];
};

/* -------------------------------------------------------------------------- */
/* SUPABASE                                                                   */
/* -------------------------------------------------------------------------- */

async function supabaseFetch<T>(table: string, options: { query?: string; method?: string } = {}): Promise<T> {
  const { supabaseBrowserFetch } = await import("@/app/lib/supabase/browser-fetch");
  return supabaseBrowserFetch<T>(table, options.query ?? "", { method: options.method ?? "GET" });
}

/* -------------------------------------------------------------------------- */
/* FORMATTERS                                                                 */
/* -------------------------------------------------------------------------- */

function formatR(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`;
}

function formatChartDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);

  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatLongDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);

  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toMetricTrade(
  trade: Trade
): MetricTrade {
  return {
    id: trade.id,
    trade_date: trade.trade_date,
    created_at: trade.created_at,
    r: trade.r,
    setup_id: trade.setup_id,
    setup_quality: trade.setup_quality,
    execution_quality:
      trade.execution_quality,
  };
}

/* -------------------------------------------------------------------------- */
/* EXECUTION SCORE                                                            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* PROCESS METRICS                                                           */
/* -------------------------------------------------------------------------- */

function toMetricTradingDay(
  day: TradingDay
): TradingDayForMetrics {
  return {
    date: day.date,
    waited_for_setup: day.waited_for_setup,
    only_one_trade: day.only_one_trade,
    did_not_recover_losses: day.did_not_recover_losses,
    session_finished: day.session_finished,
  };
}

function clampPercent(value: number) {
  return Math.max(
    0,
    Math.min(100, value)
  );
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function extractSopDate(
  row: Record<string, unknown>
) {
  const candidates = [
    row.date,
    row.session_date,
    row.trading_date,
    row.day_date,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      /^\d{4}-\d{2}-\d{2}/.test(
        candidate
      )
    ) {
      return candidate.slice(0, 10);
    }
  }

  if (
    typeof row.created_at ===
    "string"
  ) {
    return row.created_at.slice(0, 10);
  }

  if (
    typeof row.updated_at ===
    "string"
  ) {
    return row.updated_at.slice(0, 10);
  }

  return null;
}

function extractCompletedCount(
  row: Record<string, unknown>
) {
  const directCandidates = [
    row.completed_count,
    row.completed_steps_count,
    row.steps_completed,
  ];

  for (const candidate of directCandidates) {
    const value =
      toFiniteNumber(candidate);

    if (value !== null) {
      return Math.max(0, value);
    }
  }

  const collectionCandidates = [
    row.completed,
    row.completed_steps,
    row.steps,
  ];

  for (const candidate of collectionCandidates) {
    if (
      candidate &&
      typeof candidate ===
        "object"
    ) {
      if (Array.isArray(candidate)) {
        return candidate.filter(Boolean)
          .length;
      }

      return Object.values(
        candidate as Record<
          string,
          unknown
        >
      ).filter(Boolean).length;
    }
  }

  return null;
}

function normalizeSopSession(
  row: Record<string, unknown>
): SopSession | null {
  const date =
    extractSopDate(row);

  if (!date) {
    return null;
  }

  const totalSteps =
    toFiniteNumber(
      row.total_steps ??
        row.step_count ??
        row.total_count
    ) ?? 8;

  let progress =
    toFiniteNumber(
      row.progress ??
        row.progress_percent ??
        row.completion_percentage ??
        row.adherence
    );

  const completedCount =
    extractCompletedCount(row);

  if (
    progress === null &&
    completedCount !== null
  ) {
    progress =
      (completedCount /
        Math.max(
          1,
          totalSteps
        )) *
      100;
  }

  if (progress === null) {
    progress = 0;
  }

  if (
    progress >= 0 &&
    progress <= 1
  ) {
    progress *= 100;
  }

  const normalizedProgress =
    clampPercent(progress);

  const normalizedCompletedCount =
    completedCount !== null
      ? Math.min(
          Math.max(
            0,
            completedCount
          ),
          totalSteps
        )
      : Math.round(
          (normalizedProgress /
            100) *
            totalSteps
        );

  return {
    id:
      typeof row.id === "string"
        ? row.id
        : `${date}-${normalizedProgress}`,
    date,
    progress:
      normalizedProgress,
    completedCount:
      normalizedCompletedCount,
    totalSteps: Math.max(
      1,
      totalSteps
    ),
  };
}

function buildSopProgressMap(
  sessions: SopSession[]
) {
  const map = new Map<string, number>();

  for (const session of sessions) {
    map.set(session.date, session.progress);
  }

  return map;
}

/* -------------------------------------------------------------------------- */
/* HEATMAP                                                                    */
/* -------------------------------------------------------------------------- */

function buildHeatmapDays(
  dailyMetrics: DailyTradingMetrics[],
  sopSessions: SopSession[]
): HeatmapDay[] {
  const metricsByDate =
    new Map<string, DailyTradingMetrics>();

  for (const metrics of dailyMetrics) {
    metricsByDate.set(
      metrics.date,
      metrics
    );
  }

  const allDates =
    new Set<string>(
      dailyMetrics.map(
        (metrics) => metrics.date
      )
    );

  for (const session of sopSessions) {
    allDates.add(session.date);
  }

  return [...allDates]
    .sort((a, b) =>
      a.localeCompare(b)
    )
    .map((date) => {
      const metrics =
        metricsByDate.get(date);

      return {
        date,
        dayR:
          metrics?.netR ?? 0,
        trades:
          metrics?.trades ?? 0,
        wins:
          metrics?.wins ?? 0,
        winRate:
          metrics?.winRate ?? 0,
        adherence:
          metrics
            ? metrics.adherence
              ? 100
              : 0
            : null,
      };
    });
}

function buildHeatmapWeeks(
  days: HeatmapDay[]
): HeatmapWeek[] {
  if (days.length === 0) {
    return [];
  }

  const sorted = [...days].sort(
    (a, b) =>
      a.date.localeCompare(
        b.date
      )
  );

  const firstDate = new Date(
    `${sorted[0].date}T00:00:00`
  );

  const firstDay =
    firstDate.getDay() === 0
      ? 6
      : firstDate.getDay() - 1;

  const padded: (
    | HeatmapDay
    | null
  )[] = [];

  for (
    let i = 0;
    i < firstDay;
    i++
  ) {
    padded.push(null);
  }

  padded.push(...sorted);

  const weeks: HeatmapWeek[] = [];

  for (
    let i = 0;
    i < padded.length;
    i += 7
  ) {
    const week = padded.slice(
      i,
      i + 7
    );

    while (week.length < 7) {
      week.push(null);
    }

    weeks.push({
      days: week,
    });
  }

  return weeks;
}

function getHeatmapIntensity(
  value: number,
  maxAbsR: number
) {
  if (value === 0) {
    return "bg-[#20252a]";
  }

  const intensity =
    maxAbsR > 0
      ? Math.abs(value) /
        maxAbsR
      : 0;

  if (value > 0) {
    if (intensity >= 0.75) {
      return "bg-[var(--accent-strong)]";
    }

    if (intensity >= 0.45) {
      return "bg-[#147e58]";
    }

    return "bg-[#105b42]";
  }

  if (intensity >= 0.75) {
    return "bg-[#dc3f4b]";
  }

  if (intensity >= 0.45) {
    return "bg-[var(--danger-border)]";
  }

  return "bg-[var(--danger-soft)]";
}

function getCurrentAdherenceStreak(
  trades: MetricTrade[],
  tradingDays: TradingDayForMetrics[]
) {
  return calculateStreaks({
    trades,
    tradingDays,
  }).currentAdherence;
}

/* -------------------------------------------------------------------------- */
/* PAGE                                                                       */
/* -------------------------------------------------------------------------- */

export default function AnalyticsPage() {
  const [trades, setTrades] =
    useState<Trade[]>([]);

  const [setups, setSetups] =
    useState<Setup[]>([]);

  const [tradingDays, setTradingDays] =
    useState<TradingDay[]>([]);

  const [sopSessions, setSopSessions] =
    useState<SopSession[]>([]);

  const [period, setPeriod] =
    useState<Period>("month");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    hoveredEquityIndex,
    setHoveredEquityIndex,
  ] = useState<number | null>(
    null
  );

  const [
    hoveredProcessIndex,
    setHoveredProcessIndex,
  ] = useState<number | null>(
    null
  );

  const [
    hoveredDrawdownIndex,
    setHoveredDrawdownIndex,
  ] = useState<number | null>(
    null
  );

  const [
    hoveredHeatmapDate,
    setHoveredHeatmapDate,
  ] = useState<string | null>(
    null
  );

  /* ------------------------------------------------------------------------ */
  /* LOAD DATA                                                                */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [
          tradesData,
          setupsData,
          daysData,
        ] = await Promise.all([
          supabaseFetch<Trade[]>("trades", {
            query:
              "?select=*&order=trade_date.asc,created_at.asc",
          }),

          supabaseFetch<Setup[]>("setups", {
            query:
              "?select=id,name,active&order=name.asc",
          }),

          supabaseFetch<TradingDay[]>(
            "trading_days",
            {
              query:
                "?select=*&order=date.asc",
            }
          ),
        ]);

        setTrades(
          tradesData ?? []
        );

        setSetups(
          setupsData ?? []
        );

        setTradingDays(
          daysData ?? []
        );

        /*
         * SOP is intentionally loaded separately.
         *
         * The exact column names can evolve without breaking Analytics:
         * normalizeSopSession() detects the supported date/progress shapes.
         * If SOP RLS/schema is unavailable, Analytics falls back to
         * trading_days for process metrics instead of breaking the page.
         */

        try {
          const sopData =
            await supabaseFetch<SopSession[]>(
              "sop_sessions",
              {
                query:
                  "?select=*",
              }
            );

          const normalizedSopSessions =
            (
              (sopData ??
                []) as Record<
                string,
                unknown
              >[]
            )
              .map(
                normalizeSopSession
              )
              .filter(
                (
                  session
                ): session is SopSession =>
                  session !== null
              );

          setSopSessions(
            normalizedSopSessions
          );
        } catch (
          sopError
        ) {
          console.warn(
            "No se pudieron cargar sop_sessions. Se usará trading_days como fallback.",
            sopError
          );

          setSopSessions([]);
        }
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los analytics."
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  /* ------------------------------------------------------------------------ */
  /* PERIOD DATA                                                              */
  /* ------------------------------------------------------------------------ */

  const periodTrades =
    useMemo(() => {
      return trades.filter(
        (trade) =>
          isDateInPeriod(
            trade.trade_date,
            period
          )
      );
    }, [trades, period]);

  const periodTradingDays =
    useMemo(() => {
      return tradingDays.filter(
        (day) =>
          isDateInPeriod(
            day.date,
            period
          )
      );
    }, [
      tradingDays,
      period,
    ]);

  const periodSopSessions =
    useMemo(() => {
      return sopSessions.filter(
        (session) =>
          isDateInPeriod(
            session.date,
            period
          )
      );
    }, [
      sopSessions,
      period,
    ]);

  const sopProgressMap =
    useMemo(
      () =>
        buildSopProgressMap(
          periodSopSessions
        ),
      [periodSopSessions]
    );

  /* ------------------------------------------------------------------------ */
  /* SETUP LOOKUP                                                             */
  /* ------------------------------------------------------------------------ */

  const setupMap = useMemo(() => {
    const map = new Map<
      string,
      string
    >();

    for (const setup of setups) {
      map.set(
        setup.id,
        setup.name
      );
    }

    return map;
  }, [setups]);

  /* ------------------------------------------------------------------------ */
  /* UNIFIED METRICS                                                          */
  /* ------------------------------------------------------------------------ */

  const metricTrades =
    useMemo<MetricTrade[]>(
      () =>
        periodTrades.map(
          toMetricTrade
        ),
      [periodTrades]
    );

  const metricTradingDays =
    useMemo<TradingDayForMetrics[]>(
      () =>
        periodTradingDays.map(
          toMetricTradingDay
        ),
      [periodTradingDays]
    );

  const unifiedMetrics =
    useMemo(
      () =>
        calculateTradingMetrics({
          trades:
            metricTrades,
          tradingDays:
            metricTradingDays,
        }),
      [
        metricTrades,
        metricTradingDays,
      ]
    );

  const analytics = useMemo(() => {
    const profitFactor =
      unifiedMetrics.performance
          .profitFactor === null &&
        unifiedMetrics.performance.netR >
          0
        ? Infinity
        : unifiedMetrics.performance
              .profitFactor ?? 0;

    return {
      totalTrades:
        unifiedMetrics.performance
          .totalTrades,

      netR:
        unifiedMetrics.performance
          .netR,

      winRate:
        unifiedMetrics.performance
          .winRate,

      expectancy:
        unifiedMetrics.performance
          .expectancy,

      profitFactor,

      maxDrawdown:
        unifiedMetrics.drawdown.max,

      aPlusRate:
        unifiedMetrics.performance
          .aPlusRate,

      processAdherence:
        unifiedMetrics.process
          .adherence,

      averageExecution:
        unifiedMetrics.execution
          .average,

      wins:
        unifiedMetrics.performance
          .wins,

      losses:
        unifiedMetrics.performance
          .losses,
    };
  }, [unifiedMetrics]);

  /* ------------------------------------------------------------------------ */
  /* DAILY UNIFIED METRICS                                                    */
  /* ------------------------------------------------------------------------ */

  const dailyTradingMetrics =
    useMemo(() => {
      return calculateDailyTradingMetricsSeries({
        trades:
          metricTrades,
        tradingDays:
          metricTradingDays,
      });
    }, [
      metricTrades,
      metricTradingDays,
    ]);

  /* ------------------------------------------------------------------------ */
  /* EQUITY CURVE                                                             */
  /* ------------------------------------------------------------------------ */

  const equityCurve =
    useMemo<EquityPoint[]>(
      () =>
        unifiedMetrics.drawdown.equityCurve.map(
          (point) => {
            const originalTrade =
              periodTrades.find(
                (trade) =>
                  trade.id ===
                  point.trade.id
              );

            return {
              label:
                formatChartDate(
                  point.date
                ),

              date: point.date,

              value:
                point.equity,

              trade:
                originalTrade ??
                (point.trade as Trade),
            };
          }
        ),
      [
        unifiedMetrics,
        periodTrades,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* DRAWDOWN                                                                 */
  /* ------------------------------------------------------------------------ */

  const drawdownCurve =
    useMemo<DrawdownPoint[]>(
      () =>
        unifiedMetrics.drawdown.equityCurve.map(
          (point) => ({
            label:
              formatChartDate(
                point.date
              ),

            date: point.date,

            equity:
              point.equity,

            peak:
              point.equity +
              point.drawdown,

            drawdown:
              point.drawdown,
          })
        ),
      [unifiedMetrics]
    );

  /* ------------------------------------------------------------------------ */
  /* PROCESS EVOLUTION                                                        */
  /* ------------------------------------------------------------------------ */

  const processEvolution =
    useMemo<ProcessPoint[]>(
      () =>
        dailyTradingMetrics.map(
          (metrics) => {
            const sopProgress =
              sopProgressMap.get(
                metrics.date
              ) ?? null;

            return {
              label:
                formatChartDate(
                  metrics.date
                ),

              date:
                metrics.date,

              adherence:
                sopProgress ??
                (metrics.adherence
                  ? 100
                  : 0),

              execution:
                metrics.execution,

              tradeCount:
                metrics.trades,

              dayR:
                metrics.netR,

              sopProgress,
            };
          }
        ),
      [
        dailyTradingMetrics,
        sopProgressMap,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* SETUP ANALYTICS                                                          */
  /* ------------------------------------------------------------------------ */

  const setupStats =
    useMemo<SetupStat[]>(
      () => {
        const validTrades =
          periodTrades.filter(
            (trade) =>
              Number.isFinite(
                Number(trade.r)
              )
          );

        return setups
          .map((setup) => {
            const setupTrades =
              validTrades.filter(
                (trade) =>
                  trade.setup_id ===
                  setup.id
              );

            if (
              setupTrades.length ===
              0
            ) {
              return null;
            }

            const setupPerformance =
              calculatePerformanceMetrics(
                setupTrades.map(
                  toMetricTrade
                )
              );

            return {
              id: setup.id,
              name: setup.name,

              trades:
                setupPerformance.totalTrades,

              wins:
                setupPerformance.wins,

              winRate:
                setupPerformance.winRate,

              expectancy:
                setupPerformance.expectancy,

              r:
                setupPerformance.netR,
            };
          })
          .filter(
            (
              setup
            ): setup is SetupStat =>
              setup !== null
          )
          .sort(
            (a, b) =>
              b.r - a.r
          );
      },
      [
        periodTrades,
        setups,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* QUICK READ                                                               */
  /* ------------------------------------------------------------------------ */

  const insights =
    useMemo<AnalyticsInsight[]>(() => {
      const bestSetup =
        setupStats[0] ?? null;

      const worstSetup =
        setupStats.length > 1
          ? setupStats[setupStats.length - 1]
          : null;

      const currentAdherence =
        getCurrentAdherenceStreak(
          metricTrades,
          metricTradingDays
        );

      return [
        {
          label: "MEJOR SETUP",
          value:
            bestSetup?.name ?? "—",
          detail:
            bestSetup
              ? `${formatR(bestSetup.r)} · ${bestSetup.trades} trades`
              : "Sin muestra",
          tone:
            bestSetup &&
            bestSetup.r >= 0
              ? "positive"
              : "neutral",
        },
        {
          label: "SETUP A VIGILAR",
          value:
            worstSetup?.name ?? "—",
          detail:
            worstSetup
              ? `${formatR(worstSetup.r)} · ${worstSetup.trades} trades`
              : "Sin muestra",
          tone:
            worstSetup &&
            worstSetup.r < 0
              ? "negative"
              : "neutral",
        },
        {
          label: "EJECUCIÓN",
          value: `${analytics.averageExecution.toFixed(0)}/100`,
          detail:
            analytics.averageExecution >= 80
              ? "Nivel sólido"
              : "Hay margen de mejora",
          tone:
            analytics.averageExecution >= 80
              ? "positive"
              : "neutral",
        },
        {
          label: "ADHERENCIA",
          value: `${analytics.processAdherence.toFixed(0)}%`,
          detail:
            currentAdherence > 0
              ? `${currentAdherence} día${currentAdherence === 1 ? "" : "s"} consecutivo${currentAdherence === 1 ? "" : "s"}`
              : "Sin racha activa",
          tone:
            analytics.processAdherence >= 80
              ? "positive"
              : "neutral",
        },
      ];
    }, [
      analytics,
      setupStats,
      metricTrades,
      metricTradingDays,
    ]);

  /* ------------------------------------------------------------------------ */
  /* STREAKS                                                                  */
  /* ------------------------------------------------------------------------ */

  const streaks =
    useMemo<StreakStats>(
      () => {
        const metrics =
          calculateStreaks({
            trades:
              metricTrades,
            tradingDays:
              metricTradingDays,
          });

        return {
          currentAdherence:
            metrics.currentAdherence,

          bestAdherence:
            metrics.bestAdherence,

          currentWinning:
            metrics.currentWinning,

          bestWinning:
            metrics.bestWinning,
        };
      },
      [
        metricTrades,
        metricTradingDays,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* HEATMAP                                                                  */
  /* ------------------------------------------------------------------------ */

  const heatmapDays =
    useMemo(() => {
      return buildHeatmapDays(
        dailyTradingMetrics,
        periodSopSessions
      );
    }, [
      dailyTradingMetrics,
      periodSopSessions,
    ]);

  const heatmapWeeks =
    useMemo(() => {
      return buildHeatmapWeeks(
        heatmapDays
      );
    }, [heatmapDays]);

  const heatmapMaxAbsR =
    useMemo(() => {
      return Math.max(
        0,
        ...heatmapDays.map(
          (day) =>
            Math.abs(
              day.dayR
            )
        )
      );
    }, [heatmapDays]);

  const hoveredHeatmapDay =
    useMemo(() => {
      if (!hoveredHeatmapDate) {
        return null;
      }

      return (
        heatmapDays.find(
          (day) =>
            day.date ===
            hoveredHeatmapDate
        ) ?? null
      );
    }, [
      hoveredHeatmapDate,
      heatmapDays,
    ]);

  const periodLabel =
    PERIOD_LABELS[period];

  /* ------------------------------------------------------------------------ */
  /* RESET HOVER STATE                                                        */
  /* ------------------------------------------------------------------------ */

  function handlePeriodChange(
    nextPeriod: Period
  ) {
    setHoveredEquityIndex(null);
    setHoveredProcessIndex(null);
    setHoveredDrawdownIndex(null);
    setHoveredHeatmapDate(null);
    setPeriod(nextPeriod);
  }

  /* ------------------------------------------------------------------------ */
  /* LOADING                                                                  */
  /* ------------------------------------------------------------------------ */

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--surface)] px-8 py-10 text-white">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm text-[var(--text-dim)]">
            Cargando analytics...
          </p>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-[var(--surface)] px-4 py-6 text-white sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">

        <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
              ANALYTICS
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm text-[var(--text-secondary)]">
                Performance, ejecución y riesgo
              </p>
              <span className="text-[var(--text-faint)]">•</span>
              <p className="text-xs text-[var(--text-muted)]">
                {analytics.totalTrades}{" "}
                {analytics.totalTrades === 1 ? "trade" : "trades"} ·{" "}
                {analytics.wins}W / {analytics.losses}L
              </p>
            </div>
          </div>

          <div className="flex w-full overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1 lg:w-auto">
            <PeriodButton active={period === "day"} onClick={() => handlePeriodChange("day")}>
              Este día
            </PeriodButton>
            <PeriodButton active={period === "week"} onClick={() => handlePeriodChange("week")}>
              Esta semana
            </PeriodButton>
            <PeriodButton active={period === "month"} onClick={() => handlePeriodChange("month")}>
              Este mes
            </PeriodButton>
            <PeriodButton active={period === "all"} onClick={() => handlePeriodChange("all")}>
              Histórico
            </PeriodButton>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              {periodLabel}
            </p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
              Resultado + proceso
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="R ACUMULADO" value={formatR(analytics.netR)} positive={analytics.netR >= 0} negative={analytics.netR < 0} featured />
            <MetricCard label="EXPECTANCY" value={formatR(analytics.expectancy)} positive={analytics.expectancy >= 0} negative={analytics.expectancy < 0} />
            <MetricCard
              label="PROFIT FACTOR"
              value={Number.isFinite(analytics.profitFactor) ? analytics.profitFactor.toFixed(2) : "∞"}
              positive={analytics.profitFactor >= 1}
            />
            <MetricCard label="MAX DRAWDOWN" value={`-${analytics.maxDrawdown.toFixed(2)}R`} negative={analytics.maxDrawdown > 0} />
            <MetricCard label="WIN RATE" value={formatPercent(analytics.winRate)} />
            <MetricCard label="A+" value={formatPercent(analytics.aPlusRate)} />
            <MetricCard label="ADHERENCIA" value={formatPercent(analytics.processAdherence)} positive={analytics.processAdherence >= 80} />
            <MetricCard label="EJECUCIÓN" value={`${analytics.averageExecution.toFixed(0)}/100`} positive={analytics.averageExecution >= 80} />
          </div>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {insights.map((insight) => (
            <InsightCard key={insight.label} insight={insight} />
          ))}
        </section>

        <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <SectionHeader
            label="EQUITY CURVE"
            meta={
              <span className={analytics.netR >= 0 ? "text-[var(--accent)]" : "text-red-400"}>
                {formatR(analytics.netR)}
              </span>
            }
          />
          <div className="p-4 sm:p-5 lg:p-6">
            {equityCurve.length > 0 ? (
              <EquityCurveChart
                points={equityCurve}
                hoveredIndex={hoveredEquityIndex}
                onHover={setHoveredEquityIndex}
                setupMap={setupMap}
              />
            ) : (
              <EmptyChart message="No hay trades suficientes para mostrar la equity curve." />
            )}
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <SectionHeader
            label="EJECUCIÓN + IDENTIDAD"
            meta={
              <div className="flex items-center gap-4">
                <LegendItem
                  label={periodSopSessions.length > 0 ? "SOP" : "ADHERENCIA"}
                  className="bg-[var(--accent)]"
                />
                <LegendItem label="EJECUCIÓN" className="bg-[var(--info)]" />
              </div>
            }
          />
          <div className="p-4 sm:p-5 lg:p-6">
            {processEvolution.length > 0 ? (
              <ProcessEvolutionChart
                points={processEvolution}
                hoveredIndex={hoveredProcessIndex}
                onHover={setHoveredProcessIndex}
              />
            ) : (
              <EmptyChart message="No hay jornadas registradas suficientes para mostrar la evolución." />
            )}
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <SectionHeader
            label="DRAWDOWN"
            labelClass="text-red-400"
            meta={<span className="text-red-400">-{analytics.maxDrawdown.toFixed(2)}R</span>}
          />
          <div className="p-4 sm:p-5 lg:p-6">
            {drawdownCurve.length > 0 ? (
              <DrawdownChart
                points={drawdownCurve}
                hoveredIndex={hoveredDrawdownIndex}
                onHover={setHoveredDrawdownIndex}
              />
            ) : (
              <EmptyChart message="No hay trades suficientes para mostrar el drawdown." />
            )}
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <SectionHeader label="STREAKS" />
          <div className="grid grid-cols-2 gap-px bg-[var(--surface-3)] lg:grid-cols-4">
            <StreakCard label="RACHA ADHERENCIA" value={`${streaks.currentAdherence}`} suffix={streaks.currentAdherence === 1 ? "día" : "días"} />
            <StreakCard label="MEJOR ADHERENCIA" value={`${streaks.bestAdherence}`} suffix={streaks.bestAdherence === 1 ? "día" : "días"} />
            <StreakCard label="RACHA GANADORA" value={`${streaks.currentWinning}`} suffix={streaks.currentWinning === 1 ? "trade" : "trades"} />
            <StreakCard label="MEJOR RACHA GANADORA" value={`${streaks.bestWinning}`} suffix={streaks.bestWinning === 1 ? "trade" : "trades"} />
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <SectionHeader
            label="HEATMAP"
            meta={
              <div className="flex items-center gap-4">
                <LegendItem label="PÉRDIDA" className="bg-[var(--danger-soft)]" />
                <LegendItem label="GANANCIA" className="bg-[var(--accent-strong)]" />
              </div>
            }
          />
          <div className="p-4 sm:p-5 lg:p-6">
            {heatmapWeeks.length > 0 ? (
              <Heatmap
                weeks={heatmapWeeks}
                maxAbsR={heatmapMaxAbsR}
                hoveredDate={hoveredHeatmapDate}
                onHover={setHoveredHeatmapDate}
                hoveredDay={hoveredHeatmapDay}
              />
            ) : (
              <EmptyChart message="No hay datos suficientes para mostrar el heatmap." />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <SectionHeader
            label="SETUP PERFORMANCE"
            meta={
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
                {setupStats.length} con muestra
              </span>
            }
          />

          {setupStats.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              No hay datos suficientes para mostrar los setups.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="border-b border-[var(--surface-3)]">
                  <tr>
                    <Th>#</Th>
                    <Th>SETUP</Th>
                    <Th>TRADES</Th>
                    <Th>WIN RATE</Th>
                    <Th>EXPECTANCY</Th>
                    <Th>R</Th>
                  </tr>
                </thead>
                <tbody>
                  {setupStats.map((setup, index) => (
                    <tr
                      key={setup.id}
                      className="border-b border-[var(--surface-3)] transition last:border-b-0 hover:bg-white/[0.015]"
                    >
                      <Td><span className="text-[var(--text-faint)]">{String(index + 1).padStart(2, "0")}</span></Td>
                      <Td><span className="font-medium text-white">{setup.name}</span></Td>
                      <Td>{setup.trades}</Td>
                      <Td>{formatPercent(setup.winRate)}</Td>
                      <Td>
                        <span className={setup.expectancy >= 0 ? "text-[var(--accent)]" : "text-red-400"}>
                          {formatR(setup.expectancy)}
                        </span>
                      </Td>
                      <Td>
                        <span className={setup.r >= 0 ? "font-semibold text-[var(--accent)]" : "font-semibold text-red-400"}>
                          {formatR(setup.r)}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* METRIC CARD                                                                */
/* -------------------------------------------------------------------------- */

function MetricCard({
  label,
  value,
  positive,
  negative,
  featured = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  featured?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl border bg-[var(--surface-2)] p-4 sm:p-5",
        featured
          ? "border-[var(--accent-border)]"
          : "border-[var(--border)]",
      ].join(" ")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </p>

      <p
        className={[
          "mt-2 text-2xl font-semibold tracking-tight sm:text-[27px]",
          positive
            ? "text-[var(--accent)]"
            : negative
              ? "text-red-400"
              : "text-white",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SECTION HEADER                                                             */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  label,
  labelClass = "text-[var(--accent)]",
  meta,
}: {
  label: string;
  labelClass?: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[64px] items-center justify-between gap-4 border-b border-[var(--surface-3)] px-5 py-4 sm:px-6">
      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${labelClass}`}>
        {label}
      </p>

      {meta && (
        <div className="shrink-0 text-sm font-semibold">
          {meta}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* INSIGHT CARD                                                               */
/* -------------------------------------------------------------------------- */

function InsightCard({
  insight,
}: {
  insight: AnalyticsInsight;
}) {
  const toneClass =
    insight.tone === "positive"
      ? "text-[var(--accent)]"
      : insight.tone === "negative"
        ? "text-red-400"
        : "text-white";

  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {insight.label}
      </p>

      <p className={`mt-2 truncate text-sm font-semibold ${toneClass}`} title={insight.value}>
        {insight.value}
      </p>

      <p className="mt-1 truncate text-[11px] text-[var(--text-dim)]">
        {insight.detail}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* STREAK CARD                                                                */
/* -------------------------------------------------------------------------- */

function StreakCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div className="bg-[var(--surface-2)] p-4 sm:p-5">

      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </p>

      <div className="mt-3 flex items-baseline gap-2">

        <span className="text-3xl font-semibold text-white">
          {value}
        </span>

        <span className="text-xs text-[var(--text-muted)]">
          {suffix}
        </span>

      </div>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PERIOD BUTTON                                                              */
/* -------------------------------------------------------------------------- */

function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "shrink-0 rounded-lg px-3 py-2 text-[11px] font-medium transition",
        active
          ? "bg-[#242a2f] text-white"
          : "text-[var(--text-dim)] hover:bg-[#1d2125] hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* LEGEND                                                                     */
/* -------------------------------------------------------------------------- */

function LegendItem({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2">

      <span
        className={`h-2 w-2 rounded-full ${className}`}
      />

      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-dim)]">
        {label}
      </span>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TABLE                                                                      */
/* -------------------------------------------------------------------------- */

function Th({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-6 py-4 text-[11px] font-semibold tracking-[0.16em] text-[var(--text-muted)]">
      {children}
    </th>
  );
}

function Td({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
      {children}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* EMPTY CHART                                                                */
/* -------------------------------------------------------------------------- */

function EmptyChart({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)]">

      <p className="max-w-sm text-center text-sm text-[var(--text-muted)]">
        {message}
      </p>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EQUITY CURVE                                                               */
/* -------------------------------------------------------------------------- */

function EquityCurveChart({
  points,
  hoveredIndex,
  onHover,
  setupMap,
}: {
  points: EquityPoint[];
  hoveredIndex: number | null;
  onHover: (
    index: number | null
  ) => void;
  setupMap: Map<
    string,
    string
  >;
}) {
  const width = 1000;
  const height = 300;

  const paddingX = 28;
  const paddingY = 30;

  const values = points.map(
    (point) =>
      point.value
  );

  const minValue =
    Math.min(
      0,
      ...values
    );

  const maxValue =
    Math.max(
      0,
      ...values
    );

  const range =
    maxValue -
      minValue ===
    0
      ? 1
      : maxValue -
        minValue;

  const getX = (
    index: number
  ) => {
    if (
      points.length ===
      1
    ) {
      return width / 2;
    }

    return (
      paddingX +
      (index /
        (points.length -
          1)) *
        (width -
          paddingX * 2)
    );
  };

  const getY = (
    value: number
  ) => {
    return (
      height -
      paddingY -
      ((value -
        minValue) /
        range) *
        (height -
          paddingY * 2)
    );
  };

  const path =
    points
      .map(
        (
          point,
          index
        ) => {
          const x =
            getX(index);

          const y =
            getY(
              point.value
            );

          return `${
            index === 0
              ? "M"
              : "L"
          } ${x} ${y}`;
        }
      )
      .join(" ");

  const zeroY =
    getY(0);

  const labelIndexes =
    getLabelIndexes(
      points.length
    );

  return (
    <div className="relative w-full overflow-x-auto">

      <svg
        viewBox={`0 0 ${width} ${
          height + 36
        }`}
        className="h-[270px] min-w-[680px] w-full sm:h-[290px]"
        preserveAspectRatio="none"
        onMouseLeave={() =>
          onHover(null)
        }
      >

        <line
          x1={paddingX}
          x2={
            width -
            paddingX
          }
          y1={getY(
            maxValue
          )}
          y2={getY(
            maxValue
          )}
          stroke="var(--surface-3)"
          strokeWidth="1"
        />

        <line
          x1={paddingX}
          x2={
            width -
            paddingX
          }
          y1={zeroY}
          y2={zeroY}
          stroke="#3a4046"
          strokeWidth="1"
          strokeDasharray="5 5"
        />

        <line
          x1={paddingX}
          x2={
            width -
            paddingX
          }
          y1={getY(
            minValue
          )}
          y2={getY(
            minValue
          )}
          stroke="var(--surface-3)"
          strokeWidth="1"
        />

        <text
          x={4}
          y={zeroY + 4}
          fill="var(--text-muted)"
          fontSize="11"
        >
          0R
        </text>

        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map(
          (
            point,
            index
          ) => {
            const x =
              getX(index);

            const y =
              getY(
                point.value
              );

            const active =
              hoveredIndex ===
              index;

            return (
              <g
                key={`${point.date}-${index}`}
                onMouseEnter={() =>
                  onHover(
                    index
                  )
                }
                className="cursor-pointer"
              >

                <circle
                  cx={x}
                  cy={y}
                  r={
                    active
                      ? 6
                      : 4
                  }
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth={
                    active
                      ? 3
                      : 2
                  }
                />

                {active && (
                  <circle
                    cx={x}
                    cy={y}
                    r="10"
                    fill="none"
                    stroke="var(--accent)"
                    strokeOpacity="0.18"
                    strokeWidth="4"
                  />
                )}

              </g>
            );
          }
        )}

        {labelIndexes.map(
          (index) => {
            const point =
              points[index];

            return (
              <text
                key={`label-${point.date}-${index}`}
                x={getX(index)}
                y={height + 20}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
              >
                {point.label}
              </text>
            );
          }
        )}

      </svg>

      {hoveredIndex !== null &&
        points[hoveredIndex] && (
          <EquityTooltip
            point={
              points[
                hoveredIndex
              ]
            }
            index={
              hoveredIndex
            }
            total={
              points.length
            }
            setupMap={
              setupMap
            }
          />
        )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EQUITY TOOLTIP                                                             */
/* -------------------------------------------------------------------------- */

function EquityTooltip({
  point,
  index,
  total,
  setupMap,
}: {
  point: EquityPoint;
  index: number;
  total: number;
  setupMap: Map<
    string,
    string
  >;
}) {
  const trade =
    point.trade;

  const isPositive =
    Number(
      trade.r ?? 0
    ) >= 0;

  const position =
    index >= total - 2
      ? "right-0"
      : index <= 1
        ? "left-0"
        : "left-1/2 -translate-x-1/2";

  const setupName =
    trade.setup_id
      ? setupMap.get(
          trade.setup_id
        ) ?? "—"
      : "—";

  return (
    <div
      className={`pointer-events-none absolute top-3 z-20 w-[260px] rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]/95 p-4 shadow-2xl backdrop-blur ${position}`}
    >

      <div className="mb-3 flex items-center justify-between border-b border-[var(--surface-3)] pb-3">

        <div>

          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            TRADE
          </p>

          <p className="mt-1 text-sm font-medium text-white">
            {formatLongDate(
              trade.trade_date
            )}
          </p>

        </div>

        <span
          className={`text-sm font-semibold ${
            isPositive
              ? "text-[var(--accent)]"
              : "text-red-400"
          }`}
        >
          {formatR(
            Number(
              trade.r ?? 0
            )
          )}
        </span>

      </div>

      <div className="space-y-1.5 sm:space-y-2">

        <TooltipRow
          label="Instrumento"
          value={
            trade.instrument ||
            "—"
          }
        />

        <TooltipRow
          label="Dirección"
          value={
            trade.direction ||
            "—"
          }
        />

        <TooltipRow
          label="Setup"
          value={setupName}
        />

        <TooltipRow
          label="Calidad"
          value={
            trade.setup_quality ||
            "—"
          }
        />

        <TooltipRow
          label="Ejecución"
          value={
            trade.execution_quality ||
            "—"
          }
        />

        <div className="mt-3 border-t border-[var(--surface-3)] pt-3">

          <TooltipRow
            label="R acumulado"
            value={formatR(
              point.value
            )}
            strong
          />

        </div>

      </div>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PROCESS CHART                                                              */
/* -------------------------------------------------------------------------- */

function ProcessEvolutionChart({
  points,
  hoveredIndex,
  onHover,
}: {
  points: ProcessPoint[];
  hoveredIndex: number | null;
  onHover: (
    index: number | null
  ) => void;
}) {
  const width = 1000;
  const height = 300;

  const paddingX = 28;
  const paddingY = 30;

  const getX = (
    index: number
  ) => {
    if (
      points.length ===
      1
    ) {
      return width / 2;
    }

    return (
      paddingX +
      (index /
        (points.length -
          1)) *
        (width -
          paddingX * 2)
    );
  };

  const getY = (
    value: number
  ) => {
    return (
      height -
      paddingY -
      (value / 100) *
        (height -
          paddingY * 2)
    );
  };

  const adherencePath =
    points
      .map(
        (
          point,
          index
        ) => {
          const x =
            getX(index);

          const y =
            getY(
              point.adherence
            );

          return `${
            index === 0
              ? "M"
              : "L"
          } ${x} ${y}`;
        }
      )
      .join(" ");

  const executionPath =
    points
      .map(
        (
          point,
          index
        ) => {
          const x =
            getX(index);

          const y =
            getY(
              point.execution
            );

          return `${
            index === 0
              ? "M"
              : "L"
          } ${x} ${y}`;
        }
      )
      .join(" ");

  const labelIndexes =
    getLabelIndexes(
      points.length
    );

  return (
    <div className="relative w-full overflow-x-auto">

      <svg
        viewBox={`0 0 ${width} ${
          height + 36
        }`}
        className="h-[270px] min-w-[680px] w-full sm:h-[290px]"
        preserveAspectRatio="none"
        onMouseLeave={() =>
          onHover(null)
        }
      >

        {[100, 75, 50, 25, 0].map(
          (value) => {
            const y =
              getY(value);

            return (
              <g
                key={value}
              >

                <line
                  x1={paddingX}
                  x2={
                    width -
                    paddingX
                  }
                  y1={y}
                  y2={y}
                  stroke="var(--surface-3)"
                  strokeWidth="1"
                />

                <text
                  x={4}
                  y={y + 4}
                  fill="var(--text-muted)"
                  fontSize="10"
                >
                  {value}
                </text>

              </g>
            );
          }
        )}

        <path
          d={
            adherencePath
          }
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d={
            executionPath
          }
          fill="none"
          stroke="var(--info)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map(
          (
            point,
            index
          ) => {
            const x =
              getX(index);

            const adherenceY =
              getY(
                point.adherence
              );

            const executionY =
              getY(
                point.execution
              );

            const active =
              hoveredIndex ===
              index;

            return (
              <g
                key={`${point.date}-${index}`}
                onMouseEnter={() =>
                  onHover(
                    index
                  )
                }
                className="cursor-pointer"
              >

                <circle
                  cx={x}
                  cy={
                    adherenceY
                  }
                  r={
                    active
                      ? 5.5
                      : 3.5
                  }
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth={
                    active
                      ? 3
                      : 2
                  }
                />

                <circle
                  cx={x}
                  cy={
                    executionY
                  }
                  r={
                    active
                      ? 5.5
                      : 3.5
                  }
                  fill="var(--surface)"
                  stroke="var(--info)"
                  strokeWidth={
                    active
                      ? 3
                      : 2
                  }
                />

              </g>
            );
          }
        )}

        {labelIndexes.map(
          (index) => {
            const point =
              points[index];

            return (
              <text
                key={`label-${point.date}-${index}`}
                x={getX(index)}
                y={height + 20}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
              >
                {point.label}
              </text>
            );
          }
        )}

      </svg>

      {hoveredIndex !== null &&
        points[hoveredIndex] && (
          <ProcessTooltip
            point={
              points[
                hoveredIndex
              ]
            }
            index={
              hoveredIndex
            }
            total={
              points.length
            }
          />
        )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PROCESS TOOLTIP                                                            */
/* -------------------------------------------------------------------------- */

function ProcessTooltip({
  point,
  index,
  total,
}: {
  point: ProcessPoint;
  index: number;
  total: number;
}) {
  const position =
    index >= total - 2
      ? "right-0"
      : index <= 1
        ? "left-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <div
      className={`pointer-events-none absolute top-3 z-20 w-[240px] rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]/95 p-4 shadow-2xl backdrop-blur ${position}`}
    >

      <div className="mb-3 border-b border-[var(--surface-3)] pb-3">

        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          PROCESO
        </p>

        <p className="mt-1 text-sm font-medium text-white">
          {formatLongDate(
            point.date
          )}
        </p>

      </div>

      <div className="space-y-2">

        <TooltipRow
          label={point.sopProgress !== null ? "SOP" : "Adherencia"}
          value={`${point.adherence.toFixed(
            0
          )}%`}
          valueClass={
            point.adherence >=
            80
              ? "text-[var(--accent)]"
              : "text-red-400"
          }
        />

        <TooltipRow
          label="Ejecución"
          value={`${point.execution.toFixed(
            0
          )}%`}
          valueClass="text-[var(--info)]"
        />

        <TooltipRow
          label="Trades"
          value={String(
            point.tradeCount
          )}
        />

        <TooltipRow
          label="R del día"
          value={formatR(
            point.dayR
          )}
          valueClass={
            point.dayR >= 0
              ? "text-[var(--accent)]"
              : "text-red-400"
          }
          strong
        />

      </div>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DRAWDOWN CHART                                                             */
/* -------------------------------------------------------------------------- */

function DrawdownChart({
  points,
  hoveredIndex,
  onHover,
}: {
  points: DrawdownPoint[];
  hoveredIndex: number | null;
  onHover: (
    index: number | null
  ) => void;
}) {
  const width = 1000;
  const height = 300;

  const paddingX = 28;
  const paddingY = 30;

  const maxDrawdown =
    Math.max(
      0,
      ...points.map(
        (point) =>
          point.drawdown
      )
    );

  const range =
    maxDrawdown === 0
      ? 1
      : maxDrawdown;

  const getX = (
    index: number
  ) => {
    if (
      points.length ===
      1
    ) {
      return width / 2;
    }

    return (
      paddingX +
      (index /
        (points.length -
          1)) *
        (width -
          paddingX * 2)
    );
  };

  const getY = (
    value: number
  ) => {
    return (
      paddingY +
      (value / range) *
        (height -
          paddingY * 2)
    );
  };

  const zeroY =
    getY(0);

  const path =
    points
      .map(
        (
          point,
          index
        ) => {
          const x =
            getX(index);

          const y =
            getY(
              point.drawdown
            );

          return `${
            index === 0
              ? "M"
              : "L"
          } ${x} ${y}`;
        }
      )
      .join(" ");

  const areaPath =
    `${path} L ${
      getX(
        points.length - 1
      )
    } ${zeroY} L ${getX(
      0
    )} ${zeroY} Z`;

  const labelIndexes =
    getLabelIndexes(
      points.length
    );

  return (
    <div className="relative w-full overflow-x-auto">

      <svg
        viewBox={`0 0 ${width} ${
          height + 36
        }`}
        className="h-[270px] min-w-[680px] w-full sm:h-[290px]"
        preserveAspectRatio="none"
        onMouseLeave={() =>
          onHover(null)
        }
      >

        {[0, 25, 50, 75, 100].map(
          (percent) => {
            const value =
              (maxDrawdown *
                percent) /
              100;

            const y =
              getY(value);

            return (
              <g
                key={percent}
              >

                <line
                  x1={paddingX}
                  x2={
                    width -
                    paddingX
                  }
                  y1={y}
                  y2={y}
                  stroke="var(--surface-3)"
                  strokeWidth="1"
                />

                {percent ===
                  0 && (
                  <text
                    x={4}
                    y={y + 4}
                    fill="var(--text-muted)"
                    fontSize="10"
                  >
                    0R
                  </text>
                )}

              </g>
            );
          }
        )}

        <path
          d={areaPath}
          fill="var(--danger)"
          fillOpacity="0.06"
          stroke="none"
        />

        <path
          d={path}
          fill="none"
          stroke="var(--danger)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map(
          (
            point,
            index
          ) => {
            const x =
              getX(index);

            const y =
              getY(
                point.drawdown
              );

            const active =
              hoveredIndex ===
              index;

            return (
              <g
                key={`${point.date}-${index}`}
                onMouseEnter={() =>
                  onHover(
                    index
                  )
                }
                className="cursor-pointer"
              >

                <circle
                  cx={x}
                  cy={y}
                  r={
                    active
                      ? 6
                      : 4
                  }
                  fill="var(--surface)"
                  stroke="var(--danger)"
                  strokeWidth={
                    active
                      ? 3
                      : 2
                  }
                />

                {active && (
                  <circle
                    cx={x}
                    cy={y}
                    r="10"
                    fill="none"
                    stroke="var(--danger)"
                    strokeOpacity="0.18"
                    strokeWidth="4"
                  />
                )}

              </g>
            );
          }
        )}

        {labelIndexes.map(
          (index) => {
            const point =
              points[index];

            return (
              <text
                key={`label-${point.date}-${index}`}
                x={getX(index)}
                y={height + 20}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
              >
                {point.label}
              </text>
            );
          }
        )}

      </svg>

      {hoveredIndex !== null &&
        points[hoveredIndex] && (
          <DrawdownTooltip
            point={
              points[
                hoveredIndex
              ]
            }
            index={
              hoveredIndex
            }
            total={
              points.length
            }
          />
        )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DRAWDOWN TOOLTIP                                                           */
/* -------------------------------------------------------------------------- */

function DrawdownTooltip({
  point,
  index,
  total,
}: {
  point: DrawdownPoint;
  index: number;
  total: number;
}) {
  const position =
    index >= total - 2
      ? "right-0"
      : index <= 1
        ? "left-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <div
      className={`pointer-events-none absolute top-3 z-20 w-[240px] rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]/95 p-4 shadow-2xl backdrop-blur ${position}`}
    >

      <div className="mb-3 border-b border-[var(--surface-3)] pb-3">

        <p className="text-[10px] uppercase tracking-[0.16em] text-red-400">
          DRAWDOWN
        </p>

        <p className="mt-1 text-sm font-medium text-white">
          {formatLongDate(
            point.date
          )}
        </p>

      </div>

      <div className="space-y-2">

        <TooltipRow
          label="Equity"
          value={formatR(
            point.equity
          )}
        />

        <TooltipRow
          label="Peak"
          value={formatR(
            point.peak
          )}
        />

        <TooltipRow
          label="Drawdown"
          value={`-${point.drawdown.toFixed(
            2
          )}R`}
          valueClass="text-red-400"
          strong
        />

      </div>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HEATMAP                                                                    */
/* -------------------------------------------------------------------------- */

function Heatmap({
  weeks,
  maxAbsR,
  hoveredDate,
  onHover,
  hoveredDay,
}: {
  weeks: HeatmapWeek[];
  maxAbsR: number;
  hoveredDate: string | null;
  onHover: (
    date: string | null
  ) => void;
  hoveredDay: HeatmapDay | null;
}) {
  return (
    <div className="relative">

      <div className="mb-3 grid grid-cols-7 gap-1.5 sm:gap-2">

        {[
          "Lun",
          "Mar",
          "Mié",
          "Jue",
          "Vie",
          "Sáb",
          "Dom",
        ].map((day) => (
          <div
            key={day}
            className="text-center text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]"
          >
            {day}
          </div>
        ))}

      </div>

      <div className="space-y-2">

        {weeks.map(
          (
            week,
            weekIndex
          ) => (
            <div
              key={weekIndex}
              className="grid grid-cols-7 gap-1.5 sm:gap-2"
            >

              {week.days.map(
                (
                  day,
                  dayIndex
                ) => {
                  if (!day) {
                    return (
                      <div
                        key={`empty-${weekIndex}-${dayIndex}`}
                        className="aspect-square rounded-md bg-transparent"
                      />
                    );
                  }

                  const active =
                    hoveredDate ===
                    day.date;

                  const intensity =
                    getHeatmapIntensity(
                      day.dayR,
                      maxAbsR
                    );

                  const tooltipPosition =
                    dayIndex <= 1
                      ? "left-0"
                      : dayIndex >= 5
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2";

                  return (
                    <div
                      key={day.date}
                      className="relative"
                      onMouseEnter={() =>
                        onHover(
                          day.date
                        )
                      }
                      onMouseLeave={() =>
                        onHover(null)
                      }
                    >

                      <div
                        className={[
                          "flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border transition-all",
                          intensity,
                          active
                            ? "scale-105 border-white/40 shadow-lg"
                            : "border-transparent",
                        ].join(" ")}
                      >

                        <span className="text-[10px] font-medium text-white/80">
                          {
                            new Date(
                              `${day.date}T00:00:00`
                            ).getDate()
                          }
                        </span>

                        {day.trades >
                          0 && (
                          <span className="mt-1 text-[9px] font-semibold text-white">
                            {day.dayR >=
                            0
                              ? "+"
                              : ""}
                            {day.dayR.toFixed(
                              1
                            )}
                          </span>
                        )}

                      </div>

                      {active &&
                        hoveredDay && (
                          <HeatmapTooltip
                            day={
                              hoveredDay
                            }
                            position={
                              tooltipPosition
                            }
                          />
                        )}

                    </div>
                  );
                }
              )}

            </div>
          )
        )}

      </div>

      <div className="mt-5 flex items-center justify-between">

        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Pérdida
        </span>

        <div className="flex items-center gap-1.5">

          <span className="h-3 w-3 rounded-[3px] bg-[var(--danger-soft)]" />
          <span className="h-3 w-3 rounded-[3px] bg-[var(--danger-border)]" />
          <span className="h-3 w-3 rounded-[3px] bg-[#20252a]" />
          <span className="h-3 w-3 rounded-[3px] bg-[#105b42]" />
          <span className="h-3 w-3 rounded-[3px] bg-[#147e58]" />
          <span className="h-3 w-3 rounded-[3px] bg-[var(--accent-strong)]" />

        </div>

        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Ganancia
        </span>

      </div>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HEATMAP TOOLTIP                                                            */
/* -------------------------------------------------------------------------- */

function HeatmapTooltip({
  day,
  position,
}: {
  day: HeatmapDay;
  position: string;
}) {
  return (
    <div
      className={[
        "pointer-events-none absolute top-1/2 z-30 w-[245px] -translate-y-1/2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]/95 p-4 shadow-2xl backdrop-blur",
        position,
      ].join(" ")}
    >

      <div className="mb-3 border-b border-[var(--surface-3)] pb-3">

        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          TRADING DAY
        </p>

        <p className="mt-1 text-sm font-medium text-white">
          {formatLongDate(
            day.date
          )}
        </p>

      </div>

      <div className="space-y-2">

        <TooltipRow
          label="R del día"
          value={formatR(
            day.dayR
          )}
          valueClass={
            day.dayR >= 0
              ? "text-[var(--accent)]"
              : "text-red-400"
          }
          strong
        />

        <TooltipRow
          label="Trades"
          value={String(
            day.trades
          )}
        />

        <TooltipRow
          label="Win Rate"
          value={`${day.winRate.toFixed(
            0
          )}%`}
        />

        <TooltipRow
          label="Adherencia"
          value={
            day.adherence ===
            null
              ? "—"
              : `${day.adherence.toFixed(
                  0
                )}%`
          }
          valueClass={
            day.adherence ===
            null
              ? "text-[var(--text-muted)]"
              : day.adherence >=
                  80
                ? "text-[var(--accent)]"
                : "text-red-400"
          }
        />

      </div>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TOOLTIP ROW                                                                */
/* -------------------------------------------------------------------------- */

function TooltipRow({
  label,
  value,
  strong,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">

      <span className="text-xs text-[var(--text-muted)]">
        {label}
      </span>

      <span
        className={`text-right text-xs ${
          strong
            ? "font-semibold"
            : "font-medium"
        } ${valueClass}`}
      >
        {value}
      </span>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CHART LABELS                                                               */
/* -------------------------------------------------------------------------- */

function getLabelIndexes(
  length: number
) {
  if (length <= 1) {
    return length === 1
      ? [0]
      : [];
  }

  if (length <= 5) {
    return Array.from(
      { length },
      (_, index) =>
        index
    );
  }

  const indexes = [
    0,
    Math.floor(
      (length - 1) / 4
    ),
    Math.floor(
      (length - 1) / 2
    ),
    Math.floor(
      ((length - 1) * 3) /
        4
    ),
    length - 1,
  ];

  return [
    ...new Set(indexes),
  ];
}