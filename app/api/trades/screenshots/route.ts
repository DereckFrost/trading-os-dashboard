import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/app/lib/supabase/server";
import {
  createScreenshotSignedUrl,
  deleteScreenshotUrl,
  ensureTradeScreenshotsBucket,
  getScreenshotAdminClient,
  TRADE_SCREENSHOTS_BUCKET,
} from "@/app/lib/trade-screenshots";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function getExtension(type: string) {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

function sanitizeSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 80) || "draft"
  );
}

/**
 * Resolves a private screenshot to a short-lived signed URL.
 * The storage path is ownership-checked before Supabase signs anything.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const value =
      request.nextUrl.searchParams.get("path") ?? "";

    if (!value) {
      return NextResponse.json(
        {
          success: false,
          error: "Falta la ruta del screenshot.",
        },
        { status: 400 },
      );
    }

    const signedUrl =
      await createScreenshotSignedUrl(
        value,
        user.id,
      );

    return NextResponse.redirect(signedUrl, 307);
  } catch (error) {
    console.error(
      "Screenshot access error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo abrir el screenshot.",
      },
      { status: 403 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const formData = await request.formData();

    const file = formData.get("file");
    const slot = String(formData.get("slot") ?? "");
    const scopeId = sanitizeSegment(
      String(formData.get("scopeId") ?? "draft"),
    );
    const oldUrl =
      String(formData.get("oldUrl") ?? "") || null;

    if (!(file instanceof File)) {
      throw new Error("No se recibió ninguna imagen.");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error(
        "El screenshot debe ser PNG, JPG, WEBP o GIF.",
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      throw new Error(
        "El screenshot debe pesar entre 1 byte y 10 MB.",
      );
    }

    if (slot !== "before" && slot !== "after") {
      throw new Error(
        "El tipo de screenshot no es válido.",
      );
    }

    await ensureTradeScreenshotsBucket();

    const supabase = getScreenshotAdminClient();
    const extension = getExtension(file.type);
    const filename = `${crypto.randomUUID()}.${extension}`;
    const path =
      `users/${user.id}/trades/${scopeId}/${slot}/${filename}`;

    const bytes = new Uint8Array(
      await file.arrayBuffer(),
    );

    const uploaded = await supabase.storage
      .from(TRADE_SCREENSHOTS_BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploaded.error) {
      throw new Error(
        `No se pudo subir el screenshot: ${uploaded.error.message}`,
      );
    }

    if (oldUrl) {
      await deleteScreenshotUrl(oldUrl, user.id);
    }

    return NextResponse.json({
      success: true,
      path,
      // The UI can use this immediately without ever exposing a public bucket URL.
      url: `/api/trades/screenshots?path=${encodeURIComponent(path)}`,
      slot,
    });
  } catch (error) {
    console.error("Screenshot upload error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo subir el screenshot.",
      },
      { status: 400 },
    );
  }
}
