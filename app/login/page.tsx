"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  getSupabaseBrowserClient,
} from "@/app/lib/supabase/browser";

type SessionResponse = {
  success: boolean;
  user?: {
    id: string;
    email: string | null;
  };
  session?: {
    accessToken: string;
    refreshToken: string;
  };
  error?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] =
    useState("");
  const [password, setPassword] =
    useState("");
  const [mode, setMode] =
    useState<
      "login" | "signup"
    >("login");
  const [loading, setLoading] =
    useState(false);
  const [message, setMessage] =
    useState("");

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const {
          data,
        } =
          await getSupabaseBrowserClient()
            .auth.getSession();

        if (
          !active ||
          !data.session
        ) {
          return;
        }

        const synced =
          await sync(
            data.session
              .access_token,
            data.session
              .refresh_token,
            "sync",
          );

        if (
          synced.success
        ) {
          router.replace("/");
        }
      } catch {
        // An expired browser session simply remains on the login screen.
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase =
        getSupabaseBrowserClient();

      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword(
              {
                email:
                  email.trim(),
                password,
              },
            )
          : await supabase.auth.signUp(
              {
                email:
                  email.trim(),
                password,
              },
            );

      if (result.error) {
        throw result.error;
      }

      if (!result.data.session) {
        setMessage(
          "Cuenta creada. Revisa tu email si Supabase requiere confirmación.",
        );
        return;
      }

      const synced =
        await sync(
          result.data.session
            .access_token,
          result.data.session
            .refresh_token,
          "login",
        );

      if (
        !synced.success
      ) {
        throw new Error(
          synced.error ??
            "No se pudo establecer la sesión segura.",
        );
      }

      if (
        synced.session
      ) {
        const updated =
          await supabase.auth.setSession(
            {
              access_token:
                synced.session
                  .accessToken,
              refresh_token:
                synced.session
                  .refreshToken,
            },
          );

        if (
          updated.error
        ) {
          throw updated.error;
        }
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar la autenticación.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#08090a] px-5 text-zinc-100">
      <div className="w-full max-w-[420px] rounded-2xl border border-zinc-800 bg-[var(--surface)] p-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
          TRADING OS
        </p>

        <h1 className="mt-3 text-2xl font-semibold">
          {mode === "login"
            ? "Iniciar sesión"
            : "Crear cuenta"}
        </h1>

        <p className="mt-2 text-sm text-zinc-500" />

        <form
          onSubmit={submit}
          className="mt-7 space-y-4"
        >
          <input
            value={email}
            onChange={(event) =>
              setEmail(
                event.target.value,
              )
            }
            type="email"
            required
            placeholder="Email"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm"
          />

          <input
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value,
              )
            }
            type="password"
            required
            minLength={6}
            placeholder="Contraseña"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm"
          />

          {message && (
            <p className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-xs text-zinc-400">
              {message}
            </p>
          )}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-emerald-400 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[#07110d]"
          >
            {loading
              ? "Procesando…"
              : mode === "login"
                ? "Entrar"
                : "Crear cuenta"}
          </button>
        </form>

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setMode(
                mode === "login"
                  ? "signup"
                  : "login",
              );
              setMessage("");
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:border-emerald-500/50 hover:bg-zinc-800 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {mode === "login"
              ? "Crear cuenta"
              : "Iniciar sesión"}
          </button>
        </div>
      </div>
    </main>
  );
}

async function sync(
  accessToken: string,
  refreshToken: string,
  mode: "login" | "sync",
): Promise<SessionResponse> {
  const response =
    await fetch(
      "/api/auth/session",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          accessToken,
          refreshToken,
          mode,
        }),
      },
    );

  const payload =
    (await response
      .json()
      .catch(
        () => ({
          success: false,
        }),
      )) as SessionResponse;

  if (!response.ok) {
    throw new Error(
      payload.error ??
        "No se pudo establecer la sesión segura.",
    );
  }

  return payload;
}
