import { NextRequest, NextResponse } from "next/server";
import { supabaseServerFetch } from "@/app/lib/supabase/server";
import {
  buildCoachSnapshot,
  runCoachEngine,
  type CoachPeriod,
  type CoachSetup,
  type CoachTrade,
  type CoachTradingDay,
} from "@/app/lib/coach-engine";

export const dynamic = "force-dynamic";

type Period = "day" | "week" | "month" | "all";
type StoragePeriod = "day" | "week" | "month" | "custom";

type AIAnalysis = {
  verdict: string;
  executive_summary: string;
  strengths: string[];
  weaknesses: string[];
  behavioral_findings: string[];
  setup_findings: string[];
  week_over_week: string[];
  priorities: {
    priority: number;
    action: string;
    reason: string;
  }[];
  what_not_to_change: string[];
  confidence: string;
};

type SavedAnalysis = {
  id: string;
  ai_model: string;
  created_at: string;
};

type Snapshot = ReturnType<typeof buildCoachSnapshot>;

type LongitudinalHistoryEntry = {
  period_type: Period | StoragePeriod;
  period_start: string;
  period_end: string;
  snapshot: Snapshot;
  ai_analysis: AIAnalysis | null;
  created_at: string;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.1";

const PERIODS: Period[] = ["day", "week", "month", "all"];

function toStoragePeriod(period: Period): StoragePeriod {
  return period === "all" ? "custom" : period;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setUTCDate(result.getUTCDate() + diff);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateOnly(date);
}

function getCurrentRange(
  period: Period,
  availableDates: string[],
): { start: string; end: string } {
  const now = new Date();
  const end = dateOnly(now);

  if (period === "day") {
    return { start: end, end };
  }

  if (period === "week") {
    return { start: dateOnly(startOfWeek(now)), end };
  }

  if (period === "month") {
    return { start: dateOnly(startOfMonth(now)), end };
  }

  const sorted = availableDates.filter(Boolean).sort();
  return {
    start: sorted[0] ?? end,
    end: sorted.at(-1) ?? end,
  };
}

function getPreviousRange(
  period: Period,
  current: { start: string; end: string },
): { start: string; end: string } | null {
  if (period === "all") return null;

  if (period === "day") {
    const previous = addDays(current.start, -1);
    return { start: previous, end: previous };
  }

  if (period === "week") {
    const previousEnd = addDays(current.start, -1);
    return {
      start: addDays(previousEnd, -6),
      end: previousEnd,
    };
  }

  const previousEnd = addDays(current.start, -1);
  const previousStartDate = startOfMonth(parseDate(previousEnd));

  return {
    start: dateOnly(previousStartDate),
    end: previousEnd,
  };
}

function filterRange<T extends { trade_date?: string | null; date?: string | null }>(
  rows: T[],
  range: { start: string; end: string },
) {
  return rows.filter((row) => {
    const value = row.trade_date ?? row.date ?? "";
    return value >= range.start && value <= range.end;
  });
}

function toCoachPeriod(
  period: Period,
  range: { start: string; end: string },
): CoachPeriod {
  return {
    type:
      period === "week" || period === "month"
        ? period
        : "custom",
    start: range.start,
    end: range.end,
  };
}

function buildComparison(
  current: Snapshot,
  previous: Snapshot | null,
) {
  if (!previous) return null;

  return {
    previousPeriod: previous.period,
    current: {
      totalR: current.performance.totalR,
      expectancy: current.performance.expectancy,
      winRate: current.performance.winRate,
      adherence: current.process.adherence,
      executionScore: current.process.executionScore,
      identityScore: current.process.identityScore,
    },
    previous: {
      totalR: previous.performance.totalR,
      expectancy: previous.performance.expectancy,
      winRate: previous.performance.winRate,
      adherence: previous.process.adherence,
      executionScore: previous.process.executionScore,
      identityScore: previous.process.identityScore,
    },
    changes: {
      totalR: current.performance.totalR - previous.performance.totalR,
      expectancy:
        current.performance.expectancy - previous.performance.expectancy,
      winRate: current.performance.winRate - previous.performance.winRate,
      adherence:
        current.process.adherence - previous.process.adherence,
      executionScore:
        current.process.executionScore -
        previous.process.executionScore,
      identityScore:
        current.process.identityScore -
        previous.process.identityScore,
    },
  };
}

const AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string" },
    executive_summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    behavioral_findings: { type: "array", items: { type: "string" } },
    setup_findings: { type: "array", items: { type: "string" } },
    week_over_week: { type: "array", items: { type: "string" } },
    priorities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          priority: { type: "number" },
          action: { type: "string" },
          reason: { type: "string" },
        },
        required: ["priority", "action", "reason"],
      },
    },
    what_not_to_change: { type: "array", items: { type: "string" } },
    confidence: { type: "string" },
  },
  required: [
    "verdict",
    "executive_summary",
    "strengths",
    "weaknesses",
    "behavioral_findings",
    "setup_findings",
    "week_over_week",
    "priorities",
    "what_not_to_change",
    "confidence",
  ],
};

