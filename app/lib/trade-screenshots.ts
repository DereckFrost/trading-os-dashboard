import { createClient } from "@supabase/supabase-js";

export const TRADE_SCREENSHOTS_BUCKET =
  "trade-screenshots";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";

function getAdminClient() {
  if (!SUPABASE_URL) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL en .env.local.",
    );
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. El sistema de screenshots necesita la clave de servicio en el servidor.",
    );
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function getScreenshotAdminClient() {
  return getAdminClient();
}

export async function ensureTradeScreenshotsBucket() {
  const supabase = getAdminClient();

  const existing =
    await supabase.storage.getBucket(
      TRADE_SCREENSHOTS_BUCKET,
    );

  if (!existing.error && existing.data) {
    // Screenshots contain private trading data. Always enforce a private bucket
    // even if the project was originally created with public: true.
    if (existing.data.public) {
      const updated =
        await supabase.storage.updateBucket(
          TRADE_SCREENSHOTS_BUCKET,
          {
            public: false,
            fileSizeLimit: "10MB",
            allowedMimeTypes: [
              "image/png",
              "image/jpeg",
              "image/webp",
              "image/gif",
            ],
          },
        );

      if (updated.error) {
        throw new Error(
          `No se pudo asegurar el bucket privado de screenshots: ${updated.error.message}`,
        );
      }
    }

    return;
  }

  const created =
    await supabase.storage.createBucket(
      TRADE_SCREENSHOTS_BUCKET,
      {
        public: false,
        fileSizeLimit: "10MB",
        allowedMimeTypes: [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
        ],
      },
    );

  if (
    created.error &&
    !created.error.message
      .toLowerCase()
      .includes("already exists")
  ) {
    throw new Error(
      `No se pudo preparar el bucket de screenshots: ${created.error.message}`,
    );
  }
}

/**
 * Accepts both the new storage-path format and legacy public Supabase URLs.
 * This lets us make the bucket private without requiring an immediate DB rewrite.
 */
export function extractScreenshotPath(
  value: string | null | undefined,
) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.startsWith("users/") &&
    normalized.length > "users/".length
  ) {
    return normalized;
  }

  const markers = [
    `/storage/v1/object/public/${TRADE_SCREENSHOTS_BUCKET}/`,
    `/storage/v1/object/sign/${TRADE_SCREENSHOTS_BUCKET}/`,
  ];

  for (const marker of markers) {
    const index = normalized.indexOf(marker);

    if (index !== -1) {
      return decodeURIComponent(
        normalized.slice(index + marker.length).split("?")[0],
      );
    }
  }

  return null;
}

export function getScreenshotProxyUrl(
  value: string | null | undefined,
) {
  const path = extractScreenshotPath(value);

  if (!path) {
    return value ?? "";
  }

  return `/api/trades/screenshots?path=${encodeURIComponent(path)}`;
}

export function assertScreenshotPathOwned(
  path: string,
  userId: string,
) {
  const prefix = `users/${userId}/`;

  if (!path.startsWith(prefix)) {
    throw new Error(
      "No tienes permiso para acceder a este screenshot.",
    );
  }

  if (path.includes("..")) {
    throw new Error(
      "La ruta del screenshot no es válida.",
    );
  }

  return path;
}

export async function createScreenshotSignedUrl(
  value: string,
  userId: string,
) {
  const path = extractScreenshotPath(value);

  if (!path) {
    throw new Error(
      "La referencia del screenshot no es válida.",
    );
  }

  assertScreenshotPathOwned(path, userId);
  await ensureTradeScreenshotsBucket();

  const supabase = getAdminClient();
  const result =
    await supabase.storage
      .from(TRADE_SCREENSHOTS_BUCKET)
      .createSignedUrl(
        path,
        SIGNED_URL_TTL_SECONDS,
      );

  if (result.error || !result.data?.signedUrl) {
    throw new Error(
      `No se pudo generar la URL segura del screenshot: ${result.error?.message ?? "URL no disponible"}`,
    );
  }

  return result.data.signedUrl;
}

export async function deleteScreenshotUrl(
  value: string | null | undefined,
  userId?: string,
) {
  const path = extractScreenshotPath(value);

  if (!path) {
    return;
  }

  if (userId) {
    assertScreenshotPathOwned(path, userId);
  }

  const supabase = getAdminClient();

  const result =
    await supabase.storage
      .from(TRADE_SCREENSHOTS_BUCKET)
      .remove([path]);

  if (result.error) {
    console.error(
      "Screenshot cleanup error:",
      result.error,
    );
  }
}
