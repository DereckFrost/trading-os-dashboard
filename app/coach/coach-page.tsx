"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Period = "day" | "week" | "month" | "all";

type SetupAnalysis = {
  setupId: string | null;
  setupName: string;
  trades: number;
  winners: number;
  losers: number;
  winRate: number;
  expectancy: number;
  totalR: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number | null;
  aPlusRate: number;
  evidence: string;
  hasPositiveExpectancy: boolean;
  hasWinningTrade: boolean;
  eligibleForBestSetup: boolean;
};

type Performance = {
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

type ProcessMetrics = {
  adherence: number;
  executionScore: number;
  identityScore: number;
  adherentDays: number;
  currentAdherenceStreak: number;
  bestAdherenceStreak: number;
};

type Consistency = {
  currentWinningStreak: number;
  bestWinningStreak: number;
};

type Behavior = {
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

type Snapshot = {
  period: {
    type: "day" | "week" | "month" | "custom";
    start: string;
    end: string;
  };
  performance: Performance;
  process: ProcessMetrics;
  consistency: Consistency;
  setups: {
    bestSetup: SetupAnalysis | null;
    worstSetup: SetupAnalysis | null;
    all: SetupAnalysis[];
  };
  behavior: Behavior;
  comparison: Comparison | null;
};

type Comparison = {
  previousPeriod: {
    type: string;
    start: string;
    end: string;
  };
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

type AIPriority = {
  priority: number;
  action: string;
  reason: string;
};

type AIAnalysis = {
  verdict: string;
  executive_summary: string;
  strengths: string[];
  weaknesses: string[];
  behavioral_findings: string[];
  setup_findings: string[];
  week_over_week: string[];
  priorities: AIPriority[];
  what_not_to_change: string[];
  confidence: string;
};

type CoachResponse = {
  success: boolean;
  model?: string;
  source?: {
    trades: number;
    tradingDays: number;
    setups: number;
  };
  snapshot: Snapshot;
  aiAnalysis?: AIAnalysis | null;
  savedAnalysis?: {
    id: string;
    ai_model: string;
    created_at: string;
  } | null;
  error?: string;
};

type CoachHistoryEntry = {
  id: string;
  period_type: Period | "custom";
  period_start: string;
  period_end: string;
  ai_model: string;
  snapshot: Snapshot;
  ai_analysis: AIAnalysis | null;
  created_at: string;
  updated_at?: string;
};

type CoachHistoryResponse = {
  success?: boolean;
  history?: CoachHistoryEntry[];
  data?: CoachHistoryEntry[];
  rows?: CoachHistoryEntry[];
  error?: string;
};

const PERIODS: {
  value: Period;
  label: string;
}[] = [
  {
    value: "day",
    label: "Día",
  },
  {
    value: "week",
    label: "Semana",
  },
  {
    value: "month",
    label: "Mes",
  },
  {
    value: "all",
    label: "Histórico",
  },
];

function formatR(value: number) {
  if (!Number.isFinite(value)) {
    return "0.00R";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value)}%`;
}

function formatPF(value: number | null) {
  if (value === null) {
    return "—";
  }

  if (!Number.isFinite(value)) {
    return value > 0 ? "∞" : "0.00";
  }

  return value.toFixed(2);
}

function formatDate(value: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getPeriodLabel(period: Period | "custom") {
  switch (period) {
    case "day":
      return "Día";
    case "week":
      return "Semana";
    case "month":
      return "Mes";
    case "all":
    case "custom":
      return "Histórico";
    default:
      return "Semana";
  }
}

function getChangeTone(value: number) {
  if (value > 0) {
    return "text-[var(--accent)]";
  }

  if (value < 0) {
    return "text-red-400";
  }

  return "text-[var(--text-dim)]";
}

function buildCoachVerdict(snapshot: Snapshot) {
  const { performance, process, behavior } = snapshot;

  if (
    behavior.impulsiveTrades > 0 ||
    behavior.recoveryAttempts > 0 ||
    behavior.invalidTrades > 0
  ) {
    return "El principal riesgo está en la ejecución del proceso, no en la estrategia.";
  }

  if (process.identityScore < 60) {
    return "La prioridad es reconstruir adherencia y ejecución antes de optimizar setups.";
  }

  if (performance.totalR < 0 && process.identityScore >= 80) {
    return "El resultado fue negativo sin deterioro claro de identidad. No cambies el sistema por una muestra aislada.";
  }

  if (performance.expectancy > 0 && process.identityScore >= 80) {
    return "El proceso muestra una señal positiva. El objetivo ahora es repetirlo con consistencia.";
  }

  return "La prioridad es convertir una ejecución aceptable en consistencia repetible.";
}

function buildCoachPriority(snapshot: Snapshot) {
  const { behavior, process } = snapshot;

  if (behavior.impulsiveTrades > 0) {
    return {
      action: "Eliminar operaciones impulsivas.",
      reason: `${behavior.impulsiveTrades} operación(es) muestran señales de impulsividad en el período.`,
    };
  }

  if (behavior.recoveryAttempts > 0) {
    return {
      action: "Cortar el ciclo de recuperación después de una pérdida.",
      reason: `${behavior.recoveryAttempts} jornada(s) muestran intento de recuperación.`,
    };
  }

  if (behavior.invalidTrades > 0) {
    return {
      action: "No ejecutar setups inválidos.",
      reason: `${behavior.invalidTrades} operación(es) fueron clasificadas como inválidas.`,
    };
  }

  if (process.adherence < 80) {
    return {
      action: "Elevar la adherencia al proceso.",
      reason: `La adherencia actual es ${Math.round(process.adherence)}%.`,
    };
  }

  return {
    action: "Mantener el proceso y acumular muestra.",
    reason: "No hay una ruptura conductual dominante que justifique cambiar el plan.",
  };
}

function buildNoChangeRules(snapshot: Snapshot) {
  const rules: string[] = [];

  if (!snapshot.setups.bestSetup) {
    rules.push("No cambiar setups: no existe evidencia suficiente de edge positivo.");
  }

  if (
    snapshot.performance.trades < 10 ||
    snapshot.performance.tradingDays < 5
  ) {
    rules.push("No sacar conclusiones estructurales con una muestra pequeña.");
  }

  if (!rules.length) {
    rules.push("No modificar la estrategia por una variación aislada del resultado.");
  }

  return rules;
}

export default function CoachPage() {
  const [period, setPeriod] = useState<Period>("week");

  const [data, setData] = useState<CoachResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [aiLoading, setAiLoading] = useState(false);

  const [error, setError] = useState("");

  const [coachHistory, setCoachHistory] = useState<
    CoachHistoryEntry[]
  >([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [historyError, setHistoryError] = useState("");

  const [selectedHistoryId, setSelectedHistoryId] =
    useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError("");

      const response = await fetch("/api/coach/history", {
        cache: "no-store",
      });

      const payload = (await response.json()) as
        | CoachHistoryResponse
        | CoachHistoryEntry[];

      if (!response.ok) {
        const message =
          !Array.isArray(payload) && payload.error
            ? payload.error
            : "No se pudo cargar el historial del Coach.";

        throw new Error(message);
      }

      const rows = Array.isArray(payload)
        ? payload
        : payload.history ??
          payload.data ??
          payload.rows ??
          [];

      setCoachHistory(rows);

      setSelectedHistoryId((current) => {
        if (
          current &&
          rows.some((row) => row.id === current)
        ) {
          return current;
        }

        return rows[0]?.id ?? null;
      });
    } catch (err) {
      setHistoryError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el historial del Coach.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadCoach = useCallback(
    async (includeAI: boolean) => {
      try {
        if (includeAI) {
          setAiLoading(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await fetch(
          `/api/coach?period=${period}&ai=${
            includeAI ? "true" : "false"
          }`,
          {
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as
          | CoachResponse
          | {
              error?: string;
            };

        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "No se pudo cargar Coach.",
          );
        }

        setData(payload as CoachResponse);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar Coach.",
        );
      } finally {
        setLoading(false);
        setAiLoading(false);
      }
    },
    [period],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadHistory]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCoach(false);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadCoach]);

  const snapshot = data?.snapshot ?? null;

  const performance = snapshot?.performance;

  const process = snapshot?.process;

  const behavior = snapshot?.behavior;

  const comparison = snapshot?.comparison;

  const ai = data?.aiAnalysis ?? null;

  const selectedHistory =
    coachHistory.find(
      (entry) => entry.id === selectedHistoryId,
    ) ?? null;

  const sortedSetups = useMemo(() => {
    return [...(snapshot?.setups.all ?? [])].sort((a, b) => {
      if (
        a.eligibleForBestSetup !==
        b.eligibleForBestSetup
      ) {
        return a.eligibleForBestSetup ? -1 : 1;
      }

      return b.totalR - a.totalR;
    });
  }, [snapshot?.setups.all]);

  /*
   * Historial cronológico.
   *
   * El endpoint puede devolver registros en cualquier orden.
   * Para la evolución necesitamos siempre:
   *
   * más antiguo → más reciente
   */
  const chronologicalHistory = useMemo(() => {
    return [...coachHistory].sort((a, b) => {
      const dateA = new Date(
        `${a.period_start}T00:00:00`,
      ).getTime();

      const dateB = new Date(
        `${b.period_start}T00:00:00`,
      ).getTime();

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      const endA = new Date(
        `${a.period_end}T00:00:00`,
      ).getTime();

      const endB = new Date(
        `${b.period_end}T00:00:00`,
      ).getTime();

      return endA - endB;
    });
  }, [coachHistory]);

  /*
   * Para la lectura longitudinal usamos únicamente registros
   * guardados. No inventamos datos entre períodos.
   */

  const deterministicPriority = snapshot
    ? buildCoachPriority(snapshot)
    : null;

  const deterministicNoChange = snapshot
    ? buildNoChangeRules(snapshot)
    : [];

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-[var(--surface)] px-6 py-8 text-white md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-sm text-[var(--text-dim)]">
            Cargando Coach...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] px-6 py-8 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
              COACH
            </p>
            {snapshot && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {getPeriodLabel(period)} · {formatDate(snapshot.period.start)} —{" "}
                {formatDate(snapshot.period.end)} · {performance?.trades ?? 0} trades ·{" "}
                {performance?.tradingDays ?? 0} días
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
              {PERIODS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPeriod(item.value)}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                    period === item.value
                      ? "bg-[#242a2d] text-white"
                      : "text-[var(--text-muted)] hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={aiLoading}
              onClick={() => void loadCoach(true)}
              className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[#174434] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aiLoading ? "Analizando..." : "Analizar con IA"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {snapshot && performance && process && behavior && (
          <>
            {/* LONGITUDINAL CONTEXT */}
            {period !== "all" && chronologicalHistory.length >= 2 && (
              <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                <div className="flex items-center justify-between border-b border-[var(--surface-3)] px-5 py-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                    CONTEXTO LONGITUDINAL
                  </p>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    {chronologicalHistory.length} registros
                  </span>
                </div>

                <div className="grid gap-0 md:grid-cols-3">
                  {chronologicalHistory.slice(-3).reverse().map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setPeriod("all");
                        setSelectedHistoryId(entry.id);
                      }}
                      className="border-b border-[var(--surface-3)] p-5 text-left transition last:border-b-0 hover:bg-[#151a18] md:border-b-0 md:border-r md:last:border-r-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            {getPeriodLabel(entry.period_type)}
                          </p>
                          <p className="mt-2 text-xs font-semibold text-white">
                            {formatDate(entry.period_start)} — {formatDate(entry.period_end)}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            entry.snapshot.performance.totalR >= 0
                              ? "text-[var(--accent)]"
                              : "text-red-400"
                          }`}
                        >
                          {formatR(entry.snapshot.performance.totalR)}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <HistoryMiniStat
                          label="ADHERENCIA"
                          value={`${Math.round(entry.snapshot.process.adherence)}%`}
                        />
                        <HistoryMiniStat
                          label="EXECUTION"
                          value={`${Math.round(entry.snapshot.process.executionScore)}`}
                        />
                        <HistoryMiniStat
                          label="IDENTITY"
                          value={`${Math.round(entry.snapshot.process.identityScore)}`}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* COACH VERDICT */}
            <section className="mb-5 rounded-xl border border-[var(--accent-border)] bg-[#111a17]">
              <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                      {ai ? "AI COACH" : "COACH VERDICT"}
                    </p>
                    {ai && (
                      <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                        {ai.confidence === "high"
                          ? "Confianza alta"
                          : ai.confidence === "medium"
                            ? "Confianza media"
                            : "Confianza baja"}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-3 text-base font-semibold leading-6 text-white">
                    {ai?.verdict ?? buildCoachVerdict(snapshot)}
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-[var(--text-dim)]">
                    {ai?.executive_summary ??
                      "Diagnóstico determinista basado exclusivamente en las métricas estructuradas del período."}
                  </p>
                </div>

                <div className="min-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    PRIORIDAD #1
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {ai?.priorities[0]?.action ?? deterministicPriority?.action}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                    {ai?.priorities[0]?.reason ?? deterministicPriority?.reason}
                  </p>
                </div>
              </div>

              {!ai && (
                <div className="border-t border-[var(--surface-3)] px-5 py-4">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    NO CAMBIAR
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    {deterministicNoChange.map((item) => (
                      <p key={item} className="text-xs text-[var(--text-dim)]">
                        • {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* KPI STRIP */}
            <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <MetricCard
                label="R"
                value={formatR(performance.totalR)}
                positive={performance.totalR >= 0}
              />
              <MetricCard
                label="WIN RATE"
                value={formatPct(performance.winRate)}
                positive={performance.winRate >= 50}
              />
              <MetricCard
                label="EXPECTANCY"
                value={formatR(performance.expectancy)}
                positive={performance.expectancy >= 0}
              />
              <MetricCard label="DRAWDOWN" value={formatR(performance.maxDrawdownR)} />
              <MetricCard
                label="ADHERENCIA"
                value={formatPct(process.adherence)}
                positive={process.adherence >= 80}
              />
              <MetricCard
                label="IDENTITY"
                value={`${Math.round(process.identityScore)}/100`}
                positive={process.identityScore >= 80}
              />
            </section>

            {/* PERIOD CHANGE */}
            {comparison && (
              <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                      VS. PERÍODO ANTERIOR
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Solo cambios; los valores actuales ya están arriba.
                    </p>
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    {formatDate(comparison.previousPeriod.start)} —{" "}
                    {formatDate(comparison.previousPeriod.end)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <ComparisonBox label="R" value={comparison.changes.totalR} />
                  <ComparisonBox label="EXPECTANCY" value={comparison.changes.expectancy} />
                  <ComparisonBox label="WIN RATE" value={comparison.changes.winRate} suffix="%" />
                  <ComparisonBox label="ADHERENCIA" value={comparison.changes.adherence} suffix="%" />
                  <ComparisonBox label="EXECUTION" value={comparison.changes.executionScore} suffix="" />
                  <ComparisonBox label="IDENTITY" value={comparison.changes.identityScore} suffix="" />
                </div>
              </section>
            )}

            {/* IDENTITY + BEHAVIOR */}
            <section className="mb-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                      IDENTITY SCORE
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Proceso + ejecución. Nunca depende del dinero.
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-3xl font-semibold text-white">
                      {Math.round(process.identityScore)}
                    </p>
                    <p className="text-[8px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      / 100
                    </p>
                    {comparison && (
                      <p className={`mt-1 text-[10px] font-semibold ${getChangeTone(comparison.changes.identityScore)}`}>
                        {comparison.changes.identityScore > 0 ? "+" : ""}
                        {comparison.changes.identityScore.toFixed(0)} vs anterior
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  <ProgressRow label="Adherencia" value={process.adherence} />
                  <ProgressRow label="Ejecución" value={process.executionScore} />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <StatBox
                    label="DÍAS ADHERENTES"
                    value={`${process.adherentDays}/${performance.tradingDays}`}
                  />
                  <StatBox label="RACHA ACTUAL" value={`${process.currentAdherenceStreak} días`} />
                  <StatBox label="MEJOR RACHA" value={`${process.bestAdherenceStreak} días`} />
                  <StatBox label="MEJOR WIN STREAK" value={`${snapshot.consistency.bestWinningStreak}`} />
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                      COMPORTAMIENTO
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Rupturas de proceso separadas de señales emocionales.
                    </p>
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    {behavior.daysWithProcessBreak} días con ruptura
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <StatBox label="SOBREOPERACIÓN" value={String(behavior.overtradingDays)} />
                  <StatBox label="RECUPERACIÓN" value={String(behavior.recoveryAttempts)} />
                  <StatBox label="INVÁLIDOS" value={String(behavior.invalidTrades)} />
                  <StatBox label="OPERACIONES EXTRA" value={String(behavior.overtradingTrades)} />
                </div>

                <div className="mt-5 border-t border-[var(--surface-3)] pt-5">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    SEÑALES EMOCIONALES
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <StatBox label="FOMO" value={String(behavior.fomoTrades)} />
                    <StatBox label="IMPULSIVIDAD" value={String(behavior.impulsiveTrades)} />
                    <StatBox label="EMOCIONALES" value={String(behavior.emotionalTrades)} />
                  </div>
                </div>

                {behavior.observations.length > 0 && (
                  <div className="mt-5 border-t border-[var(--surface-3)] pt-5">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      OBSERVACIONES
                    </p>
                    <div className="mt-3 space-y-2">
                      {behavior.observations.slice(0, 4).map((observation, index) => (
                        <div
                          key={`${observation}-${index}`}
                          className="flex gap-3 text-xs leading-5 text-[var(--text-dim)]"
                        >
                          <span className="text-[var(--warning)]">•</span>
                          <span>{observation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* AI DETAILS */}
            {ai && (
              <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                <div className="border-b border-[var(--surface-3)] px-5 py-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                    ANÁLISIS IA
                  </p>
                </div>

                <div className="grid lg:grid-cols-3">
                  <AIInsightBlock title="FORTALEZAS" items={ai.strengths} positive />
                  <AIInsightBlock title="ATENCIÓN" items={ai.weaknesses} warning />
                  <AIInsightBlock
                    title="PRIORIDAD"
                    items={[
                      ai.priorities[0]?.action ?? "Sin prioridad definida.",
                      ...(ai.priorities[0]?.reason ? [ai.priorities[0].reason] : []),
                    ]}
                  />
                </div>

                <div className="grid gap-6 border-t border-[var(--surface-3)] p-5 lg:grid-cols-2">
                  <AIList title="HALLAZGOS CONDUCTUALES" items={ai.behavioral_findings} />
                  <AIList title="COMPARACIÓN" items={ai.week_over_week} />
                </div>

                <div className="border-t border-[var(--surface-3)] p-5">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    PLAN DE ACCIÓN
                  </p>
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {ai.priorities.map((priority) => (
                      <div
                        key={priority.priority}
                        className="rounded-lg border border-[var(--accent-border)] bg-[#101714] p-4"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">
                            {priority.priority}
                          </span>
                          <p className="text-xs font-semibold text-white">
                            Prioridad {priority.priority}
                          </p>
                        </div>
                        <p className="mt-3 text-sm font-medium leading-6 text-[#d2d8d4]">
                          {priority.action}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-[#737d77]">
                          {priority.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[var(--surface-3)] p-5">
                  <AIList title="NO CAMBIAR" items={ai.what_not_to_change} />
                </div>
              </section>
            )}

            {/* SETUP DIAGNOSTICS */}
            <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
              <div className="border-b border-[var(--surface-3)] px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                      SETUP DIAGNOSTICS
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      La muestra determina cuánto peso darle a cada señal.
                    </p>
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    {sortedSetups.length} con muestra
                  </span>
                </div>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-2">
                <SetupHighlight
                  label="MEJOR EXPECTANCY POSITIVA"
                  setup={snapshot.setups.bestSetup}
                  positive
                />
                <SetupHighlight
                  label="MENOR EXPECTANCY"
                  setup={snapshot.setups.worstSetup}
                />
              </div>

              <div className="overflow-x-auto border-t border-[var(--surface-3)]">
                <table className="w-full min-w-[1050px] text-left">
                  <thead className="border-b border-[var(--surface-3)]">
                    <tr>
                      {[
                        "SETUP",
                        "TRADES",
                        "WR",
                        "AVG WIN",
                        "AVG LOSS",
                        "EXPECTANCY",
                        "PF",
                        "R",
                        "A+",
                        "EVIDENCIA",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-5 py-3 text-[8px] font-semibold tracking-[0.16em] text-[var(--text-muted)]"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSetups.map((setup) => (
                      <tr
                        key={setup.setupId ?? setup.setupName}
                        className="border-b border-[var(--surface-3)] last:border-b-0"
                      >
                        <td className="px-5 py-3 text-sm font-medium text-white">
                          {setup.setupName}
                        </td>
                        <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">{setup.trades}</td>
                        <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">{formatPct(setup.winRate)}</td>
                        <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">{formatR(setup.averageWin)}</td>
                        <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">{formatR(setup.averageLoss)}</td>
                        <td
                          className={`px-5 py-3 text-xs font-semibold ${
                            setup.expectancy > 0
                              ? "text-[var(--accent)]"
                              : setup.expectancy < 0
                                ? "text-red-400"
                                : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {formatR(setup.expectancy)}
                        </td>
                        <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                          {formatPF(setup.profitFactor)}
                        </td>
                        <td
                          className={`px-5 py-3 text-xs font-semibold ${
                            setup.totalR >= 0
                              ? "text-[var(--accent)]"
                              : "text-red-400"
                          }`}
                        >
                          {formatR(setup.totalR)}
                        </td>
                        <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                          {formatPct(setup.aPlusRate)}
                        </td>
                        <td className="px-5 py-3">
                          <EvidenceBadge evidence={setup.evidence} />
                        </td>
                      </tr>
                    ))}

                    {!sortedSetups.length && (
                      <tr>
                        <td colSpan={10} className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
                          No hay trades registrados para analizar setups.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {ai && ai.setup_findings.length > 0 && (
              <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                  LECTURA DE SETUPS POR IA
                </p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {ai.setup_findings.map((finding, index) => (
                    <div
                      key={`${finding}-${index}`}
                      className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4"
                    >
                      <span className="mt-1 text-[var(--accent)]">•</span>
                      <p className="text-sm leading-6 text-[var(--text-secondary)]">{finding}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* HISTORICAL COACH */}
            {period === "all" && (
              <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                <div className="border-b border-[var(--surface-3)] px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                        COACH HISTORY
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Evolución guardada por período.
                      </p>
                    </div>
                    <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
                      {coachHistory.length} registros
                    </span>
                  </div>
                </div>

                {historyLoading ? (
                  <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                    Cargando historial...
                  </div>
                ) : historyError ? (
                  <div className="p-6 text-sm text-red-300">{historyError}</div>
                ) : coachHistory.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                    Todavía no hay análisis guardados.
                  </div>
                ) : (
                  <div className="grid gap-0 lg:grid-cols-[1fr_1.4fr]">
                    <div className="max-h-[480px] overflow-y-auto border-b border-[var(--surface-3)] lg:border-b-0 lg:border-r">
                      {coachHistory.map((entry) => {
                        const active = entry.id === selectedHistoryId;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSelectedHistoryId(entry.id)}
                            className={`w-full border-b border-[var(--surface-3)] p-4 text-left transition last:border-b-0 ${
                              active
                                ? "bg-[var(--accent-soft)]/50"
                                : "hover:bg-[#1b1e21]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                  {getPeriodLabel(entry.period_type)}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-white">
                                  {formatDate(entry.period_start)} — {formatDate(entry.period_end)}
                                </p>
                              </div>
                              <span
                                className={`text-xs font-semibold ${
                                  entry.snapshot.performance.totalR >= 0
                                    ? "text-[var(--accent)]"
                                    : "text-red-400"
                                }`}
                              >
                                {formatR(entry.snapshot.performance.totalR)}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-3">
                              <HistoryMiniStat
                                label="IDENTITY"
                                value={`${Math.round(entry.snapshot.process.identityScore)}`}
                              />
                              <HistoryMiniStat
                                label="EXECUTION"
                                value={`${Math.round(entry.snapshot.process.executionScore)}`}
                              />
                              <HistoryMiniStat
                                label="ADHERENCIA"
                                value={`${Math.round(entry.snapshot.process.adherence)}%`}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="p-5">
                      {selectedHistory ? (
                        <>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                {getPeriodLabel(selectedHistory.period_type)}
                              </p>
                              <h3 className="mt-2 text-base font-semibold text-white">
                                {formatDate(selectedHistory.period_start)} —{" "}
                                {formatDate(selectedHistory.period_end)}
                              </h3>
                            </div>
                            <span className="text-sm font-semibold text-[var(--accent)]">
                              {formatR(selectedHistory.snapshot.performance.totalR)}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <HistoryMetric
                              label="R"
                              value={formatR(selectedHistory.snapshot.performance.totalR)}
                              positive={selectedHistory.snapshot.performance.totalR >= 0}
                            />
                            <HistoryMetric
                              label="EXPECTANCY"
                              value={formatR(selectedHistory.snapshot.performance.expectancy)}
                              positive={selectedHistory.snapshot.performance.expectancy >= 0}
                            />
                            <HistoryMetric
                              label="EXECUTION"
                              value={`${Math.round(selectedHistory.snapshot.process.executionScore)}`}
                            />
                            <HistoryMetric
                              label="IDENTITY"
                              value={`${Math.round(selectedHistory.snapshot.process.identityScore)}`}
                            />
                          </div>

                          {selectedHistory.ai_analysis ? (
                            <div className="mt-4 rounded-lg border border-[var(--accent-border)] bg-[#101714] p-4">
                              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                                VEREDICTO
                              </p>
                              <h4 className="mt-2 text-sm font-semibold text-white">
                                {selectedHistory.ai_analysis.verdict}
                              </h4>
                              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                                {selectedHistory.ai_analysis.executive_summary}
                              </p>
                            </div>
                          ) : (
                            <div className="mt-4 rounded-lg border border-dashed border-[var(--border-strong)] p-4 text-xs text-[var(--text-muted)]">
                              Registro sin análisis IA.
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="py-10 text-center text-sm text-[var(--text-muted)]">
                          Selecciona un análisis.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ========================================================================== */
/* HISTORY / LONGITUDINAL COMPONENTS                                         */
/* ========================================================================== */

function HistoryMiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>

      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
        {value}
      </p>
    </div>
  );
}

function HistoryMetric({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
        {label}
      </p>

      <p
        className={`mt-2 text-sm font-semibold ${
          positive
            ? "text-[var(--accent)]"
            : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>

      <p
        className={`mt-3 text-xl font-semibold ${
          positive
            ? "text-[var(--accent)]"
            : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ComparisonBox({
  label,
  value,
  suffix = "R",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  const formatted =
    suffix === "R"
      ? formatR(value)
      : `${value >= 0 ? "+" : ""}${value.toFixed(
          2,
        )}${suffix}`;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
        {label}
      </p>

      <p
        className={`mt-2 text-sm font-semibold ${getChangeTone(
          value,
        )}`}
      >
        {formatted}
      </p>
    </div>
  );
}

function AIInsightBlock({
  title,
  items,
  positive = false,
  warning = false,
}: {
  title: string;
  items: string[];
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="border-t border-[var(--surface-3)] p-6 first:border-t-0 lg:border-r lg:border-t-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {title}
      </p>

      <div className="mt-5 space-y-5">
        {items.length ? (
          items.map((item, index) => (
            <div
              key={`${title}-${index}`}
              className="flex gap-3"
            >
              <ToneIcon
                tone={
                  positive
                    ? "positive"
                    : warning
                      ? "warning"
                      : "neutral"
                }
              />

              <p className="text-sm leading-6 text-[var(--text-dim)]">
                {item}
              </p>
            </div>
          ))
        ) : (
          <p className="text-xs leading-5 text-[var(--text-muted)]">
            No hay hallazgos.
          </p>
        )}
      </div>
    </div>
  );
}

function ToneIcon({
  tone,
}: {
  tone: "positive" | "warning" | "neutral";
}) {
  if (tone === "positive") {
    return (
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
        ✓
      </div>
    );
  }

  if (tone === "warning") {
    return (
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#674d25] bg-[#2c2415] text-[var(--warning)]">
        !
      </div>
    );
  }

  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[#1d2024] text-[var(--text-dim)]">
      —
    </div>
  );
}

function ProgressRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const safe = Math.max(
    0,
    Math.min(100, value),
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-[var(--text-dim)]">
          {label}
        </span>

        <span className="text-xs font-semibold text-white">
          {Math.round(safe)}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
          style={{
            width: `${safe}%`,
          }}
        />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
        {label}
      </p>

      <p className="mt-2 text-base font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

function EvidenceBadge({
  evidence,
}: {
  evidence: SetupAnalysis["evidence"];
}) {
  const config = {
    insuficiente: {
      label: "Insuficiente",
      className: "border-red-500/20 bg-red-500/10 text-red-300",
    },
    inicial: {
      label: "Inicial",
      className: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
    },
    en_desarrollo: {
      label: "En desarrollo",
      className: "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
    },
    establecida: {
      label: "Establecida",
      className: "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
    },
  }[evidence] ?? {
    label: "Insuficiente",
    className: "border-red-500/20 bg-red-500/10 text-red-300",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function SetupHighlight({
  label,
  setup,
  positive = false,
}: {
  label: string;
  setup: SetupAnalysis | null;
  positive?: boolean;
}) {
  if (!setup) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-strong)] p-5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {label}
        </p>

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          {positive
            ? "Sin setup con evidencia suficiente."
            : "No hay muestra suficiente."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {label}
          </p>

          <h3 className="mt-3 text-sm font-semibold text-white">
            {setup.setupName}
          </h3>
        </div>

        <span
          className={`text-sm font-semibold ${
            setup.expectancy > 0
              ? "text-[var(--accent)]"
              : setup.expectancy < 0
                ? "text-red-400"
                : "text-[var(--text-secondary)]"
          }`}
        >
          {formatR(setup.expectancy)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-4">
        <MetricSmall
          label="TRADES"
          value={String(setup.trades)}
        />

        <MetricSmall
          label="WR"
          value={formatPct(setup.winRate)}
        />

        <MetricSmall
          label="PF"
          value={formatPF(setup.profitFactor)}
        />

        <MetricSmall
          label="R"
          value={formatR(setup.totalR)}
        />
      </div>

      <p className="mt-4 text-[10px] text-[var(--text-muted)]">
        {setup.evidence === "insuficiente"
          ? "Muestra insuficiente para tomar decisiones."
          : positive
            ? "Ventaja positiva con evidencia estadística disponible."
            : "Señal de revisión; no implica eliminación automática."}
      </p>
    </div>
  );
}

function MetricSmall({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
        {label}
      </p>

      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
        {value}
      </p>
    </div>
  );
}

function AIList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {title}
      </p>

      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item, index) => (
            <div
              key={`${title}-${index}`}
              className="flex gap-3 text-sm leading-6 text-[#b6bdb9]"
            >
              <span className="text-[var(--accent)]">
                •
              </span>

              <span>{item}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Sin hallazgos.
          </p>
        )}
      </div>
    </div>
  );
}