async function generateAI(
  snapshot: Snapshot,
  longitudinalHistory: LongitudinalHistoryEntry[] = [],
): Promise<AIAnalysis | null> {
  if (!OPENAI_API_KEY) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Eres el AI Coach de Trading OS. Analiza exclusivamente los datos estructurados recibidos. Sé directo, cuantitativo y conductual. No inventes datos. Identity es exclusivamente proceso y ejecución, nunca dinero. Usa exactamente las métricas del snapshot; no las recalcules con otra definición. No declares un setup como edge probado con menos de 3 trades. No llames mejor setup a un setup sin expectancy positiva y sin trade ganador. Si la muestra es insuficiente, dilo explícitamente. Prioriza patrones repetidos de comportamiento sobre resultados aislados. Cuando exista longitudinal_history, úsalo para detectar tendencia, persistencia y reversión. Nunca ordenes cambiar automáticamente la estrategia, los setups ni los parámetros de riesgo.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                current_snapshot: snapshot,
                longitudinal_history: longitudinalHistory.map((entry) => ({
                  period_type: entry.period_type,
                  period_start: entry.period_start,
                  period_end: entry.period_end,
                  snapshot: entry.snapshot,
                  ai_analysis: entry.ai_analysis
                    ? {
                        verdict: entry.ai_analysis.verdict,
                        executive_summary:
                          entry.ai_analysis.executive_summary,
                        behavioral_findings:
                          entry.ai_analysis.behavioral_findings,
                        priorities: entry.ai_analysis.priorities,
                      }
                    : null,
                })),
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "trading_os_coach",
          strict: true,
          schema: AI_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI: ${await response.text()}`);
  }

  const payload = await response.json();

  const outputText =
    typeof payload.output_text === "string"
      ? payload.output_text
      : Array.isArray(payload.output)
        ? payload.output
            .flatMap(
              (item: { content?: Array<{ text?: string }> }) =>
                item.content ?? [],
            )
            .map((item: { text?: string }) => item.text ?? "")
            .join("")
        : "";

  if (!outputText) {
    throw new Error("OpenAI no devolvió contenido.");
  }

  return JSON.parse(outputText) as AIAnalysis;
}

async function supabaseFetch<T>(table: string, query: string): Promise<T> {
  return supabaseServerFetch<T>(table, { query });
}

async function supabaseWrite<T>(
  table: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  query = "",
): Promise<T> {
  return supabaseServerFetch<T>(table, {
    method,
    body,
    query,
    prefer: method === "DELETE" ? "return=minimal" : "return=representation",
  });
}

async function saveCoachAnalysis(
  period: Period,
  snapshot: Snapshot,
  aiAnalysis: AIAnalysis,
): Promise<SavedAnalysis> {
  const storagePeriod = toStoragePeriod(period);

  await supabaseWrite(
    "coach_analysis_history",
    "DELETE",
    undefined,
    `?period_type=eq.${encodeURIComponent(storagePeriod)}&period_start=eq.${encodeURIComponent(snapshot.period.start)}`,
  );

  const rows = await supabaseWrite<
    Array<{ id: string; ai_model: string; created_at: string }>
  >(
    "coach_analysis_history",
    "POST",
    {
      period_type: storagePeriod,
      period_start: snapshot.period.start,
      period_end: snapshot.period.end,
      snapshot,
      ai_analysis: aiAnalysis,
      ai_model: OPENAI_MODEL,
    },
  );

  const saved = rows[0];

  if (!saved) {
    throw new Error(
      "Supabase guardó el análisis pero no devolvió el registro creado.",
    );
  }

  return {
    id: saved.id,
    ai_model: saved.ai_model || OPENAI_MODEL,
    created_at: saved.created_at,
  };
}

async function getLatestSavedCoachAnalysis(
  period: Period,
  periodStart: string,
  periodEnd: string,
) {
  const storagePeriod = toStoragePeriod(period);

  const query =
    `?select=id,ai_model,created_at,ai_analysis,snapshot` +
    `&period_type=eq.${encodeURIComponent(storagePeriod)}` +
    `&period_start=eq.${encodeURIComponent(periodStart)}` +
    `&period_end=eq.${encodeURIComponent(periodEnd)}` +
    `&order=created_at.desc&limit=1`;

  const rows = await supabaseFetch<
    Array<{
      id: string;
      ai_model: string;
      created_at: string;
      ai_analysis: AIAnalysis | null;
      snapshot: Snapshot | null;
    }>
  >("coach_analysis_history", query);

  const row = rows[0];
  if (!row) return null;

  return {
    metadata: {
      id: row.id,
      ai_model: row.ai_model || OPENAI_MODEL,
      created_at: row.created_at,
    },
    aiAnalysis: row.ai_analysis ?? null,
    snapshot: row.snapshot ?? null,
  };
}

async function getLongitudinalHistory(
  period: Period,
  currentPeriodStart: string,
  currentPeriodEnd: string,
): Promise<LongitudinalHistoryEntry[]> {
  try {
    const periodFilter =
      period === "all"
        ? ""
        : `&period_type=eq.${encodeURIComponent(toStoragePeriod(period))}`;

    const query =
      `?select=period_type,period_start,period_end,snapshot,ai_analysis,created_at` +
      periodFilter +
      `&order=period_end.desc,created_at.desc&limit=20`;

    const rows = await supabaseFetch<LongitudinalHistoryEntry[]>(
      "coach_analysis_history",
      query,
    );

    return rows
      .filter((row) => {
        if (
          row.period_start === currentPeriodStart &&
          row.period_end === currentPeriodEnd
        ) {
          return false;
        }

        return row.period_end < currentPeriodStart;
      })
      .sort((a, b) => {
        const endComparison = b.period_end.localeCompare(a.period_end);
        if (endComparison !== 0) return endComparison;
        return b.created_at.localeCompare(a.created_at);
      })
      .slice(0, 5);
  } catch (error) {
    console.warn("Coach longitudinal history unavailable:", error);
    return [];
  }
}

function metricSignature(snapshot: Snapshot) {
  return JSON.stringify({
    period: snapshot.period,
    performance: snapshot.performance,
    process: snapshot.process,
    consistency: snapshot.consistency,
    setups: snapshot.setups,
    behavior: snapshot.behavior,
    comparison: snapshot.comparison,
  });
}

async function handleRequest(request: NextRequest) {
  const periodParam =
    request.nextUrl.searchParams.get("period") ?? "week";
  const aiRequested =
    request.nextUrl.searchParams.get("ai") === "true";

  if (!PERIODS.includes(periodParam as Period)) {
    return NextResponse.json(
      { success: false, error: "Período inválido." },
      { status: 400 },
    );
  }

  const period = periodParam as Period;

  const [trades, days, setups] = await Promise.all([
    supabaseFetch<CoachTrade[]>(
      "trades",
      "?select=*&order=trade_date.asc,created_at.asc",
    ),
    supabaseFetch<CoachTradingDay[]>(
      "trading_days",
      "?select=*&order=date.asc",
    ),
    supabaseFetch<CoachSetup[]>(
      "setups",
      "?select=id,name,category,active&order=name.asc",
    ),
  ]);

  const availableDates = [
    ...trades.map((trade) => trade.trade_date ?? ""),
    ...days.map((day) => day.date ?? ""),
  ].filter(Boolean);

  const currentRange = getCurrentRange(period, availableDates);
  const currentPeriod = toCoachPeriod(period, currentRange);

  const currentTrades = filterRange(trades, currentRange);
  const currentDays = filterRange(days, currentRange);

  const currentResult = runCoachEngine(
    {
      trades,
      tradingDays: days,
      setups,
    },
    currentPeriod,
  );

  const snapshot = {
    ...buildCoachSnapshot(currentResult),
    comparison: null,
  } as Snapshot;

  const previousRange = getPreviousRange(period, currentRange);

  if (previousRange) {
    const previousPeriod = toCoachPeriod(period, previousRange);
    const previousResult = runCoachEngine(
      {
        trades,
        tradingDays: days,
        setups,
      },
      previousPeriod,
    );

    const previousSnapshot = buildCoachSnapshot(previousResult);

    snapshot.comparison = buildComparison(
      snapshot,
      previousSnapshot,
    );
  }

  // Keep these variables explicit: the response source reflects the
  // filtered period while the engine remains the single metric authority.
  void currentTrades;
  void currentDays;

  let aiAnalysis: AIAnalysis | null = null;
  let savedAnalysis: SavedAnalysis | null = null;

  const savedCoach = await getLatestSavedCoachAnalysis(
    period,
    snapshot.period.start,
    snapshot.period.end,
  );

  if (savedCoach) {
    savedAnalysis = savedCoach.metadata;

    const snapshotMatches =
      savedCoach.snapshot &&
      metricSignature(savedCoach.snapshot) ===
        metricSignature(snapshot);

    if (!aiRequested && snapshotMatches) {
      aiAnalysis = savedCoach.aiAnalysis;
    }
  }

  if (aiRequested) {
    const longitudinalHistory = await getLongitudinalHistory(
      period,
      snapshot.period.start,
      snapshot.period.end,
    );

    aiAnalysis = await generateAI(snapshot, longitudinalHistory);

    if (aiAnalysis) {
      savedAnalysis = await saveCoachAnalysis(
        period,
        snapshot,
        aiAnalysis,
      );
    }
  }

  const response = {
    success: true,
    model: OPENAI_MODEL,
    source: {
      trades: currentResult.metrics.trades,
      tradingDays: currentResult.metrics.tradingDays,
      setups: setups.length,
    },
    snapshot,
    aiAnalysis,
    savedAnalysis,
  };

  return NextResponse.json(response);
}

export async function GET(request: NextRequest) {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error("Coach GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Error desconocido.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error("Coach POST error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Error desconocido.",
      },
      { status: 500 },
    );
  }
}
