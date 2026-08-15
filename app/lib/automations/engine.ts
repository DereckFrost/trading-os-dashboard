import { supabaseServerFetch } from "@/app/lib/supabase/server";

import {
  buildCoachSnapshot,
  getWeeklyPeriod,
  runCoachEngine,
  type CoachSetup,
  type CoachTrade,
  type CoachTradingDay,
} from "@/app/lib/coach-engine";

import type {
  AutomationAlert,
  AutomationPeriod,
  AutomationReport,
  AutomationResult,
  AutomationRun,
  AutomationType,
} from "./types";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ?? "";

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ??
  "gpt-5.1";

const AUTOMATION_TIMEZONE =
  process.env.AUTOMATION_TIMEZONE ??
  "America/Santo_Domingo";

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

type RawTrade = {
  id: string;
  trade_date: string;
  created_at: string | null;
  instrument: string | null;
  direction: string | null;
  setup_id: string | null;
  setup_quality: string | null;
  execution_quality: string | null;
  emotion: string | null;
  close_type: string | null;
  r: number | string | null;
  trading_day_id: string | null;
};

type RawTradingDay = {
  id: string;
  date: string;
  mental_state: string | null;
  waited_for_setup: boolean | null;
  only_one_trade: boolean | null;
  did_not_recover_losses: boolean | null;
  session_finished: boolean | null;
  notes: string | null;
};

type RawSetup = {
  id: string;
  name: string;
  category: string | null;
  active: boolean | null;
};

type CoachHistoryRow = {
  period_type: string;
  period_start: string;
  period_end: string;
  snapshot: Record<string, unknown>;
  ai_analysis: unknown;
  created_at: string;
};

async function supabaseFetch<T>(table: string, query: string): Promise<T> { return supabaseServerFetch<T>(table, { query }); }
async function supabaseWrite<T>(table: string, method: "POST" | "PATCH", body: unknown, query = ""): Promise<T> { return supabaseServerFetch<T>(table, { method, body, query, prefer: "return=representation" }); }

function dateOnlyInTimezone(
  date = new Date(),
): string {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        AUTOMATION_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).format(date);
}

function utcDate(
  dateOnly: string,
): Date {
  return new Date(
    `${dateOnly}T00:00:00.000Z`,
  );
}

function formatDate(
  date: Date,
): string {
  return date
    .toISOString()
    .slice(0, 10);
}

function addDays(
  value: string,
  amount: number,
): string {
  const date = utcDate(value);
  date.setUTCDate(
    date.getUTCDate() + amount,
  );
  return formatDate(date);
}

function previousCompletedWeek(
  today: string,
): AutomationPeriod {
  const current =
    getWeeklyPeriod(today);

  return {
    type: "week",
    start: addDays(
      current.start,
      -7,
    ),
    end: addDays(
      current.end,
      -7,
    ),
  };
}

function previousCompletedMonth(
  today: string,
): AutomationPeriod {
  const current =
    utcDate(today);

  const currentMonthStart =
    new Date(
      Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        1,
      ),
    );

  const previousMonthEnd =
    new Date(
      currentMonthStart,
    );

  previousMonthEnd.setUTCDate(
    previousMonthEnd.getUTCDate() -
      1,
  );

  const previousMonthStart =
    new Date(
      Date.UTC(
        previousMonthEnd.getUTCFullYear(),
        previousMonthEnd.getUTCMonth(),
        1,
      ),
    );

  return {
    type: "month",
    start:
      formatDate(
        previousMonthStart,
      ),
    end:
      formatDate(
        previousMonthEnd,
      ),
  };
}

function currentWeek(
  today: string,
): AutomationPeriod {
  const period =
    getWeeklyPeriod(today);

  return {
    type: "week",
    start: period.start,
    end: period.end,
  };
}

function mapTrade(
  trade: RawTrade,
): CoachTrade {
  return {
    id: trade.id,
    trade_date: trade.trade_date,
    created_at:
      trade.created_at,
    instrument:
      trade.instrument ?? "",
    direction:
      trade.direction,
    setup_id:
      trade.setup_id,
    setup_quality:
      trade.setup_quality,
    execution_quality:
      trade.execution_quality,
    emotion:
      trade.emotion,
    close_type:
      trade.close_type,
    r: Number(
      trade.r ?? 0,
    ),
    trading_day_id:
      trade.trading_day_id,
  };
}

