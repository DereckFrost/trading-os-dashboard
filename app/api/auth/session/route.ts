import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ACCESS_COOKIE =
  "trading_os_access_token";
const REFRESH_COOKIE =
  "trading_os_refresh_token";
const DEFAULT_REFRESH_MAX_AGE =
  60 * 60 * 24 * 30;

type JwtClaims = {
  sub?: string;
  session_id?: string;
  exp?: number;
};

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

function getAccessMaxAge(
  accessToken: string,
) {
  const claims =
    decodeJwtClaims(
      accessToken,
    );

  if (!claims?.exp) {
    return 60 * 60;
  }

  return Math.max(
    60,
    claims.exp -
      Math.floor(
        Date.now() / 1000,
      ),
  );
}

function setSessionCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
) {
  response.cookies.set(
    ACCESS_COOKIE,
    accessToken,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV ===
        "production",
      path: "/",
      maxAge:
        getAccessMaxAge(
          accessToken,
        ),
    },
  );

  response.cookies.set(
    REFRESH_COOKIE,
    refreshToken,
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
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as {
        accessToken?: string;
        refreshToken?: string;
        mode?: "login" | "sync";
      };

    if (
      !body.accessToken ||
      !body.refreshToken
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Sesión incompleta.",
        },
        { status: 400 },
      );
    }

    const url =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL?.trim();

    const key =
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!url || !key) {
      throw new Error(
        "Faltan las credenciales públicas de Supabase.",
      );
    }

    const supabase =
      createClient(
        url,
        key,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

    const {
      data,
      error,
    } =
      await supabase.auth.getUser(
        body.accessToken,
      );

    if (
      error ||
      !data.user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La sesión de Supabase no es válida.",
        },
        { status: 401 },
      );
    }

    /*
     * Login is the one place where we validate the access-token identity
     * against the refresh-token session before establishing server cookies.
     *
     * refreshSession rotates the refresh token. The rotated pair is returned
     * to the browser so its local Supabase session remains in sync.
     */
    if (
      body.mode === "login"
    ) {
      const claims =
        decodeJwtClaims(
          body.accessToken,
        );

      if (
        claims?.sub &&
        claims.sub !==
          data.user.id
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "La sesión no coincide.",
          },
          { status: 401 },
        );
      }

      const refreshed =
        await supabase.auth.refreshSession(
          {
            refresh_token:
              body.refreshToken,
          },
        );

      if (
        refreshed.error ||
        !refreshed.data.user ||
        !refreshed.data.session
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "La sesión de Supabase no es válida.",
          },
          { status: 401 },
        );
      }

      const refreshedClaims =
        decodeJwtClaims(
          refreshed.data.session
            .access_token,
        );

      if (
        refreshed.data.user.id !==
        data.user.id
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "La sesión no coincide.",
          },
          { status: 401 },
        );
      }

      if (
        claims?.session_id &&
        refreshedClaims?.session_id &&
        claims.session_id !==
          refreshedClaims.session_id
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "La sesión no coincide.",
          },
          { status: 401 },
        );
      }

      const session =
        refreshed.data.session;

      const response =
        NextResponse.json({
          success: true,
          user: {
            id:
              refreshed.data
                .user.id,
            email:
              refreshed.data
                .user.email ??
              null,
          },
          session: {
            accessToken:
              session.access_token,
            refreshToken:
              session.refresh_token,
          },
        });

      setSessionCookies(
        response,
        session.access_token,
        session.refresh_token,
      );

      return response;
    }

    /*
     * Normal browser synchronization happens after Supabase itself refreshes
     * the session. Do not rotate the refresh token again here; doing so would
     * make the browser's local refresh token stale.
     */
    const response =
      NextResponse.json({
        success: true,
        user: {
          id: data.user.id,
          email:
            data.user.email ??
            null,
        },
      });

    setSessionCookies(
      response,
      body.accessToken,
      body.refreshToken,
    );

    return response;
  } catch (error) {
    console.error(
      "Auth session error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo sincronizar la sesión.",
      },
      { status: 500 },
    );
  }
}
