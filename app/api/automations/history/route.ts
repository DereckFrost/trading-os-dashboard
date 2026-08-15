import { NextRequest, NextResponse } from "next/server";

import {
  listAutomationRuns,
} from "@/app/lib/automations/engine";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  try {
    const rawLimit =
      Number(
        request.nextUrl.searchParams.get(
          "limit",
        ) ?? "30",
      );

    const runs =
      await listAutomationRuns(
        Number.isFinite(rawLimit)
          ? rawLimit
          : 30,
      );

    return NextResponse.json({
      success: true,
      runs,
    });
  } catch (error) {
    console.error("Automation history API error:", error);
    return NextResponse.json(
      {
        success: false,
        runs: [],
        error: "No se pudo cargar el historial de automations.",
      },
      { status: 500 },
    );
  }
}