function mapTradingDay(
  day: RawTradingDay,
): CoachTradingDay {
  return {
    id: day.id,
    date: day.date,
    mental_state:
      day.mental_state,
    waited_for_setup:
      Boolean(
        day.waited_for_setup,
      ),
    only_one_trade:
      Boolean(
        day.only_one_trade,
      ),
    did_not_recover_losses:
      Boolean(
        day.did_not_recover_losses,
      ),
    session_finished:
      Boolean(
        day.session_finished,
      ),
    notes: day.notes,
  };
}

function mapSetup(
  setup: RawSetup,
): CoachSetup {
  return {
    id: setup.id,
    name: setup.name,
    category:
      setup.category,
    active:
      Boolean(setup.active),
  };
}

async function loadRawData() {
  const [
    trades,
    tradingDays,
    setups,
  ] = await Promise.all([
    supabaseFetch<RawTrade[]>(
      "trades",
      "?select=id,trade_date,created_at,instrument,direction,setup_id,setup_quality,execution_quality,emotion,close_type,r,trading_day_id&order=trade_date.asc,created_at.asc",
    ),
    supabaseFetch<RawTradingDay[]>(
      "trading_days",
      "?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes&order=date.asc",
    ),
    supabaseFetch<RawSetup[]>(
      "setups",
      "?select=id,name,category,active&order=name.asc",
    ),
  ]);

  return {
    trades:
      trades.map(mapTrade),
    tradingDays:
      tradingDays.map(
        mapTradingDay,
      ),
    setups:
      setups.map(mapSetup),
  };
}

async function loadCoachHistory(
  periodType: "week" | "month",
  currentStart: string,
) {
  const query =
    `?select=period_type,period_start,period_end,snapshot,ai_analysis,created_at` +
    `&period_type=eq.${periodType}` +
    `&period_end=lt.${encodeURIComponent(currentStart)}` +
    `&order=period_end.desc,created_at.desc` +
    `&limit=8`;

  return supabaseFetch<
    CoachHistoryRow[]
  >(
    "coach_analysis_history",
    query,
  );
}

function parseAIReport(
  raw: unknown,
): AutomationReport | null {
  if (
    typeof raw !==
      "object" ||
    raw === null
  ) {
    return null;
  }

  const value =
    raw as Record<
      string,
      unknown
    >;

  const strings = (
    input: unknown,
  ): string[] =>
    Array.isArray(input)
      ? input.filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
      : [];

  return {
    title:
      typeof value.title ===
      "string"
        ? value.title
        : "Trading OS Review",

    verdict:
      typeof value.verdict ===
      "string"
        ? value.verdict
        : "Sin veredicto disponible.",

    executiveSummary:
      typeof value.executive_summary ===
      "string"
        ? value.executive_summary
        : "Sin resumen disponible.",

    strengths:
      strings(
        value.strengths,
      ),

    risks:
      strings(
        value.risks,
      ),

    priorities:
      strings(
        value.priorities,
      ),

    whatNotToChange:
      strings(
        value.what_not_to_change,
      ),

    longitudinal:
      strings(
        value.longitudinal,
      ),

    confidence:
      typeof value.confidence ===
      "string"
        ? value.confidence
        : "media",
  };
}

