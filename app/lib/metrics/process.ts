import type {
  SopSession,
  TradingDay,
  TradingTrade,
} from "@/app/lib/domain/trading";

export type TradingDayForMetrics = TradingDay;
export type SopSessionForMetrics = SopSession;
export type TradeForProcessMetrics = Pick<
  TradingTrade,
  "trade_date"
>;

export function filterEvaluatedTradingDays(
  days: TradingDayForMetrics[],
  trades: TradeForProcessMetrics[] = [],
): TradingDayForMetrics[] {
  if (!trades.length) {
    return days;
  }

  const evaluatedDates = new Set(
    trades
      .map((trade) => trade.trade_date?.slice(0, 10))
      .filter((date): date is string => Boolean(date)),
  );

  return days.filter((day) =>
    evaluatedDates.has(day.date?.slice(0, 10) ?? ""),
  );
}

export type ProcessMetrics = {
  adherence: number;

  totalDays: number;

  adherentDays: number;

  sopCompletion: number;
};

/**
 * Determina si una Trading Day cumplió
 * todos los criterios definidos para adherencia.
 *
 * Esta es la única definición matemática
 * de process adherence dentro de Trading OS.
 */
export function isProcessAdherent(
  day: TradingDayForMetrics,
): boolean {
  return Boolean(
    day.waited_for_setup &&
      day.only_one_trade &&
      day.did_not_recover_losses &&
      day.session_finished,
  );
}

/**
 * Calcula el porcentaje de Trading Days
 * que cumplieron completamente el proceso.
 */
export function calculateProcessAdherence(
  days: TradingDayForMetrics[],
  trades: TradeForProcessMetrics[] = [],
): number {
  const evaluatedDays =
    filterEvaluatedTradingDays(
      days,
      trades,
    );

  if (!evaluatedDays.length) {
    return 0;
  }

  const adherent =
    evaluatedDays.filter(
      isProcessAdherent,
    ).length;

  return Math.round(
    (adherent / evaluatedDays.length) *
      100,
  );
}

/**
 * Calcula el porcentaje de pasos SOP
 * completados para una jornada.
 *
 * El formato esperado es:
 *
 * {
 *   "1": true,
 *   "2": true,
 *   ...
 *   "8": true
 * }
 */
export function calculateSopCompletion(
  completedSteps: unknown,
  totalSteps = 8,
): number {
  if (
    !completedSteps ||
    typeof completedSteps !==
      "object" ||
    Array.isArray(
      completedSteps,
    )
  ) {
    return 0;
  }

  if (totalSteps <= 0) {
    return 0;
  }

  const completed =
    Object.entries(
      completedSteps as Record<
        string,
        unknown
      >,
    ).filter(
      ([key, value]) =>
        Number.isInteger(
          Number(key),
        ) &&
        Number(key) >= 1 &&
        Number(key) <=
          totalSteps &&
        value === true,
    ).length;

  return Math.round(
    (completed / totalSteps) *
      100,
  );
}

/**
 * Obtiene los pasos completados de una SOP Session
 * independientemente de si el campo viene como
 * completedSteps o completed_steps.
 */
export function getSopCompletedSteps(
  session:
    | SopSessionForMetrics
    | null
    | undefined,
): unknown {
  if (!session) {
    return null;
  }

  return (
    session.completedSteps ??
    session.completed_steps ??
    null
  );
}

/**
 * Calcula el completion de una SOP Session.
 */
export function calculateSopSessionCompletion(
  session:
    | SopSessionForMetrics
    | null
    | undefined,
): number {
  if (!session) {
    return 0;
  }

  const totalSteps =
    session.totalSteps ??
    8;

  const completedSteps =
    getSopCompletedSteps(
      session,
    );

  if (completedSteps) {
    return calculateSopCompletion(
      completedSteps,
      totalSteps,
    );
  }

  if (
    typeof session.progress ===
      "number" &&
    Number.isFinite(
      session.progress,
    )
  ) {
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          session.progress,
        ),
      ),
    );
  }

  return 0;
}

/**
 * Calcula las métricas de proceso
 * de forma centralizada.
 *
 * Mantiene separadas:
 * - Process Adherence
 * - SOP Completion
 *
 * No mezcla ambas métricas.
 */
export function calculateProcessMetrics(
  days: TradingDayForMetrics[],
  sopSessions: SopSessionForMetrics[] = [],
  trades: TradeForProcessMetrics[] = [],
): ProcessMetrics {
  const evaluatedDays =
    filterEvaluatedTradingDays(
      days,
      trades,
    );

  const adherence =
    calculateProcessAdherence(
      evaluatedDays,
    );

  const sopCompletions =
    sopSessions.map(
      calculateSopSessionCompletion,
    );

  const sopCompletion =
    sopCompletions.length
      ? Math.round(
          sopCompletions.reduce(
            (
              sum,
              value,
            ) =>
              sum + value,
            0,
          ) /
            sopCompletions.length,
        )
      : 0;

  return {
    adherence,

    totalDays:
      evaluatedDays.length,

    adherentDays:
      evaluatedDays.filter(
        isProcessAdherent,
      ).length,

    sopCompletion,
  };
}