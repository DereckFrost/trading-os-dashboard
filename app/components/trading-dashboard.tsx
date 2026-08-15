"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { DailyWorkflowPanel } from "@/app/components/daily-workflow-panel";
import { calculateProcessAdherence } from "@/app/lib/metrics/process";
import {
  calculateTradingMetrics,
  type MetricTrade,
} from "@/app/lib/metrics";

type Trade = {
  id: string;
  trade_date: string;
  instrument: string;
  direction: string;
  setup_id: string | null;
  setup_quality: string | null;
  execution_quality: string | null;
  emotion: string | null;
  close_type: string | null;
  r: number | null;
  created_at: string | null;
  setup?: { name: string } | null;
};

type Setup = {
  id: string;
  name: string;
};

type TradingDay = {
  id: string;
  date: string;
  waited_for_setup: boolean;
  only_one_trade: boolean;
  did_not_recover_losses: boolean;
  session_finished: boolean;
  notes: string | null;
};

type SopSession = {
  id: string;
  session_date: string;
  completed_steps: Record<string, unknown> | null;
};

export function TradingDashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradingDays, setTradingDays] = useState<TradingDay[]>([]);
  const [sopSessions, setSopSessions] = useState<SopSession[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      setLoading(true);

      const [
        tradesResponse,
        setupsResponse,
        tradingDaysResponse,
      ] = await Promise.all([
        fetch("/api/trades", {
          cache: "no-store",
        }),

        fetch("/api/trading-office", {
          cache: "no-store",
        }),

        fetch("/api/trading-days", {
          cache: "no-store",
        }),
      ]);

      if (!tradesResponse.ok) {
        throw new Error(
          "No se pudieron cargar los trades.",
        );
      }

      const tradesData =
        (await tradesResponse.json()) as {
          trades?: Trade[];
        };

      let setups: Setup[] = [];

      if (setupsResponse.ok) {
        const setupData =
          (await setupsResponse.json()) as {
            setups?: Setup[];
          };

        setups = setupData.setups ?? [];
      }

      const setupMap = new Map(
        setups.map((setup) => [
          setup.id,
          setup,
        ]),
      );

      const normalized =
        (tradesData.trades ?? []).map(
          (trade) => ({
            ...trade,
            setup: trade.setup_id
              ? setupMap.has(trade.setup_id)
                ? {
                    name:
                      setupMap.get(
                        trade.setup_id,
                      )!.name,
                  }
                : null
              : null,
          }),
        );

      setTrades(normalized);

      if (tradingDaysResponse.ok) {
        const tradingDaysData =
          (await tradingDaysResponse.json()) as {
            days?: TradingDay[];
            sopSessions?: SopSession[];
          };

        setTradingDays(
          tradingDaysData.days ?? [],
        );

        setSopSessions(
          tradingDaysData.sopSessions ?? [],
        );
      } else {
        setTradingDays([]);
        setSopSessions([]);
      }
    } catch (error) {
      console.error(
        "Trading Office load error:",
        error,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        void loadData();
      }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const metrics = useMemo(() => {
    const now = new Date();

    const currentMonth =
      `${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, "0")}`;

    const monthTrades =
      trades.filter((trade) =>
        trade.trade_date.startsWith(
          currentMonth,
        ),
      );

    const metricTrades: MetricTrade[] =
      monthTrades.map(
        (trade) => ({
          id: trade.id,
          trade_date:
            trade.trade_date,
          created_at:
            trade.created_at,
          r: trade.r,
          setup_id:
            trade.setup_id,
          setup_quality:
            trade.setup_quality,
          execution_quality:
            trade.execution_quality,
        }),
      );

    const unifiedMetrics =
      calculateTradingMetrics({
        trades: metricTrades,
      });

    const {
      performance,
      execution,
    } = unifiedMetrics;

    return [
      {
        label: "TRADES DEL MES",
        value:
          String(
            performance.totalTrades,
          ),
        tone: "neutral" as const,
      },

      {
        label: "R ACUMULADO",
        value:
          formatR(
            performance.netR,
          ),
        tone:
          performance.netR >= 0
            ? ("positive" as const)
            : ("warning" as const),
      },

      {
        label: "EJECUCIÓN MEDIA",
        value:
          `${execution.average}/100`,
        tone:
          execution.average >= 80
            ? ("positive" as const)
            : ("neutral" as const),
      },

      {
        label: "TRADES A+",
        value:
          String(
            performance.aPlusTrades,
          ),
        tone:
          performance.aPlusTrades > 0
            ? ("positive" as const)
            : ("neutral" as const),
      },

      {
        label: "ADHERENCIA",
        value: `${getMonthlyAdherence(
          tradingDays,
          currentMonth,
          trades,
        )}%`,
        tone:
          getMonthlyAdherence(
            tradingDays,
            currentMonth,
            trades,
          ) >= 80
            ? ("positive" as const)
            : ("neutral" as const),
      },
    ];
  }, [trades, tradingDays]);

  return (
    <div className="min-h-screen bg-[var(--surface)] text-zinc-100">
      <div className="mx-auto w-full max-w-[1320px] px-5 py-7 lg:px-8 lg:py-9">
        <header className="mb-5 flex items-end justify-between gap-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
              TRADING OFFICE
            </p>
          </div>
        </header>

        <section className="grid items-stretch gap-4 lg:grid-cols-[0.78fr_1.6fr]">
          <PrincipleCard />

          <DailyWorkflowPanel />
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {metrics.map(
            (metric) => (
              <MetricCard
                key={
                  metric.label
                }
                {...metric}
              />
            ),
          )}
        </section>

        <section className="mt-4 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/60">
          <div className="flex items-center justify-between border-b border-zinc-700/70 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-emerald-400">
                CALENDARIO
              </p>
            </div>

            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">
              {loading
                ? "Cargando…"
                : `${getTradingDaysCount(
                    tradingDays,
                  )} días registrados`}
            </span>
          </div>

          <TradingCalendar
            trades={trades}
            tradingDays={tradingDays}
            sopSessions={sopSessions}
          />
        </section>
      </div>
    </div>
  );
}

