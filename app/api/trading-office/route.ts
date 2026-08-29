import { NextRequest, NextResponse } from "next/server";
import { supabaseServerFetch } from "@/app/lib/supabase/server";
import {
  SOP_STEPS,
  calculateProgress,
  countCompletedSteps,
  getActiveWaitValidation,
  getEntryValidation,
  getLocalDateKey,
  isAfterEntryValidationStart,
  isAfterSopStart,
  isInvalidSetupName,
  isInvalidSetupQuality,
  normalizeCompletedSteps,
  type ActiveWaitValidation,
  type EntryValidation,
} from "@/app/lib/sop";

export const dynamic = "force-dynamic";

type SopSession = {
  id: string;
  session_date: string;
  completed_steps: Record<string, unknown> | null;
  completed_count: number;
  total_steps: number;
  progress: number;
  status: "in_progress" | "completed";
  completed_at: string | null;
};

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
};

type Setup = {
  id: string;
  name: string;
  active: boolean;
};

function getStepAvailability(stepId: number, now = new Date()) {
  const step = SOP_STEPS.find((item) => item.id === stepId);

  if (!step?.availableAfter) {
    return true;
  }

  return isAfterSopStart(now);
}

function getNextStep(
  completed: Record<number, boolean>,
  trades: Trade[],
) {
  if (trades.length > 0) {
    if (!completed[6]) return 6;
    if (!completed[7]) return 7;
    if (!completed[8]) return 8;
    return null;
  }

  if (!completed[1]) return 1;
  if (!completed[2]) return 2;
  if (!completed[4]) return 4;
  if (!completed[5]) return 5;

  return null;
}

async function ensureSopSession(date: string) {
  const existing = await supabaseServerFetch<SopSession[]>("sop_sessions", {
    query:
      `?select=id,session_date,completed_steps,completed_count,total_steps,progress,status,completed_at&session_date=eq.${encodeURIComponent(date)}&limit=1`,
  });

  if (existing?.[0]) {
    return existing[0];
  }

  return upsertSession(date, {});
}

async function getTodayState(sessionDate?: string) {
  const today = sessionDate || getLocalDateKey();
  const session = await ensureSopSession(today);

  const [days, trades, setups] = await Promise.all([
    supabaseServerFetch<TradingDay[]>("trading_days", {
      query:
        `?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes&date=eq.${encodeURIComponent(today)}&limit=1`,
    }),
    supabaseServerFetch<Trade[]>("trades", {
      query:
        `?select=id,trade_date,instrument,direction,setup_id,setup_quality,execution_quality,emotion,close_type,r,created_at&trade_date=eq.${encodeURIComponent(today)}&order=created_at.asc`,
    }),
    supabaseServerFetch<Setup[]>("setups", {
      query: "?select=id,name,active&active=eq.true&order=name.asc",
    }),
  ]);

  const tradingDay = days?.[0] ?? null;
  const todayTrades = trades ?? [];
  const completed = normalizeCompletedSteps(session?.completed_steps);
  const activeWaitValidation = getActiveWaitValidation(
    session?.completed_steps,
  );
  const entryValidation = getEntryValidation(session?.completed_steps);

  return {
    today,
    session,
    tradingDay,
    trades: todayTrades,
    setups: setups ?? [],
    completed,
    activeWaitValidation,
    entryValidation,
    progress: calculateProgress(session?.completed_steps),
    completedCount: countCompletedSteps(session?.completed_steps),
    totalSteps: SOP_STEPS.length,
    sessionFinished: Boolean(tradingDay?.session_finished),
    nextStep: getNextStep(completed, todayTrades),
    entryGate: {
      validated: Boolean(entryValidation),
      canValidate:
        isAfterEntryValidationStart() && !Boolean(entryValidation),
      blockedReason: Boolean(entryValidation)
        ? "La entrada ya fue validada para esta jornada."
        : !isAfterEntryValidationStart()
          ? "La validación de entrada comienza a las 9:45 AM."
          : null,
    },
  };
}

async function upsertSession(
  date: string,
  completedSteps: Record<string, unknown>,
) {
  const completedCount = countCompletedSteps(completedSteps);
  const progress = calculateProgress(completedSteps);
  const status = progress === 100 ? "completed" : "in_progress";
  const completedAt =
    progress === 100 ? new Date().toISOString() : null;

  const rows = await supabaseServerFetch<SopSession[]>("sop_sessions", {
    method: "POST",
    query: "?on_conflict=user_id%2Csession_date",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      session_date: date,
      completed_steps: completedSteps,
      completed_count: completedCount,
      total_steps: SOP_STEPS.length,
      progress,
      status,
      completed_at: completedAt,
    },
  });

  return rows?.[0] ?? null;
}