function buildFallbackReport(
  snapshot: Record<string, unknown>,
): AutomationReport {
  const performance =
    asRecord(
      snapshot.performance,
    );

  const process =
    asRecord(
      snapshot.process,
    );

  const behavior =
    asRecord(
      snapshot.behavior,
    );

  const trades =
    asNumber(
      performance.trades,
    );

  const totalR =
    asNumber(
      performance.totalR,
    );

  const adherence =
    asNumber(
      process.adherence,
    );

  const overtradingDays =
    asNumber(
      behavior.overtradingDays,
    );

  const fomoTrades =
    asNumber(
      behavior.fomoTrades,
    );

  const recoveryAttempts =
    asNumber(
      behavior.recoveryAttempts,
    );

  const invalidTrades =
    asNumber(
      behavior.invalidTrades,
    );

  const priorities: string[] =
    [];

  const risks: string[] =
    [];

  if (
    overtradingDays >
    0
  ) {
    risks.push(
      `${overtradingDays} jornada(s) con sobreoperación.`,
    );

    priorities.push(
      "Mantener el límite de un trade por jornada.",
    );
  }

  if (
    fomoTrades > 0
  ) {
    risks.push(
      `${fomoTrades} trade(s) asociados a FOMO.`,
    );

    priorities.push(
      "No ejecutar entradas fuera del setup validado.",
    );
  }

  if (
    recoveryAttempts >
    0
  ) {
    risks.push(
      `${recoveryAttempts} intento(s) de recuperación después de pérdidas.`,
    );

    priorities.push(
      "No buscar recuperar una pérdida dentro de la misma jornada.",
    );
  }

  if (
    invalidTrades > 0
  ) {
    risks.push(
      `${invalidTrades} trade(s) inválidos.`,
    );

    priorities.push(
      "Reforzar el gate antes de cada entrada.",
    );
  }

  if (
    adherence >= 90
  ) {
    priorities.push(
      "Preservar la adherencia actual sin aumentar riesgo.",
    );
  }

  const verdict =
    risks.length === 0
      ? "Proceso estable."
      : "Proceso con desviaciones que requieren seguimiento.";

  return {
    title:
      "Trading OS Automated Review",

    verdict,

    executiveSummary:
      `${trades ?? 0} trades, ${totalR ?? 0}R y ${adherence ?? 0}% de adherencia en el período.`,

    strengths:
      adherence >=
      90
        ? [
            "Adherencia al proceso >= 90%.",
          ]
        : [],

    risks,

    priorities: [
      ...new Set(
        priorities,
      ),
    ],

    whatNotToChange: [
      "No modificar setups ni parámetros de riesgo basándose en una sola muestra.",
    ],

    longitudinal: [],

    confidence:
      "media",
  };
}

async function generateAIReport(
  snapshot: Record<string, unknown>,
  history: CoachHistoryRow[],
): Promise<AutomationReport | null> {
  if (!OPENAI_API_KEY) {
    return null;
  }

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${OPENAI_API_KEY}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          model:
            OPENAI_MODEL,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text:
                    "Eres el Automated Review Engine de Trading OS. Analiza exclusivamente los datos estructurados. Sé directo, cuantitativo y conductual. No inventes datos. Identity representa proceso y ejecución, nunca dinero. No declares edge de un setup con muestras pequeñas. Prioriza patrones repetidos. Usa history para detectar tendencia, persistencia o reversión. No recomiendes aumentar riesgo ni cambiar una estrategia por una sola muestra. Devuelve únicamente JSON válido con las claves: title, verdict, executive_summary, strengths, risks, priorities, what_not_to_change, longitudinal, confidence.",
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({
                    current_snapshot:
                      snapshot,
                    longitudinal_history:
                      history.map(
                        (
                          item,
                        ) => ({
                          period_type:
                            item.period_type,
                          period_start:
                            item.period_start,
                          period_end:
                            item.period_end,
                          snapshot:
                            item.snapshot,
                        }),
                      ),
                  }),
                },
              ],
            },
          ],
        }),
      },
    );

  if (!response.ok) {
    return null;
  }

  const payload =
    (await response.json()) as {
      output_text?: string;
      output?: Array<{
        content?: Array<{
          text?: string;
        }>;
      }>;
    };

  const text =
    payload.output_text ??
    payload.output
      ?.flatMap(
        (item) =>
          item.content ?? [],
      )
      .map(
        (item) =>
          item.text ?? "",
      )
      .join("") ??
    "";

  if (!text) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        text
          .replace(
            /^```json\s*/i,
            "",
          )
          .replace(
            /\s*```$/i,
            "",
          ),
      );

    return parseAIReport(
      parsed,
    );
  } catch {
    return null;
  }
}

