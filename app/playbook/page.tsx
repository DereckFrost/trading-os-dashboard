"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateTradingMetrics,
  type MetricTrade,
} from "@/app/lib/metrics";

type Setup = {
  id: string;
  name: string;
  active: boolean;
};

type PlaybookEntry = {
  id: string;
  setup_id: string | null;
  title: string;
  description: string | null;
  rules: string | null;
  screenshot_url: string | null;
  is_a_plus_example: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Trade = {
  id: string;
  setup_id: string | null;
  trade_date: string;
  instrument: string;
  direction: string;
  setup_quality: string | null;
  execution_quality: string | null;
  close_type: string | null;
  r: number | null;
  before_screenshot_url: string | null;
  after_screenshot_url: string | null;
  notes: string | null;
};

type Stats = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
  totalR: number;
  aPlusRate: number;
  averageExecution: number;
  profitFactor: number | null;
};

type MainDraft = {
  title: string;
  description: string;
  rules: string;
  notes: string;
};

type ExampleDraft = {
  title: string;
  description: string;
  screenshot_url: string;
  notes: string;
};

function screenshotDisplayUrl(value: string | null) {
  if (!value) return "";

  if (value.startsWith("/api/trades/screenshots?path=")) {
    return value;
  }

  if (value.startsWith("users/")) {
    return `/api/trades/screenshots?path=${encodeURIComponent(value)}`;
  }

  const marker = "/storage/v1/object/public/trade-screenshots/";
  const index = value.indexOf(marker);

  if (index !== -1) {
    const path = decodeURIComponent(
      value.slice(index + marker.length).split("?")[0],
    );
    return `/api/trades/screenshots?path=${encodeURIComponent(path)}`;
  }

  return value;
}

async function db<T = unknown>(table: string, query = "", options: RequestInit = {}): Promise<T> {
  const { supabaseBrowserFetch } = await import("@/app/lib/supabase/browser-fetch");
  return supabaseBrowserFetch<T>(table, query, options);
}

