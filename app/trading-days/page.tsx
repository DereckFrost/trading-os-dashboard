"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  calculatePerformanceMetrics,
  isProcessAdherent,
} from "@/app/lib/metrics";

type TradingDay = {
  id: string;
  date: string;
  mental_state: string | null;
  waited_for_setup: boolean;
  only_one_trade: boolean;
  did_not_recover_losses: boolean;
  session_finished: boolean;
  notes: string | null;
};

type SopSession = {
  id: string;
  session_date: string;
  completed_steps:
    | Record<string, unknown>
    | null;
};

type Trade = {
  id: string;
  trade_date: string;
  r: number | null;
  setup_quality: string | null;
  emotion: string | null;
  created_at: string | null;
};

type SupabaseTradeRow = {
  id: string;
  trade_date: string;
  r: number | null;
  setup_quality: string | null;
  created_at: string | null;
  emotion: string | null;
};

type DayStats = {
  trades: number;
  totalR: number;
  validSetup: boolean;
  onlyOneTrade: boolean;
  didNotRecoverLosses: boolean;
};

async function tradingDaysApi<T = unknown>(
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  const response =
    await fetch(
      `/api/trading-days${
        options.query ?? ""
      }`,
      {
        method:
          options.method ?? "GET",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          options.body !==
          undefined
            ? JSON.stringify(
                options.body,
              )
            : undefined,
        cache: "no-store",
      },
    );

  const text =
    await response.text();

  let payload:
    | Record<string, unknown>
    | null = null;

  if (text) {
    try {
      payload =
        JSON.parse(text) as Record<
          string,
          unknown
        >;
    } catch {
      payload = null;
    }
  }

  if (
    !response.ok ||
    payload?.success === false
  ) {
    throw new Error(
      typeof payload?.error ===
        "string"
        ? payload.error
        : `Trading Days API error ${response.status}.`,
    );
  }

  return payload as T;
}

