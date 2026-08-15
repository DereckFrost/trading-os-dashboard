"use client";

import { useEffect, useMemo, useState } from "react";

type AutomationType =
  | "weekly_review"
  | "monthly_review"
  | "behavior_alerts";

type Alert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
};

type Report = {
  title: string;
  verdict: string;
  executiveSummary: string;
  strengths: string[];
  risks: string[];
  priorities: string[];
  whatNotToChange: string[];
  longitudinal: string[];
  confidence: string;
};

type Run = {
  id: string;
  automationType: AutomationType;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  status: "completed" | "skipped" | "failed";
  report: Report | null;
  alerts: Alert[];
  aiModel: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type AutomationDefinition = {
  type: AutomationType;
  label: string;
  description: string;
  trigger: string;
  action: string;
  cadence: string;
};

const AUTOMATIONS: AutomationDefinition[] = [
  {
    type: "weekly_review",
    label: "Weekly Review",
    description:
      "Convierte la semana cerrada en una revisión operativa y conductual guardada en el historial.",
    trigger: "Semana cerrada",
    action: "Review + snapshot + contexto longitudinal",
    cadence: "Cada semana",
  },
  {
    type: "monthly_review",
    label: "Monthly Review",
    description:
      "Cierra el mes con una lectura de proceso, ejecución y comportamiento sin alterar tu estrategia.",
    trigger: "Mes calendario cerrado",
    action: "Review + snapshot + comparación histórica",
    cadence: "Cada mes",
  },
  {
    type: "behavior_alerts",
    label: "Behavior Alerts",
    description:
      "Detecta desviaciones objetivas del proceso y conserva la evidencia cuando aparece una señal relevante.",
    trigger: "Condición conductual detectada",
    action: "Detectar + deduplicar + guardar evidencia",
    cadence: "Durante el período activo",
  },
];

const LABELS: Record<AutomationType, string> = {
  weekly_review: "Weekly Review",
  monthly_review: "Monthly Review",
  behavior_alerts: "Behavior Alerts",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: Run["status"]) {
  if (status === "completed") return "Completada";
  if (status === "failed") return "Requiere atención";
  return "Sin ejecución";
}

function statusClass(status: Run["status"]) {
  if (status === "completed") return "text-emerald-400";
  if (status === "failed") return "text-red-400";
  return "text-zinc-400";
}

function userSafeError() {
  return "La ejecución no pudo completarse. Revisa el detalle y vuelve a intentarlo.";
}

function compactText(value: string, max = 150) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export default function AutomationsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<AutomationType | null>(null);
  const [error, setError] = useState("");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  async function load() {
    try {
      setLoading(true);
      const response = await fetch("/api/automations/history?limit=40", {
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        runs?: Run[];
        error?: string;
      };

      if (!response.ok) throw new Error(data.error ?? "load_failed");
      setRuns(data.runs ?? []);
    } catch {
      setError("No se pudo cargar el Automation Center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function runAutomation(type: AutomationType) {
    try {
      setRunning(type);
      setError("");
      setActionMessage("");

      const response = await fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, force: true }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok) throw new Error(data.error ?? "run_failed");

      await load();
      setActionMessage(`${LABELS[type]} completada.`);
    } catch {
      setError("La ejecución no pudo completarse. Puedes reintentarlo.");
    } finally {
      setRunning(null);
    }
  }

  const latest = useMemo(() => {
    const map = new Map<AutomationType, Run>();
    for (const run of runs) {
      const current = map.get(run.automationType);
      if (
        !current ||
        new Date(run.updatedAt).getTime() > new Date(current.updatedAt).getTime()
      ) {
        map.set(run.automationType, run);
      }
    }
    return map;
  }, [runs]);

  const recentAlerts = useMemo(() => {
    const seen = new Set<string>();

    return runs
      .filter((run) => run.automationType === "behavior_alerts")
      .flatMap((run) =>
        run.alerts.map((alert) => ({
          ...alert,
          periodEnd: run.periodEnd,
          createdAt: run.createdAt,
        })),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((alert) => {
        const signature = [
          alert.id,
          alert.periodEnd,
          alert.metric ?? "",
          alert.value ?? "",
          alert.threshold ?? "",
        ].join(":");

        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      })
      .slice(0, 8);
  }, [runs]);

  const completedRuns = runs.filter((run) => run.status === "completed");

  // A historical failure is not an active incident. Attention is based on the
  // latest run of each automation type, so a successful retry clears the banner.
  const latestFailedRuns = useMemo(
    () =>
      Array.from(latest.values()).filter(
        (run) => run.status === "failed",
      ),
    [latest],
  );

  const attentionCount = latestFailedRuns.length;

  return (
    <main className="min-h-screen bg-[#0d0f10] text-zinc-100">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8">
        <header className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
              AUTOMATION CENTER
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Ejecución programada, detección conductual y trazabilidad.
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${
              attentionCount > 0
                ? "border-red-500/20 bg-red-500/5 text-red-300"
                : "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
            }`}
          >
            {attentionCount > 0
              ? `● ${attentionCount} ejecución${attentionCount === 1 ? "" : "es"} requiere${attentionCount === 1 ? "" : "n"} atención`
              : "● Todo operativo"}
          </span>
        </header>

        {(error || actionMessage) && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-[var(--surface-2)] px-4 py-3 text-sm">
            <span className={error ? "text-red-300" : "text-emerald-300"}>
              {error || actionMessage}
            </span>
            <button
              type="button"
              onClick={() => {
                setError("");
                setActionMessage("");
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cerrar
            </button>
          </div>
        )}

        <section className="mb-5 grid gap-3 md:grid-cols-4">
          {[
            ["AUTOMATIONS", "3", "Procesos configurados"],
            ["EJECUCIONES", String(completedRuns.length), "Completadas"],
            ["ALERTAS", String(recentAlerts.length), "Señales recientes"],
            ["FALLOS", String(attentionCount), "Requieren revisión"],
          ].map(([label, value, caption]) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-800 bg-[var(--surface-2)] p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {label}
              </p>
              <p className="mt-3 text-2xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-zinc-600">{caption}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {AUTOMATIONS.map((automation) => {
            const run = latest.get(automation.type);
            const isRunning = running === automation.type;

            return (
              <article
                key={automation.type}
                className="rounded-xl border border-zinc-800 bg-[var(--surface-2)] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      {automation.label}
                    </p>
                    <h2 className="mt-3 text-base font-semibold">
                      {automation.trigger}
                    </h2>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                      run?.status === "failed"
                        ? "border-red-500/20 bg-red-500/5 text-red-300"
                        : run?.status === "completed"
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        run?.status === "failed"
                          ? "bg-red-400"
                          : run?.status === "completed"
                            ? "bg-emerald-400"
                            : "bg-zinc-500"
                      }`}
                    />
                    {run ? statusLabel(run.status).toUpperCase() : "SIN EJECUCIÓN"}
                  </span>
                </div>

                <p className="mt-3 min-h-[60px] text-sm leading-6 text-zinc-500">
                  {automation.description}
                </p>

                <div className="mt-5 space-y-3 border-t border-zinc-800 pt-4 text-xs">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-zinc-600">Acción</span>
                    <span className="max-w-[210px] text-right text-zinc-300">
                      {automation.action}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-zinc-600">Cadencia</span>
                    <span className="text-zinc-300">{automation.cadence}</span>
                  </div>
                </div>

                <div className="mt-5 border-t border-zinc-800 pt-4">
                  {run ? (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <div>
                        <p className="text-zinc-600">Última ejecución</p>
                        <p className="mt-1 text-zinc-300">
                          {formatDateTime(run.updatedAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-zinc-600">Estado</p>
                        <p className={`mt-1 font-medium ${statusClass(run.status)}`}>
                          {statusLabel(run.status)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">
                      Aún no hay una ejecución registrada.
                    </p>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-zinc-800 pt-4">
                  <button
                    type="button"
                    disabled={!run || isRunning}
                    onClick={() => run && setSelectedRun(run)}
                    className="rounded-md border border-zinc-700 bg-transparent px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Ver detalle
                  </button>
                  <button
                    type="button"
                    disabled={running !== null}
                    onClick={() => void runAutomation(automation.type)}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:border-emerald-400 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRunning ? "Ejecutando…" : "Ejecutar ahora"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-5 rounded-xl border border-zinc-800 bg-[var(--surface-2)]">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                SEÑALES RECIENTES
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Eventos conductuales detectados por el motor. Las repeticiones idénticas se deduplican.
              </p>
            </div>
            <span className="text-[10px] text-zinc-600">
              {recentAlerts.length} visibles
            </span>
          </div>

          {recentAlerts.length === 0 ? (
            <div className="px-5 py-8 text-sm text-zinc-500">
              No hay señales conductuales recientes.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {recentAlerts.map((alert, index) => (
                <div
                  key={`${alert.id}-${alert.periodEnd}-${index}`}
                  className="flex items-start gap-4 px-5 py-4"
                >
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${
                      alert.severity === "critical"
                        ? "bg-red-400"
                        : alert.severity === "warning"
                          ? "bg-amber-400"
                          : "bg-zinc-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{alert.title}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">
                      {alert.message}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] text-zinc-600">
                    {formatDate(alert.periodEnd)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-5 rounded-xl border border-zinc-800 bg-[var(--surface-2)]">
          <div className="border-b border-zinc-800 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              ACTIVIDAD
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Historial real de ejecuciones, resultados y fallos.
            </p>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-sm text-zinc-500">Cargando…</div>
          ) : runs.length === 0 ? (
            <div className="px-5 py-8 text-sm text-zinc-500">
              Todavía no hay actividad. El historial aparecerá cuando una automation ejecute su acción.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRun(run)}
                  className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-white/[0.015] md:grid-cols-[190px_1fr_150px_70px]"
                >
                  <div>
                    <p className="text-xs font-semibold">
                      {LABELS[run.automationType]}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      {formatDate(run.periodStart)} → {formatDate(run.periodEnd)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-300">
                      {run.status === "failed"
                        ? "Ejecución fallida"
                        : run.report?.verdict
                          ? compactText(run.report.verdict)
                          : run.alerts.length > 0
                            ? `${run.alerts.length} señal${run.alerts.length === 1 ? "" : "es"} detectada${run.alerts.length === 1 ? "" : "s"}`
                            : "Ejecución completada sin señales."}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      {formatDateTime(run.createdAt)}
                    </p>
                  </div>
                  <div className="self-center md:text-right">
                    <span className={`text-xs ${statusClass(run.status)}`}>
                      {statusLabel(run.status)}
                    </span>
                  </div>
                  <div className="self-center text-right text-xs text-zinc-500">
                    Ver →
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedRun && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedRun(null);
          }}
        >
          <div className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-zinc-700 bg-[#111516] shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-6 py-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                  {LABELS[selectedRun.automationType]}
                </p>
                <h2 className="mt-2 text-lg font-semibold">
                  {statusLabel(selectedRun.status)}
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  {formatDate(selectedRun.periodStart)} → {formatDate(selectedRun.periodEnd)} · {formatDateTime(selectedRun.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cerrar
              </button>
            </header>

            <div className="overflow-y-auto px-6 py-5">
              {selectedRun.status === "failed" ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300">
                    EJECUCIÓN FALLIDA
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {userSafeError()}
                  </p>
                  <button
                    type="button"
                    disabled={running !== null}
                    onClick={() => {
                      setSelectedRun(null);
                      void runAutomation(selectedRun.automationType);
                    }}
                    className="mt-4 rounded-md border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-300 hover:border-red-300 disabled:opacity-50"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <>
                  {selectedRun.report?.verdict && (
                    <section className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        VEREDICTO
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-zinc-100">
                        {selectedRun.report.verdict}
                      </p>
                      {selectedRun.report.executiveSummary && (
                        <p className="mt-2 text-xs leading-5 text-zinc-500">
                          {selectedRun.report.executiveSummary}
                        </p>
                      )}
                    </section>
                  )}

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {[
                      ["FORTALEZAS", selectedRun.report?.strengths],
                      ["RIESGOS", selectedRun.report?.risks],
                      ["PRIORIDADES", selectedRun.report?.priorities],
                      ["NO CAMBIAR", selectedRun.report?.whatNotToChange],
                    ].map(([title, values]) => (
                      <section
                        key={title as string}
                        className="rounded-lg border border-zinc-800 p-4"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                          {title as string}
                        </p>
                        {Array.isArray(values) && values.length > 0 ? (
                          <ul className="mt-3 space-y-2">
                            {values.map((value) => (
                              <li key={value} className="text-xs leading-5 text-zinc-400">
                                • {value}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-3 text-xs text-zinc-600">Sin observaciones.</p>
                        )}
                      </section>
                    ))}
                  </div>

                  {selectedRun.alerts.length > 0 && (
                    <section className="mt-4 rounded-lg border border-zinc-800 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        EVIDENCIA CONDUCTUAL
                      </p>
                      <div className="mt-3 space-y-2">
                        {selectedRun.alerts.map((alert) => (
                          <div key={alert.id} className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`size-1.5 rounded-full ${
                                  alert.severity === "critical"
                                    ? "bg-red-400"
                                    : alert.severity === "warning"
                                      ? "bg-amber-400"
                                      : "bg-zinc-500"
                                }`}
                              />
                              <p className="text-xs font-semibold">{alert.title}</p>
                            </div>
                            <p className="mt-1 pl-3.5 text-xs leading-5 text-zinc-500">
                              {alert.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {!selectedRun.report && selectedRun.alerts.length === 0 && (
                    <div className="rounded-lg border border-zinc-800 p-5 text-sm text-zinc-500">
                      La ejecución terminó correctamente, pero no produjo contenido adicional.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