function formatR(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDate(value: string) {
  return new Date(
    `${value.slice(0, 10)}T00:00:00`,
  ).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function calculateStats(
  trades: Trade[],
): Stats {
  const metricTrades: MetricTrade[] =
    trades.map((trade) => ({
      id: trade.id,
      trade_date: trade.trade_date,
      r:
        trade.r === null
          ? null
          : Number(trade.r),
      setup_id: trade.setup_id,
      setup_quality:
        trade.setup_quality,
      execution_quality:
        trade.execution_quality,
    }));

  const metrics =
    calculateTradingMetrics({
      trades: metricTrades,
    });

  return {
    trades:
      metrics.performance.totalTrades,

    wins:
      metrics.performance.wins,

    losses:
      metrics.performance.losses,

    winRate:
      metrics.performance.winRate,

    expectancy:
      metrics.performance.expectancy,

    totalR:
      metrics.performance.netR,

    aPlusRate:
      metrics.performance.aPlusRate,

    averageExecution:
      metrics.execution.average,

    profitFactor:
      metrics.performance.profitFactor,
  };
}

function mainEntryFor(
  entries: PlaybookEntry[],
  setupId: string,
) {
  return entries.find(
    (entry) =>
      entry.setup_id ===
        setupId &&
      !entry.is_a_plus_example,
  );
}


export default function PlaybookPage() {
  const [setups, setSetups] =
    useState<Setup[]>([]);

  const [entries, setEntries] =
    useState<PlaybookEntry[]>([]);

  const [trades, setTrades] =
    useState<Trade[]>([]);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [editing, setEditing] =
    useState(false);

  const [
    showExampleForm,
    setShowExampleForm,
  ] = useState(false);

  const [
    editingExampleId,
    setEditingExampleId,
  ] = useState<string | null>(
    null,
  );

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [lightboxImage, setLightboxImage] =
    useState<{
      url: string;
      alt: string;
    } | null>(null);

  const [mainDraft, setMainDraft] =
    useState<MainDraft>({
      title: "",
      description: "",
      rules: "",
      notes: "",
    });

  const [
    exampleDraft,
    setExampleDraft,
  ] = useState<ExampleDraft>({
    title: "",
    description: "",
    screenshot_url: "",
    notes: "",
  });

  async function load(
    preferredId?: string,
  ) {
    try {
      setLoading(true);
      setError("");

      const [
        setupsData,
        playbookData,
        tradesData,
      ] = await Promise.all([
        db<Setup[]>(
          "setups",
          "?select=id,name,active&order=name.asc",
        ),

        db<PlaybookEntry[]>(
          "playbook",
          "?select=id,setup_id,title,description,rules,screenshot_url,is_a_plus_example,notes,created_at,updated_at&order=created_at.asc",
        ),

        db<Trade[]>(
          "trades",
          "?select=id,setup_id,trade_date,instrument,direction,setup_quality,execution_quality,close_type,r,before_screenshot_url,after_screenshot_url,notes&order=trade_date.desc,created_at.desc",
        ),
      ]);

      const nextSetups: Setup[] =
        setupsData ?? [];

      const nextEntries: PlaybookEntry[] =
        playbookData ?? [];

      const nextTrades: Trade[] =
        tradesData ?? [];

      setSetups(nextSetups);
      setEntries(nextEntries);
      setTrades(nextTrades);

      const preferred =
        preferredId ??
        selectedId;

      const nextId =
        preferred &&
        nextSetups.some(
          (setup) =>
            setup.id ===
            preferred,
        )
          ? preferred
          : null;

      setSelectedId(nextId);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el Playbook.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = useMemo(() => {
    return setups
      .filter(
        (setup) =>
          setup.active,
      )
      .map((setup) => {
        const setupEntries =
          entries.filter(
            (entry) =>
              entry.setup_id ===
              setup.id,
          );

        const mainEntry =
          setupEntries.find(
            (entry) =>
              !entry.is_a_plus_example,
          );

        const aPlusEntry =
          setupEntries.find(
            (entry) =>
              entry.is_a_plus_example &&
              Boolean(
                entry.screenshot_url,
              ),
          );

        return {
          ...setup,

          stats: calculateStats(
            trades.filter(
              (trade) =>
                trade.setup_id ===
                setup.id,
            ),
          ),

          coverScreenshot:
            mainEntry?.screenshot_url ??
            aPlusEntry?.screenshot_url ??
            null,
        };
      })
      .sort(
        (a, b) =>
          b.stats.totalR -
            a.stats.totalR ||
          b.stats.expectancy -
            a.stats.expectancy,
      );
  }, [setups, trades, entries]);

  const filtered = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    if (!query) {
      return cards;
    }

    return cards.filter(
      (setup) =>
        setup.name
          .toLowerCase()
          .includes(query),
    );
  }, [cards, search]);

  const selected = useMemo(
    () =>
      cards.find(
        (setup) =>
          setup.id ===
          selectedId,
      ) ??
      null,
    [cards, selectedId],
  );

  const selectedEntries =
    useMemo(() => {
      if (!selected) {
        return [];
      }

      return entries.filter(
        (entry) =>
          entry.setup_id ===
          selected.id,
      );
    }, [entries, selected]);

  const mainEntry = useMemo(
    () =>
      selected
        ? mainEntryFor(
            entries,
            selected.id,
          )
        : undefined,
    [entries, selected],
  );

  const aPlusEntries =
    useMemo(
      () =>
        selectedEntries.filter(
          (entry) =>
            entry.is_a_plus_example,
        ),
      [selectedEntries],
    );

  const selectedTrades =
    useMemo(() => {
      if (!selected) {
        return [];
      }

      return trades
        .filter(
          (trade) =>
            trade.setup_id ===
            selected.id,
        )
        .sort((a, b) =>
          b.trade_date.localeCompare(
            a.trade_date,
          ),
        );
    }, [trades, selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selected) {
        return;
      }

      setMainDraft({
        title:
          mainEntry?.title ??
          selected.name,

        description:
          mainEntry?.description ??
          "",

        rules:
          mainEntry?.rules ??
          "",

        notes:
          mainEntry?.notes ??
          "",
      });

      setEditing(false);
      setShowExampleForm(false);
      setEditingExampleId(null);
      setSuccess("");
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    selectedId,
    selected,
    mainEntry,
  ]);

  function resetExampleForm() {
    setExampleDraft({
      title: "",
      description: "",
      screenshot_url: "",
      notes: "",
    });

    setEditingExampleId(null);
    setShowExampleForm(false);
  }

  function closeSelectedSetup() {
    setSelectedId(null);
    setEditing(false);
    resetExampleForm();
    setError("");
  }

  useEffect(() => {
    if (!selectedId && !lightboxImage) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (lightboxImage) {
        setLightboxImage(null);
      } else {
        setSelectedId(null);
        setEditing(false);
        setShowExampleForm(false);
        setEditingExampleId(null);
        setError("");
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [selectedId, lightboxImage]);

  function startEditingExample(
    entry: PlaybookEntry,
  ) {
    setExampleDraft({
      title: entry.title,
      description:
        entry.description ??
        "",
      screenshot_url:
        entry.screenshot_url ??
        "",
      notes:
        entry.notes ?? "",
    });

    setEditingExampleId(
      entry.id,
    );

    setShowExampleForm(true);
    setSuccess("");
    setError("");
  }

  async function saveMainEntry() {
    if (!selected) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        setup_id: selected.id,

        title:
          mainDraft.title.trim() ||
          selected.name,

        description:
          mainDraft.description.trim() ||
          null,

        rules:
          mainDraft.rules.trim() ||
          null,

        screenshot_url:
          mainEntry?.screenshot_url ??
          null,

        is_a_plus_example: false,

        notes:
          mainDraft.notes.trim() ||
          null,
      };

      let saved:
        | PlaybookEntry
        | null = null;

      if (mainEntry) {
        const result =
          await db(
            "playbook",
            `?id=eq.${mainEntry.id}`,
            {
              method: "PATCH",

              headers: {
                Prefer:
                  "return=representation",
              },

              body:
                JSON.stringify(
                  payload,
                ),
            },
          );

        saved = Array.isArray(
          result,
        )
          ? result[0] ??
            null
          : result;
      } else {
        const result =
          await db(
            "playbook",
            "",
            {
              method: "POST",

              headers: {
                Prefer:
                  "return=representation",
              },

              body:
                JSON.stringify(
                  payload,
                ),
            },
          );

        saved = Array.isArray(
          result,
        )
          ? result[0] ??
            null
          : result;
      }

      if (saved) {
        setEntries(
          (current) => {
            const exists =
              current.some(
                (entry) =>
                  entry.id ===
                  saved!.id,
              );

            return exists
              ? current.map(
                  (entry) =>
                    entry.id ===
                    saved!.id
                      ? saved!
                      : entry,
                )
              : [
                  ...current,
                  saved!,
                ];
          },
        );
      }

      setEditing(false);
      setSuccess(
        "Setup actualizado.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el setup.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveAPlusExample() {
    if (!selected) {
      return;
    }

    if (
      !exampleDraft.title.trim()
    ) {
      setError(
        "El ejemplo A+ necesita un título.",
      );

      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        setup_id: selected.id,

        title:
          exampleDraft.title.trim(),

        description:
          exampleDraft.description.trim() ||
          null,

        rules: null,

        screenshot_url:
          exampleDraft.screenshot_url.trim() ||
          null,

        is_a_plus_example: true,

        notes:
          exampleDraft.notes.trim() ||
          null,
      };

      let saved:
        | PlaybookEntry
        | null = null;

      if (editingExampleId) {
        const result =
          await db(
            "playbook",
            `?id=eq.${editingExampleId}`,
            {
              method: "PATCH",

              headers: {
                Prefer:
                  "return=representation",
              },

              body:
                JSON.stringify(
                  payload,
                ),
            },
          );

        saved = Array.isArray(
          result,
        )
          ? result[0] ??
            null
          : result;

        if (saved) {
          setEntries(
            (current) =>
              current.map(
                (entry) =>
                  entry.id ===
                  saved!.id
                    ? saved!
                    : entry,
              ),
          );
        }

        setSuccess(
          "Ejemplo A+ actualizado.",
        );
      } else {
        const result =
          await db(
            "playbook",
            "",
            {
              method: "POST",

              headers: {
                Prefer:
                  "return=representation",
              },

              body:
                JSON.stringify(
                  payload,
                ),
            },
          );

        saved = Array.isArray(
          result,
        )
          ? result[0] ??
            null
          : result;

        if (saved) {
          setEntries(
            (current) => [
              ...current,
              saved!,
            ],
          );
        }

        setSuccess(
          "Ejemplo A+ agregado.",
        );
      }

      resetExampleForm();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el ejemplo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteAPlus(
    id: string,
  ) {
    try {
      setError("");
      setSuccess("");

      await db<PlaybookEntry[]>(
        "playbook",
        `?id=eq.${id}`,
        {
          method: "DELETE",
        },
      );

      setEntries(
        (current) =>
          current.filter(
            (entry) =>
              entry.id !== id,
          ),
      );

      if (
        editingExampleId === id
      ) {
        resetExampleForm();
      }

      setSuccess(
        "Ejemplo eliminado.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el ejemplo.",
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--surface)] px-8 py-10 text-white">
        <div className="mx-auto max-w-7xl text-sm text-[var(--text-dim)]">
          Cargando Playbook...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] px-8 py-10 text-white">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
              PLAYBOOK
            </p>

            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {filtered.length} {filtered.length === 1 ? "setup" : "setups"}
              {search.trim() ? " encontrados" : " activos"}
            </p>
          </div>

          <div className="relative w-full md:w-[280px]">
            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Buscar setup..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 pr-10 text-sm text-white outline-none placeholder:text-[#5f6670] focus:border-[#3b474f]"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-sm text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-white"
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>

        </header>

        {/* FEEDBACK */}

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[#6ee7b7]">
            {success}
          </div>
        )}

        {cards.length === 0 ? (
          <EmptyState />
        ) : (
          <>

            {/* SETUP CARDS */}

            <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

              {filtered.map(
                (setup) => (
                  <SetupCard
                    key={
                      setup.id
                    }
                    setup={
                      setup
                    }
                    active={
                      selected?.id ===
                      setup.id
                    }
                    onClick={() => {
                      setSelectedId(
                        setup.id,
                      );

                      setSuccess("");
                      setError("");
                    }}
                  />
                ),
              )}

            </section>

            {!filtered.length && (
              <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--text-muted)]">
                No se encontró ningún setup.
              </div>
            )}

            {/* SELECTED SETUP */}

            {selected && (
              <div
                className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    closeSelectedSetup();
                  }
                }}
              >
                <section className="relative max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-2xl">

                  <button
                    type="button"
                    onClick={closeSelectedSetup}
                    className="absolute right-5 top-5 z-10 flex size-9 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-1)]/90 text-lg text-[#9aa2ab] backdrop-blur transition hover:border-[#505963] hover:bg-[var(--surface-3)] hover:text-white"
                    aria-label="Cerrar setup"
                  >
                    ×
                  </button>

                  {/* SETUP HEADER */}

                <div className="border-b border-[var(--surface-3)] px-6 py-6">

                  <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                        SETUP
                      </p>

                      <h2 className="mt-2 text-2xl font-semibold">
                        {selected.name}
                      </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">

                      <Metric
                        label="TRADES"
                        value={String(
                          selected
                            .stats
                            .trades,
                        )}
                      />

                      <Metric
                        label="WIN RATE"
                        value={formatPercent(
                          selected
                            .stats
                            .winRate,
                        )}
                      />

                      <Metric
                        label="EXPECTANCY"
                        value={formatR(
                          selected
                            .stats
                            .expectancy,
                        )}
                        positive={
                          selected
                            .stats
                            .expectancy >=
                          0
                        }
                      />

                      <Metric
                        label="R"
                        value={formatR(
                          selected
                            .stats
                            .totalR,
                        )}
                        positive={
                          selected
                            .stats
                            .totalR >=
                          0
                        }
                      />

                      <Metric
                        label="A+"
                        value={formatPercent(
                          selected
                            .stats
                            .aPlusRate,
                        )}
                        positive={
                          selected
                            .stats
                            .aPlusRate >=
                          50
                        }
                      />

                      <Metric
                        label="EXECUCIÓN"
                        value={`${selected.stats.averageExecution}/100`}
                        positive={
                          selected
                            .stats
                            .averageExecution >=
                          75
                        }
                      />

                    </div>

                  </div>

                </div>

                {/* KNOWLEDGE + A+ */}

                <div className="grid lg:grid-cols-2">

                  {/* KNOWLEDGE */}

                  <div className="border-b border-[var(--surface-3)] p-6 lg:border-b-0 lg:border-r">

                    <div className="mb-5 flex items-center justify-between">

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                          KNOWLEDGE
                        </p>


                      </div>

                      {!editing && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditing(
                              true,
                            )
                          }
                          className="rounded-lg border border-[var(--border-strong)] bg-[#1a1d20] px-4 py-2 text-xs font-medium hover:border-[var(--text-faint)] hover:bg-[var(--surface-3)]"
                        >
                          Editar
                        </button>
                      )}

                    </div>

                    {editing ? (
                      <MainEditor
                        draft={
                          mainDraft
                        }
                        setDraft={
                          setMainDraft
                        }
                        saving={
                          saving
                        }
                        cancel={() => {
                          setMainDraft(
                            {
                              title:
                                mainEntry?.title ??
                                selected.name,

                              description:
                                mainEntry?.description ??
                                "",

                              rules:
                                mainEntry?.rules ??
                                "",

                              notes:
                                mainEntry?.notes ??
                                "",
                            },
                          );

                          setEditing(
                            false,
                          );
                        }}
                        save={
                          saveMainEntry
                        }
                      />
                    ) : (
                      <MainKnowledge
                        entry={
                          mainEntry
                        }
                      />
                    )}

                  </div>

                  {/* A+ */}

                  <div className="p-6">

                    <div className="mb-5 flex items-center justify-between">

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                          EJEMPLOS A+
                        </p>


                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (
                            showExampleForm
                          ) {
                            resetExampleForm();
                          } else {
                            setError("");
                            setSuccess("");

                            setExampleDraft(
                              {
                                title: "",
                                description:
                                  "",
                                screenshot_url:
                                  "",
                                notes: "",
                              },
                            );

                            setEditingExampleId(
                              null,
                            );

                            setShowExampleForm(
                              true,
                            );
                          }
                        }}
                        className="rounded-lg border border-[var(--border-strong)] bg-[#1a1d20] px-4 py-2 text-xs font-medium hover:border-[var(--text-faint)] hover:bg-[var(--surface-3)]"
                      >
                        {showExampleForm
                          ? "Cerrar"
                          : "+ Ejemplo"}
                      </button>

                    </div>

                    {showExampleForm && (
                      <ExampleEditor
                        draft={
                          exampleDraft
                        }
                        setDraft={
                          setExampleDraft
                        }
                        saving={
                          saving
                        }
                        editing={
                          Boolean(
                            editingExampleId,
                          )
                        }
                        cancel={
                          resetExampleForm
                        }
                        save={
                          saveAPlusExample
                        }
                      />
                    )}

                    <div className="mt-5">

                      {aPlusEntries.length ? (
                        <div className="grid gap-4 sm:grid-cols-2">

                          {aPlusEntries.map(
                            (
                              entry,
                            ) => (
                              <APlusCard
                                key={
                                  entry.id
                                }
                                entry={
                                  entry
                                }
                                onEdit={() =>
                                  startEditingExample(
                                    entry,
                                  )
                                }
                                onDelete={() =>
                                  void deleteAPlus(
                                    entry.id,
                                  )
                                }
                              />
                            ),
                          )}

                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-[var(--border-strong)] px-5 py-8 text-center">
                          <p className="text-sm text-[var(--text-muted)]">
                            Ningún ejemplo A+ documentado.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setError("");
                              setSuccess("");
                              setExampleDraft({
                                title: "",
                                description: "",
                                screenshot_url: "",
                                notes: "",
                              });
                              setEditingExampleId(null);
                              setShowExampleForm(true);
                            }}
                            className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)] hover:text-[#6ee7b7]"
                          >
                            + Agregar ejemplo
                          </button>
                        </div>
                      )}

                    </div>

                  </div>

                </div>

                  <EvidenceGallery
                    trades={
                      selectedTrades
                    }
                    onOpen={(image) =>
                      setLightboxImage(image)
                    }
                  />

                {/* HISTORY */}

                  <History
                    trades={
                      selectedTrades
                    }
                  />

                </section>
              </div>
            )}

            {lightboxImage && (
              <div
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setLightboxImage(null);
                  }
                }}
              >
                <div className="relative flex max-h-[94vh] max-w-[94vw] items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lightboxImage.url}
                    alt={lightboxImage.alt}
                    className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
                  />

                  <button
                    type="button"
                    onClick={() => setLightboxImage(null)}
                    className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/70 text-xl text-white backdrop-blur transition hover:bg-black/90"
                    aria-label="Cerrar imagen"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

          </>
        )}

      </div>
    </main>
  );
}

