"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SOP_STEPS,
  getLocalDateKey,
  isAfterEntryValidationStart,
  isAfterSopStart,
  type ActiveWaitValidation,
  type EntryValidation,
  type SopPhase,
} from "@/app/lib/sop";

type OfficeState = {
  today: string;
  completed: Record<number, boolean>;
  progress: number;
  completedCount: number;
  totalSteps: number;
  sessionFinished: boolean;
  nextStep: number | null;
  entryValidation: EntryValidation | null;
  activeWaitValidation: ActiveWaitValidation | null;
  setups: Array<{
    id: string;
    name: string;
    active: boolean;
  }>;
  entryGate: {
    validated: boolean;
    canValidate: boolean;
    blockedReason: string | null;
  };
  trades: Array<{
    id: string;
    setup_quality: string | null;
    r: number | null;
  }>;
};

const phases: SopPhase[] = [
  "Preparación",
  "Ejecución",
  "Cierre",
];

function getNextAction(
  stepId: number | null,
  completed: Record<number, boolean>,
  entryValidation: EntryValidation | null,
  sessionFinished: boolean,
) {
  if (sessionFinished || stepId === null) {
    return null;
  }

  const actions: Record<number, {
    title: string;
    description: string;
    button: string;
  }> = {
    1: {
      title: "Completar lectura trading al día",
      description: "Cierra este paso antes de pasar a la preparación del día.",
      button: "Completar →",
    },
    2: {
      title: "Revisar tus principios",
      description: "Alinea la sesión con el proceso antes de mirar una entrada.",
      button: "Completar →",
    },
    4: {
      title: "Esperar activamente",
      description: "Revisa HTF, liquidez, zonas, SMT y ciclo diario antes de buscar una entrada.",
      button: "Validar espera →",
    },
    5: {
      title: "Validar el setup",
      description: "Solo pasa una entrada que cumpla todas las condiciones del gate.",
      button: "Abrir gate →",
    },
    6: {
      title: entryValidation ? "Documentar la operación" : "Validar entrada primero",
      description: entryValidation
        ? "Registra el trade desde Journal; no abras una operación fuera del flujo.": "La entrada aún no está validada.",
      button: entryValidation ? "Abrir Journal →" : "Abrir gate →",
    },
    7: {
      title: "Cerrar plataformas",
      description: "Con la operación documentada, termina la sesión de mercado.",
      button: "Marcar cierre →",
    },
    8: {
      title: "Finalizar jornada",
      description: "Cierra el día y bloquea el SOP para preservar la ejecución real.",
      button: "Finalizar →",
    },
  };

  return actions[stepId] ?? null;
}

function resetGateState() {
  return {
    setupId: "",
    setupQuality: "A+",
    planSetup: false,
    structure: false,
    confirmation: false,
    risk: false,
    mentalState: false,
  };
}

function resetWaitGateState() {
  return {
    htfDirection: false,
    liquidityLevels: false,
    validZones: false,
    validSmt: false,
    dailyCycle: false,
  };
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey
    .split("-")
    .map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
    ),
  );
}

function formatDate(dateKey: string) {
  const date = parseDateKey(dateKey);

  return new Intl.DateTimeFormat(
    "es-DO",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  )
    .format(date)
    .replace(".", "")
    .replace(
      /^./,
      (char) => char.toUpperCase(),
    );
}

function formatLongDate(dateKey: string) {
  const date = parseDateKey(dateKey);

  return new Intl.DateTimeFormat(
    "es-DO",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  )
    .format(date)
    .replace(".", "");
}