async function ensureTradingDay(date: string) {
  const rows = await supabaseServerFetch<TradingDay[]>("trading_days", {
    query:
      `?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes&date=eq.${encodeURIComponent(date)}&limit=1`,
  });

  if (rows?.[0]) {
    return rows[0];
  }

  const created = await supabaseServerFetch<TradingDay[]>(
    "trading_days",
    {
      method: "POST",
      prefer: "return=representation",
      body: {
        date,
        mental_state: null,
        waited_for_setup: false,
        only_one_trade: false,
        did_not_recover_losses: true,
        session_finished: false,
        notes: null,
      },
    },
  );

  return created?.[0] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const date =
      request.nextUrl.searchParams.get("date") || getLocalDateKey();

    return NextResponse.json({
      success: true,
      ...(await getTodayState(date)),
    });
  } catch (error) {
    console.error("Trading Office GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar Trading Office.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    const today = String(body.sessionDate || getLocalDateKey());
    const current = await getTodayState(today);

    const currentSteps = {
      ...current.completed,
    } as Record<string, unknown>;

    if (
      current.tradingDay?.session_finished &&
      action !== "get_state"
    ) {
      throw new Error(
        "La jornada ya fue finalizada. El SOP de esta fecha está bloqueado.",
      );
    }

    if (action === "toggle_step") {
      const stepId = Number(body.stepId);

      if (
        !Number.isInteger(stepId) ||
        !SOP_STEPS.some((step) => step.id === stepId)
      ) {
        throw new Error("Paso de SOP inválido.");
      }

      if (stepId === 4 && !getStepAvailability(4)) {
        throw new Error(
          "El paso de espera activa se habilita a las 9:15 AM.",
        );
      }

      if (stepId === 4) {
        if (currentSteps["4"] !== true) {
          throw new Error(
            "El paso Esperar activamente debe validarse desde su Gate.",
          );
        }

        currentSteps["4"] = false;
        currentSteps["__activeWaitValidation"] = null;

        if (current.tradingDay) {
          await supabaseServerFetch("trading_days", {
            method: "PATCH",
            query: `?id=eq.${encodeURIComponent(current.tradingDay.id)}`,
            body: {
              waited_for_setup: false,
            },
          });
        }

        await upsertSession(today, currentSteps);

        return NextResponse.json({
          success: true,
          ...(await getTodayState(today)),
        });
      }

      if (stepId === 5) {
        if (currentSteps["4"] !== true) {
          throw new Error(
            "Primero completa Esperar activamente antes de ejecutar un setup válido.",
          );
        }

        if (currentSteps["5"] !== true) {
          throw new Error(
            "El paso 5 debe validarse desde el Gate de entrada.",
          );
        }

        currentSteps["5"] = false;
        currentSteps["__entryValidation"] = null;

        await upsertSession(today, currentSteps);

        return NextResponse.json({
          success: true,
          ...(await getTodayState(today)),
        });
      }

      if (stepId === 6 && current.trades.length === 0) {
        throw new Error(
          "Documenta la operación después de registrar el trade.",
        );
      }

      if (stepId === 7 && current.trades.length === 0) {
        throw new Error(
          "No puedes cerrar plataformas sin una operación registrada.",
        );
      }

      if (stepId === 8) {
        throw new Error(
          "El paso 8 se completa únicamente mediante Finalizar jornada.",
        );
      }

      currentSteps[String(stepId)] =
        currentSteps[String(stepId)] === true ? false : true;

      await upsertSession(today, currentSteps);

      return NextResponse.json({
        success: true,
        ...(await getTodayState(today)),
      });
    }

    if (action === "validate_wait") {
      if (today !== getLocalDateKey()) {
        throw new Error(
          "La espera activa solo puede validarse en la jornada de hoy.",
        );
      }

      const currentMinutes = Number(body.currentMinutes);

      if (!Number.isFinite(currentMinutes) || currentMinutes < 555) {
        throw new Error(
          "La espera activa comienza a las 9:15 AM.",
        );
      }

      const confirmations = (body.confirmations ?? {}) as Record<
        string,
        unknown
      >;

      const requiredConfirmations = [
        "htfDirection",
        "liquidityLevels",
        "validZones",
        "validSmt",
        "dailyCycle",
      ];

      if (
        requiredConfirmations.some(
          (key) => confirmations[key] !== true,
        )
      ) {
        throw new Error(
          "Completa las cinco áreas de revisión antes de marcar Esperar activamente.",
        );
      }

      const activeWaitValidation: ActiveWaitValidation = {
        confirmations: {
          htfDirection: true,
          liquidityLevels: true,
          validZones: true,
          validSmt: true,
          dailyCycle: true,
        },
        validatedAt: new Date().toISOString(),
      };

      currentSteps["4"] = true;
      currentSteps["__activeWaitValidation"] = activeWaitValidation;

      await upsertSession(today, currentSteps);

      const tradingDay =
        current.tradingDay ?? (await ensureTradingDay(today));

      if (tradingDay) {
        await supabaseServerFetch("trading_days", {
          method: "PATCH",
          query: `?id=eq.${encodeURIComponent(tradingDay.id)}`,
          body: {
            waited_for_setup: true,
          },
        });
      }

      return NextResponse.json({
        success: true,
        ...(await getTodayState(today)),
      });
    }

    if (action === "finalize_day") {
      if (today !== getLocalDateKey()) {
        throw new Error("Solo puedes finalizar la jornada de hoy.");
      }

      if (current.trades.length === 0) {
        throw new Error(
          "No puedes finalizar la jornada sin una operación registrada.",
        );
      }

      if (!currentSteps[6] || !currentSteps[7]) {
        throw new Error(
          "Completa Documentarlo y Cerrar plataformas antes de finalizar la jornada.",
        );
      }

      const tradingDay =
        current.tradingDay ?? (await ensureTradingDay(today));

      if (!tradingDay) {
        throw new Error(
          "No se pudo encontrar la jornada de Trading Days para esta fecha.",
        );
      }

      await supabaseServerFetch("trading_days", {
        method: "PATCH",
        query: `?id=eq.${encodeURIComponent(tradingDay.id)}`,
        body: {
          session_finished: true,
        },
      });

      currentSteps["8"] = true;

      await upsertSession(today, currentSteps);

      return NextResponse.json({
        success: true,
        ...(await getTodayState(today)),
      });
    }

    if (action === "reset_sop") {
      await upsertSession(today, {});

      return NextResponse.json({
        success: true,
        ...(await getTodayState(today)),
      });
    }

    if (action === "validate_entry") {
      const currentMinutes = Number(body.currentMinutes);

      if (!Number.isFinite(currentMinutes) || currentMinutes < 585) {
        throw new Error(
          "La validación de entrada comienza a las 9:45 AM.",
        );
      }

      if (currentSteps["4"] !== true) {
        throw new Error(
          "Primero valida Esperar activamente antes de validar la entrada.",
        );
      }

      const setupId = String(body.setupId ?? "");
      const setupQuality = String(body.setupQuality ?? "");

      const confirmations = (body.confirmations ?? {}) as Record<
        string,
        unknown
      >;

      const setup = current.setups.find((item) => item.id === setupId);

      if (!setup) {
        throw new Error("Selecciona un setup activo del plan.");
      }

      if (isInvalidSetupName(setup.name)) {
        throw new Error(
          "Ese setup está marcado como inválido/FOMO y no puede pasar el gate.",
        );
      }

      if (isInvalidSetupQuality(setupQuality)) {
        throw new Error("Un setup C no puede pasar el gate de entrada.");
      }

      const requiredConfirmations = [
        "planSetup",
        "structure",
        "confirmation",
        "risk",
        "mentalState",
      ];

      if (
        requiredConfirmations.some(
          (key) => confirmations[key] !== true,
        )
      ) {
        throw new Error(
          "No puedes validar la entrada mientras falte una condición del gate.",
        );
      }

      const entryValidation: EntryValidation = {
        setupId,
        setupName: setup.name,
        setupQuality,
        confirmations: {
          planSetup: true,
          structure: true,
          confirmation: true,
          risk: true,
          mentalState: true,
        },
        validatedAt: new Date().toISOString(),
      };

      currentSteps["4"] = true;
      currentSteps["5"] = true;
      currentSteps["__entryValidation"] = entryValidation;

      await upsertSession(today, currentSteps);

      const tradingDay =
        current.tradingDay ?? (await ensureTradingDay(today));

      if (tradingDay) {
        await supabaseServerFetch("trading_days", {
          method: "PATCH",
          query: `?id=eq.${encodeURIComponent(tradingDay.id)}`,
          body: {
            waited_for_setup: true,
            only_one_trade: false,
          },
        });
      }

      return NextResponse.json({
        success: true,
        ...(await getTodayState(today)),
      });
    }

    throw new Error("Acción de Trading Office no reconocida.");
  } catch (error) {
    console.error("Trading Office POST error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar Trading Office.",
      },
      { status: 400 },
    );
  }
}