function buildAlerts(
  snapshot: Record<string, unknown>,
): AutomationAlert[] {
  const alerts: AutomationAlert[] =
    [];

  const behavior =
    asRecord(
      snapshot.behavior,
    );

  const process =
    asRecord(
      snapshot.process,
    );

  const performance =
    asRecord(
      snapshot.performance,
    );

  const overtradingDays =
    asNumber(
      behavior.overtradingDays,
    );

  const fomoTrades =
    asNumber(
      behavior.fomoTrades,
    );

  const recoveryAttempts =
    asNumber(
      behavior.recoveryAttempts,
    );

  const invalidTrades =
    asNumber(
      behavior.invalidTrades,
    );

  const adherence =
    asNumber(
      process.adherence,
    );

  const executionScore =
    asNumber(
      process.executionScore,
    );

  const tradingDays =
    asNumber(
      performance.tradingDays,
    );

  const trades =
    asNumber(
      performance.trades,
    );

  const maxDrawdownR =
    asNumber(
      performance.maxDrawdownR,
    );

  if (
    overtradingDays >
    0
  ) {
    alerts.push({
      id: "overtrading",
      severity: "warning",
      title:
        "Sobreoperación detectada",
      message:
        `${overtradingDays} jornada(s) tuvieron más de un trade.`,
      metric:
        "overtradingDays",
      value:
        overtradingDays,
      threshold: 0,
    });
  }

  if (
    fomoTrades > 0
  ) {
    alerts.push({
      id: "fomo",
      severity: "critical",
      title:
        "FOMO detectado",
      message:
        `${fomoTrades} trade(s) fueron asociados a FOMO.`,
      metric:
        "fomoTrades",
      value:
        fomoTrades,
      threshold: 0,
    });
  }

  if (
    recoveryAttempts > 0
  ) {
    alerts.push({
      id: "recovery",
      severity: "critical",
      title:
        "Intento de recuperación",
      message:
        `${recoveryAttempts} intento(s) de recuperación después de pérdidas.`,
      metric:
        "recoveryAttempts",
      value:
        recoveryAttempts,
      threshold: 0,
    });
  }

  if (
    invalidTrades > 0
  ) {
    alerts.push({
      id: "invalid-trade",
      severity: "warning",
      title:
        "Trade inválido",
      message:
        `${invalidTrades} trade(s) fueron clasificados como inválidos.`,
      metric:
        "invalidTrades",
      value:
        invalidTrades,
      threshold: 0,
    });
  }

  if (
    adherence < 75 &&
    tradingDays > 0
  ) {
    alerts.push({
      id: "low-adherence",
      severity: "warning",
      title:
        "Adherencia deteriorada",
      message:
        `La adherencia del proceso cayó a ${adherence}%.`,
      metric:
        "adherence",
      value:
        adherence,
      threshold: 75,
    });
  }

  if (
    executionScore < 70 &&
    trades > 0
  ) {
    alerts.push({
      id: "execution-deterioration",
      severity: "warning",
      title:
        "Ejecución deteriorada",
      message:
        `La ejecución media está en ${executionScore}/100.`,
      metric:
        "executionScore",
      value:
        executionScore,
      threshold: 70,
    });
  }

  if (
    maxDrawdownR <=
      -3 &&
    trades > 0
  ) {
    alerts.push({
      id: "drawdown",
      severity: "warning",
      title:
        "Drawdown elevado",
      message:
        `El drawdown máximo del período es ${maxDrawdownR}R.`,
      metric:
        "maxDrawdownR",
      value:
        maxDrawdownR,
      threshold: -3,
    });
  }

  return alerts;
}

function publicAutomationError() {
  return "No se pudo completar la automation. Revisa el estado e intenta nuevamente.";
}

async function getAutomationRunsForPeriod(
  automationType: AutomationType,
  periodStart: string,
  periodEnd: string,
) {
  const query =
    `?select=id,automation_type,period_type,period_start,period_end,status,snapshot,report,alerts,ai_model,error,created_at,updated_at` +
    `&automation_type=eq.${encodeURIComponent(automationType)}` +
    `&period_start=eq.${encodeURIComponent(periodStart)}` +
    `&period_end=eq.${encodeURIComponent(periodEnd)}` +
    `&order=created_at.desc&limit=50`;

  return supabaseFetch<Array<{
    id: string;
    automation_type: AutomationType;
    period_type: string;
    period_start: string;
    period_end: string;
    status: AutomationRun["status"];
    snapshot: Record<string, unknown> | null;
    report: AutomationReport | null;
    alerts: AutomationAlert[] | null;
    ai_model: string | null;
    error: string | null;
    created_at: string;
    updated_at: string;
  }>>("trading_os_automation_runs", query);
}

