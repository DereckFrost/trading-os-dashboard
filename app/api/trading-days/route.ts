import { NextResponse } from "next/server";

import {
  supabaseEq,
  supabaseServerFetch,
} from "@/app/lib/supabase/server";

export const dynamic =
  "force-dynamic";

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
  trade_date: string;
  r: number | null;
  setup_quality: string | null;
  created_at: string | null;
  emotion: string | null;
};

type SopSession = {
  id: string;
  session_date: string;
  completed_steps:
    | Record<string, unknown>
    | null;
};

/*
 * Trading Days API
 *
 * Esta ruta es la única capa de escritura de
 * Trading Days. La interfaz nunca escribe
 * directamente contra Supabase.
 *
 * Importante:
 * - Crear/editar Trading Day NO modifica trades.
 * - Eliminar Trading Day NO elimina trades.
 * - La sesión SOP se conserva como entidad
 *   independiente y puede eliminarse junto con
 *   el registro de jornada.
 * - mental_state es legacy. La UI deriva el
 *   estado mental desde trades.emotion.
 */

function validateDate(
  value: unknown,
) {
  const date =
    String(value ?? "").trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new Error(
      "Formato de fecha inválido. Usa YYYY-MM-DD.",
    );
  }

  return date;
}

function normalizeTradingDayPayload(
  body: Record<string, unknown>,
) {
  const date =
    validateDate(
      body.date,
    );

  const notes =
    typeof body.notes ===
      "string" &&
    body.notes.trim()
      ? body.notes.trim()
      : null;

  return {
    date,
    /*
     * No escribimos mental_state desde
     * Trading Days. La emoción real vive
     * en trades.emotion.
     */
    waited_for_setup:
      Boolean(
        body.waited_for_setup,
      ),

    only_one_trade:
      Boolean(
        body.only_one_trade,
      ),

    did_not_recover_losses:
      Boolean(
        body.did_not_recover_losses,
      ),

    session_finished:
      Boolean(
        body.session_finished,
      ),

    notes,
  };
}

async function findDayByDate(
  date: string,
) {
  const rows =
    await supabaseServerFetch<
      TradingDay[]
    >(
      "trading_days",
      {
        query:
          `?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes` +
          `&${supabaseEq(
            "date",
            date,
          )}` +
          "&limit=1",
      },
    );

  return rows?.[0] ?? null;
}

