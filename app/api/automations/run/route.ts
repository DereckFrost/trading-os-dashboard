import { NextRequest, NextResponse } from "next/server";

import {
  runAutomation,
} from "@/app/lib/automations/engine";

import type {
  AutomationType,
} from "@/app/lib/automations/types";

export const dynamic = "force-dynamic";

const VALID_TYPES: AutomationType[] = [
  "weekly_review",
  "monthly_review",
  "behavior_alerts",
];

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json().catch(
        () => ({}),
      )) as {
        type?: AutomationType;
        force?: boolean;
      };

    const type =
      body.type;

    if (
      !type ||
      !VALID_TYPES.includes(type)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Tipo de automation inválido.",
        },
        { status: 400 },
      );
    }

    const result =
      await runAutomation(
        type,
        {
          force:
            body.force === true,
        },
      );

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
    console.error("Automation API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo ejecutar la automation.",
      },
      { status: 500 },
    );
  }
}