function alertSignature(alert: AutomationAlert, periodEnd: string) {
  return [
    alert.id,
    alert.metric ?? "",
    alert.value ?? "",
    alert.threshold ?? "",
    periodEnd,
  ].join(":");
}

async function getExistingRun(
  automationType: AutomationType,
  periodStart: string,
  periodEnd: string,
) {
  const query =
    `?select=id,automation_type,period_type,period_start,period_end,status,snapshot,report,alerts,ai_model,error,created_at,updated_at` +
    `&automation_type=eq.${encodeURIComponent(automationType)}` +
    `&period_start=eq.${encodeURIComponent(periodStart)}` +
    `&period_end=eq.${encodeURIComponent(periodEnd)}` +
    `&order=created_at.desc&limit=1`;

  const rows =
    await supabaseFetch<
      Array<{
        id: string;
        automation_type:
          AutomationType;
        period_type: string;
        period_start: string;
        period_end: string;
        status:
          AutomationRun["status"];
        snapshot:
          Record<string, unknown> | null;
        report:
          AutomationReport | null;
        alerts:
          AutomationAlert[] | null;
        ai_model: string | null;
        error: string | null;
        created_at: string;
        updated_at: string;
      }>
    >(
      "trading_os_automation_runs",
      query,
    );

  return rows[0] ?? null;
}