export async function GET(
  request: Request,
) {
  try {
    const url =
      new URL(request.url);

    const date =
      url.searchParams.get(
        "date",
      );

    const daysQuery = date
      ? `?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes` +
        `&${supabaseEq(
          "date",
          validateDate(date),
        )}` +
        "&order=date.desc"
      : "?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes&order=date.desc";

    const tradesQuery = date
      ? `?select=id,trade_date,r,setup_quality,created_at,emotion` +
        `&${supabaseEq(
          "trade_date",
          validateDate(date),
        )}` +
        "&order=trade_date.desc,created_at.asc"
      : "?select=id,trade_date,r,setup_quality,created_at,emotion&order=trade_date.desc,created_at.asc";

    const sopQuery = date
      ? `?select=id,session_date,completed_steps` +
        `&${supabaseEq(
          "session_date",
          validateDate(date),
        )}` +
        "&order=session_date.desc"
      : "?select=id,session_date,completed_steps&order=session_date.desc";

    const [
      days,
      trades,
      sopSessions,
    ] = await Promise.all([
      supabaseServerFetch<
        TradingDay[]
      >(
        "trading_days",
        {
          query: daysQuery,
        },
      ),

      supabaseServerFetch<
        TradeRow[]
      >(
        "trades",
        {
          query: tradesQuery,
        },
      ),

      supabaseServerFetch<
        SopSession[]
      >(
        "sop_sessions",
        {
          query: sopQuery,
        },
      ),
    ]);

    return NextResponse.json({
      success: true,
      days: days ?? [],
      trades: trades ?? [],
      sopSessions:
        sopSessions ?? [],
    });
  } catch (error) {
    console.error(
      "Trading Days GET error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        days: [],
        trades: [],
        sopSessions: [],
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los Trading Days.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const payload =
      normalizeTradingDayPayload(
        body,
      );

    const existing =
      await findDayByDate(
        payload.date,
      );

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ya existe un Trading Day para esa fecha. Usa PATCH para editarlo.",
          day: existing,
        },
        { status: 409 },
      );
    }

    const created =
      await supabaseServerFetch<
        TradingDay[]
      >(
        "trading_days",
        {
          method: "POST",
          prefer:
            "return=representation",
          body: payload,
        },
      );

    return NextResponse.json({
      success: true,
      day:
        created?.[0] ??
        null,
    });
  } catch (error) {
    console.error(
      "Trading Days POST error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear el Trading Day.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const payload =
      normalizeTradingDayPayload(
        body,
      );

    const id =
      typeof body.id ===
        "string" &&
      body.id.trim()
        ? body.id.trim()
        : null;

    const existing =
      id
        ? await supabaseServerFetch<
            TradingDay[]
          >(
            "trading_days",
            {
              query:
                `?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes` +
                `&${supabaseEq(
                  "id",
                  id,
                )}` +
                "&limit=1",
            },
          )
        : await supabaseServerFetch<
            TradingDay[]
          >(
            "trading_days",
            {
              query:
                `?select=id,date,mental_state,waited_for_setup,only_one_trade,did_not_recover_losses,session_finished,notes` +
                `&${supabaseEq(
                  "date",
                  payload.date,
                )}` +
                "&limit=1",
            },
          );

    const current =
      existing?.[0] ??
      null;

    if (!current) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se encontró el Trading Day que quieres editar.",
        },
        { status: 404 },
      );
    }

    const updated =
      await supabaseServerFetch<
        TradingDay[]
      >(
        "trading_days",
        {
          method: "PATCH",
          query:
            `?${supabaseEq(
              "id",
              current.id,
            )}`,
          prefer:
            "return=representation",
          body: payload,
        },
      );

    return NextResponse.json({
      success: true,
      day:
        updated?.[0] ??
        null,
    });
  } catch (error) {
    console.error(
      "Trading Days PATCH error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el Trading Day.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
) {
  try {
    const url =
      new URL(request.url);

    const dateParam =
      url.searchParams.get(
        "date",
      );

    const idParam =
      url.searchParams.get(
        "id",
      );

    if (
      !dateParam &&
      !idParam
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Debes enviar date o id.",
        },
        { status: 400 },
      );
    }

    const filter =
      idParam
        ? supabaseEq(
            "id",
            idParam,
          )
        : supabaseEq(
            "date",
            validateDate(
              dateParam,
            ),
          );

    const existing =
      await supabaseServerFetch<
        TradingDay[]
      >(
        "trading_days",
        {
          query:
            `?select=id,date` +
            `&${filter}` +
            "&limit=1",
        },
      );

    const day =
      existing?.[0] ??
      null;

    if (!day) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se encontró el Trading Day.",
        },
        { status: 404 },
      );
    }

    /*
     * Primero intentamos desvincular trades que
     * todavía apunten a este Trading Day.
     *
     * Los trades NO se eliminan.
     */
    await supabaseServerFetch(
      "trades",
      {
        method: "PATCH",
        query:
          `?${supabaseEq(
            "trading_day_id",
            day.id,
          )}`,
        prefer:
          "return=minimal",
        body: {
          trading_day_id:
            null,
        },
      },
    );

    /*
     * El SOP session es estado operativo de la
     * jornada y sí puede eliminarse con ella.
     */
    await supabaseServerFetch(
      "sop_sessions",
      {
        method: "DELETE",
        query:
          `?${supabaseEq(
            "session_date",
            day.date,
          )}`,
        prefer:
          "return=minimal",
      },
    );

    await supabaseServerFetch(
      "trading_days",
      {
        method: "DELETE",
        query:
          `?${supabaseEq(
            "id",
            day.id,
          )}`,
        prefer:
          "return=minimal",
      },
    );

    return NextResponse.json({
      success: true,
      date: day.date,
      deleted: {
        tradingDay: 1,
        sopSessions: 1,
        trades: 0,
      },
    });
  } catch (error) {
    console.error(
      "Trading Days DELETE error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el Trading Day.",
      },
      { status: 500 },
    );
  }
}