function formatR(
  value: number,
) {
  return `${
    value >= 0
      ? "+"
      : ""
  }${value.toFixed(2)}R`;
}

function getTradingDaysCount(
  tradingDays: TradingDay[],
) {
  return tradingDays.length;
}

function getMonthlyAdherence(
  tradingDays: TradingDay[],
  monthKey: string,
  trades: Trade[],
) {
  const days = tradingDays.filter(
    (day) =>
      day.date.startsWith(
        monthKey,
      ),
  );

  const monthTrades =
    trades.filter((trade) =>
      trade.trade_date.startsWith(
        monthKey,
      ),
    );

  return calculateProcessAdherence(
    days,
    monthTrades,
  );
}

function PrincipleCard() {
  return (
    <section className="rounded-xl border border-zinc-700/70 bg-zinc-900/60 p-5">
      <div className="flex items-center gap-3">
        <span className="h-5 w-[2px] rounded-full bg-emerald-400" />

        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
          PRINCIPIO
        </span>
      </div>

      <h2 className="mt-5 text-[23px] font-semibold tracking-tight text-zinc-100">
        Mi trabajo es ejecutar.
      </h2>

      <div className="mt-4 space-y-2.5 text-[13px] leading-5">
        <p className="font-medium text-zinc-100">
          Mi trabajo no es producir
          beneficios hoy. Mi trabajo
          es ejecutar un proceso
          profesional hoy.
        </p>

        <p className="text-zinc-400">
          Los beneficios son la
          consecuencia de ejecutar
          ese proceso cientos de
          veces.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-700/80 bg-zinc-800/30 px-4 py-3">
        <div className="border-l-2 border-emerald-400 pl-4">
          <p className="text-[13px] leading-6 text-zinc-300">
            No estoy entrenando para
            ganar el próximo trade.
            Estoy entrenando para
            convertirme en el tipo de
            persona que puede ejecutar
            miles de trades exactamente
            igual.
          </p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone:
    | "neutral"
    | "positive"
    | "warning";
}) {
  return (
    <article
      className={`rounded-xl border bg-zinc-900/60 p-4 ${
        tone === "positive"
          ? "border-emerald-700/70"
          : tone === "warning"
            ? "border-rose-700/60"
            : "border-zinc-700/70"
      }`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-4 text-xl font-semibold tracking-tight ${
          tone === "positive"
            ? "text-emerald-400"
            : tone === "warning"
              ? "text-rose-400"
              : "text-zinc-100"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function TradingCalendar({
  trades,
  tradingDays,
  sopSessions,
}: {
  trades: Trade[];
  tradingDays: TradingDay[];
  sopSessions: SopSession[];
}) {
  const today =
    new Date();

  const [
    currentDate,
    setCurrentDate,
  ] = useState(
    new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    ),
  );

  const year =
    currentDate.getFullYear();

  const month =
    currentDate.getMonth();

  const firstDay =
    new Date(
      year,
      month,
      1,
    );

  const daysInMonth =
    new Date(
      year,
      month + 1,
      0,
    ).getDate();

  const mondayOffset =
    (firstDay.getDay() + 6) % 7;

  const totalCells =
    Math.ceil(
      (mondayOffset +
        daysInMonth) /
        7,
    ) * 7;

  const tradesByDate =
    useMemo(() => {
      const map =
        new Map<
          string,
          Trade[]
        >();

      for (const trade of trades) {
        const current =
          map.get(
            trade.trade_date,
          ) ?? [];

        current.push(
          trade,
        );

        map.set(
          trade.trade_date,
          current,
        );
      }

      return map;
    }, [trades]);

  const tradingDaysByDate =
    useMemo(
      () =>
        new Map(
          tradingDays.map(
            (day) => [
              day.date,
              day,
            ],
          ),
        ),
      [tradingDays],
    );

  const sopSessionsByDate =
    useMemo(
      () =>
        new Map(
          sopSessions.map(
            (session) => [
              session.session_date,
              session,
            ],
          ),
        ),
      [sopSessions],
    );

  const monthLabel =
    new Intl.DateTimeFormat(
      "es-ES",
      {
        month: "long",
        year: "numeric",
      },
    ).format(
      currentDate,
    );

  function previousMonth() {
    setCurrentDate(
      new Date(
        year,
        month - 1,
        1,
      ),
    );
  }

  function nextMonth() {
    setCurrentDate(
      new Date(
        year,
        month + 1,
        1,
      ),
    );
  }

  function goToday() {
    setCurrentDate(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1,
      ),
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={
              previousMonth
            }
            className="flex size-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
            aria-label="Mes anterior"
          >
            <ChevronLeftIcon />
          </button>

          <button
            type="button"
            onClick={
              goToday
            }
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            Hoy
          </button>

          <button
            type="button"
            onClick={
              nextMonth
            }
            className="flex size-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
            aria-label="Mes siguiente"
          >
            <ChevronRightIcon />
          </button>
        </div>

        <h3 className="text-sm font-semibold capitalize text-zinc-100">
          {monthLabel}
        </h3>

        <div className="w-[104px]" />
      </div>

      <div className="min-w-[860px]">
        <div className="grid grid-cols-7 border-b border-zinc-800/80">
          {[
            "LUN",
            "MAR",
            "MIÉ",
            "JUE",
            "VIE",
            "SÁB",
            "DOM",
          ].map(
            (day) => (
              <div
                key={day}
                className="border-r border-zinc-800/70 px-3 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600 last:border-r-0"
              >
                {day}
              </div>
            ),
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[860px] grid grid-cols-7">
          {Array.from(
            {
              length: totalCells,
            },
            (_, index) => {
              const dayNumber =
                index -
                mondayOffset +
                1;

              if (
                dayNumber < 1 ||
                dayNumber >
                  daysInMonth
              ) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="min-h-[102px] border-b border-r border-zinc-800/70 bg-zinc-950/10"
                  />
                );
              }

              const date =
                `${year}-${String(
                  month + 1,
                ).padStart(
                  2,
                  "0",
                )}-${String(
                  dayNumber,
                ).padStart(
                  2,
                  "0",
                )}`;

              const dayTrades =
                tradesByDate.get(
                  date,
                ) ?? [];

              return (
                <CalendarDay
                  key={date}
                  date={date}
                  dayNumber={
                    dayNumber
                  }
                  trades={
                    dayTrades
                  }
                  tradingDay={
                    tradingDaysByDate.get(
                      date,
                    ) ?? null
                  }
                  sopSession={
                    sopSessionsByDate.get(
                      date,
                    ) ?? null
                  }
                />
              );
            },
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 border-t border-zinc-800/80 px-5 py-3">
        <Legend
          label="Adherente"
          className="bg-emerald-400"
        />

        <Legend
          label="No adherente"
          className="bg-rose-400"
        />

        <Legend
          label="Sin evaluación"
          className="bg-zinc-500"
        />

        <span className="ml-auto text-[9px] text-zinc-600">
          Color principal = resultado del día
        </span>
      </div>
    </div>
  );
}

function CalendarDay({
  date,
  dayNumber,
  trades,
  tradingDay,
  sopSession,
}: {
  date: string;
  dayNumber: number;
  trades: Trade[];
  tradingDay: TradingDay | null;
  sopSession: SopSession | null;
}) {
  const today =
    new Date();

  const current =
    new Date(
      `${date}T12:00:00`,
    );

  const isToday =
    current.getFullYear() ===
      today.getFullYear() &&
    current.getMonth() ===
      today.getMonth() &&
    current.getDate() ===
      today.getDate();

  const totalR =
    trades.reduce(
      (sum, trade) =>
        sum +
        (trade.r === null
          ? 0
          : Number(trade.r)),
      0,
    );

  const hasTrades =
    trades.length > 0;

  const hasEvaluation =
    Boolean(
      tradingDay ||
        sopSession,
    );

  const sopCompleted =
    Boolean(
      sopSession?.completed_steps &&
        Object.entries(
          sopSession.completed_steps,
        ).some(
          ([key, value]) =>
            key === "8" &&
            value === true,
        ),
    );

  const processAdherent =
    Boolean(
      tradingDay &&
        tradingDay.waited_for_setup &&
        tradingDay.only_one_trade &&
        tradingDay.did_not_recover_losses &&
        tradingDay.session_finished &&
        sopCompleted,
    );

  const processLabel =
    processAdherent
      ? "Adherente"
      : hasEvaluation
        ? "No adherente"
        : "Sin evaluar";

  const positive =
    totalR > 0;

  const negative =
    totalR < 0;

  const emotions =
    Array.from(
      new Set(
        trades
          .map(
            (trade) =>
              trade.emotion,
          )
          .filter(Boolean),
      ),
    );

  const dayContent = (
    <div
      className={`min-h-[102px] border-b border-r border-zinc-800/70 p-3 transition ${
        (hasTrades ||
          hasEvaluation)
          ? "cursor-pointer hover:bg-zinc-800/30"
          : ""
      } ${
        isToday
          ? "bg-emerald-500/[0.035]"
          : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ${
            isToday
              ? "bg-emerald-400 text-[#07110d]"
              : "text-zinc-400"
          }`}
        >
          {dayNumber}
        </span>

        {(hasTrades ||
          hasEvaluation) && (
          <div className="flex items-center gap-1.5">
            <span
              className={`mt-2 size-1.5 rounded-full ${
                positive
                  ? "bg-emerald-400"
                  : negative
                    ? "bg-rose-400"
                    : "bg-zinc-500"
              }`}
            />

            <span
              className={`mt-2 size-1.5 rounded-full ${
                processAdherent
                  ? "bg-emerald-400"
                  : hasEvaluation
                    ? "bg-rose-400"
                    : "bg-zinc-500"
              }`}
              title={
                processLabel
              }
            />
          </div>
        )}
      </div>

      {hasTrades ||
      hasEvaluation ? (
        <div className="mt-3">
          <p
            className={`text-[12px] font-semibold ${
              positive
                ? "text-emerald-400"
                : negative
                  ? "text-rose-400"
                  : "text-zinc-300"
            }`}
          >
            {formatR(totalR)}
          </p>

          <div className="mt-2 flex items-center gap-1.5">
            <span className="rounded border border-zinc-700 bg-zinc-900/70 px-1.5 py-0.5 text-[8px] font-medium text-zinc-500">
              {trades.length}{" "}
              {trades.length ===
              1
                ? "trade"
                : "trades"}
            </span>

            <span
              className={`rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase ${
                positive
                  ? "border-emerald-800/60 text-emerald-500"
                  : negative
                    ? "border-rose-800/60 text-rose-500"
                    : "border-zinc-700 text-zinc-500"
              }`}
            >
              {positive
                ? "WIN"
                : negative
                  ? "LOSS"
                  : "BE"}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase ${
                processAdherent
                  ? "border-emerald-800/60 text-emerald-500"
                  : hasEvaluation
                    ? "border-rose-800/60 text-rose-500"
                    : "border-zinc-700 text-zinc-500"
              }`}
            >
              {processLabel}
            </span>
          </div>

          {hasTrades &&
            emotions.length >
              0 && (
              <p className="mt-2 truncate text-[8px] text-zinc-600">
                {emotions[0]}
              </p>
            )}
        </div>
      ) : (
        <p className="mt-9 text-[9px] text-zinc-800">
          —
        </p>
      )}
    </div>
  );

  if (
    !hasTrades &&
    !hasEvaluation
  ) {
    return (
      <div>
        {dayContent}
      </div>
    );
  }

  return (
    <Link
      href={`/journal?date=${date}`}
      title={`Ver jornada del ${formatDate(
        date,
      )}`}
      className="block"
    >
      {dayContent}
    </Link>
  );
}

function Legend({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className="flex items-center gap-2 text-[9px] font-medium text-zinc-600">
      <span
        className={`size-1.5 rounded-full ${className}`}
      />
      {label}
    </span>
  );
}

function formatDate(
  value: string,
) {
  const [
    year,
    month,
    day,
  ] = value.split("-");

  return year &&
    month &&
    day
    ? `${day}/${month}/${year}`
    : value;
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="size-4"
    >
      <path d="m14 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="size-4"
    >
      <path d="m10 18 6-6-6-6" />
    </svg>
  );
}