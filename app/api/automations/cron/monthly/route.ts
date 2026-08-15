import { NextRequest, NextResponse } from "next/server";

import {
  runAutomation,
} from "@/app/lib/automations/engine";
import { listOwnerUserIds, runAsUser } from "@/app/lib/supabase/server";

function getCronSecret() {
  const secret =
    process.env.CRON_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "CRON_SECRET no está configurado.",
    );
  }

  return secret;
}

function authorized(
  request: NextRequest,
) {
  const secret = getCronSecret();

  const authorization =
    request.headers.get(
      "authorization",
    );

  return (
    authorization ===
    `Bearer ${secret}`
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    if (!authorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const userIds = await listOwnerUserIds();
    const results = [];
    for (const userId of userIds) {
      results.push(await runAsUser(userId, () => runAutomation("monthly_review")));
    }
    const result = results[0] ?? { success: true, automationType: "monthly_review", results };

    return NextResponse.json(
      result,
      {
        status:
          result.success
            ? 200
            : 500,
      },
    );
  } catch (error) {
    console.error(
      "Automation cron error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar la automation.",
      },
      { status: 500 },
    );
  }
}
