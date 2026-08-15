import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { AsyncLocalStorage } from "node:async_hooks";

type SupabaseMethod =
  | "GET"
  | "POST"
  | "PATCH"
  | "DELETE";

type SupabaseOptions = {
  method?: SupabaseMethod;
  query?: string;
  body?: unknown;
  prefer?: string;
  userId?: string;
  allowUnauthenticated?: boolean;
};

const ACCESS_COOKIE = "trading_os_access_token";
const REFRESH_COOKIE = "trading_os_refresh_token";
const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

const OWNED_TABLES = new Set([
  "trades",
  "trading_days",
  "setups",
  "playbook",
  "sop_sessions",
  "coach_analyses",
  "coach_analysis_history",
  "trading_os_automation_runs",
]);

type AuthContext = {
  userId: string;
};

type JwtClaims = {
  sub?: string;
  session_id?: string;
};

const authContext =
  new AsyncLocalStorage<AuthContext>();

export class AuthRequiredError extends Error {
  status = 401;

  constructor(
    message = "Debes iniciar sesión para continuar.",
  ) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

function getConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL en .env.local.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.",
    );
  }

  return {
    url,
    serviceRoleKey,
  };
}

function getAdminClient() {
  const {
    url,
    serviceRoleKey,
  } = getConfig();

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function readAccessToken() {
  const cookieStore =
    await cookies();

  return (
    cookieStore.get(
      ACCESS_COOKIE,
    )?.value ?? null
  );
}

async function readRefreshToken() {
  const cookieStore =
    await cookies();

  return (
    cookieStore.get(
      REFRESH_COOKIE,
    )?.value ?? null
  );
}

function decodeJwtClaims(
  token: string,
): JwtClaims | null {
  try {
    const parts =
      token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const payload =
      parts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padded =
      payload.padEnd(
        payload.length +
          ((4 -
            (payload.length %
              4)) %
            4),
        "=",
      );

    return JSON.parse(
      Buffer.from(
        padded,
        "base64",
      ).toString("utf8"),
    ) as JwtClaims;
  } catch {
    return null;
  }
}

function getSafeSupabaseErrorMessage(
  status: number,
) {
  if (status === 401) {
    return "La sesión no es válida.";
  }

  if (status === 403) {
    return "No tienes permisos para realizar esta operación.";
  }

  if (status === 404) {
    return "No se encontró el recurso solicitado.";
  }

  if (status === 409) {
    return "La operación entra en conflicto con los datos existentes.";
  }

  return "No se pudo completar la operación con la base de datos.";
}

export async function getAuthenticatedUser() {
  const context =
    authContext.getStore();

  const accessToken =
    await readAccessToken();

  if (context?.userId) {
    return {
      id: context.userId,
      accessToken:
        accessToken ?? null,
    };
  }

  if (!accessToken) {
    throw new AuthRequiredError();
  }

  const {
    url,
  } = getConfig();

  const anonKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!anonKey) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.",
    );
  }

  const supabase =
    getAdminClient();

  const {
    data,
    error,
  } =
    await supabase.auth.getUser(
      accessToken,
    );

  if (!error && data.user) {
    return {
      id: data.user.id,
      accessToken,
    };
  }

  const refreshToken =
    await readRefreshToken();

  if (!refreshToken) {
    throw new AuthRequiredError(
      "Tu sesión expiró. Inicia sesión nuevamente.",
    );
  }

  /*
   * Keep the expired access token's identity/session binding.
   * A Supabase refresh token is single-use and belongs to one auth session.
   * We therefore require the refreshed session to match the same user and
   * session_id represented by the access-token cookie.
   */
  const expectedClaims =
    decodeJwtClaims(
      accessToken,
    );

  const refreshClient =
    createClient(
      url,
      anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

  const refreshed =
    await refreshClient.auth.refreshSession(
      {
        refresh_token:
          refreshToken,
      },
    );

  if (
    refreshed.error ||
    !refreshed.data.user ||
    !refreshed.data.session
  ) {
    throw new AuthRequiredError(
      "Tu sesión expiró. Inicia sesión nuevamente.",
    );
  }

  const refreshedClaims =
    decodeJwtClaims(
      refreshed.data.session
        .access_token,
    );

  if (
    expectedClaims?.sub &&
    refreshed.data.user.id !==
      expectedClaims.sub
  ) {
    throw new AuthRequiredError(
      "La sesión no coincide. Inicia sesión nuevamente.",
    );
  }

  if (
    expectedClaims?.session_id &&
    refreshedClaims?.session_id &&
    refreshedClaims.session_id !==
      expectedClaims.session_id
  ) {
    throw new AuthRequiredError(
      "La sesión no coincide. Inicia sesión nuevamente.",
    );
  }

  const cookieStore =
    await cookies();

  const session =
    refreshed.data.session;

  cookieStore.set(
    ACCESS_COOKIE,
    session.access_token,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV ===
        "production",
      path: "/",
      maxAge: Math.max(
        60,
        session.expires_at
          ? session.expires_at -
              Math.floor(
                Date.now() / 1000,
              )
          : 60 * 60,
      ),
    },
  );

  cookieStore.set(
    REFRESH_COOKIE,
    session.refresh_token,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV ===
        "production",
      path: "/",
      maxAge:
        DEFAULT_REFRESH_MAX_AGE,
    },
  );

  return {
    id: refreshed.data.user.id,
    accessToken:
      session.access_token,
  };
}

