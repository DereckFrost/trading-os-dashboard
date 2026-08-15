"use client";

import { useRouter } from "next/navigation";
import { ScreenshotPasteField } from "@/app/components/screenshot-paste-field";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  calculateExecutionAverage,
  calculatePerformanceMetrics,
} from "@/app/lib/metrics";

type Setup = {
  id: string;
  name: string;
  active: boolean;
};

type Trade = {
  id: string;
  title: string | null;
  trading_day_id: string | null;
  setup_id: string | null;
  trade_date: string;
  instrument: string;
  direction: string;
  setup_quality: string | null;
  execution_quality: string | null;
  emotion: string | null;
  close_type: string | null;
  r: number | null;
  before_screenshot_url: string | null;
  after_screenshot_url: string | null;
  notes: string | null;
  created_at?: string | null;
};

type OfficeResponse = {
  entryGate?: {
    validated?: boolean;
  };

  entryValidation?: {
    setupId?: string;
    setupQuality?: string;
  };
};

const closeOptions = [
  {
    value: "🟢 TP",
    label: "TP",
  },
  {
    value: "🔴 SL",
    label: "SL",
  },
  {
    value: "PARCIAL",
    label: "PARCIAL",
  },
  {
    value: "⚪ BE",
    label: "BE",
  },
];

const executionOptions = [
  "Excelente",
  "Buena",
  "Regular",
  "Mala",
];

const setupQualityOptions = [
  "A+",
  "B+",
  "B",
  "C",
];

const emotionOptions = [
  "Calma",
  "Neutral",
  "Ansiedad",
  "Frustración",
  "FOMO",
  "Miedo",
  "Euforia",
];

function getLocalDateKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function formatDate(
  date: string,
) {
  if (!date) {
    return "—";
  }

  const [
    year,
    month,
    day,
  ] = date.split("-");

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

function formatR(
  value: number | null,
) {
  if (
    value === null ||
    Number.isNaN(value)
  ) {
    return "0.00R";
  }

  const sign =
    value > 0 ? "+" : "";

  return `${sign}${value.toFixed(
    2,
  )}R`;
}

function getResultLabel(
  closeType: string | null,
  r: number | null,
) {
  if (closeType === "🟢 TP") {
    return "GANADOR";
  }

  if (closeType === "🔴 SL") {
    return "PÉRDIDA";
  }

  if (closeType === "PARCIAL") {
    return "PARCIAL";
  }

  if (closeType === "⚪ BE") {
    return "BREAK EVEN";
  }

  if (
    r !== null &&
    r > 0
  ) {
    return "GANADOR";
  }

  if (
    r !== null &&
    r < 0
  ) {
    return "PÉRDIDA";
  }

  return "—";
}

function getResultClass(
  closeType: string | null,
  r: number | null,
) {
  const result =
    getResultLabel(
      closeType,
      r,
    );

  if (result === "GANADOR") {
    return "result win";
  }

  if (result === "PÉRDIDA") {
    return "result loss";
  }

  if (result === "PARCIAL") {
    return "result partial";
  }

  if (result === "BREAK EVEN") {
    return "result be";
  }

  return "result";
}

function getQualityClass(
  value: string | null,
) {
  if (value === "A+") {
    return "quality quality-aplus";
  }

  if (value === "B+") {
    return "quality quality-bplus";
  }

  if (value === "B") {
    return "quality quality-b";
  }

  if (value === "C") {
    return "quality quality-c";
  }

  return "quality";
}

async function supabaseFetch<T>(
  table: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  const { supabaseBrowserFetch } = await import("@/app/lib/supabase/browser-fetch");
  return supabaseBrowserFetch<T>(table, options.query ?? "", {
    method: options.method ?? "GET",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    headers: options.method === "POST" ? { Prefer: "return=representation" } : { Prefer: "return=minimal" },
  });
}

export function TradingJournal() {
  const router = useRouter();
  const [
    trades,
    setTrades,
  ] = useState<Trade[]>(
    [],
  );

  const [
    setups,
    setSetups,
  ] = useState<Setup[]>(
    [],
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    showNewTrade,
    setShowNewTrade,
  ] = useState(false);

  const [
    editingTradeId,
    setEditingTradeId,
  ] = useState<
    string | null
  >(null);

  const [
    deletingTradeId,
    setDeletingTradeId,
  ] = useState<
    string | null
  >(null);

  const [
    sopReady,
    setSopReady,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    directionFilter,
    setDirectionFilter,
  ] = useState("ALL");

  const [
    qualityFilter,
    setQualityFilter,
  ] = useState("ALL");

  const [
    resultFilter,
    setResultFilter,
  ] = useState("ALL");

  const [
    form,
    setForm,
  ] = useState({
    trade_date:
      getLocalDateKey(),

    instrument:
      "US100",

    direction:
      "LONG",

    setup_id:
      "",

    setup_quality:
      "B",

    execution_quality:
      "Excelente",

    emotion:
      "Calma",

    close_type:
      "🔴 SL",

    r:
      "-1",

    before_screenshot_url:
      "",

    after_screenshot_url:
      "",

    notes:
      "",
  });

  const today =
    getLocalDateKey();

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [
        tradesData,
        setupsData,
        officeResponse,
      ] =
        await Promise.all([
          supabaseFetch<
            Trade[]
          >(
            "trades",
            {
              query:
                "?select=*&order=trade_date.desc,created_at.desc",
            },
          ),

          supabaseFetch<
            Setup[]
          >(
            "setups",
            {
              query:
                "?select=id,name,active&active=eq.true&order=name.asc",
            },
          ),

          fetch(
            `/api/trading-office?date=${today}`,
            {
              cache:
                "no-store",
            },
          ).then(
            (response) =>
              response.json() as Promise<OfficeResponse>,
          ),
        ]);

      setTrades(
        tradesData ??
          [],
      );

      setSetups(
        setupsData ??
          [],
      );

      setSopReady(
        Boolean(
          officeResponse
            ?.entryGate
            ?.validated,
        ),
      );

      /*
       * Deep-link:
       * /journal?edit=<id>
       *
       * Historical trades remain editable.
       * Only today's closed SOP can block.
       */
      const params =
        typeof window !==
        "undefined"
          ? new URLSearchParams(
              window.location.search,
            )
          : null;

      const editTradeId =
        params?.get(
          "edit",
        );

      if (editTradeId) {
        const tradeToEdit =
          (
            tradesData ??
            []
          ).find(
            (trade) =>
              trade.id ===
              editTradeId,
          );

        if (
          tradeToEdit
        ) {
          openEditTrade(
            tradeToEdit,
          );
        }

        window.history.replaceState(
          {},
          "",
          "/journal",
        );
      }

      const openFromSop =
        params?.get(
          "new",
        ) === "1";

      if (
        openFromSop &&
        officeResponse
          ?.entryGate
          ?.validated
      ) {
        setForm(
          (current) => ({
            ...current,

            trade_date:
              today,

            setup_id:
              officeResponse
                .entryValidation
                ?.setupId ??
              current.setup_id,

            setup_quality:
              officeResponse
                .entryValidation
                ?.setupQuality ??
              current.setup_quality,
          }),
        );

        setEditingTradeId(
          null,
        );

        setShowNewTrade(
          true,
        );

        window.history.replaceState(
          {},
          "",
          "/journal",
        );
      }
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los datos.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTrades =
    useMemo(() => {
      return trades.filter(
        (trade) => {
          const setupName =
            setups.find(
              (setup) =>
                setup.id ===
                trade.setup_id,
            )?.name ??
            "";

          const searchText =
            search
              .trim()
              .toLowerCase();

          const matchesSearch =
            !searchText ||
            trade.instrument
              .toLowerCase()
              .includes(
                searchText,
              ) ||
            trade.direction
              .toLowerCase()
              .includes(
                searchText,
              ) ||
            setupName
              .toLowerCase()
              .includes(
                searchText,
              ) ||
            (
              trade.emotion ??
              ""
            )
              .toLowerCase()
              .includes(
                searchText,
              ) ||
            (
              trade.notes ??
              ""
            )
              .toLowerCase()
              .includes(
                searchText,
              );

          const matchesDirection =
            directionFilter ===
              "ALL" ||
            trade.direction ===
              directionFilter;

          const matchesQuality =
            qualityFilter ===
              "ALL" ||
            trade.setup_quality ===
              qualityFilter;

          const result =
            trade.r !==
              null &&
            trade.r > 0
              ? "WIN"
              : trade.r !==
                    null &&
                  trade.r < 0
                ? "LOSS"
                : "OTHER";

          const matchesResult =
            resultFilter ===
              "ALL" ||
            result ===
              resultFilter;

          return (
            matchesSearch &&
            matchesDirection &&
            matchesQuality &&
            matchesResult
          );
        },
      );
    }, [
      trades,
      setups,
      search,
      directionFilter,
      qualityFilter,
      resultFilter,
    ]);

  const metrics =
    useMemo(() => {
      const metricTrades =
        trades.map(
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
          }),
        );

      const performance =
        calculatePerformanceMetrics(
          metricTrades,
        );

      const executionAverage =
        calculateExecutionAverage(
          trades.map(
            (trade) => ({
              execution_quality:
                trade.execution_quality,
            }),
          ),
        );

      return {
        total:
          performance.totalTrades,

        accumulatedR:
          performance.netR,

        wins:
          performance.wins,

        losses:
          performance.losses,

        winRate:
          performance.winRate,

        averageExecution:
          executionAverage,
      };
    }, [trades]);

  function updateForm(
    field: keyof typeof form,
    value: string,
  ) {
    setForm(
      (current) => ({
        ...current,
        [field]:
          value,
      }),
    );
  }

  function handleCloseTypeChange(
    value: string,
  ) {
    let nextR =
      form.r;

    if (
      value === "🔴 SL"
    ) {
      nextR = "-1";
    }

    if (
      value === "⚪ BE"
    ) {
      nextR = "0";
    }

    if (
      value === "🟢 TP" &&
      form.r === "-1"
    ) {
      nextR = "1";
    }

    if (
      value === "PARCIAL" &&
      form.r === "-1"
    ) {
      nextR = "0.5";
    }

    setForm(
      (current) => ({
        ...current,
        close_type:
          value,
        r:
          nextR,
      }),
    );
  }

  function openNewTrade() {
    setError("");
    setSuccess("");

    setEditingTradeId(
      null,
    );

    setForm({
      trade_date:
        today,

      instrument:
        "US100",

      direction:
        "LONG",

      setup_id:
        setups[0]?.id ??
        "",

      setup_quality:
        "B",

      execution_quality:
        "Excelente",

      emotion:
        "Calma",

      close_type:
        "🔴 SL",

      r:
        "-1",

      before_screenshot_url:
        "",

      after_screenshot_url:
        "",

      notes:
        "",
    });

    setShowNewTrade(
      true,
    );
  }

  function openEditTrade(
    trade: Trade,
  ) {
    setError("");
    setSuccess("");

    setEditingTradeId(
      trade.id,
    );

    setForm({
      trade_date:
        trade.trade_date,

      instrument:
        trade.instrument,

      direction:
        trade.direction,

      setup_id:
        trade.setup_id ??
        "",

      setup_quality:
        trade.setup_quality ??
        "B",

      execution_quality:
        trade.execution_quality ??
        "Excelente",

      emotion:
        trade.emotion ??
        "Calma",

      close_type:
        trade.close_type ??
        "⚪ BE",

      r: String(
        trade.r ?? 0,
      ),

      before_screenshot_url:
        trade.before_screenshot_url ??
        "",

      after_screenshot_url:
        trade.after_screenshot_url ??
        "",

      notes:
        trade.notes ??
        "",
    });

    setShowNewTrade(
      true,
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!form.setup_id) {
        throw new Error(
          "Selecciona un setup.",
        );
      }

      if (
        !form.instrument.trim()
      ) {
        throw new Error(
          "Introduce el instrumento.",
        );
      }

      if (!form.trade_date) {
        throw new Error(
          "Selecciona la fecha del trade.",
        );
      }

      /*
       * UI LOCK:
       *
       * SOLO se aplica si:
       *   trade_date === HOY
       *   AND SOP de HOY finalizado
       *
       * Históricos pasan.
       */
      const editingExisting =
        Boolean(
          editingTradeId,
        );

      const isToday =
        form.trade_date ===
        today;

      const numericR =
        Number(form.r);

      if (
        !Number.isFinite(
          numericR,
        )
      ) {
        throw new Error(
          "El valor de R no es válido.",
        );
      }

      const response =
        await fetch(
          "/api/trades",
          {
            method:
              editingExisting
                ? "PATCH"
                : "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                ...(editingExisting
                  ? {
                      id:
                        editingTradeId,
                    }
                  : {}),

                setup_id:
                  form.setup_id,

                trade_date:
                  form.trade_date,

                instrument:
                  form.instrument.trim(),

                direction:
                  form.direction,

                setup_quality:
                  form.setup_quality,

                execution_quality:
                  form.execution_quality,

                emotion:
                  form.emotion,

                close_type:
                  form.close_type,

                r:
                  numericR,

                before_screenshot_url:
                  form.before_screenshot_url.trim() ||
                  null,

                after_screenshot_url:
                  form.after_screenshot_url.trim() ||
                  null,

                notes:
                  form.notes.trim() ||
                  null,

                /*
                 * SOP solamente se aplica
                 * al crear el trade de HOY.
                 */
                ...(!editingExisting &&
                isToday
                  ? {
                      enforce_sop:
                        true,
                    }
                  : {}),
              }),
          },
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "No se pudo guardar el trade.",
        );
      }

      setSuccess(
        editingExisting
          ? "Trade actualizado correctamente."
          : result.sopValidated === true
            ? "Trade registrado y vinculado al SOP de la jornada."
            : isToday
              ? "Trade registrado. La operación queda contabilizada como parte de la ejecución real de la jornada."
              : "Trade histórico registrado correctamente.",
      );

      setShowNewTrade(
        false,
      );

      setEditingTradeId(
        null,
      );

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el trade.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTrade(
    trade: Trade,
  ) {
    const confirmed =
      window.confirm(
        `¿Eliminar el trade de ${formatDate(
          trade.trade_date,
        )} · ${trade.instrument}?\n\nEsta acción no se puede deshacer.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingTradeId(
        trade.id,
      );

      setError("");
      setSuccess("");

      const response =
        await fetch(
          `/api/trades?id=${encodeURIComponent(
            trade.id,
          )}`,
          {
            method:
              "DELETE",
          },
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "No se pudo eliminar el trade.",
        );
      }

      setSuccess(
        "Trade eliminado correctamente.",
      );

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el trade.",
      );
    } finally {
      setDeletingTradeId(
        null,
      );
    }
  }

  return (
    <main className="journal-page">
      <style jsx>{`
        .journal-page {
          min-height: 100vh;
          padding: 52px 32px 80px;
          color: var(--text-primary);
          background: var(--surface);
        }

        .journal-container {
          width: min(1280px, 100%);
          margin: 0 auto;
        }

        .journal-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 30px;
        }

        .eyebrow {
          margin: 0 0 8px;
          color: var(--accent);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 3px;
        }

        h1 {
          margin: 0;
          font-size: 34px;
          line-height: 1.1;
          letter-spacing: -1px;
        }

        .subtitle {
          margin: 10px 0 0;
          color: #8e949d;
          font-size: 14px;
        }

        button {
          font: inherit;
        }

        .primary-button {
          border: 1px solid var(--accent);
          border-radius: 8px;
          padding: 12px 18px;
          color: #00ed9c;
          background: rgba(0, 216, 144, 0.07);
          cursor: pointer;
          font-weight: 700;
        }

        .primary-button:hover {
          background: rgba(0, 216, 144, 0.14);
        }

        .primary-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .alert {
          margin-bottom: 18px;
          border: 1px solid var(--danger-border);
          border-radius: 8px;
          padding: 12px 14px;
          color: #ff899f;
          background: rgba(255, 52, 94, 0.07);
          font-size: 13px;
        }

        .alert.success {
          border-color: #135f48;
          color: #59e3b0;
          background: rgba(0, 216, 144, 0.06);
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }

        .metric {
          border: 1px solid var(--surface-3);
          border-radius: 10px;
          padding: 17px;
          background: var(--surface-2);
        }

        .metric.highlight {
          border-color: rgba(0, 216, 144, 0.25);
        }

        .metric-label {
          color: var(--text-dim);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.8px;
          text-transform: uppercase;
        }

        .metric-value {
          margin-top: 9px;
          font-size: 25px;
          font-weight: 700;
        }

        .filters {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 18px;
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #2c3136;
          border-radius: 7px;
          padding: 11px 12px;
          color: var(--text-primary);
          background: var(--surface);
          outline: none;
        }

        input:focus,
        select:focus,
        textarea:focus {
          border-color: #00b97a;
        }

        textarea {
          min-height: 110px;
          resize: vertical;
        }

        .table-wrap {
          overflow-x: auto;
          border: 1px solid var(--surface-3);
          border-radius: 10px;
          background: var(--surface-2);
        }

        table {
          width: 100%;
          min-width: 1120px;
          border-collapse: collapse;
        }

        th {
          padding: 14px 12px;
          border-bottom: 1px solid var(--surface-3);
          color: var(--text-muted);
          font-size: 9px;
          letter-spacing: 1.5px;
          text-align: left;
        }

        td {
          padding: 15px 12px;
          border-bottom: 1px solid var(--surface-3);
          color: #cdd1d6;
          font-size: 12px;
        }

        tr:hover td {
          background: rgba(255,255,255,0.015);
        }

        .direction {
          display: inline-flex;
          border-radius: 5px;
          padding: 5px 8px;
          border: 1px solid #155b46;
          color: #44dba8;
          background: rgba(0, 216, 144, 0.06);
          font-size: 10px;
          font-weight: 700;
        }

        .r-positive {
          color: #3ce09d;
          font-weight: 700;
        }

        .r-negative {
          color: #ff7087;
          font-weight: 700;
        }

        .r-neutral {
          color: #a0a6ad;
          font-weight: 700;
        }

        .result {
          color: var(--text-dim);
          font-size: 10px;
          font-weight: 700;
        }

        .result.win {
          color: #35d995;
        }

        .result.loss {
          color: var(--danger);
        }

        .result.partial {
          color: #e9b95b;
        }

        .result.be {
          color: #9ba1a8;
        }

        .quality {
          display: inline-flex;
          border-radius: 5px;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 700;
        }

        .quality-aplus {
          border: 1px solid #00a970;
          color: #38dc9c;
          background: rgba(0,216,144,.07);
        }

        .quality-bplus {
          color: #7acfb2;
          background: rgba(70,170,140,.06);
        }

        .quality-b {
          color: #b0b5bb;
          background: rgba(255,255,255,.04);
        }

        .quality-c {
          color: #ff8a9d;
          background: rgba(255,52,94,.05);
        }

        .action-row {
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 6px;
          min-width: max-content;
          white-space: nowrap;
        }

        .action-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 48px;
          height: 32px;
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          padding: 0 10px;
          color: var(--text-secondary);
          background: transparent;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
          text-decoration: none;
          transition:
            background .15s ease,
            border-color .15s ease,
            color .15s ease;
        }

        .action-button:hover {
          background: #202327;
          border-color: #4a5159;
          color: var(--text-primary);
        }

        .action-button:focus-visible {
          outline: 2px solid rgba(0, 216, 144, .45);
          outline-offset: 2px;
        }

        .action-button.danger {
          color: var(--danger);
          border-color: var(--danger-border);
        }

        .action-button.danger:hover {
          background: rgba(255,52,94,.08);
        }

        .locked-action {
          display: inline-flex;
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          padding: 7px 10px;
          color: #727983;
          background: var(--surface);
          font-size: 11px;
          font-weight: 600;
        }

        .empty {
          padding: 60px 20px;
          color: var(--text-muted);
          text-align: center;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0,0,0,.75);
        }

        .modal {
          width: min(820px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          border: 1px solid #2b3035;
          border-radius: 12px;
          background: #17191a;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 22px;
          border-bottom: 1px solid #272c30;
        }

        .modal-title {
          font-size: 18px;
          font-weight: 700;
        }

        .modal-body {
          padding: 22px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        .field {
          display: grid;
          gap: 7px;
        }

        .field.full {
          grid-column: 1 / -1;
        }

        .field label {
          color: var(--text-dim);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.3px;
          text-transform: uppercase;
        }

        .screenshot-field {
          display: grid;
          gap: 8px;
        }

        .screenshot-field-label {
          color: var(--text-dim);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.3px;
          text-transform: uppercase;
        }

        .screenshot-dropzone {
          min-height: 190px;
          overflow: hidden;
          border: 1px dashed var(--border-strong);
          border-radius: 10px;
          background: var(--surface);
          cursor: pointer;
          outline: none;
          transition:
            border-color .15s ease,
            background .15s ease;
        }

        .screenshot-dropzone:hover,
        .screenshot-dropzone:focus,
        .screenshot-dropzone.is-dragging {
          border-color: var(--accent);
          background: rgba(0, 216, 144, .035);
        }

        .screenshot-dropzone.is-disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .screenshot-empty {
          min-height: 190px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 7px;
          padding: 24px;
          color: var(--text-dim);
          text-align: center;
        }

        .screenshot-empty strong {
          color: var(--text-primary);
          font-size: 14px;
        }

        .screenshot-empty span {
          font-size: 12px;
        }

        .screenshot-preview {
          position: relative;
          min-height: 190px;
          background: var(--background);
        }

        .screenshot-preview img {
          display: block;
          width: 100%;
          max-height: 360px;
          object-fit: contain;
        }

        .screenshot-overlay {
          position: absolute;
          inset: auto 0 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          color: var(--text-primary);
          background: linear-gradient(
            transparent,
            rgba(0, 0, 0, .88)
          );
          font-size: 11px;
        }

        .screenshot-clear {
          border: 1px solid #5b3139;
          border-radius: 6px;
          padding: 6px 9px;
          color: #ff8a9c;
          background: rgba(255, 52, 94, .06);
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
        }

        .screenshot-clear:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          padding: 18px 22px;
          border-top: 1px solid #272c30;
        }

        .cancel-button {
          border: 1px solid var(--border-strong);
          border-radius: 7px;
          padding: 11px 17px;
          color: #adb3ba;
          background: transparent;
          cursor: pointer;
          font-weight: 600;
        }

        .save-button {
          border: 1px solid var(--accent);
          border-radius: 7px;
          padding: 11px 19px;
          color: #06150f;
          background: var(--accent);
          cursor: pointer;
          font-weight: 700;
        }

        .save-button:disabled,
        .cancel-button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        @media (max-width: 1000px) {
          .metrics {
            grid-template-columns: repeat(3, 1fr);
          }

          .filters {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .journal-page {
            padding: 30px 16px 60px;
          }

          .journal-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .metrics {
            grid-template-columns: 1fr 1fr;
          }

          .filters {
            grid-template-columns: 1fr;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .field.full {
            grid-column: auto;
          }
        }
      `}</style>

      <div className="journal-container">
        <header className="journal-header">
          <div>
            <p className="eyebrow">
              TRADING JOURNAL
            </p>
          </div>

          <button
            className="primary-button"
            onClick={
              openNewTrade
            }
          >
            + Nuevo trade
          </button>
        </header>

        <div
          className={`alert ${
            sopReady
              ? "success"
              : ""
          }`}
        >
          {sopReady
            ? "Entrada validada en Trading Office. El Journal está listo para registrar la operación de hoy."
            : "El Journal registra todas las operaciones reales. La primera operación del día requiere validación del SOP desde Trading Office; las operaciones posteriores también pueden registrarse para medir cualquier ruptura de reglas."}
        </div>

        {error && (
          <div className="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="alert success">
            {success}
          </div>
        )}

        <section className="metrics">
          <div className="metric">
            <div className="metric-label">
              Trades
            </div>

            <div className="metric-value">
              {metrics.total}
            </div>
          </div>

          <div className="metric highlight">
            <div className="metric-label">
              R acumulado
            </div>

            <div className="metric-value">
              {formatR(
                metrics.accumulatedR,
              )}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">
              Win Rate
            </div>

            <div className="metric-value">
              {metrics.winRate}%
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">
              Ejecución media
            </div>

            <div className="metric-value">
              {metrics.averageExecution}/100
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">
              W / L
            </div>

            <div className="metric-value">
              {metrics.wins} /{" "}
              {metrics.losses}
            </div>
          </div>
        </section>

        <section className="filters">
          <input
            type="text"
            placeholder="Buscar trade..."
            value={search}
            onChange={(
              event,
            ) =>
              setSearch(
                event.target.value,
              )
            }
          />

          <select
            value={
              directionFilter
            }
            onChange={(
              event,
            ) =>
              setDirectionFilter(
                event.target.value,
              )
            }
          >
            <option value="ALL">
              Todas las direcciones
            </option>

            <option value="LONG">
              LONG
            </option>

            <option value="SHORT">
              SHORT
            </option>
          </select>

          <select
            value={
              qualityFilter
            }
            onChange={(
              event,
            ) =>
              setQualityFilter(
                event.target.value,
              )
            }
          >
            <option value="ALL">
              Todas las calidades
            </option>

            {setupQualityOptions.map(
              (quality) => (
                <option
                  key={
                    quality
                  }
                  value={
                    quality
                  }
                >
                  {quality}
                </option>
              ),
            )}
          </select>

          <select
            value={
              resultFilter
            }
            onChange={(
              event,
            ) =>
              setResultFilter(
                event.target.value,
              )
            }
          >
            <option value="ALL">
              Todos los resultados
            </option>

            <option value="WIN">
              Ganadores
            </option>

            <option value="LOSS">
              Pérdidas
            </option>

            <option value="OTHER">
              BE / Parcial
            </option>
          </select>
        </section>

        <section className="table-wrap">
          {loading ? (
            <div className="empty">
              Cargando trades...
            </div>
          ) : filteredTrades.length ===
            0 ? (
            <div className="empty">
              No hay trades que coincidan
              con los filtros.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>
                    FECHA
                  </th>

                  <th>
                    SETUP
                  </th>

                  <th>
                    MERCADO
                  </th>

                  <th>
                    DIRECCIÓN
                  </th>

                  <th>
                    R
                  </th>

                  <th>
                    RESULTADO
                  </th>

                  <th>
                    SETUP
                  </th>

                  <th>
                    EJECUCIÓN
                  </th>

                  <th>
                    EMOCIÓN
                  </th>

                  <th>
                    ACCIONES
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredTrades.map(
                  (trade) => {
                    const setup =
                      setups.find(
                        (item) =>
                          item.id ===
                          trade.setup_id,
                      );

                    const isLocked = false;

                    const r =
                      Number(
                        trade.r ??
                          0,
                      );

                    const rClass =
                      r > 0
                        ? "r-positive"
                        : r < 0
                          ? "r-negative"
                          : "r-neutral";

                    return (
                      <tr
                        key={
                          trade.id
                        }
                      >
                        <td>
                          {formatDate(
                            trade.trade_date,
                          )}
                        </td>

                        <td>
                          {setup?.name ??
                            "—"}
                        </td>

                        <td>
                          <strong>
                            {
                              trade.instrument
                            }
                          </strong>
                        </td>

                        <td>
                          <span className="direction">
                            {
                              trade.direction
                            }
                          </span>
                        </td>

                        <td
                          className={
                            rClass
                          }
                        >
                          {formatR(
                            trade.r,
                          )}
                        </td>

                        <td>
                          <span
                            className={getResultClass(
                              trade.close_type,
                              trade.r,
                            )}
                          >
                            {getResultLabel(
                              trade.close_type,
                              trade.r,
                            )}
                          </span>
                        </td>

                        <td>
                          <span
                            className={getQualityClass(
                              trade.setup_quality,
                            )}
                          >
                            {trade.setup_quality ??
                              "—"}
                          </span>
                        </td>

                        <td>
                          {trade.execution_quality ??
                            "—"}
                        </td>

                        <td>
                          {trade.emotion ??
                            "—"}
                        </td>

                        <td>
                          {isLocked ? (
                            <span
                              className="locked-action"
                              title="Solo el trade de hoy queda bloqueado cuando la jornada actual ha sido finalizada."
                            >
                              🔒 Bloqueado
                            </span>
                          ) : (
                            <div className="action-row">
                              <button
                                type="button"
                                className="action-button"
                                onClick={() =>
                                  router.push(
                                    `/journal/${trade.id}`,
                                  )
                                }
                              >
                                Ver
                              </button>

                              <button
                                type="button"
                                className="action-button"
                                onClick={() =>
                                  openEditTrade(
                                    trade,
                                  )
                                }
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                className="action-button danger"
                                disabled={
                                  deletingTradeId ===
                                  trade.id
                                }
                                onClick={() =>
                                  void handleDeleteTrade(
                                    trade,
                                  )
                                }
                              >
                                {deletingTradeId ===
                                trade.id
                                  ? "..."
                                  : "Eliminar"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {showNewTrade && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={
              handleSubmit
            }
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  TRADING JOURNAL
                </div>

                <div className="modal-title">
                  {editingTradeId
                    ? "Editar trade"
                    : "Nuevo trade"}
                </div>
              </div>

              <button
                type="button"
                className="cancel-button"
                onClick={() => {
                  setShowNewTrade(
                    false,
                  );
                  setEditingTradeId(
                    null,
                  );
                }}
              >
                Cerrar
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label>
                    Fecha
                  </label>

                  <input
                    type="date"
                    value={
                      form.trade_date
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "trade_date",
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label>
                    Instrumento
                  </label>

                  <input
                    value={
                      form.instrument
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "instrument",
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label>
                    Dirección
                  </label>

                  <select
                    value={
                      form.direction
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "direction",
                        event.target.value,
                      )
                    }
                  >
                    <option value="LONG">
                      LONG
                    </option>

                    <option value="SHORT">
                      SHORT
                    </option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Setup
                  </label>

                  <select
                    value={
                      form.setup_id
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "setup_id",
                        event.target.value,
                      )
                    }
                    required
                  >
                    <option value="">
                      Selecciona...
                    </option>

                    {setups.map(
                      (setup) => (
                        <option
                          key={
                            setup.id
                          }
                          value={
                            setup.id
                          }
                        >
                          {
                            setup.name
                          }
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Calidad del setup
                  </label>

                  <select
                    value={
                      form.setup_quality
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "setup_quality",
                        event.target.value,
                      )
                    }
                  >
                    {setupQualityOptions.map(
                      (quality) => (
                        <option
                          key={
                            quality
                          }
                          value={
                            quality
                          }
                        >
                          {quality}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Calidad de ejecución
                  </label>

                  <select
                    value={
                      form.execution_quality
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "execution_quality",
                        event.target.value,
                      )
                    }
                  >
                    {executionOptions.map(
                      (quality) => (
                        <option
                          key={
                            quality
                          }
                          value={
                            quality
                          }
                        >
                          {quality}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Emoción
                  </label>

                  <select
                    value={
                      form.emotion
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "emotion",
                        event.target.value,
                      )
                    }
                  >
                    {emotionOptions.map(
                      (emotion) => (
                        <option
                          key={
                            emotion
                          }
                          value={
                            emotion
                          }
                        >
                          {emotion}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Cierre
                  </label>

                  <select
                    value={
                      form.close_type
                    }
                    onChange={(
                      event,
                    ) =>
                      handleCloseTypeChange(
                        event.target.value,
                      )
                    }
                  >
                    {closeOptions.map(
                      (option) => (
                        <option
                          key={
                            option.value
                          }
                          value={
                            option.value
                          }
                        >
                          {
                            option.label
                          }
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="field">
                  <label>
                    R
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={
                      form.r
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "r",
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>

                <div className="field full">
                  <ScreenshotPasteField
                    label="Screenshot antes"
                    slot="before"
                    value={
                      form.before_screenshot_url
                    }
                    onChange={(value) =>
                      updateForm(
                        "before_screenshot_url",
                        value,
                      )
                    }
                    scopeId={
                      editingTradeId
                    }
                    disabled={saving}
                  />
                </div>

                <div className="field full">
                  <ScreenshotPasteField
                    label="Screenshot después"
                    slot="after"
                    value={
                      form.after_screenshot_url
                    }
                    onChange={(value) =>
                      updateForm(
                        "after_screenshot_url",
                        value,
                      )
                    }
                    scopeId={
                      editingTradeId
                    }
                    disabled={saving}
                  />
                </div>

                <div className="field full">
                  <label>
                    Notas
                  </label>

                  <textarea
                    value={
                      form.notes
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "notes",
                        event.target.value,
                      )
                    }
                    placeholder="Contexto de la operación..."
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                disabled={
                  saving
                }
                onClick={() => {
                  setShowNewTrade(
                    false,
                  );
                  setEditingTradeId(
                    null,
                  );
                }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="save-button"
                disabled={
                  saving
                }
              >
                {saving
                  ? "Guardando..."
                  : editingTradeId
                    ? "Guardar cambios"
                    : "Registrar trade"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}