function getLocalDate() {
  const now =
    new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function getMonthStart(
  date: string,
) {
  const [
    year,
    month,
  ] = date.split("-");

  return `${year}-${month}-01`;
}

function addMonths(
  date: string,
  amount: number,
) {
  const [
    year,
    month,
  ] = date
    .split("-")
    .map(Number);

  const result =
    new Date(
      year,
      month - 1 + amount,
      1,
    );

  return `${result.getFullYear()}-${String(
    result.getMonth() + 1,
  ).padStart(2, "0")}-01`;
}

function getMonthLabel(
  date: string,
) {
  const [
    year,
    month,
  ] = date
    .split("-")
    .map(Number);

  return new Intl.DateTimeFormat(
    "es-DO",
    {
      month: "long",
      year: "numeric",
    },
  ).format(
    new Date(
      year,
      month - 1,
      1,
    ),
  );
}

function getCalendarCells(
  monthStart: string,
) {
  const [
    year,
    month,
  ] = monthStart
    .split("-")
    .map(Number);

  const firstDay =
    new Date(
      year,
      month - 1,
      1,
    );

  const lastDay =
    new Date(
      year,
      month,
      0,
    );

  /*
   * Domingo = 0
   * Lunes = 1
   *
   * El calendario utiliza domingo
   * como primer día de la semana.
   */
  const leadingDays =
    firstDay.getDay();

  const daysInMonth =
    lastDay.getDate();

  const cells: Array<
    string | null
  > = [];

  for (
    let index = 0;
    index < leadingDays;
    index += 1
  ) {
    cells.push(null);
  }

  for (
    let day = 1;
    day <=
    daysInMonth;
    day += 1
  ) {
    cells.push(
      `${year}-${String(
        month,
      ).padStart(
        2,
        "0",
      )}-${String(
        day,
      ).padStart(
        2,
        "0",
      )}`,
    );
  }

  while (
    cells.length % 7 !==
    0
  ) {
    cells.push(null);
  }

  return cells;
}

function formatDate(
  date: string,
) {
  const [
    year,
    month,
    day,
  ] = date.split("-");

  return year &&
    month &&
    day
    ? `${day}/${month}/${year}`
    : date;
}

function isSopFinished(
  session:
    | SopSession
    | undefined,
) {
  return (
    session?.completed_steps?.[
      "8"
    ] === true
  );
}

function buildStats(
  trades: Trade[],
): DayStats | undefined {
  if (
    trades.length ===
    0
  ) {
    return undefined;
  }

  const metricTrades =
    trades.map(
      (trade) => ({
        id: trade.id,
        trade_date:
          trade.trade_date,
        created_at:
          trade.created_at,
        r: trade.r,
        setup_quality:
          trade.setup_quality,
        emotion:
          trade.emotion,
      }),
    );

  const performance =
    calculatePerformanceMetrics(
      metricTrades,
    );

  const totalR =
    performance.netR;

  const validSetup =
    trades.every(
      (trade) =>
        String(
          trade.setup_quality ??
            "",
        ).trim() !== "C",
    );

  const onlyOneTrade =
    trades.length ===
    1;

  let didNotRecoverLosses =
    true;

  for (
    let index = 0;
    index <
    trades.length - 1;
    index += 1
  ) {
    if (
      Number(
        trades[index]
          .r ?? 0,
      ) < 0
    ) {
      didNotRecoverLosses =
        false;

      break;
    }
  }

  return {
    trades:
      trades.length,
    totalR,
    validSetup,
    onlyOneTrade,
    didNotRecoverLosses,
  };
}

function getMentalStateFromTrades(
  trades: Trade[],
  fallback:
    | string
    | null,
) {
  const emotions =
    trades
      .map(
        (trade) =>
          trade.emotion,
      )
      .filter(
        (
          emotion,
        ): emotion is string =>
          Boolean(
            emotion &&
              emotion.trim(),
          ),
      )
      .map(
        (emotion) =>
          emotion.trim(),
      );

  if (
    emotions.length ===
    0
  ) {
    return (
      fallback ??
      "Sin registrar"
    );
  }

  const uniqueEmotions =
    [
      ...new Set(
        emotions,
      ),
    ];

  if (
    uniqueEmotions.length ===
    1
  ) {
    return (
      uniqueEmotions[0] ??
      "Sin registrar"
    );
  }

  return "Mixto";
}

function BooleanBadge({
  value,
}: {
  value: boolean;
}) {
  return (
    <span
      className={`inline-flex min-w-[58px] justify-center rounded-md border px-2 py-1 text-[10px] font-bold ${
        value
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/30 bg-red-500/10 text-red-400"
      }`}
    >
      {value
        ? "Sí"
        : "No"}
    </span>
  );
}

function NeutralBadge() {
  return (
    <span className="inline-flex min-w-[58px] justify-center rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-[10px] font-bold text-gray-600">
      —
    </span>
  );
}

function Metric({
  label,
  value,
  green,
}: {
  label: string;
  value: string;
  green?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--surface-2)] p-5">
      <div className="text-[9px] font-bold tracking-[0.18em] text-gray-600">
        {label}
      </div>

      <div
        className={`mt-2 text-2xl font-bold ${
          green
            ? "text-emerald-400"
            : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function TradingDaysPage() {
  const [
    days,
    setDays,
  ] = useState<
    TradingDay[]
  >([]);

  const [
    trades,
    setTrades,
  ] = useState<
    Trade[]
  >([]);

  const [
    sopSessions,
    setSopSessions,
  ] = useState<
    SopSession[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    deletingId,
    setDeletingId,
  ] = useState<
    string | null
  >(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    showForm,
    setShowForm,
  ] = useState(false);

  const [
    date,
    setDate,
  ] = useState(
    getLocalDate(),
  );

  const [
    mentalState,
    setMentalState,
  ] = useState(
    "😌 Tranquilo",
  );

  const [
    notes,
    setNotes,
  ] = useState("");

  /*
   * ==========================================================
   * CALENDARIO
   * ==========================================================
   */

  const [
    calendarMonth,
    setCalendarMonth,
  ] = useState(
    getMonthStart(
      getLocalDate(),
    ),
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState<
    string | null
  >(getLocalDate());

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const data =
        await tradingDaysApi<{
          days?: TradingDay[];
          trades?: SupabaseTradeRow[];
          sopSessions?: SopSession[];
        }>();

      const normalizedTrades =
        (
          data.trades ??
          []
        ).map(
          (trade) => ({
            id:
              trade.id,
            trade_date:
              trade.trade_date,
            r:
              trade.r,
            setup_quality:
              trade.setup_quality,
            emotion:
              trade.emotion,
            created_at:
              trade.created_at,
          }),
        );

      setDays(
        data.days ?? [],
      );

      setTrades(
        normalizedTrades,
      );

      setSopSessions(
        data.sopSessions ?? [],
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los Trading Days.",
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
      window.clearTimeout(
        timer,
      );
    };
  }, []);

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

  const statsByDate =
    useMemo(() => {
      const map: Record<
        string,
        DayStats
      > = {};

      for (const [
        tradeDate,
        dayTrades,
      ] of tradesByDate.entries()) {
        const stats =
          buildStats(
            dayTrades,
          );

        if (stats) {
          map[tradeDate] =
            stats;
        }
      }

      return map;
    }, [
      tradesByDate,
    ]);

  const sopMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          SopSession
        >();

      for (const session of sopSessions) {
        map.set(
          session.session_date,
          session,
        );
      }

      return map;
    }, [sopSessions]);

  function isClosedBySop(
    dayDate: string,
  ) {
    const session =
      sopMap.get(
        dayDate,
      );

    if (session) {
      return isSopFinished(
        session,
      );
    }

    const legacyDay =
      days.find(
        (day) =>
          day.date ===
          dayDate,
      );

    return Boolean(
      legacyDay
        ?.session_finished,
    );
  }

  const evaluatedDays =
    useMemo(
      () =>
        days.filter(
          (day) =>
            Boolean(
              statsByDate[
                day.date
              ],
            ),
        ),
      [
        days,
        statsByDate,
      ],
    );

  const processDays =
    evaluatedDays.filter(
      (day) =>
        isProcessAdherent(
          {
            date:
              day.date,
            waited_for_setup:
              day.waited_for_setup,
            only_one_trade:
              day.only_one_trade,
            did_not_recover_losses:
              day.did_not_recover_losses,
            session_finished:
              isClosedBySop(
                day.date,
              ),
          },
        ),
    ).length;

  const processPercentage =
    evaluatedDays.length >
    0
      ? Math.round(
          (processDays /
            evaluatedDays.length) *
            100,
        )
      : 0;

  const totalR =
    trades.reduce(
      (sum, trade) =>
        sum +
        Number(
          trade.r ?? 0,
        ),
      0,
    );

  const profitableDays =
    evaluatedDays.filter(
      (day) =>
        (
          statsByDate[
            day.date
          ]?.totalR ??
          0
        ) > 0,
    ).length;

  /*
   * ==========================================================
   * CALENDARIO — DATOS DERIVADOS
   * ==========================================================
   */

  const calendarCells =
    useMemo(
      () =>
        getCalendarCells(
          calendarMonth,
        ),
      [calendarMonth],
    );

  const selectedDay =
    selectedDate
      ? days.find(
          (day) =>
            day.date ===
            selectedDate,
        )
      : undefined;

  const selectedTrades =
    selectedDate
      ? tradesByDate.get(
          selectedDate,
        ) ?? []
      : [];

  const selectedStats =
    selectedDate
      ? statsByDate[
          selectedDate
        ]
      : undefined;

  const selectedMentalState =
    selectedDate
      ? getMentalStateFromTrades(
          selectedTrades,
          selectedDay?.mental_state ??
            null,
        )
      : "Sin registrar";

  const selectedClosed =
    selectedDate
      ? isClosedBySop(
          selectedDate,
        )
      : false;

  const selectedProcess =
    selectedDate &&
    selectedStats
      ? isProcessAdherent({
          date:
            selectedDate,
          waited_for_setup:
            selectedDay
              ?.waited_for_setup ??
            false,
          only_one_trade:
            selectedStats.onlyOneTrade,
          did_not_recover_losses:
            selectedStats.didNotRecoverLosses,
          session_finished:
            selectedClosed,
        })
      : false;

  function handleCalendarDayClick(
    calendarDate: string,
  ) {
    setSelectedDate(
      calendarDate,
    );
    setDate(
      calendarDate,
    );
  }

  function handleEditDay(
    day: TradingDay,
  ) {
    const dayTrades =
      tradesByDate.get(
        day.date,
      ) ?? [];

    const derivedMentalState =
      getMentalStateFromTrades(
        dayTrades,
        day.mental_state,
      );

    setDate(
      day.date,
    );

    setSelectedDate(
      day.date,
    );

    setMentalState(
      derivedMentalState,
    );

    setNotes(
      day.notes ??
        "",
    );

    setError("");
    setSuccess("");

    setShowForm(
      true,
    );
  }

  async function handleSubmit(
    event: FormEvent,
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const stats =
        statsByDate[
          date
        ];

      const sopFinished =
        isClosedBySop(
          date,
        );

      const sopSession =
        sopMap.get(
          date,
        );

      const payload = {
        date,
        /*
         * mental_state se mantiene fuera
         * de la escritura. Trading Journal
         * es la fuente de verdad de emoción.
         */
        waited_for_setup:
          Boolean(
            sopSession
              ?.completed_steps?.[
              "4"
            ],
          ),
        only_one_trade:
          stats?.onlyOneTrade ??
          false,
        did_not_recover_losses:
          stats?.didNotRecoverLosses ??
          true,
        session_finished:
          sopFinished,
        notes:
          notes.trim() ||
          null,
      };

      const existing =
        days.find(
          (day) =>
            day.date ===
            date,
        );

      await tradingDaysApi(
        {
          method:
            existing
              ? "PATCH"
              : "POST",
          body:
            existing
              ? {
                  ...payload,
                  id: existing.id,
                }
              : payload,
        },
      );

      setShowForm(
        false,
      );

      setNotes("");

      setSelectedDate(
        date,
      );

      setSuccess(
        "Trading Day guardado correctamente.",
      );

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Error guardando Trading Day.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDay(
    day: TradingDay,
  ) {
    const confirmed =
      window.confirm(
        `¿Eliminar el Trading Day del ${formatDate(
          day.date,
        )}?\\n\\nEsto elimina la jornada y su sesión SOP, pero NO elimina los trades asociados.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(
        day.id,
      );

      setError("");
      setSuccess("");

      await tradingDaysApi(
        {
          method:
            "DELETE",
          query:
            `?id=${encodeURIComponent(
              day.id,
            )}`,
        },
      );

      setSuccess(
        "Trading Day eliminado correctamente. Los trades se conservaron.",
      );

      if (
        selectedDate ===
        day.date
      ) {
        setSelectedDate(
          null,
        );
      }

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el Trading Day.",
      );
    } finally {
      setDeletingId(
        null,
      );
    }
  }

  function openNewDay(
    initialDate?: string,
  ) {
    const targetDate =
      initialDate ??
      getLocalDate();

    const targetTrades =
      tradesByDate.get(
        targetDate,
      ) ?? [];

    setDate(
      targetDate,
    );

    setSelectedDate(
      targetDate,
    );

    setMentalState(
      getMentalStateFromTrades(
        targetTrades,
        "😌 Tranquilo",
      ),
    );

    setNotes("");

    setError("");
    setSuccess("");

    setShowForm(
      true,
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] text-white">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <div className="mb-6 flex items-end justify-between gap-6">
          <div>
            <div className="mb-2 text-xs font-bold tracking-[0.25em] text-emerald-400">
              TRADING DAYS
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              openNewDay()
            }
            className="shrink-0 rounded-lg border border-emerald-500 bg-emerald-500/10 px-5 py-3 font-semibold text-emerald-400 transition hover:bg-emerald-500 hover:text-black"
          >
            Nuevo día
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-400">
            {success}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric
            label="DÍAS REGISTRADOS"
            value={String(
              days.length,
            )}
          />

          <Metric
            label="DÍAS EVALUADOS"
            value={String(
              evaluatedDays.length,
            )}
          />

          <Metric
            label="ADHERENCIA AL PROCESO"
            value={`${processPercentage}%`}
            green
          />

          <Metric
            label="R ACUMULADO"
            value={`${
              totalR >=
              0
                ? "+"
                : ""
            }${totalR.toFixed(
              2,
            )}R`}
          />
        </div>

        <section className="mb-6 rounded-xl border border-white/10 bg-[var(--surface-2)] px-5 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[9px] font-bold tracking-[0.2em] text-emerald-400">
                PROCESO
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-center">
                <div className="text-[9px] font-bold tracking-widest text-gray-600">
                  DÍAS +
                </div>

                <div className="mt-1 text-lg font-bold text-emerald-400">
                  {profitableDays}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-center">
                <div className="text-[9px] font-bold tracking-widest text-gray-600">
                  DÍAS ADHERENTES
                </div>

                <div className="mt-1 text-lg font-bold text-white">
                  {processDays}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-center">
                <div className="text-[9px] font-bold tracking-widest text-gray-600">
                  ADHERENCIA
                </div>

                <div className="mt-1 text-lg font-bold text-emerald-400">
                  {processPercentage}%
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            CALENDARIO
            ===================================================== */}

        <section className="mb-6 overflow-hidden rounded-xl border border-white/10 bg-[var(--surface-2)]">
          <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[9px] font-bold tracking-[0.2em] text-emerald-400">
                CALENDARIO
              </div>

              <h2 className="mt-1 text-lg font-bold capitalize">
                {getMonthLabel(
                  calendarMonth,
                )}
              </h2>

            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth(
                    addMonths(
                      calendarMonth,
                      -1,
                    ),
                  )
                }
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition hover:border-white/20 hover:text-white"
              >
                ←
              </button>

              <button
                type="button"
                onClick={() => {
                  const today =
                    getLocalDate();

                  setCalendarMonth(
                    getMonthStart(
                      today,
                    ),
                  );

                  setSelectedDate(
                    today,
                  );
                }}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-gray-400 transition hover:border-white/20 hover:text-white"
              >
                Hoy
              </button>

              <button
                type="button"
                onClick={() =>
                  setCalendarMonth(
                    addMonths(
                      calendarMonth,
                      1,
                    ),
                  )
                }
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition hover:border-white/20 hover:text-white"
              >
                →
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-white/10">
            {[
              "DOM",
              "LUN",
              "MAR",
              "MIÉ",
              "JUE",
              "VIE",
              "SÁB",
            ].map(
              (label) => (
                <div
                  key={
                    label
                  }
                  className="border-r border-white/5 px-2 py-3 text-center text-[9px] font-bold tracking-widest text-gray-600 last:border-r-0"
                >
                  {label}
                </div>
              ),
            )}
          </div>

          <div className="grid grid-cols-7">
            {calendarCells.map(
              (
                calendarDate,
                index,
              ) => {
                if (
                  !calendarDate
                ) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="min-h-[96px] border-b border-r border-white/5 bg-[var(--surface)]/40"
                    />
                  );
                }

                const day =
                  days.find(
                    (item) =>
                      item.date ===
                      calendarDate,
                  );

                const dayTrades =
                  tradesByDate.get(
                    calendarDate,
                  ) ?? [];

                const stats =
                  statsByDate[
                    calendarDate
                  ];

                const hasData =
                  Boolean(
                    day ||
                      stats ||
                      dayTrades.length,
                  );

                const mental =
                  getMentalStateFromTrades(
                    dayTrades,
                    day?.mental_state ??
                      null,
                  );

                const closed =
                  isClosedBySop(
                    calendarDate,
                  );

                const process =
                  Boolean(
                    day &&
                      stats &&
                      isProcessAdherent(
                        {
                          date:
                            calendarDate,
                          waited_for_setup:
                            day.waited_for_setup,
                          only_one_trade:
                            stats.onlyOneTrade,
                          did_not_recover_losses:
                            stats.didNotRecoverLosses,
                          session_finished:
                            closed,
                        },
                      ),
                  );

                const isSelected =
                  selectedDate ===
                  calendarDate;

                const isToday =
                  calendarDate ===
                  getLocalDate();

                const totalRForDay =
                  stats?.totalR ??
                  0;

                return (
                  <button
                    key={
                      calendarDate
                    }
                    type="button"
                    onClick={() =>
                      handleCalendarDayClick(
                        calendarDate,
                      )
                    }
                    className={`relative min-h-[96px] border-b border-r border-white/5 p-2.5 text-left transition hover:bg-white/[0.035] ${
                      isSelected
                        ? "bg-emerald-500/[0.07] ring-1 ring-inset ring-emerald-500/40"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                          isToday
                            ? "bg-emerald-500 text-black"
                            : isSelected
                              ? "text-emerald-400"
                              : "text-gray-400"
                        }`}
                      >
                        {Number(
                          calendarDate.slice(
                            8,
                          ),
                        )}
                      </span>

                      {hasData && (
                        <span
                          className={`h-2 w-2 rounded-full ${
                            process
                              ? "bg-emerald-400"
                              : stats
                                ? "bg-red-400"
                                : "bg-gray-500"
                          }`}
                        />
                      )}
                    </div>

                    {hasData && (
                      <div className="mt-2 space-y-1.5">
                        <div
                          className={`text-xs font-bold ${
                            totalRForDay >
                            0
                              ? "text-emerald-400"
                              : totalRForDay <
                                  0
                                ? "text-red-400"
                                : "text-gray-400"
                          }`}
                        >
                          {stats
                            ? `${
                                totalRForDay >=
                                0
                                  ? "+"
                                  : ""
                              }${totalRForDay.toFixed(
                                2,
                              )}R`
                            : "—"}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {stats && (
                            <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[8px] font-semibold text-gray-500">
                              {stats.trades}{" "}
                              {stats.trades ===
                              1
                                ? "trade"
                                : "trades"}
                            </span>
                          )}

                          {closed && (
                            <span className="rounded border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400">
                              Cerrado
                            </span>
                          )}
                        </div>

                        <div className="truncate text-[9px] text-gray-600">
                          {mental}
                        </div>
                      </div>
                    )}
                  </button>
                );
              },
            )}
          </div>

          <div className="flex flex-wrap items-center gap-5 border-t border-white/10 px-5 py-3">
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Proceso adherente
            </div>

            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              Hubo trades / desviación
            </div>

            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span className="h-2 w-2 rounded-full bg-gray-500" />
              Jornada registrada
            </div>
          </div>
        </section>

        {/* =====================================================
            DETALLE DEL DÍA SELECCIONADO
            ===================================================== */}

        {selectedDate && (
          <section className="mb-6 rounded-xl border border-white/10 bg-[var(--surface-2)]">
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[9px] font-bold tracking-[0.2em] text-emerald-400">
                  JORNADA SELECCIONADA
                </div>

                <h2 className="mt-1 text-xl font-bold">
                  {formatDate(
                    selectedDate,
                  )}
                </h2>
              </div>

              <div className="flex gap-2">
                {selectedDay && (
                  <button
                    type="button"
                    onClick={() =>
                      handleEditDay(
                        selectedDay,
                      )
                    }
                    className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-gray-400 transition hover:border-white/20 hover:text-white"
                  >
                    Editar jornada
                  </button>
                )}

                {!selectedDay &&
                  selectedTrades.length >
                    0 && (
                    <button
                      type="button"
                      onClick={() =>
                        openNewDay(
                          selectedDate,
                        )
                      }
                      className="rounded-lg border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500 hover:text-black"
                    >
                      Registrar jornada
                    </button>
                  )}
              </div>
            </div>

            {selectedTrades.length ===
              0 &&
            !selectedDay ? (
              <div className="px-5 py-10 text-center">
                <div className="text-sm font-semibold text-gray-400">
                  No hay actividad registrada este día.
                </div>

                <p className="mt-2 text-xs text-gray-600">
                  Puedes registrar una jornada manualmente.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-[var(--surface)] p-3">
                  <div className="text-[9px] font-bold tracking-widest text-gray-600">
                    R DEL DÍA
                  </div>

                  <div
                    className={`mt-2 text-xl font-bold ${
                      (selectedStats?.totalR ??
                        0) >
                      0
                        ? "text-emerald-400"
                        : (selectedStats?.totalR ??
                              0) <
                            0
                          ? "text-red-400"
                          : "text-gray-400"
                    }`}
                  >
                    {selectedStats
                      ? `${
                          selectedStats.totalR >=
                          0
                            ? "+"
                            : ""
                        }${selectedStats.totalR.toFixed(
                          2,
                        )}R`
                      : "0.00R"}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[var(--surface)] p-3">
                  <div className="text-[9px] font-bold tracking-widest text-gray-600">
                    TRADES
                  </div>

                  <div className="mt-2 text-lg font-bold text-white">
                    {
                      selectedTrades.length
                    }
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[var(--surface)] p-3">
                  <div className="text-[9px] font-bold tracking-widest text-gray-600">
                    ESTADO MENTAL
                  </div>

                  <div className="mt-2 truncate text-sm font-semibold text-gray-300">
                    {
                      selectedMentalState
                    }
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[var(--surface)] p-3">
                  <div className="text-[9px] font-bold tracking-widest text-gray-600">
                    PROCESO
                  </div>

                  <div
                    className={`mt-2 text-sm font-bold ${
                      selectedProcess
                        ? "text-emerald-400"
                        : selectedStats
                          ? "text-red-400"
                          : "text-gray-600"
                    }`}
                  >
                    {selectedStats
                      ? selectedProcess
                        ? "Adherente"
                        : "No adherente"
                      : "Sin evaluación"}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* =====================================================
            HISTORIAL
            ===================================================== */}

        <section className="w-full overflow-hidden rounded-xl border border-white/10 bg-[var(--surface-2)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-[9px] font-bold tracking-[0.2em] text-emerald-400">
                HISTORIAL
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-gray-500">
              Cargando...
            </div>
          ) : days.length ===
            0 ? (
            <div className="p-10 text-center text-gray-500">
              No hay Trading Days registrados.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[9px] tracking-[0.08em] text-gray-500">
                    <th className="px-4 py-3">
                      FECHA
                    </th>

                    <th className="px-3 py-3">
                      ESTADO
                    </th>

                    <th className="px-3 py-3">
                      TRADES
                    </th>

                    <th className="px-3 py-3">
                      R
                    </th>

                    <th className="px-2 py-3 text-center">
                      SETUP
                    </th>

                    <th className="px-2 py-3 text-center">
                      1 TRADE
                    </th>

                    <th className="px-2 py-3 text-center">
                      NO RECUP.
                    </th>

                    <th className="px-2 py-3 text-center">
                      CIERRE
                    </th>

                    <th className="px-2 py-3 text-center">
                      PROCESO
                    </th>

                    <th className="px-4 py-4 text-center">
                      ACCIÓN
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {days.map(
                    (day) => {
                      const dayTrades =
                        tradesByDate.get(
                          day.date,
                        ) ?? [];

                      const stats =
                        statsByDate[
                          day.date
                        ];

                      const hasTrades =
                        Boolean(
                          stats,
                        );

                      const closed =
                        isClosedBySop(
                          day.date,
                        );

                      const processAdherent =
                        hasTrades &&
                        isProcessAdherent(
                          {
                            date:
                              day.date,
                            waited_for_setup:
                              day.waited_for_setup,
                            only_one_trade:
                              stats?.onlyOneTrade ??
                              day.only_one_trade,
                            did_not_recover_losses:
                              stats?.didNotRecoverLosses ??
                              day.did_not_recover_losses,
                            session_finished:
                              closed,
                          },
                        );

                      const mentalState =
                        getMentalStateFromTrades(
                          dayTrades,
                          day.mental_state,
                        );

                      const r =
                        stats?.totalR ??
                        0;

                      return (
                        <tr
                          key={
                            day.id
                          }
                          className="border-b border-white/5 text-xs transition hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-4 font-medium">
                            {formatDate(
                              day.date,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            <span
                              className={
                                mentalState ===
                                "Sin registrar"
                                  ? "text-gray-600"
                                  : "text-gray-300"
                              }
                            >
                              {
                                mentalState
                              }
                            </span>
                          </td>

                          <td className="px-3 py-4 font-semibold">
                            {stats?.trades ??
                              0}
                          </td>

                          <td
                            className={`px-3 py-4 font-semibold ${
                              !stats
                                ? "text-gray-500"
                                : r >
                                    0
                                  ? "text-emerald-400"
                                  : r <
                                      0
                                    ? "text-red-400"
                                    : "text-gray-400"
                            }`}
                          >
                            {stats
                              ? `${
                                  r >=
                                  0
                                    ? "+"
                                    : ""
                                }${r.toFixed(
                                  2,
                                )}R`
                              : "—"}
                          </td>

                          <td className="px-2 py-3 text-center">
                            {hasTrades ? (
                              <BooleanBadge
                                value={
                                  stats.validSetup
                                }
                              />
                            ) : (
                              <NeutralBadge />
                            )}
                          </td>

                          <td className="px-2 py-3 text-center">
                            {hasTrades ? (
                              <BooleanBadge
                                value={
                                  stats.onlyOneTrade
                                }
                              />
                            ) : (
                              <NeutralBadge />
                            )}
                          </td>

                          <td className="px-2 py-3 text-center">
                            {hasTrades ? (
                              <BooleanBadge
                                value={
                                  stats.didNotRecoverLosses
                                }
                              />
                            ) : (
                              <NeutralBadge />
                            )}
                          </td>

                          <td className="px-2 py-3 text-center">
                            <BooleanBadge
                              value={
                                closed
                              }
                            />
                          </td>

                          <td className="px-2 py-3 text-center">
                            {hasTrades ? (
                              <BooleanBadge
                                value={
                                  processAdherent
                                }
                              />
                            ) : (
                              <NeutralBadge />
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  handleEditDay(
                                    day,
                                  )
                                }
                                disabled={
                                  deletingId ===
                                  day.id
                                }
                                className="rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleDeleteDay(
                                    day,
                                  )
                                }
                                disabled={
                                  deletingId ===
                                  day.id
                                }
                                className="rounded-md border border-red-500/40 px-2.5 py-1.5 text-[10px] font-semibold text-red-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingId ===
                                day.id
                                  ? "..."
                                  : "Eliminar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* =====================================================
            FORMULARIO
            ===================================================== */}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <form
              onSubmit={
                handleSubmit
              }
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-[#17191a]"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                <div>
                  <div className="text-xs font-bold tracking-widest text-emerald-400">
                    TRADING DAY
                  </div>

                  <h2 className="mt-1 text-2xl font-bold">
                    {days.some(
                      (day) =>
                        day.date ===
                        date,
                    )
                      ? "Editar día"
                      : "Nuevo día"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowForm(
                      false,
                    )
                  }
                  className="rounded-md border border-white/10 px-3 py-2 text-xs text-gray-400 transition hover:text-white"
                >
                  Cerrar
                </button>
              </div>

              <div className="space-y-5 px-6 py-6">
                <div>
                  <label className="mb-2 block text-xs font-bold tracking-widest text-gray-400">
                    FECHA
                  </label>

                  <input
                    type="date"
                    value={
                      date
                    }
                    onChange={(
                      event,
                    ) =>
                      setDate(
                        event.target.value,
                      )
                    }
                    className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-white"
                    required
                  />
                </div>

                <div className="rounded-lg border border-white/10 bg-[var(--surface)] p-3">
                  <div className="text-xs font-bold tracking-widest text-gray-400">
                    ESTADO MENTAL
                  </div>

                  <div className="mt-2 text-xs text-gray-600">
                    Fuente principal:
                    Trading Journal →
                    emoción del trade.
                  </div>

                  <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
                    {getMentalStateFromTrades(
                      tradesByDate.get(
                        date,
                      ) ?? [],
                      mentalState,
                    )}
                  </div>

                  <p className="mt-3 text-xs leading-5 text-gray-600">
                    Trading Days refleja la
                    emoción registrada en el
                    Journal. El campo legacy
                    de estado mental se mantiene
                    solamente para compatibilidad
                    con la estructura existente.
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[var(--surface)] p-3">
                  <div className="text-xs font-bold tracking-widest text-gray-400">
                    CIERRE DE JORNADA
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-300">
                      Se determina automáticamente
                      desde Trading Office.
                    </span>

                    <BooleanBadge
                      value={
                        isClosedBySop(
                          date,
                        )
                      }
                    />
                  </div>

                  <p className="mt-3 text-xs leading-5 text-gray-500">
                    Trading Days no decide
                    manualmente cuándo termina
                    una jornada. El SOP de Trading
                    Office es la fuente de verdad.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold tracking-widest text-gray-400">
                    NOTAS
                  </label>

                  <textarea
                    value={
                      notes
                    }
                    onChange={(
                      event,
                    ) =>
                      setNotes(
                        event.target.value,
                      )
                    }
                    className="min-h-[120px] w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-white"
                    placeholder="Observaciones de la jornada..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5">
                <button
                  type="button"
                  onClick={() =>
                    setShowForm(
                      false,
                    )
                  }
                  disabled={
                    saving
                  }
                  className="rounded-lg border border-white/10 px-5 py-3 text-sm font-semibold text-gray-400 transition hover:text-white disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={
                    saving
                  }
                  className="rounded-lg border border-emerald-500 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500 hover:text-black disabled:opacity-50"
                >
                  {saving
                    ? "Guardando..."
                    : "Guardar Trading Day"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}