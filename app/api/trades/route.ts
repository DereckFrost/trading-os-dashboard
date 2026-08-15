import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  supabaseServerFetch,
} from "@/app/lib/supabase/server";
import { deleteScreenshotUrl } from "@/app/lib/trade-screenshots";

import {
  calculateExecutionScore,
  calculateProgress,
  countCompletedSteps,
  getEntryValidation,
  normalizeCompletedSteps,
  SOP_STEPS,
} from "@/app/lib/sop";

export const dynamic = "force-dynamic";

function eqFilter(column: string, value: string) {
  return `${column}=eq.${encodeURIComponent(value)}`;
}

type Setup = {
  id: string;
  name: string;
  active: boolean;
};

type SopSession = {
  id: string;
  session_date: string;
  completed_steps: Record<string, unknown> | null;
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

type TradeRow = {
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
  created_at: string | null;
};

async function ensureTradingDay(date: string) {
  const existing = await supabaseServerFetch<TradingDay[]>(
    "trading_days",
    {
      query:
        `?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes` +
        `&${eqFilter("date", date)}` +
        "&limit=1",
    },
  );

  if (existing?.[0]) {
    return existing[0];
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

async function getSopSession(date: string) {
  const rows = await supabaseServerFetch<SopSession[]>(
    "sop_sessions",
    {
      query:
        `?select=id,session_date,completed_steps` +
        `&${eqFilter("session_date", date)}` +
        "&limit=1",
    },
  );

  return rows?.[0] ?? null;
}

async function saveSopSteps(
  date: string,
  completedSteps: Record<string, unknown>,
) {
  const progress = calculateProgress(completedSteps);

  const rows = await supabaseServerFetch<SopSession[]>(
    "sop_sessions",
    {
      method: "POST",
      query: "?on_conflict=user_id%2Csession_date",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        session_date: date,
        completed_steps: completedSteps,
        completed_count: countCompletedSteps(completedSteps),
        total_steps: SOP_STEPS.length,
        progress,
        status: progress === 100 ? "completed" : "in_progress",
        completed_at:
          progress === 100 ? new Date().toISOString() : null,
      },
    },
  );

  return rows?.[0] ?? null;
}

async function syncTradingDay(date: string) {
  const day = await ensureTradingDay(date);

  if (!day) {
    return;
  }

  const dayTrades = await supabaseServerFetch<
    Array<{
      id: string;
      r: number | null;
      created_at: string | null;
    }>
  >("trades", {
    query:
      `?select=id,r,created_at` +
      `&${eqFilter("trade_date", date)}` +
      "&order=created_at.asc",
  });

  const onlyOneTrade = dayTrades.length === 1;

  let didNotRecoverLosses = true;

  for (let index = 0; index < dayTrades.length - 1; index += 1) {
    if (Number(dayTrades[index]?.r ?? 0) < 0) {
      didNotRecoverLosses = false;
      break;
    }
  }

  const session = await getSopSession(date);

  const completed = normalizeCompletedSteps(
    session?.completed_steps,
  );

  const sessionFinished = completed[8] === true;

  await supabaseServerFetch("trading_days", {
    method: "PATCH",
    query: `?${eqFilter("id", day.id)}`,
    body: {
      waited_for_setup: completed[4] === true,
      only_one_trade: onlyOneTrade,
      did_not_recover_losses: didNotRecoverLosses,
      session_finished: sessionFinished,
    },
  });
}

async function getTradeOrThrow(id: string) {
  const rows = await supabaseServerFetch<TradeRow[]>("trades", {
    query:
      `?select=*` +
      `&${eqFilter("id", id)}` +
      "&limit=1",
  });

  const trade = rows?.[0];

  if (!trade) {
    throw new Error("No se encontró el trade solicitado.");
  }

  return trade;
}

/* -------------------------------------------------------------------------- */
/* GET */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date");
    const id = request.nextUrl.searchParams.get("id");

    if (id) {
      const trade = await getTradeOrThrow(id);

      return NextResponse.json({
        success: true,
        trade,
      });
    }

    const query = date
      ? `?select=*&${eqFilter(
          "trade_date",
          date,
        )}&order=created_at.desc`
      : "?select=*&order=trade_date.desc,created_at.desc";

    const trades = await supabaseServerFetch<TradeRow[]>(
      "trades",
      {
        query,
      },
    );

    return NextResponse.json({
      success: true,
      trades: trades ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar los trades.";

    const status =
      message === "No se encontró el trade solicitado."
        ? 404
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const tradeDate = String(body.trade_date ?? "");
    const setupId = String(body.setup_id ?? "");
    const setupQuality = String(body.setup_quality ?? "");
    const executionQuality = String(body.execution_quality ?? "");
    const numericR = Number(body.r);
    const enforceSop = Boolean(body.enforce_sop);

    if (!tradeDate) {
      throw new Error("Selecciona la fecha del trade.");
    }

    if (!setupId) {
      throw new Error("Selecciona un setup.");
    }

    if (!Number.isFinite(numericR)) {
      throw new Error("El valor de R no es válido.");
    }

    const [
      setupRows,
      tradingDay,
      todaySop,
      existingTrades,
    ] = await Promise.all([
      supabaseServerFetch<Setup[]>("setups", {
        query:
          `?select=id,name,active` +
          `&${eqFilter("id", setupId)}` +
          "&limit=1",
      }),

      ensureTradingDay(tradeDate),

      enforceSop
        ? getSopSession(tradeDate)
        : Promise.resolve(null),

      supabaseServerFetch<Array<{ id: string }>>(
        "trades",
        {
          query:
            `?select=id` +
            `&${eqFilter("trade_date", tradeDate)}` +
            "&limit=1",
        },
      ),
    ]);

    const setup = setupRows?.[0] ?? null;

    if (!setup || !setup.active) {
      throw new Error("Selecciona un setup activo válido.");
    }

    /*
     * IMPORTANTE:
     *
     * El Journal registra la realidad.
     *
     * Un setup FOMO, inválido o calidad C NO se bloquea.
     * Es precisamente una violación que necesitamos registrar
     * para medir disciplina, sobreoperación y cumplimiento.
     */

    let sopValidated = false;

    /*
     * El SOP solamente controla la PRIMERA operación
     * del día.
     *
     * Si ya existe un trade:
     * → permitir registrar el siguiente.
     * → no volver a exigir el Entry Gate.
     * → esto permite medir la ruptura de "1 trade".
     */

    if (enforceSop) {
      const hasExistingTrade =
        (existingTrades?.length ?? 0) > 0;

      if (!hasExistingTrade) {
        const entryValidation = getEntryValidation(
          todaySop?.completed_steps,
        );

        const completed = normalizeCompletedSteps(
          todaySop?.completed_steps,
        );

        sopValidated =
          completed[5] === true ||
          Boolean(entryValidation);

        if (!sopValidated) {
          throw new Error(
            "La primera operación del día requiere validar la entrada desde Trading Office.",
          );
        }
      }
    }

    const title =
      `${String(body.instrument ?? "US100")} ` +
      `${String(body.direction ?? "LONG")} — ` +
      `${setup.name}`;

    const payload = {
      title,

      trading_day_id:
        tradingDay?.id ??
        null,

      setup_id: setup.id,

      trade_date: tradeDate,

      instrument: String(
        body.instrument ?? "",
      ).trim(),

      direction: String(
        body.direction ?? "LONG",
      ),

      setup_quality: setupQuality,

      execution_quality: executionQuality,

      emotion: String(
        body.emotion ?? "Neutral",
      ),

      close_type: String(
        body.close_type ?? "⚪ BE",
      ),

      r: numericR,

      before_screenshot_url:
        String(
          body.before_screenshot_url ?? "",
        ).trim() || null,

      after_screenshot_url:
        String(
          body.after_screenshot_url ?? "",
        ).trim() || null,

      notes:
        String(
          body.notes ?? "",
        ).trim() || null,
    };

    const created = await supabaseServerFetch<TradeRow[]>(
      "trades",
      {
        method: "POST",
        prefer: "return=representation",
        body: payload,
      },
    );

    const trade = created?.[0] ?? null;

    if (!trade) {
      throw new Error(
        "Supabase no devolvió el trade creado.",
      );
    }

    /*
     * Solamente la primera operación validada
     * activa los pasos posteriores del SOP.
     *
     * Los trades adicionales NO modifican el SOP.
     * Se registran como ejecución real de la jornada.
     */

    if (sopValidated) {
      const session = await getSopSession(tradeDate);

      const completed = normalizeCompletedSteps(
        session?.completed_steps,
      );

      completed[6] = true;
      completed[7] = false;
      completed[8] = false;

      await saveSopSteps(tradeDate, {
        ...completed,

        __entryValidation: session?.completed_steps
          ? getEntryValidation(
              session.completed_steps,
            )
          : undefined,
      });
    }

    await syncTradingDay(tradeDate);

    return NextResponse.json({
      success: true,

      trade,

      executionScore: calculateExecutionScore(
        executionQuality,
        setupQuality,
      ),

      sopValidated,
    });
  } catch (error) {
    console.error("Trade POST error:", error);

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "No se pudo registrar el trade.",
      },
      {
        status: 400,
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH */
/* -------------------------------------------------------------------------- */

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const id = String(body.id ?? "");

    if (!id) {
      throw new Error("Falta el ID del trade.");
    }

    const current = await getTradeOrThrow(id);

    const nextTradeDate = String(
      body.trade_date ?? current.trade_date,
    );

    const setupId = String(
      body.setup_id ??
        current.setup_id ??
        "",
    );

    const setupQuality = String(
      body.setup_quality ??
        current.setup_quality ??
        "",
    );

    const executionQuality = String(
      body.execution_quality ??
        current.execution_quality ??
        "",
    );

    const setupRows = await supabaseServerFetch<Setup[]>(
      "setups",
      {
        query:
          `?select=id,name,active` +
          `&${eqFilter("id", setupId)}` +
          "&limit=1",
      },
    );

    const setup = setupRows?.[0];

    if (!setup || !setup.active) {
      throw new Error(
        "Selecciona un setup activo válido.",
      );
    }

    /*
     * NO bloquear FOMO / inválido / C al editar.
     * El Journal debe conservar la realidad.
     */

    const numericR = Number(
      body.r ?? current.r,
    );

    if (!Number.isFinite(numericR)) {
      throw new Error("El valor de R no es válido.");
    }

    const nextTradingDay =
      nextTradeDate === current.trade_date
        ? null
        : await ensureTradingDay(nextTradeDate);

    const payload = {
      title:
        `${String(
          body.instrument ??
            current.instrument,
        )} ` +
        `${String(
          body.direction ??
            current.direction,
        )} — ${setup.name}`,

      setup_id: setup.id,

      trading_day_id:
        nextTradingDay?.id ??
        current.trading_day_id ??
        null,

      trade_date: nextTradeDate,

      instrument: String(
        body.instrument ??
          current.instrument,
      ).trim(),

      direction: String(
        body.direction ??
          current.direction,
      ),

      setup_quality: setupQuality,

      execution_quality: executionQuality,

      emotion: String(
        body.emotion ??
          current.emotion ??
          "Neutral",
      ),

      close_type: String(
        body.close_type ??
          current.close_type ??
          "⚪ BE",
      ),

      r: numericR,

      before_screenshot_url:
        body.before_screenshot_url !==
        undefined
          ? String(
              body.before_screenshot_url ?? "",
            ).trim() || null
          : current.before_screenshot_url,

      after_screenshot_url:
        body.after_screenshot_url !==
        undefined
          ? String(
              body.after_screenshot_url ?? "",
            ).trim() || null
          : current.after_screenshot_url,

      notes:
        body.notes !== undefined
          ? String(
              body.notes ?? "",
            ).trim() || null
          : current.notes,
    };

    const updated =
      await supabaseServerFetch<TradeRow[]>(
        "trades",
        {
          method: "PATCH",

          query:
            `?${eqFilter("id", id)}`,

          prefer:
            "return=representation",

          body: payload,
        },
      );

    await syncTradingDay(
      current.trade_date,
    );

    if (
      nextTradeDate !==
      current.trade_date
    ) {
      await syncTradingDay(
        nextTradeDate,
      );
    }

    return NextResponse.json({
      success: true,

      trade:
        updated?.[0] ??
        null,
    });
  } catch (error) {
    console.error("Trade PATCH error:", error);

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "No se pudo editar el trade.",
      },
      {
        status: 400,
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  request: NextRequest,
) {
  try {
    const id =
      request.nextUrl.searchParams.get(
        "id",
      );

    if (!id) {
      throw new Error(
        "Falta el ID del trade.",
      );
    }

    const trade =
      await getTradeOrThrow(id);

    const user =
      await getAuthenticatedUser();

    await supabaseServerFetch(
      "trades",
      {
        method: "DELETE",

        query:
          `?${eqFilter("id", id)}`,

        prefer:
          "return=minimal",
      },
    );

    // Storage is independent from the trade row. Remove both screenshots
    // after the database delete so abandoned objects do not accumulate.
    await Promise.allSettled([
      deleteScreenshotUrl(
        trade.before_screenshot_url,
        user.id,
      ),
      deleteScreenshotUrl(
        trade.after_screenshot_url,
        user.id,
      ),
    ]);

    const session =
      await getSopSession(
        trade.trade_date,
      );

    if (session) {
      const completed =
        normalizeCompletedSteps(
          session.completed_steps,
        );

      if (
        completed[6] ||
        completed[7] ||
        completed[8]
      ) {
        delete completed[6];
        delete completed[7];
        delete completed[8];

        await saveSopSteps(
          trade.trade_date,
          {
            ...completed,

            __entryValidation:
              getEntryValidation(
                session.completed_steps,
              ) ?? undefined,
          },
        );
      }
    }

    await syncTradingDay(
      trade.trade_date,
    );

    return NextResponse.json({
      success: true,

      deletedId: id,
    });
  } catch (error) {
    console.error(
      "Trade DELETE error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el trade.",
      },
      {
        status: 400,
      },
    );
  }
}