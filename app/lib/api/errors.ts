import { NextResponse } from "next/server";
import { AuthRequiredError } from "@/app/lib/supabase/server";

export function apiErrorResponse(
  error: unknown,
  fallback = "No se pudo completar la solicitud.",
) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: error.message,
        },
      },
      { status: 401 },
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallback;

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "REQUEST_FAILED",
        message,
      },
    },
    { status: 400 },
  );
}