/* ========================================================================== */
/* SETUP CARD                                                                 */
/* ========================================================================== */

function SetupCard({
  setup,
  active,
  onClick,
}: {
  setup: Setup & {
    stats: Stats;
    coverScreenshot: string | null;
  };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full overflow-hidden rounded-xl border bg-[var(--surface-2)] text-left transition ${
        active
          ? "border-[#28634f] shadow-[0_0_0_1px_rgba(72,227,164,0.08)]"
          : "border-[var(--border)] hover:border-[#3a424a]"
      }`}
    >
      {/* VISUAL COVER */}

      <div className="relative aspect-[16/7] overflow-hidden bg-[#0f1113]">
        {setup.coverScreenshot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.coverScreenshot}
              alt=""
              className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.025] group-hover:opacity-100"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-2)] via-[var(--surface-2)]/15 to-transparent" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Sin evidencia visual
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="line-clamp-2 text-base font-semibold text-white">
              {setup.name}
            </p>

            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {setup.stats.trades}{" "}
              {setup.stats.trades === 1 ? "trade" : "trades"}
            </p>
          </div>

          <span
            className={`shrink-0 text-sm font-semibold ${
              setup.stats.totalR >= 0
                ? "text-[var(--accent)]"
                : "text-red-400"
            }`}
          >
            {formatR(setup.stats.totalR)}
          </span>
        </div>
      </div>

      {/* METRICS */}

      <div className="p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <Metric
            label="WIN RATE"
            value={formatPercent(setup.stats.winRate)}
          />

          <Metric
            label="EXPECTANCY"
            value={formatR(setup.stats.expectancy)}
            positive={setup.stats.expectancy >= 0}
          />

          <Metric
            label="A+"
            value={formatPercent(setup.stats.aPlusRate)}
          />

          <Metric
            label="EJECUCIÓN"
            value={`${setup.stats.averageExecution}/100`}
            positive={setup.stats.averageExecution >= 75}
          />
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[var(--surface-3)] pt-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Abrir setup
          </span>

          <span className="text-[var(--text-dim)] transition-transform duration-200 group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>
    </button>
  );
}

/* ========================================================================== */
/* METRIC                                                                     */
/* ========================================================================== */

function Metric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>

      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>

      <p
        className={`mt-1 text-sm font-semibold ${
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

/* ========================================================================== */
/* MAIN KNOWLEDGE                                                             */
/* ========================================================================== */

function MainKnowledge({
  entry,
}: {
  entry?: PlaybookEntry;
}) {
  if (!entry) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-strong)] px-5 py-8">

        <p className="text-sm font-medium">
          Este setup todavía no tiene una ficha documentada.
        </p>

        <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
          Usa “Editar” para documentar su lógica.
        </p>

      </div>
    );
  }

  return (
    <div className="space-y-7">

      {entry.description && (
        <Section title="Descripción">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            {entry.description}
          </p>
        </Section>
      )}

      {entry.rules && (
        <Section title="Reglas">
          <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">
            {entry.rules}
          </p>
        </Section>
      )}

      {entry.notes && (
        <Section title="Notas">
          <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">
            {entry.notes}
          </p>
        </Section>
      )}

      {!entry.description &&
        !entry.rules &&
        !entry.notes && (
          <p className="text-sm text-[var(--text-muted)]">
            Esta ficha todavía está vacía.
          </p>
        )}

    </div>
  );
}