export async function requireAuthenticatedUser() {
  return getAuthenticatedUser();
}

export async function runAsUser<T>(
  userId: string,
  callback: () => Promise<T>,
) {
  return authContext.run(
    { userId },
    callback,
  );
}

export async function listOwnerUserIds() {
  const supabase =
    getAdminClient();

  const ids: string[] = [];
  let page = 1;

  while (true) {
    const {
      data,
      error,
    } =
      await supabase.auth.admin.listUsers(
        {
          page,
          perPage: 100,
        },
      );

    if (error) {
      throw new Error(
        "No se pudieron listar los usuarios.",
      );
    }

    ids.push(
      ...data.users.map(
        (user) => user.id,
      ),
    );

    if (
      data.users.length <
      100
    ) {
      break;
    }

    page += 1;
  }

  return ids;
}

function appendOwnershipFilter(
  query: string,
  userId: string,
) {
  const separator =
    query ? "&" : "?";

  return `${query}${separator}user_id=eq.${encodeURIComponent(
    userId,
  )}`;
}

function injectOwnership(
  body: unknown,
  userId: string,
): unknown {
  if (Array.isArray(body)) {
    return body.map(
      (item) =>
        injectOwnership(
          item,
          userId,
        ),
    );
  }

  if (
    body &&
    typeof body ===
      "object"
  ) {
    return {
      ...(body as Record<
        string,
        unknown
      >),
      user_id: userId,
    };
  }

  return body;
}

/**
 * Server-only Supabase REST client.
 *
 * Service role is used only behind the server boundary. Every owned-table
 * operation is automatically scoped to the authenticated user (or the
 * explicit runAsUser context used by trusted cron jobs).
 */
export async function supabaseServerFetch<
  T = unknown,
>(
  table: string,
  options: SupabaseOptions = {},
): Promise<T> {
  const {
    url,
    serviceRoleKey,
  } = getConfig();

  const method =
    options.method ?? "GET";

  let userId =
    options.userId;

  if (
    !userId &&
    OWNED_TABLES.has(table)
  ) {
    if (
      options.allowUnauthenticated
    ) {
      userId = undefined;
    } else {
      userId =
        (
          await getAuthenticatedUser()
        ).id;
    }
  }

  const query =
    userId &&
    OWNED_TABLES.has(table)
      ? appendOwnershipFilter(
          options.query ?? "",
          userId,
        )
      : options.query ?? "";

  const body =
    userId &&
    OWNED_TABLES.has(table) &&
    method !== "GET"
      ? injectOwnership(
          options.body,
          userId,
        )
      : options.body;

  const response =
    await fetch(
      `${url}/rest/v1/${table}${query}`,
      {
        method,
        headers: {
          apikey:
            serviceRoleKey,
          Authorization:
            `Bearer ${serviceRoleKey}`,
          "Content-Type":
            "application/json",
          Prefer:
            options.prefer ??
            "return=representation",
        },
        body:
          body !== undefined
            ? JSON.stringify(
                body,
              )
            : undefined,
        cache: "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response.text();

    /*
     * Never return raw PostgREST/PostgreSQL payloads to the browser.
     * Keep the detailed response server-side for diagnostics.
     */
    console.error(
      `Supabase ${method} ${table} failed (${response.status}):`,
      text,
    );

    throw new Error(
      getSafeSupabaseErrorMessage(
        response.status,
      ),
    );
  }

  if (
    response.status === 204
  ) {
    return null as T;
  }

  const text =
    await response.text();

  return text
    ? (JSON.parse(
        text,
      ) as T)
    : (null as T);
}

export function supabaseEq(
  column: string,
  value: string,
) {
  return `${column}=eq.${encodeURIComponent(
    value,
  )}`;
}

export function getAuthCookieNames() {
  return {
    access:
      ACCESS_COOKIE,
    refresh:
      REFRESH_COOKIE,
  };
}