function addDays(
  dateKey: string,
  amount: number,
) {
  const date = parseDateKey(dateKey);

  date.setUTCDate(
    date.getUTCDate() + amount,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function compareDateKeys(
  first: string,
  second: string,
) {
  return first.localeCompare(second);
}

async function requestOffice(
  sessionDate: string,
  action?: string,
  payload: Record<string, unknown> = {},
) {
  const url = new URL(
    "/api/trading-office",
    window.location.origin,
  );

  if (!action) {
    url.searchParams.set(
      "date",
      sessionDate,
    );
  }

  const response = await fetch(
    url.toString(),
    {
      method: action ? "POST" : "GET",

      headers: action
        ? {
            "Content-Type":
              "application/json",
          }
        : undefined,

      body: action
        ? JSON.stringify({
            action,
            sessionDate,
            ...payload,
          })
        : undefined,

      cache: "no-store",
    },
  );

  const data =
    (await response.json()) as OfficeState & {
      success: boolean;
      error?: string;
    };

  if (!response.ok || !data.success) {
    throw new Error(
      data.error ??
        "No se pudo actualizar Trading Office.",
    );
  }

  return data;
}

export function DailyWorkflowPanel() {
  const router = useRouter();

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(
    () => getLocalDateKey(),
  );

  const [
    state,
    setState,
  ] = useState<OfficeState | null>(
    null,
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
    currentTime,
    setCurrentTime,
  ] = useState(new Date());

  const [
    showGate,
    setShowGate,
  ] = useState(false);

  const [
    showWaitGate,
    setShowWaitGate,
  ] = useState(false);

  const [
    gate,
    setGate,
  ] = useState(resetGateState());

  const [
    waitGate,
    setWaitGate,
  ] = useState(resetWaitGateState());

  const today = getLocalDateKey();

  const isToday =
    selectedDate === today;

  const isFuture =
    compareDateKeys(
      selectedDate,
      today,
    ) > 0;

  const previousDate = addDays(
    selectedDate,
    -1,
  );

  const nextDate = addDays(
    selectedDate,
    1,
  );

  /*
   * ============================================================
   * LOAD
   * ============================================================
   */

  async function load(date: string) {
    try {
      setLoading(true);
      setError("");

      const data =
        await requestOffice(date);

      setState(data);

      if (data.activeWaitValidation) {
        setWaitGate({
          htfDirection:
            data.activeWaitValidation.confirmations.htfDirection,
          liquidityLevels:
            data.activeWaitValidation.confirmations.liquidityLevels,
          validZones:
            data.activeWaitValidation.confirmations.validZones,
          validSmt:
            data.activeWaitValidation.confirmations.validSmt,
          dailyCycle:
            data.activeWaitValidation.confirmations.dailyCycle,
        });
      } else {
        setWaitGate(resetWaitGateState());
      }

      if (data.entryValidation) {
        setGate({
          setupId:
            data.entryValidation
              .setupId ?? "",

          setupQuality:
            data.entryValidation
              .setupQuality ?? "A+",

          planSetup: true,
          structure: true,
          confirmation: true,
          risk: true,
          mentalState: true,
        });
      } else {
        setGate(
          resetGateState(),
        );
      }

      setShowGate(false);
      setShowWaitGate(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el SOP.",
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ============================================================
   * CARGAR JORNADA
   * ============================================================
   */

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        void load(selectedDate);
      }, 0);

    return () =>
      window.clearTimeout(timer);
  }, [selectedDate]);

  /*
   * ============================================================
   * RELOJ
   * ============================================================
   */

  useEffect(() => {
    const interval =
      window.setInterval(
        () => {
          setCurrentTime(
            new Date(),
          );
        },
        30_000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, []);

  /*
   * ============================================================
   * CAMBIO AUTOMÁTICO DE DÍA
   * ============================================================
   */

  useEffect(() => {
    const interval =
      window.setInterval(
        () => {
          const localDate =
            getLocalDateKey();

          if (
            selectedDate ===
              localDate &&
            state &&
            state.today !==
              localDate
          ) {
            setSelectedDate(
              localDate,
            );

            setShowGate(false);
            setShowWaitGate(false);

            setGate(
              resetGateState(),
            );

            setWaitGate(
              resetWaitGateState(),
            );

            setState(null);

            setError("");
          }
        },
        15_000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, [
    selectedDate,
    state,
  ]);

  /*
   * ============================================================
   * NAVEGACIÓN DE JORNADAS
   * ============================================================
   */

  function changeDate(date: string) {
    if (
      compareDateKeys(
        date,
        today,
      ) > 0
    ) {
      return;
    }

    setSelectedDate(date);
    setState(null);
    setError("");
    setShowGate(false);
    setShowWaitGate(false);
    setGate(resetGateState());
    setWaitGate(resetWaitGateState());
  }

  function goPreviousDay() {
    changeDate(previousDate);
  }

  function goNextDay() {
    if (!isToday) {
      changeDate(nextDate);
    }
  }

  function goToday() {
    if (!isToday) {
      changeDate(today);
    }
  }

  /*
   * ============================================================
   * DERIVED STATE
   * ============================================================
   */

  const isActiveWaitReady =
    isAfterSopStart(currentTime);

  const isEntryReady =
    isAfterEntryValidationStart(currentTime);

  const completed =
    state?.completed ?? {};

  const progress =
    state?.progress ?? 0;

  const completedCount =
    state?.completedCount ?? 0;

  const sessionFinished =
    state?.sessionFinished === true;

  const gateComplete =
    gate.planSetup === true &&
    gate.structure === true &&
    gate.confirmation === true &&
    gate.risk === true &&
    gate.mentalState === true;

  const waitGateComplete =
    waitGate.htfDirection === true &&
    waitGate.liquidityLevels === true &&
    waitGate.validZones === true &&
    waitGate.validSmt === true &&
    waitGate.dailyCycle === true;

  const nextStep = state?.nextStep ?? null;

  const nextAction = getNextAction(
    nextStep,
    completed,
    state?.entryValidation ?? null,
    sessionFinished,
  );

  /*
   * ============================================================
   * TOGGLE STEP
   * ============================================================
   */

  async function toggleStep(
    stepId: number,
  ) {
    try {
      setSaving(true);
      setError("");

      const data =
        await requestOffice(
          selectedDate,
          "toggle_step",
          {
            stepId,
          },
        );

      setState(data);

      if (
        stepId === 5 &&
        !data.entryValidation
      ) {
        setGate(
          resetGateState(),
        );

        setShowGate(false);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el SOP.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function validateActiveWait() {
    if (!isToday) {
      setError(
        "La espera activa solo puede validarse en la jornada de hoy.",
      );
      return;
    }

    if (!isActiveWaitReady) {
      setError(
        "La espera activa comienza a las 9:20 AM.",
      );
      return;
    }

    if (!waitGateComplete) {
      setError(
        "Completa las cinco áreas de revisión antes de marcar Esperar activamente.",
      );
      return;
    }

    try {
      setSaving(true);
      setError("");

      const data = await requestOffice(
        selectedDate,
        "validate_wait",
        {
          currentMinutes:
            currentTime.getHours() * 60 +
            currentTime.getMinutes(),
          confirmations: waitGate,
        },
      );

      setState(data);
      setShowWaitGate(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo validar la espera activa.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ============================================================
   * RESET ALL
   * ============================================================
   */

  async function resetAll() {
    const confirmed =
      window.confirm(
        `¿Desmarcar todos los pasos del SOP de ${formatDate(
          selectedDate,
        )}?\n\nEsto no eliminará trades ni el Trading Day. Solo reiniciará el checklist y la validación de entrada de esta jornada.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const data =
        await requestOffice(
          selectedDate,
          "reset_sop",
        );

      setState(data);
      setShowGate(false);
      setShowWaitGate(false);
      setGate(resetGateState());
      setWaitGate(resetWaitGateState());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo reiniciar el SOP.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ============================================================
   * FINALIZAR JORNADA
   * ============================================================
   */

  async function finalizeDay() {
    if (!isToday) {
      setError(
        "Solo puedes finalizar la jornada de hoy.",
      );

      return;
    }

    if (sessionFinished) {
      return;
    }

    const confirmed =
      window.confirm(
        `¿Finalizar la jornada del ${formatDate(
          selectedDate,
        )}?\n\nDespués de finalizar, el SOP de esta jornada quedará bloqueado.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const data =
        await requestOffice(
          selectedDate,
          "finalize_day",
        );

      setState(data);
      setShowGate(false);
      setShowWaitGate(false);
      setGate(resetGateState());
      setWaitGate(resetWaitGateState());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo finalizar la jornada.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ============================================================
   * JOURNAL
   * ============================================================
   */

  function openTradeJournal() {
    if (!state?.entryValidation) {
      setError(
        "Primero valida la entrada desde el Gate de entrada.",
      );

      return;
    }

    router.push(
      `/journal?new=1&date=${encodeURIComponent(
        selectedDate,
      )}`,
    );
  }

  /*
   * ============================================================
   * VALIDATE ENTRY
   * ============================================================
   */

  async function validateEntry() {
    if (!isToday) {
      setError(
        "La validación de entrada solo puede ejecutarse en la jornada de hoy.",
      );

      return;
    }

    if (!isEntryReady) {
      setError(
        "La validación de entrada comienza a las 9:45 AM.",
      );

      return;
    }

    if (!gateComplete) {
      setError(
        "Completa las cinco confirmaciones antes de validar la entrada.",
      );

      return;
    }

    try {
      setSaving(true);
      setError("");

      const data =
        await requestOffice(
          selectedDate,
          "validate_entry",
          {
            setupId:
              gate.setupId,

            setupQuality:
              gate.setupQuality,

            currentMinutes:
              currentTime.getHours() *
                60 +
              currentTime.getMinutes(),

            confirmations: {
              planSetup:
                gate.planSetup,

              structure:
                gate.structure,

              confirmation:
                gate.confirmation,

              risk:
                gate.risk,

              mentalState:
                gate.mentalState,
            },
          },
        );

      setState(data);
      setShowGate(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo validar la entrada.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleNextAction(stepId: number | null) {
    if (!stepId) return;

    if (stepId === 4) {
      if (!isToday) {
        setError("La espera activa solo puede validarse en la jornada de hoy.");
        return;
      }
      if (!isActiveWaitReady) {
        setError("La espera activa comienza a las 9:20 AM.");
        return;
      }
      setShowWaitGate(true);
      return;
    }

    if (stepId === 5) {
      if (!isToday) {
        setError("La validación de entrada solo puede ejecutarse en la jornada de hoy.");
        return;
      }
      setShowGate(true);
      return;
    }

    if (stepId === 6) {
      openTradeJournal();
      return;
    }

    if (stepId === 8) {
      await finalizeDay();
      return;
    }

    await toggleStep(stepId);
  }

  return (
    <section className="relative h-full rounded-xl border border-zinc-700/70 bg-zinc-900/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-5 w-[2px] rounded-full bg-emerald-400" />

            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Trading Office · SOP
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={goPreviousDay}
              disabled={saving}
              aria-label="Jornada anterior"
              className="grid size-7 place-items-center rounded-md border border-zinc-800 text-sm text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹
            </button>

            <div className="min-w-[190px]">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Jornada
                </p>

                {isToday && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-400">
                    Hoy
                  </span>
                )}

                {!isToday && (
                  <button
                    type="button"
                    onClick={goToday}
                    className="rounded-full border border-zinc-700 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400 transition hover:border-emerald-500/40 hover:text-emerald-400"
                  >
                    Ir a hoy
                  </button>
                )}
              </div>

              <p className="mt-1 text-sm font-semibold capitalize text-zinc-100">
                {formatLongDate(
                  selectedDate,
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={goNextDay}
              disabled={
                saving ||
                isToday
              }
              aria-label="Jornada siguiente"
              className="grid size-7 place-items-center rounded-md border border-zinc-800 text-sm text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>

        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-zinc-100">
            {completedCount}/
            {state?.totalSteps ?? 8}
          </p>

          <p className="mt-0.5 text-[10px] text-zinc-500">
            {progress}%
          </p>
        </div>
      </div>

      <div className="mt-5 h-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] leading-4 text-red-400">
          {error}
        </div>
      )}

      {!isToday && (
        <div className="mt-4 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-[10px] leading-4 text-blue-300">
          Estás viendo una jornada histórica. Puedes consultar su
          checklist; la validación de entrada y el cierre solo están
          disponibles para la jornada de hoy.
        </div>
      )}

      {isFuture && (
        <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-300">
          Esta jornada todavía no está disponible.
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-xs text-zinc-500">
          Cargando jornada...
        </div>
      ) : (
        <>
          {!sessionFinished && nextAction && (
            <div className="mt-6 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.035] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                    SIGUIENTE ACCIÓN
                  </p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">
                    {nextAction.title}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-zinc-500">
                    {nextAction.description}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleNextAction(nextStep)}
                  className="shrink-0 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {nextAction.button}
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-7 md:grid-cols-3">
            {phases.map((phase) => {
              const phaseSteps =
                SOP_STEPS.filter(
                  (step) =>
                    step.phase ===
                    phase,
                );

              const phaseColor =
                phase ===
                "Preparación"
                  ? "text-emerald-400"
                  : phase ===
                      "Ejecución"
                    ? "text-blue-400"
                    : "text-amber-400";

              return (
                <div key={phase}>
                  <p
                    className={`mb-4 text-[10px] font-semibold uppercase tracking-[0.17em] ${phaseColor}`}
                  >
                    {phase}
                  </p>

                  <div className="space-y-3">
                    {phaseSteps.map(
                      (step) => {
                        const checked =
                          completed[
                            step.id
                          ] === true;

                        const lockedByTime =
                          step.id === 4 &&
                          isToday &&
                          !isActiveWaitReady;

                        const isWaitGate =
                          step.id === 4;

                        const isGate =
                          step.id === 5;

                        const gateBlockedByWait =
                          isGate &&
                          completed[4] !== true;

                        const isDocument =
                          step.id === 6;

                        const isClose =
                          step.id === 8;

                        const documentBlocked =
                          isDocument &&
                          !state?.entryValidation;

                        const historicalWaitGate =
                          !isToday &&
                          isWaitGate;

                        const historicalGate =
                          !isToday &&
                          isGate;

                        return (
                          <button
                            key={step.id}
                            type="button"
                            disabled={
                              saving ||
                              sessionFinished ||
                              lockedByTime ||
                              documentBlocked ||
                              historicalWaitGate ||
                              historicalGate ||
                              gateBlockedByWait
                            }
                            onClick={() => {
                              if (isWaitGate) {
                                if (checked) {
                                  void toggleStep(4);
                                } else {
                                  if (!isToday) {
                                    setError(
                                      "La espera activa solo puede validarse en la jornada de hoy.",
                                    );
                                    return;
                                  }

                                  setShowWaitGate(true);
                                }

                                return;
                              }

                              if (isGate) {
                                if (checked) {
                                  void toggleStep(
                                    5,
                                  );
                                } else {
                                  if (!isToday) {
                                    setError(
                                      "La validación de entrada solo puede ejecutarse en la jornada de hoy.",
                                    );

                                    return;
                                  }

                                  setShowGate(
                                    true,
                                  );
                                }

                                return;
                              }

                              if (isDocument) {
                                openTradeJournal();

                                return;
                              }

                              if (isClose) {
                                void finalizeDay();

                                return;
                              }

                              void toggleStep(
                                step.id,
                              );
                            }}
                            className={`flex w-full items-start gap-3 rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              nextStep === step.id && !checked
                                ? "border-emerald-500/25 bg-emerald-500/[0.035]"
                                : "border-transparent hover:border-zinc-800 hover:bg-zinc-800/30"
                            }`}
                          >
                            <span
                              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border text-[10px] font-bold ${
                                checked
                                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                                  : "border-zinc-600 text-transparent"
                              }`}
                            >
                              ✓
                            </span>

                            <span className="min-w-0">
                              <span
                                className={`block text-[12px] font-semibold leading-5 ${
                                  checked
                                    ? "text-zinc-500 line-through"
                                    : "text-zinc-200"
                                }`}
                              >
                                {step.label}
                              </span>

                              {step.detail && (
                                <span className="mt-0.5 block text-[10px] leading-4 text-zinc-500">
                                  {
                                    step.detail
                                  }
                                </span>
                              )}

                              {isClose &&
                                !checked &&
                                !sessionFinished && (
                                  <span className="mt-1 block text-[10px] font-medium text-amber-400">
                                    Finalizar jornada →
                                  </span>
                                )}

                              {isClose &&
                                checked && (
                                  <span className="mt-1 block text-[10px] font-medium text-emerald-400">
                                    Jornada finalizada · SOP bloqueado
                                  </span>
                                )}

                              {isWaitGate &&
                                !checked &&
                                isToday && (
                                  <span className="mt-1 block text-[10px] font-medium text-blue-400">
                                    Abrir revisión de espera activa →
                                  </span>
                                )}

                              {isGate &&
                                !checked &&
                                isToday && (
                                  <span className="mt-1 block text-[10px] font-medium text-blue-400">
                                    Abrir validación de entrada →
                                  </span>
                                )}

                              {isGate &&
                                checked && (
                                  <span className="mt-1 block text-[10px] font-medium text-zinc-500">
                                    Click para desmarcar →
                                  </span>
                                )}

                              {isDocument &&
                                !checked &&
                                state?.entryValidation && (
                                  <span className="mt-1 block text-[10px] font-medium text-blue-400">
                                    Abrir nueva entrada en Journal →
                                  </span>
                                )}
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={
                saving ||
                sessionFinished ||
                completedCount === 0
              }
              onClick={() =>
                void resetAll()
              }
              className="rounded-md border border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 transition hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Reiniciar SOP
            </button>
          </div>
        </>
      )}

      {state?.entryValidation && (
        <div className="mt-6 rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                Entrada validada
              </p>

              <p className="mt-1 text-xs font-semibold text-zinc-100">
                {
                  state.entryValidation
                    .setupName
                }{" "}
                ·{" "}
                {
                  state.entryValidation
                    .setupQuality
                }
              </p>
            </div>
          </div>
        </div>
      )}


      {showWaitGate && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/70 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-xl border border-zinc-700 bg-[var(--surface-2)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                  Esperar activamente
                </p>

                <h3 className="mt-2 text-lg font-semibold text-zinc-100">
                  Lectura del mercado antes de ejecutar
                </h3>

                <p className="mt-1 text-[10px] text-zinc-500">
                  Jornada: {formatDate(selectedDate)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowWaitGate(false)}
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-2">
              {[
                ["htfDirection", "Dirección en HTF"],
                [
                  "liquidityLevels",
                  "Niveles de liquidez (PDH / PDL / PHW / PLW / BSL / SSL)",
                ],
                [
                  "validZones",
                  "Zonas válidas (1H / 15M / 5M)",
                ],
                ["validSmt", "SMT válido"],
                [
                  "dailyCycle",
                  "Posible ciclo diario (Asia / Londres)",
                ],
              ].map(([key, label]) => {
                const checked = Boolean(
                  waitGate[key as keyof typeof waitGate],
                );

                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-800 px-3 py-2.5 hover:bg-zinc-900/70"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setWaitGate((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                      className="mt-0.5 accent-emerald-500"
                    />

                    <span className="text-xs leading-5 text-zinc-300">
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-[10px] text-zinc-500">
                Marca cada área cuando ya la hayas revisado.
              </p>

              <button
                type="button"
                disabled={
                  saving ||
                  !waitGateComplete ||
                  !isActiveWaitReady ||
                  !isToday
                }
                onClick={() => void validateActiveWait()}
                className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Validando…" : "Marcar espera activa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGate && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/70 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-xl border border-zinc-700 bg-[var(--surface-2)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                  Gate de entrada
                </p>

                <h3 className="mt-2 text-lg font-semibold text-zinc-100">
                  ¿Esta entrada cumple el SOP?
                </h3>

                <p className="mt-1 text-[10px] text-zinc-500">
                  Jornada:{" "}
                  {formatDate(
                    selectedDate,
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowGate(false)
                }
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Setup

                <select
                  value={
                    gate.setupId
                  }
                  onChange={(event) =>
                    setGate(
                      (current) => ({
                        ...current,
                        setupId:
                          event.target
                            .value,
                      }),
                    )
                  }
                  className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs normal-case tracking-normal text-zinc-100 outline-none focus:border-emerald-500"
                >
                  <option value="">
                    Seleccionar setup
                  </option>

                  {(
                    state?.setups ??
                    []
                  ).map((setup) => (
                    <option
                      key={setup.id}
                      value={setup.id}
                    >
                      {setup.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Calidad

                <select
                  value={
                    gate.setupQuality
                  }
                  onChange={(event) =>
                    setGate(
                      (current) => ({
                        ...current,
                        setupQuality:
                          event.target
                            .value,
                      }),
                    )
                  }
                  className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs normal-case tracking-normal text-zinc-100 outline-none focus:border-emerald-500"
                >
                  <option>A+</option>
                  <option>B+</option>
                  <option>B</option>
                  <option>C</option>
                </select>
              </label>
            </div>

            <div className="mt-5 space-y-2">
              {[
                [
                  "planSetup",
                  "El setup pertenece al plan y está correctamente identificado.",
                ],

                [
                  "structure",
                  "La estructura/confluencia requerida está completa.",
                ],

                [
                  "confirmation",
                  "La confirmación de entrada ya ocurrió.",
                ],

                [
                  "risk",
                  "El riesgo está definido y aceptado para esta entrada.",
                ],

                [
                  "mentalState",
                  "Estoy en condiciones de ejecutar sin impulso ni FOMO.",
                ],
              ].map(
                ([key, label]) => {
                  const checked =
                    Boolean(
                      gate[
                        key as keyof typeof gate
                      ],
                    );

                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-800 px-3 py-2.5 hover:bg-zinc-900/70"
                    >
                      <input
                        type="checkbox"
                        checked={
                          checked
                        }
                        onChange={(
                          event,
                        ) =>
                          setGate(
                            (
                              current,
                            ) => ({
                              ...current,
                              [key]:
                                event
                                  .target
                                  .checked,
                            }),
                          )
                        }
                        className="mt-0.5 accent-emerald-500"
                      />

                      <span className="text-xs leading-5 text-zinc-300">
                        {label}
                      </span>
                    </label>
                  );
                },
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-[10px] text-zinc-500">
                Una vez validada, la entrada queda registrada para esta jornada.
              </p>

              <button
                type="button"
                disabled={
                  saving ||
                  !gateComplete ||
                  !isEntryReady ||
                  !isToday
                }
                onClick={() =>
                  void validateEntry()
                }
                className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving
                  ? "Validando…"
                  : "Validar entrada"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}