/* ========================================================================== */
/* MAIN EDITOR                                                                */
/* ========================================================================== */

function MainEditor({
  draft,
  setDraft,
  saving,
  cancel,
  save,
}: {
  draft: MainDraft;
  setDraft: React.Dispatch<
    React.SetStateAction<MainDraft>
  >;
  saving: boolean;
  cancel: () => void;
  save: () => void;
}) {
  return (
    <div className="space-y-5">

      <TextArea
        label="TÍTULO"
        value={draft.title}
        rows={2}
        onChange={(value) =>
          setDraft(
            (current) => ({
              ...current,
              title: value,
            }),
          )
        }
      />

      <TextArea
        label="DESCRIPCIÓN"
        value={
          draft.description
        }
        rows={5}
        placeholder="Qué representa este setup."
        onChange={(value) =>
          setDraft(
            (current) => ({
              ...current,
              description:
                value,
            }),
          )
        }
      />

      <TextArea
        label="REGLAS"
        value={draft.rules}
        rows={8}
        placeholder="Escribe las reglas del setup. Puedes utilizar una línea por regla."
        onChange={(value) =>
          setDraft(
            (current) => ({
              ...current,
              rules: value,
            }),
          )
        }
      />

      <TextArea
        label="NOTAS"
        value={draft.notes}
        rows={5}
        placeholder="Notas importantes del setup."
        onChange={(value) =>
          setDraft(
            (current) => ({
              ...current,
              notes: value,
            }),
          )
        }
      />

      <div className="flex justify-end gap-3 border-t border-[var(--surface-3)] pt-5">

        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-xs text-[var(--text-dim)] hover:bg-[#1d2024] hover:text-white"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[#07130f] hover:bg-[#48e3a4] disabled:opacity-50"
        >
          {saving
            ? "Guardando..."
            : "Guardar"}
        </button>

      </div>

    </div>
  );
}

/* ========================================================================== */
/* EXAMPLE EDITOR                                                             */
/* ========================================================================== */

function ExampleEditor({
  draft,
  setDraft,
  saving,
  editing,
  cancel,
  save,
}: {
  draft: ExampleDraft;
  setDraft: React.Dispatch<
    React.SetStateAction<ExampleDraft>
  >;
  saving: boolean;
  editing: boolean;
  cancel: () => void;
  save: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">

      <div className="mb-4 flex items-center justify-between">

        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
          {editing
            ? "EDITAR EJEMPLO A+"
            : "NUEVO EJEMPLO A+"}
        </p>

      </div>

      <div className="space-y-4">

        <TextArea
          label="TÍTULO"
          value={draft.title}
          rows={2}
          placeholder="Ejemplo A+ — Sweep + BOS"
          onChange={(value) =>
            setDraft(
              (current) => ({
                ...current,
                title: value,
              }),
            )
          }
        />

        <TextArea
          label="DESCRIPCIÓN"
          value={
            draft.description
          }
          rows={3}
          placeholder="Por qué este ejemplo es A+."
          onChange={(value) =>
            setDraft(
              (current) => ({
                ...current,
                description:
                  value,
              }),
            )
          }
        />

        <TextArea
          label="SCREENSHOT URL"
          value={
            draft.screenshot_url
          }
          rows={2}
          placeholder="URL pública de la imagen"
          onChange={(value) =>
            setDraft(
              (current) => ({
                ...current,
                screenshot_url:
                  value,
              }),
            )
          }
        />

        <TextArea
          label="NOTAS"
          value={draft.notes}
          rows={3}
          placeholder="Qué hace este ejemplo especialmente bueno."
          onChange={(value) =>
            setDraft(
              (current) => ({
                ...current,
                notes: value,
              }),
            )
          }
        />

        <div className="flex justify-end gap-2 border-t border-[var(--surface-3)] pt-4">

          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-xs text-[var(--text-dim)] hover:text-white"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#07130f] disabled:opacity-50"
          >
            {saving
              ? "Guardando..."
              : editing
                ? "Guardar cambios"
                : "Guardar A+"}
          </button>

        </div>

      </div>

    </div>
  );
}

/* ========================================================================== */
/* A+ CARD                                                                    */
/* ========================================================================== */

function APlusCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: PlaybookEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="group overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#0f1113]">
        {entry.screenshot_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotDisplayUrl(entry.screenshot_url)}
              alt={entry.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-80" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-5 text-center text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
            Sin screenshot
          </div>
        )}

        <span className="absolute left-3 top-3 rounded-md border border-[var(--accent-border)] bg-black/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#6ee7b7] backdrop-blur">
          A+
        </span>

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-white/10 bg-black/65 px-2.5 py-1.5 text-[10px] font-medium text-white backdrop-blur transition hover:bg-black/85"
          >
            Editar
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-red-400/20 bg-black/65 px-2.5 py-1.5 text-[10px] font-medium text-red-300 backdrop-blur transition hover:bg-red-950/70"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="p-4">
        <p className="text-sm font-medium text-white">
          {entry.title}
        </p>

        {entry.description && (
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--text-dim)]">
            {entry.description}
          </p>
        )}

        {entry.notes && (
          <p className="mt-3 border-t border-[var(--surface-3)] pt-3 text-xs leading-5 text-[var(--text-muted)]">
            {entry.notes}
          </p>
        )}
      </div>
    </article>
  );
}