function normalizeRun(
  row: NonNullable<
    Awaited<
      ReturnType<
        typeof getExistingRun
      >
    >
  >,
): AutomationRun {
  return {
    id: row.id,
    automationType:
      row.automation_type,
    periodType:
      row.period_type,
    periodStart:
      row.period_start,
    periodEnd:
      row.period_end,
    status:
      row.status,
    snapshot:
      row.snapshot,
    report:
      row.report,
    alerts:
      row.alerts ?? [],
    aiModel:
      row.ai_model,
    error:
      row.error ? publicAutomationError() : null,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

async function saveRun(
  input: {
    automationType:
      AutomationType;
    period: AutomationPeriod;
    snapshot:
      Record<string, unknown>;
    report:
      AutomationReport | null;
    alerts:
      AutomationAlert[];
    status:
      AutomationRun["status"];
    error?: string | null;
    existingRunId?: string | null;
  },
) {
  const body = {
    automation_type:
      input.automationType,
    period_type:
      input.period.type,
    period_start:
      input.period.start,
    period_end:
      input.period.end,
    status:
      input.status,
    snapshot:
      input.snapshot,
    report:
      input.report,
    alerts:
      input.alerts,
    ai_model:
      OPENAI_API_KEY
        ? OPENAI_MODEL
        : null,
    error:
      input.error ?? null,
  };

  const rows =
    input.existingRunId
      ? await supabaseWrite<
          Array<{
            id: string;
            automation_type:
              AutomationType;
            period_type: string;
            period_start: string;
            period_end: string;
            status:
              AutomationRun["status"];
            snapshot:
              Record<string, unknown> | null;
            report:
              AutomationReport | null;
            alerts:
              AutomationAlert[];
            ai_model: string | null;
            error: string | null;
            created_at: string;
            updated_at: string;
          }>
        >(
          "trading_os_automation_runs",
          "PATCH",
          body,
          `?id=eq.${encodeURIComponent(
            input.existingRunId,
          )}`,
        )
      : await supabaseWrite<
          Array<{
            id: string;
            automation_type:
              AutomationType;
            period_type: string;
            period_start: string;
            period_end: string;
            status:
              AutomationRun["status"];
            snapshot:
              Record<string, unknown> | null;
            report:
              AutomationReport | null;
            alerts:
              AutomationAlert[];
            ai_model: string | null;
            error: string | null;
            created_at: string;
            updated_at: string;
          }>
        >(
          "trading_os_automation_runs",
          "POST",
          body,
        );

  const row = rows[0];

  if (!row) {
    throw new Error(
      "Supabase no devolvió el automation run creado.",
    );
  }

  return normalizeRun(
    row,
  );
}

export async function runAutomation(
  automationType: AutomationType,
  options: {
    force?: boolean;
    today?: string;
  } = {},
): Promise<AutomationResult> {
  const today = options.today ?? dateOnlyInTimezone();

  const period =
    automationType === "weekly_review"
      ? previousCompletedWeek(today)
      : automationType === "monthly_review"
        ? previousCompletedMonth(today)
        : currentWeek(today);

  const existing = await getExistingRun(
    automationType,
    period.start,
    period.end,
  );

  const isBehaviorAlert = automationType === "behavior_alerts";

  if (
    existing &&
    existing.status === "completed" &&
    !options.force &&
    !isBehaviorAlert
  ) {
    return {
      success: true,
      automationType,
      period,
      run: normalizeRun(existing),
      alerts: existing.alerts ?? [],
    };
  }

  try {
    const data = await loadRawData();
    const result = runCoachEngine(data, period);
    const snapshot = buildCoachSnapshot(result) as Record<string, unknown>;

    const history =
      automationType === "weekly_review" || automationType === "monthly_review"
        ? await loadCoachHistory(period.type, period.start)
        : [];

    const allAlerts = buildAlerts(snapshot);

    if (isBehaviorAlert) {
      const priorRuns = await getAutomationRunsForPeriod(
        automationType,
        period.start,
        period.end,
      );

      const known = new Set(
        priorRuns.flatMap((run) =>
          (run.alerts ?? []).map((alert) => alertSignature(alert, period.end)),
        ),
      );

      const newAlerts = allAlerts.filter(
        (alert) => !known.has(alertSignature(alert, period.end)),
      );

      if (newAlerts.length === 0) {
        const latestCompleted = priorRuns.find((run) => run.status === "completed");
        if (latestCompleted) {
          return {
            success: true,
            automationType,
            period,
            run: normalizeRun(latestCompleted),
            alerts: [],
          };
        }

        const run = await saveRun({
          automationType,
          period,
          snapshot,
          report: buildFallbackReport(snapshot),
          alerts: [],
          status: "completed",
        });

        return {
          success: true,
          automationType,
          period,
          run,
          alerts: [],
        };
      }

      const report = buildFallbackReport(snapshot);
      const run = await saveRun({
        automationType,
        period,
        snapshot,
        report,
        alerts: newAlerts,
        status: "completed",
      });

      return {
        success: true,
        automationType,
        period,
        run,
        alerts: newAlerts,
      };
    }

    const report =
      (await generateAIReport(snapshot, history)) ??
      buildFallbackReport(snapshot);

    // Reviews are immutable execution records. A manual rerun creates a new
    // history row instead of overwriting the previous attempt.
    const run = await saveRun({
      automationType,
      period,
      snapshot,
      report,
      alerts: allAlerts,
      status: "completed",
    });

    return {
      success: true,
      automationType,
      period,
      run,
      alerts: allAlerts,
    };
  } catch (error) {
    console.error(`Automation ${automationType} failed:`, error);
    const message = error instanceof Error ? error.message : "Automation failed.";

    try {
      const run = await saveRun({
        automationType,
        period,
        snapshot: {},
        report: null,
        alerts: [],
        status: "failed",
        error: message,
      });

      return {
        success: false,
        automationType,
        period,
        run,
        alerts: [],
        error: publicAutomationError(),
      };
    } catch (saveError) {
      console.error("Could not persist automation failure:", saveError);
      return {
        success: false,
        automationType,
        period,
        run: null,
        alerts: [],
        error: publicAutomationError(),
      };
    }
  }
}

export async function listAutomationRuns(
  limit = 30,
): Promise<AutomationRun[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    100,
  );

  const query =
    `?select=id,automation_type,period_type,period_start,period_end,status,snapshot,report,alerts,ai_model,error,created_at,updated_at` +
    `&order=updated_at.desc,created_at.desc` +
    `&limit=${safeLimit}`;

  const rows =
    await supabaseFetch<
      Array<{
        id: string;
        automation_type:
          AutomationType;
        period_type: string;
        period_start: string;
        period_end: string;
        status:
          AutomationRun["status"];
        snapshot:
          Record<string, unknown> | null;
        report:
          AutomationReport | null;
        alerts:
          AutomationAlert[] | null;
        ai_model: string | null;
        error: string | null;
        created_at: string;
        updated_at: string;
      }>
    >(
      "trading_os_automation_runs",
      query,
    );

  return rows.map(
    normalizeRun,
  );
}