/* ========================================================================== */
/* REAL TRADE EVIDENCE                                                        */
/* ========================================================================== */

function EvidenceGallery({
  trades,
  onOpen,
}: {
  trades: Trade[];
  onOpen: (image: { url: string; alt: string }) => void;
}) {
  const evidence = trades
    .flatMap((trade) => {
      const items: Array<{
        id: string;
        date: string;
        type: "BEFORE" | "AFTER";
        url: string;
        r: number;
      }> = [];

      if (trade.before_screenshot_url) {
        items.push({
          id: `${trade.id}-before`,
          date: trade.trade_date,
          type: "BEFORE",
          url: screenshotDisplayUrl(trade.before_screenshot_url),
          r: Number(trade.r ?? 0),
        });
      }

      if (trade.after_screenshot_url) {
        items.push({
          id: `${trade.id}-after`,
          date: trade.trade_date,
          type: "AFTER",
          url: screenshotDisplayUrl(trade.after_screenshot_url),
          r: Number(trade.r ?? 0),
        });
      }

      return items;
    })
    .slice(0, 8);

  return (
    <div className="border-t border-[var(--surface-3)]">

      <div className="px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
            EVIDENCIA REAL
          </p>

          {evidence.length > 0 && (
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {evidence.length} {evidence.length === 1 ? "imagen" : "imágenes"}
            </span>
          )}
        </div>

      </div>

      <div className="px-6 pb-6">
        {evidence.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {evidence.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)]"
              >
                <button
                  type="button"
                  className="group block w-full cursor-zoom-in text-left"
                  onClick={() =>
                    onOpen({
                      url: item.url,
                      alt: `${item.type} — ${formatDate(item.date)}`,
                    })
                  }
                  aria-label={`Ampliar ${item.type} — ${formatDate(item.date)}`}
                >
                  <div className="aspect-[16/10] overflow-hidden bg-[#0f1113]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={`${item.type} — ${formatDate(item.date)}`}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                </button>

                <div className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      {item.type}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {formatDate(item.date)}
                    </p>
                  </div>

                  <span
                    className={`text-xs font-semibold ${
                      item.r >= 0
                        ? "text-[var(--accent)]"
                        : "text-red-400"
                    }`}
                  >
                    {formatR(item.r)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border-strong)] px-5 py-8 text-center text-sm text-[var(--text-muted)]">
            Ningún screenshot real asociado a este setup.
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* HISTORY                                                                    */
/* ========================================================================== */

function History({
  trades,
}: {
  trades: Trade[];
}) {
  return (
    <div className="border-t border-[var(--surface-3)]">

      <div className="border-b border-[var(--surface-3)] px-6 py-5">

        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
            HISTORIAL
          </p>

          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {trades.length} {trades.length === 1 ? "trade" : "trades"}
          </span>
        </div>

      </div>

      <div className="overflow-x-auto">

        <table className="w-full min-w-[850px] text-left">

          <thead className="border-b border-[var(--surface-3)]">

            <tr>

              {[
                "FECHA",
                "MERCADO",
                "DIRECCIÓN",
                "CALIDAD",
                "EJECUCIÓN",
                "RESULTADO",
                "R",
              ].map(
                (heading) => (
                  <th
                    key={
                      heading
                    }
                    className="px-6 py-4 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-muted)]"
                  >
                    {heading}
                  </th>
                ),
              )}

            </tr>

          </thead>

          <tbody>

            {trades.length ? (
              trades.map(
                (trade) => (
                  <tr
                    key={
                      trade.id
                    }
                    className="border-b border-[var(--surface-3)] last:border-b-0"
                  >

                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {formatDate(
                        trade.trade_date,
                      )}
                    </td>

                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {
                        trade.instrument
                      }
                    </td>

                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {
                        trade.direction
                      }
                    </td>

                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {
                        trade.setup_quality ??
                        "—"
                      }
                    </td>

                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {
                        trade.execution_quality ??
                        "—"
                      }
                    </td>

                    <td
                      className={`px-6 py-4 text-xs font-semibold ${
                        Number(
                          trade.r ??
                            0,
                        ) > 0
                          ? "text-[var(--accent)]"
                          : Number(
                                trade.r ??
                                  0,
                              ) < 0
                            ? "text-red-400"
                            : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {trade.close_type ??
                        (Number(
                          trade.r ??
                            0,
                        ) > 0
                          ? "GANADOR"
                          : Number(
                                trade.r ??
                                  0,
                              ) < 0
                            ? "PÉRDIDA"
                            : "—")}
                    </td>

                    <td
                      className={`px-6 py-4 text-sm font-semibold ${
                        Number(
                          trade.r ??
                            0,
                        ) >= 0
                          ? "text-[var(--accent)]"
                          : "text-red-400"
                      }`}
                    >
                      {formatR(
                        Number(
                          trade.r ??
                            0,
                        ),
                      )}
                    </td>

                  </tr>
                ),
              )
            ) : (
              <tr>

                <td
                  colSpan={7}
                  className="px-6 py-10 text-center text-sm text-[var(--text-muted)]"
                >
                  Todavía no hay trades registrados para este setup.
                </td>

              </tr>
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

/* ========================================================================== */
/* TEXT AREA                                                                  */
/* ========================================================================== */

function TextArea({
  label,
  value,
  rows,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  placeholder?: string;
  onChange: (
    value: string,
  ) => void;
}) {
  return (
    <label className="block">

      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>

      <textarea
        rows={rows}
        value={value}
        placeholder={
          placeholder
        }
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        className="mt-2 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-[#555d66] focus:border-[#3f4a53]"
      />

    </label>
  );
}

/* ========================================================================== */
/* SECTION                                                                    */
/* ========================================================================== */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>

      <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {title}
      </p>

      {children}

    </div>
  );
}

/* ========================================================================== */
/* EMPTY STATE                                                                */
/* ========================================================================== */

function EmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
      No hay setups activos registrados en Supabase.
    </section>
  );
}